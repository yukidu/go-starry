import appWorker from './routerV9';
import type { Env } from './types';
import { createSession } from './db';
import { cookie, clearCookie, sha256 } from './security';

const CENTRAL_COOKIE = 'starry_id_session';
const LOCAL_COOKIE = 'starry_session';
const APP_ID = 'gostarry';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); }
    catch { return part.slice(index + 1).trim(); }
  }
  return '';
}

function centralClearCookie() {
  return `${CENTRAL_COOKIE}=; Domain=.starry.phd; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax; Priority=High`;
}

async function centralMember(request: Request, env: Env) {
  const token = cookieValue(request, CENTRAL_COOKIE);
  if (!TOKEN_RE.test(token)) return null;
  const tokenHash = await sha256(token);
  const row = await env.STARRY_ID_DB.prepare(`
    SELECT s.userId,s.appId,s.expiresAt,u.primaryEmail,u.status,p.name,p.avatar,p.googleAvatar
    FROM auth_sessions s
    JOIN users u ON u.id=s.userId
    LEFT JOIN profiles p ON p.userId=u.id
    JOIN app_memberships m ON m.userId=s.userId AND m.appId=s.appId AND m.status='active'
    WHERE s.tokenHash=? LIMIT 1
  `).bind(tokenHash).first<any>();
  if (!row || row.status !== 'active' || Number(row.expiresAt || 0) <= Date.now()) return null;

  const now = Date.now();
  await env.STARRY_ID_DB.prepare(`
    INSERT INTO app_memberships
      (userId,appId,status,role,isAdminUser,isContributor,canUpload,joinedAt,updatedAt)
    VALUES (?,?,'active','member',0,0,0,?,?)
    ON CONFLICT(userId,appId) DO NOTHING
  `).bind(String(row.userId), APP_ID, now, now).run().catch(() => undefined);

  const membership = await env.STARRY_ID_DB.prepare(`
    SELECT status FROM app_memberships WHERE userId=? AND appId=? LIMIT 1
  `).bind(String(row.userId), APP_ID).first<{ status: string }>();
  if (!membership || membership.status !== 'active') return null;

  return {
    id: String(row.userId || ''),
    email: String(row.primaryEmail || '').trim().toLowerCase(),
    name: String(row.name || '').trim() || String(row.primaryEmail || '').split('@')[0] || 'Starry Member',
    avatar: String(row.avatar || row.googleAvatar || '')
  };
}

async function resolveLocalUser(env: Env, member: Awaited<ReturnType<typeof centralMember>>) {
  if (!member || !member.email) return null;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS starry_identities (
    starry_user_id TEXT PRIMARY KEY,
    local_user_id TEXT NOT NULL UNIQUE,
    linked_at TEXT NOT NULL,
    FOREIGN KEY (local_user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).run();

  let user = await env.DB.prepare(`
    SELECT u.id,u.email,u.display_name,u.avatar_url,u.status
    FROM starry_identities s JOIN users u ON u.id=s.local_user_id
    WHERE s.starry_user_id=? LIMIT 1
  `).bind(member.id).first<any>();

  if (!user) {
    user = await env.DB.prepare(`SELECT id,email,display_name,avatar_url,status
      FROM users WHERE lower(email)=lower(?) LIMIT 1`).bind(member.email).first<any>();
  }

  if (!user) {
    const id = crypto.randomUUID();
    await env.DB.prepare(`INSERT INTO users
      (id,email,display_name,avatar_url,status,created_at,updated_at,last_login_at)
      VALUES (?,?,?,?,'active',datetime('now'),datetime('now'),datetime('now'))`)
      .bind(id, member.email, member.name || null, member.avatar || null).run();
    user = { id, email: member.email, display_name: member.name || null, avatar_url: member.avatar || null, status: 'active' };
  }
  if (user.status !== 'active') return null;

  await env.DB.batch([
    env.DB.prepare(`INSERT INTO starry_identities(starry_user_id,local_user_id,linked_at)
      VALUES(?,?,datetime('now'))
      ON CONFLICT(starry_user_id) DO UPDATE SET local_user_id=excluded.local_user_id`)
      .bind(member.id, user.id),
    env.DB.prepare(`UPDATE users SET email=?,display_name=?,avatar_url=?,updated_at=datetime('now'),last_login_at=datetime('now')
      WHERE id=?`).bind(member.email, member.name || user.display_name || null, member.avatar || user.avatar_url || null, user.id)
  ]);
  return user;
}

async function localSessionFromCentral(request: Request, env: Env) {
  if (cookieValue(request, LOCAL_COOKIE)) return null;
  const member = await centralMember(request, env);
  const user = await resolveLocalUser(env, member);
  if (!user) return null;
  const token = await createSession(env, user.id);
  return { token, setCookie: cookie(LOCAL_COOKIE, token, SESSION_TTL_SECONDS) };
}

function requestWithLocalCookie(request: Request, token: string) {
  const headers = new Headers(request.headers);
  const current = headers.get('Cookie') || '';
  headers.set('Cookie', `${current}${current ? '; ' : ''}${LOCAL_COOKIE}=${encodeURIComponent(token)}`);
  return new Request(request, { headers });
}

function appendCookies(response: Response, values: string[]) {
  const headers = new Headers(response.headers);
  for (const value of values.filter(Boolean)) headers.append('Set-Cookie', value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function deleteCentralSession(request: Request, env: Env) {
  const token = cookieValue(request, CENTRAL_COOKIE);
  if (!TOKEN_RE.test(token)) return;
  const hash = await sha256(token);
  await env.STARRY_ID_DB.prepare('DELETE FROM auth_sessions WHERE tokenHash=?').bind(hash).run().catch(() => undefined);
}

const SSO_JS = String.raw`(() => {
  const CLIENT_ID='661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com';
  const CENTRAL='https://id.starry.phd';
  let overlay=null;
  function close(){overlay?.remove();overlay=null;}
  function show(){
    if(overlay)return;
    overlay=document.createElement('div');
    overlay.style.cssText='position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(0,0,0,.62);backdrop-filter:blur(5px);padding:20px';
    overlay.innerHTML='<div style="width:min(390px,100%);padding:24px 18px;border:1px solid rgba(125,249,255,.35);border-radius:20px;background:#081225;color:#fff;text-align:center"><button data-close style="float:right;border:0;background:transparent;color:#fff;font-size:22px">×</button><h2 style="margin:4px 0 8px">登入 Starry ID</h2><p style="color:#b8d6e8;font-size:13px">選擇 Google 帳號，完成後會留在繁星任意門。</p><div data-google style="display:flex;justify-content:center;margin-top:18px"></div><div data-status style="margin-top:12px;font-size:12px;color:#bfeaff">正在準備登入…</div></div>';
    document.body.appendChild(overlay);
    overlay.querySelector('[data-close]')?.addEventListener('click',close);
    boot();
  }
  async function login(credential){
    const status=overlay?.querySelector('[data-status]');
    if(status)status.textContent='正在登入…';
    try{
      const r=await fetch(CENTRAL+'/api/google-sync',{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({credential,appId:'gostarry'})});
      const d=await r.json().catch(()=>({}));
      if(!r.ok||!d.success)throw new Error(d.error||'登入失敗');
      location.href='/';
    }catch(e){if(status)status.textContent=e?.message||'登入失敗，請再試一次。';}
  }
  function boot(){
    if(!window.google?.accounts?.id){setTimeout(boot,80);return;}
    google.accounts.id.initialize({client_id:CLIENT_ID,callback:r=>login(String(r?.credential||'')),ux_mode:'popup',auto_select:false,itp_support:true});
    const slot=overlay?.querySelector('[data-google]');
    if(slot&&!slot.childElementCount)google.accounts.id.renderButton(slot,{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',locale:'zh_TW',width:300});
    const status=overlay?.querySelector('[data-status]');if(status)status.textContent='請選擇 Google 帳號';
  }
  function load(){if(document.querySelector('script[data-starry-gsi]'))return;const s=document.createElement('script');s.src='https://accounts.google.com/gsi/client';s.async=true;s.defer=true;s.dataset.starryGsi='1';document.head.appendChild(s);}
  load();
  document.addEventListener('click',async e=>{
    const el=e.target instanceof Element?e.target.closest('a[href^="/auth/starry"],a[href^="/auth/google"],#menuSwitchAccount'):null;
    if(!el)return;
    e.preventDefault();
    if(el.id==='menuSwitchAccount'){
      await Promise.allSettled([
        fetch('/api/logout',{method:'POST',credentials:'include'}),
        fetch(CENTRAL+'/api/logout',{method:'POST',credentials:'include',cache:'no-store'})
      ]);
      try{google?.accounts?.id?.disableAutoSelect?.();}catch(_){ }
    }
    show();
  },true);
})();`;

async function injectSso(response: Response) {
  const type = response.headers.get('Content-Type') || '';
  if (!type.toLowerCase().includes('text/html')) return response;
  let html = await response.text();
  if (!html.includes('/starry-ecosystem-sso.js')) html = html.replace('</body>', '<script src="/starry-ecosystem-sso.js"></script></body>');
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Cache-Control', 'no-store');
  return new Response(html, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === 'GET' && url.pathname === '/starry-ecosystem-sso.js') {
      return new Response(SSO_JS, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    if (method === 'POST' && url.pathname === '/api/logout') {
      await deleteCentralSession(request, env);
      const response = await appWorker.fetch(request, env, ctx);
      return appendCookies(response, [centralClearCookie()]);
    }

    if (method === 'GET' && url.pathname === '/auth/switch') {
      await deleteCentralSession(request, env);
      return new Response(null, {
        status: 302,
        headers: {
          Location: '/?starrySwitch=1',
          'Cache-Control': 'no-store',
          'Set-Cookie': `${clearCookie(LOCAL_COOKIE)}, ${centralClearCookie()}`
        }
      });
    }

    const bridged = await localSessionFromCentral(request, env).catch(error => {
      console.warn('Starry ecosystem auto-login failed', error);
      return null;
    });
    const effectiveRequest = bridged ? requestWithLocalCookie(request, bridged.token) : request;
    let response = await appWorker.fetch(effectiveRequest, env, ctx);
    if (bridged) response = appendCookies(response, [bridged.setCookie]);
    return injectSso(response);
  }
};
