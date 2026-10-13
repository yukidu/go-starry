import QRCode from "qrcode-svg";
import type { Env, ShortLink } from "./types";
import { appJs, homePage, simplePage, styles } from "./ui";
import { clearCookie, html, isAllowedDestination, isValidSlug, json, normalizeSlug, parseCookies, randomToken, sha256 } from "./security";
import { getUserFromRequest, listLinks, revokeSession } from "./db";
import { enrichStarryUser, finishStarryAuth, startStarryAuth } from "./starrySso";

const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_CREATES = 30;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/styles.css") return new Response(styles, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=3600" } });
    if (path === "/app.js") return new Response(appJs, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=3600" } });
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /api/\nDisallow: /auth/\n", { headers: { "content-type": "text/plain" } });

    if (request.method === "GET" && path === "/") return html(homePage());
    if (request.method === "GET" && path === "/privacy") return html(simplePage("隱私權政策", `<p>繁星短網址會保存會員基本登入資料、會員建立的短網址，以及服務運作所需的基本點擊統計。服務不以分析目的保存完整 IP；如啟用匿名雜湊，只用於防濫用與基本統計。</p><p>會員身份由 Starry ID 中央會員系統驗證；短網址與點擊資料仍由 Go Starry 獨立保存。</p>`));
    if (request.method === "GET" && path === "/terms") return html(simplePage("服務條款", `<p>禁止使用本服務散布釣魚、惡意程式、詐騙、侵權或其他違法內容。平台可停用疑似濫用的短網址或帳號。</p><p>短網址可能因安全、維護或政策需要而暫停服務。</p>`));

    if (request.method === "GET" && (path === "/auth/starry" || path === "/auth/google" || path === "/auth/google/callback")) return startStarryAuth();
    if (request.method === "GET" && path === "/auth/callback") return finishStarryAuth(request, env);

    if (path.startsWith("/api/")) return handleApi(request, env);

    if (request.method === "GET" && /^\/[a-zA-Z0-9_-]{3,50}$/.test(path)) {
      const slug = path.slice(1).toLowerCase();
      return redirectBySlug(request, env, ctx, slug);
    }

    return new Response("Not found", { status: 404 });
  }
};

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (request.method === "GET" && path === "/api/me") {
    const user = await getUserFromRequest(request, env);
    return json({ user: user ? await enrichStarryUser(env, user) : null });
  }

  if (request.method === "POST" && path === "/api/logout") {
    const token = parseCookies(request.headers.get("cookie")).starry_session;
    if (token) await revokeSession(env, token);
    return json({ ok: true }, 200, { "set-cookie": clearCookie("starry_session") });
  }

  const user = await getUserFromRequest(request, env);
  if (!user) return json({ error: "請先登入" }, 401);

  if (request.method === "GET" && path === "/api/links") return json({ links: await listLinks(env, user.id) });

  if (request.method === "POST" && path === "/api/links") {
    const allowed = await checkCreateRate(env, user.id);
    if (!allowed) return json({ error: `建立速度過快，請 ${RATE_WINDOW_MINUTES} 分鐘後再試` }, 429);
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const destination = String(body.destination_url || "").trim();
    if (!isAllowedDestination(destination)) return json({ error: "只允許 http / https 網址" }, 400);
    const slug = body.slug ? normalizeSlug(String(body.slug)) : await generateSlug(env);
    if (!isValidSlug(slug)) return json({ error: "短碼需為 3–50 字元，只能使用英文小寫、數字、-、_，且不能是系統保留字" }, 400);
    const exists = await env.DB.prepare(`SELECT id FROM short_links WHERE slug = ? LIMIT 1`).bind(slug).first();
    if (exists) return json({ error: "這個短碼已被使用" }, 409);
    const id = crypto.randomUUID();
    const expiresAt = body.expires_at ? new Date(body.expires_at).toISOString() : null;
    await env.DB.prepare(`
      INSERT INTO short_links (id, owner_user_id, slug, destination_url, title, note, status, created_at, updated_at, expires_at, redirect_type, click_count)
      VALUES (?, ?, ?, ?, ?, ?, 'active', datetime('now'), datetime('now'), ?, 302, 0)
    `).bind(id, user.id, slug, destination, body.title || null, body.note || null, expiresAt).run();
    return json({ link: { id, slug, destination_url: destination } }, 201);
  }

  const m = path.match(/^\/api\/links\/([0-9a-f-]{36})(?:\/(toggle|qr\.svg))?$/i);
  if (!m) return json({ error: "Not found" }, 404);
  const id = m[1];
  const action = m[2];
  const link = await env.DB.prepare(`SELECT * FROM short_links WHERE id = ? AND owner_user_id = ? LIMIT 1`).bind(id, user.id).first<ShortLink>();
  if (!link) return json({ error: "找不到短網址" }, 404);

  if (request.method === "DELETE" && !action) {
    await env.DB.prepare(`DELETE FROM short_links WHERE id = ? AND owner_user_id = ?`).bind(id, user.id).run();
    return json({ ok: true });
  }

  if (request.method === "POST" && action === "toggle") {
    const next = link.status === "active" ? "disabled" : "active";
    await env.DB.prepare(`UPDATE short_links SET status = ?, updated_at = datetime('now') WHERE id = ? AND owner_user_id = ?`).bind(next, id, user.id).run();
    return json({ ok: true, status: next });
  }

  if (request.method === "GET" && action === "qr.svg") {
    const shortUrl = `${url.origin}/${link.slug}`;
    const svg = new QRCode({ content: shortUrl, padding: 4, width: 512, height: 512, ecl: "M", join: true }).svg();
    return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "content-disposition": `inline; filename="${link.slug}.svg"`, "cache-control": "private, max-age=300" } });
  }

  if (request.method === "PUT" && !action) {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const destination = body.destination_url ? String(body.destination_url).trim() : link.destination_url;
    if (!isAllowedDestination(destination)) return json({ error: "只允許 http / https 網址" }, 400);
    await env.DB.prepare(`UPDATE short_links SET destination_url = ?, title = ?, note = ?, updated_at = datetime('now') WHERE id = ? AND owner_user_id = ?`)
      .bind(destination, body.title ?? link.title, body.note ?? link.note, id, user.id).run();
    return json({ ok: true });
  }

  return json({ error: "Not found" }, 404);
}

async function redirectBySlug(request: Request, env: Env, ctx: ExecutionContext, slug: string): Promise<Response> {
  const link = await env.DB.prepare(`SELECT * FROM short_links WHERE slug = ? LIMIT 1`).bind(slug).first<ShortLink>();
  if (!link || link.status !== "active") return new Response("Short link not found", { status: 404 });
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return new Response("Short link expired", { status: 410 });
  if (!isAllowedDestination(link.destination_url)) return new Response("Unsafe destination", { status: 400 });
  ctx.waitUntil(recordClick(request, env, link));
  return Response.redirect(link.destination_url, link.redirect_type || 302);
}

async function recordClick(request: Request, env: Env, link: ShortLink): Promise<void> {
  try {
    const ua = request.headers.get("user-agent") || "";
    const ip = request.headers.get("cf-connecting-ip") || "";
    const ipHash = ip && env.IP_HASH_SALT ? await sha256(`${env.IP_HASH_SALT}:${ip}`) : null;
    const referrer = request.headers.get("referer");
    const cf = (request as Request & { cf?: { country?: string } }).cf;
    const country = cf?.country || null;
    const summary = summarizeUa(ua);
    await env.DB.batch([
      env.DB.prepare(`UPDATE short_links SET click_count = click_count + 1, last_clicked_at = datetime('now') WHERE id = ?`).bind(link.id),
      env.DB.prepare(`INSERT INTO link_clicks (id, short_link_id, clicked_at, referrer, country, device_type, browser, os, anonymized_ip_hash, user_agent_summary) VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), link.id, referrer, country, summary.device, summary.browser, summary.os, ipHash, summary.summary)
    ]);
  } catch (err) {
    console.error("click analytics failed", err);
  }
}

function summarizeUa(ua: string): { device: string; browser: string; os: string; summary: string } {
  const l = ua.toLowerCase();
  const device = /mobile|iphone|android/.test(l) ? "mobile" : /ipad|tablet/.test(l) ? "tablet" : "desktop";
  const browser = l.includes("edg/") ? "Edge" : l.includes("chrome/") ? "Chrome" : l.includes("safari/") ? "Safari" : l.includes("firefox/") ? "Firefox" : "Other";
  const os = l.includes("iphone") || l.includes("ipad") ? "iOS" : l.includes("android") ? "Android" : l.includes("windows") ? "Windows" : l.includes("mac os") ? "macOS" : l.includes("linux") ? "Linux" : "Other";
  return { device, browser, os, summary: `${device}/${browser}/${os}` };
}

async function generateSlug(env: Env): Promise<string> {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  for (let attempt = 0; attempt < 8; attempt++) {
    const bytes = new Uint8Array(7);
    crypto.getRandomValues(bytes);
    let slug = "";
    for (const b of bytes) slug += alphabet[b % alphabet.length];
    const exists = await env.DB.prepare(`SELECT 1 FROM short_links WHERE slug = ? LIMIT 1`).bind(slug).first();
    if (!exists) return slug;
  }
  return randomToken(8).slice(0, 10).toLowerCase();
}

async function checkCreateRate(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM short_links WHERE owner_user_id = ? AND created_at >= datetime('now', ?)`)
    .bind(userId, `-${RATE_WINDOW_MINUTES} minutes`).first<{ n: number }>();
  return Number(row?.n || 0) < RATE_MAX_CREATES;
}
