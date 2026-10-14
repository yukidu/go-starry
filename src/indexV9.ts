import QRCode from "qrcode-svg";
import baseWorker from "./index";
import type { Env, PersonalAlias, ShortLink, User } from "./types";
import { appJs, adminPersonalizationPage, homePage, rankingPage, styles } from "./uiV9";
import { html, isAllowedDestination, isValidNamespace, isValidSlug, json, normalizeSlug, sha256 } from "./security";
import { getUserFromRequest } from "./db";
import { enrichStarryUser } from "./starrySso";
import { hydrateYouTubePreviews } from "./youtubePreview";
import {
  MAX_CUSTOM_ALIASES,
  RANDOM_SLUG_ALPHABET,
  RANDOM_SLUG_ATTEMPTS,
  RANDOM_SLUG_LENGTH,
  RANDOM_SLUG_SPACE,
  aliasHistoryOwner,
  customAliasRestriction,
  isSuperAdmin,
  normalizeAlias,
  recordAliasOwnership
} from "./policyV9";

const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_CREATES = 30;

interface LinkRow extends ShortLink {
  public_slug?: string | null;
}

interface AdminReservedAlias {
  slug: string;
  created_at: string;
  note: string | null;
  occupied: number;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/styles.css") return new Response(styles, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" } });
    if (path === "/app.js") return new Response(appJs, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
    if (request.method === "GET" && path === "/") return html(homePage());

    if (request.method === "GET" && path === "/ranking") {
      const user = await getUserFromRequest(request, env);
      if (!user) return Response.redirect(`${url.origin}/auth/starry`, 302);
      return html(rankingPage());
    }

    if (request.method === "GET" && path === "/admin/personalization") {
      const user = await getUserFromRequest(request, env);
      if (!user) return Response.redirect(`${url.origin}/auth/starry`, 302);
      if (!(await isSuperAdmin(env, user))) return html(`<main class="shell"><div class="card"><a href="/">← 回繁星任意門</a><h1>沒有權限</h1><p>此頁僅限超級管理員使用。</p></div></main>`, 403);
      return html(adminPersonalizationPage());
    }

    if (path.startsWith("/api/")) {
      const handled = await handleV9Api(request, env, ctx);
      if (handled) return handled;
      return baseWorker.fetch(request, env, ctx);
    }

    if (request.method === "GET") {
      const nested = path.match(/^\/([a-zA-Z0-9_-]{2,32})\/([a-zA-Z0-9_-]{3,50})$/);
      if (nested) return redirectPublicRoute(request, env, ctx, nested[1], nested[2]);
      const direct = path.match(/^\/([a-zA-Z0-9_-]{3,50})$/);
      if (direct) return redirectPublicRoute(request, env, ctx, "", direct[1]);
    }

    return baseWorker.fetch(request, env, ctx);
  }
};

async function authenticatedUser(request: Request, env: Env): Promise<User | null> {
  return getUserFromRequest(request, env);
}

async function handleV9Api(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "GET" && path === "/api/me") {
    const user = await authenticatedUser(request, env);
    if (!user) return json({ user: null });
    const enriched = await enrichStarryUser(env, user);
    return json({ user: { ...enriched, is_super_admin: await isSuperAdmin(env, user) } });
  }

  const user = await authenticatedUser(request, env);
  if (!user) {
    if (path === "/api/ranking" || path.startsWith("/api/admin/") || path === "/api/links" || path.startsWith("/api/links/") || path === "/api/aliases") {
      return json({ error: "請先登入" }, 401);
    }
    return null;
  }

  if (request.method === "GET" && path === "/api/aliases") {
    const base = await baseWorker.fetch(request, env, ctx);
    if (!base.ok) return base;
    const data = await base.json() as { aliases?: PersonalAlias[]; max_custom?: number };
    return json({ ...data, is_super_admin: await isSuperAdmin(env, user) });
  }

  if (request.method === "POST" && path === "/api/aliases") {
    return createCustomAlias(request, env, user);
  }

  if (request.method === "GET" && path === "/api/links") {
    const result = await env.DB.prepare(`
      SELECT id, owner_user_id, COALESCE(public_slug, slug) AS slug, namespace_slug, destination_url, title, note,
             preview_title, preview_image_url, metadata_checked_at, status, created_at, updated_at,
             expires_at, redirect_type, click_count, last_clicked_at
      FROM short_links
      WHERE owner_user_id = ?
      ORDER BY created_at DESC
      LIMIT 500
    `).bind(user.id).all<ShortLink>();
    return json({ links: await hydrateYouTubePreviews(env, result.results || []) });
  }

  if (request.method === "POST" && path === "/api/links") {
    return createLink(request, env, ctx, user);
  }

  if (request.method === "GET" && path === "/api/ranking") {
    const result = await env.DB.prepare(`
      SELECT lower(namespace_slug) AS slug, COUNT(*) AS short_count
      FROM short_links
      WHERE trim(COALESCE(namespace_slug, '')) <> ''
      GROUP BY lower(namespace_slug)
      HAVING COUNT(*) > 0
      ORDER BY short_count DESC, slug ASC
      LIMIT 200
    `).all<{ slug: string; short_count: number }>();
    return json({ ranking: result.results || [] });
  }

  if (path === "/api/admin/personalization" && request.method === "GET") {
    if (!(await isSuperAdmin(env, user))) return json({ error: "沒有超級管理員權限" }, 403);
    const result = await env.DB.prepare(`
      SELECT r.slug, r.created_at, r.note,
             EXISTS(SELECT 1 FROM personal_aliases p WHERE lower(p.slug) = lower(r.slug)) AS occupied
      FROM reserved_aliases r
      ORDER BY lower(r.slug) ASC
    `).all<AdminReservedAlias>();
    return json({
      reserved_aliases: result.results || [],
      short_code_rule: {
        length: RANDOM_SLUG_LENGTH,
        alphabet: RANDOM_SLUG_ALPHABET,
        alphabet_count: RANDOM_SLUG_ALPHABET.length,
        combinations_per_personalized_url: RANDOM_SLUG_SPACE,
        case_sensitive: false,
        scope: "每一組個人化網址各自獨立計算",
        excluded_reason: "排除容易看錯、聽錯的英文字母與數字"
      },
      custom_alias_rules: [
        "自訂個人化網址長度 2–32 字元，只能使用英文字母、數字、-、_",
        "不可使用管理員保留名稱",
        "不可使用 n + 7 位數字（Starry ID 會員編號保留格式）",
        "不可使用純 7 位數字（安麗直銷商編號保留格式）",
        "Starry ID 自動身份網址不受自訂保留規則影響，仍優先給真正擁有者",
        "曾經產生過公開短網址的個人化網址不可轉讓給其他會員"
      ]
    });
  }

  if (path === "/api/admin/personalization/reserved" && request.method === "POST") {
    if (!(await isSuperAdmin(env, user))) return json({ error: "沒有超級管理員權限" }, 403);
    const body = await request.json().catch(() => ({})) as { slug?: string; note?: string };
    const slug = normalizeAlias(body.slug);
    if (!/^[a-z0-9][a-z0-9_-]{1,31}$/.test(slug)) return json({ error: "保留名稱需為 2–32 字元，只能使用英文、數字、-、_" }, 400);
    const occupied = await env.DB.prepare(`SELECT owner_user_id FROM personal_aliases WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first();
    if (occupied) return json({ error: "這組個人化網址目前已被會員使用，不能強制收回" }, 409);
    await env.DB.prepare(`
      INSERT INTO reserved_aliases (slug, created_by_user_id, created_at, note)
      VALUES (?, ?, datetime('now'), ?)
      ON CONFLICT(slug) DO UPDATE SET note = excluded.note
    `).bind(slug, user.id, String(body.note || "").trim() || null).run();
    return json({ ok: true, slug }, 201);
  }

  const reservedDelete = path.match(/^\/api\/admin\/personalization\/reserved\/([a-zA-Z0-9_-]{2,32})$/);
  if (reservedDelete && request.method === "DELETE") {
    if (!(await isSuperAdmin(env, user))) return json({ error: "沒有超級管理員權限" }, 403);
    await env.DB.prepare(`DELETE FROM reserved_aliases WHERE lower(slug) = lower(?)`).bind(reservedDelete[1]).run();
    return json({ ok: true });
  }

  const linkMatch = path.match(/^\/api\/links\/([0-9a-f-]{36})(?:\/(toggle|qr\.svg|metadata))?$/i);
  if (linkMatch) {
    const id = linkMatch[1];
    const action = linkMatch[2] || "";
    if (request.method === "GET" && action === "qr.svg") return linkQr(request, env, user, id);
    if (request.method === "PUT" && !action) return updateLink(request, env, ctx, user, id);
    if (request.method === "DELETE" && !action) return deleteLink(env, user, id);
    if (request.method === "POST" && action === "toggle") return json({ error: "停用功能已移除" }, 404);
  }

  return null;
}

async function createCustomAlias(request: Request, env: Env, user: User): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { slug?: string };
  const slug = normalizeAlias(body.slug);
  if (!isValidNamespace(slug)) return json({ error: "個人化網址需為 2–32 字元，只能使用英文小寫、數字、-、_" }, 400);
  const restricted = customAliasRestriction(slug);
  if (restricted) return json({ error: restricted }, 409);

  const reserved = await env.DB.prepare(`SELECT 1 AS ok FROM reserved_aliases WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first();
  if (reserved) return json({ error: "這組個人化網址由管理員保留，不能使用" }, 409);

  const historyOwner = await aliasHistoryOwner(env, slug);
  if (historyOwner && historyOwner !== user.id) return json({ error: "這組個人化網址曾由其他會員使用，不能轉讓" }, 409);

  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM personal_aliases WHERE owner_user_id = ? AND kind = 'custom'`).bind(user.id).first<{ n: number }>();
  if (Number(count?.n || 0) >= MAX_CUSTOM_ALIASES) return json({ error: `自訂個人化網址最多 ${MAX_CUSTOM_ALIASES} 組` }, 409);

  const localOwner = await env.DB.prepare(`SELECT owner_user_id FROM personal_aliases WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first();
  if (localOwner) return json({ error: "這組個人化網址已被使用" }, 409);

  const centralOwner = await env.STARRY_ID_DB.prepare(`SELECT userId FROM public_cards WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first();
  if (centralOwner) return json({ error: "這組網址是 Starry ID 身份網址，不能作為自訂帳號" }, 409);

  await env.DB.prepare(`
    INSERT INTO personal_aliases (id, owner_user_id, slug, kind, created_at, updated_at)
    VALUES (?, ?, ?, 'custom', datetime('now'), datetime('now'))
  `).bind(crypto.randomUUID(), user.id, slug).run();
  return json({ aliases: await listAliases(env, user.id) }, 201);
}

async function listAliases(env: Env, userId: string): Promise<PersonalAlias[]> {
  const result = await env.DB.prepare(`
    SELECT id, owner_user_id, slug, kind, created_at, updated_at
    FROM personal_aliases
    WHERE owner_user_id = ?
    ORDER BY CASE kind WHEN 'starry' THEN 0 ELSE 1 END, created_at ASC
  `).bind(userId).all<PersonalAlias>();
  return result.results || [];
}

async function ownsAlias(env: Env, userId: string, slug: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT id FROM personal_aliases
    WHERE owner_user_id = ? AND lower(slug) = lower(?)
    LIMIT 1
  `).bind(userId, slug).first();
  return Boolean(row);
}

async function checkCreateRate(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`
    SELECT COUNT(*) AS n
    FROM short_links
    WHERE owner_user_id = ? AND created_at >= datetime('now', ?)
  `).bind(userId, `-${RATE_WINDOW_MINUTES} minutes`).first<{ n: number }>();
  return Number(row?.n || 0) < RATE_MAX_CREATES;
}

async function routeUnavailable(env: Env, namespace: string, publicSlug: string, excludeId = ""): Promise<boolean> {
  const active = await env.DB.prepare(`
    SELECT id FROM short_links
    WHERE lower(COALESCE(namespace_slug, '')) = lower(?)
      AND lower(COALESCE(public_slug, slug)) = lower(?)
      AND id <> ?
    LIMIT 1
  `).bind(namespace, publicSlug, excludeId).first();
  if (active) return true;
  const reserved = await env.DB.prepare(`
    SELECT 1 AS ok FROM reserved_short_routes
    WHERE lower(namespace_slug) = lower(?) AND lower(public_slug) = lower(?)
    LIMIT 1
  `).bind(namespace, publicSlug).first();
  return Boolean(reserved);
}

async function generatePublicSlug(env: Env, namespace: string): Promise<string | null> {
  for (let attempt = 0; attempt < RANDOM_SLUG_ATTEMPTS; attempt++) {
    const bytes = new Uint8Array(RANDOM_SLUG_LENGTH);
    crypto.getRandomValues(bytes);
    let slug = "";
    for (const byte of bytes) slug += RANDOM_SLUG_ALPHABET[byte % RANDOM_SLUG_ALPHABET.length];
    if (!(await routeUnavailable(env, namespace, slug))) return slug;
  }
  return null;
}

function internalSlug(): string {
  return `r${crypto.randomUUID().replace(/-/g, "")}`;
}

function fullShortUrl(origin: string, namespace: string, publicSlug: string): string {
  return namespace ? `${origin}/${namespace}/${publicSlug}` : `${origin}/${publicSlug}`;
}

async function createLink(request: Request, env: Env, ctx: ExecutionContext, user: User): Promise<Response> {
  if (!(await checkCreateRate(env, user.id))) return json({ error: `建立速度過快，請 ${RATE_WINDOW_MINUTES} 分鐘後再試` }, 429);
  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const destination = String(body.destination_url || "").trim();
  if (!isAllowedDestination(destination)) return json({ error: "只允許 http / https 網址" }, 400);

  const namespace = normalizeAlias(body.namespace_slug);
  const superAdmin = await isSuperAdmin(env, user);
  if (!namespace && !superAdmin) return json({ error: "建立短網址前必須選擇一組個人化網址" }, 400);
  if (namespace && !(await ownsAlias(env, user.id, namespace))) return json({ error: "這組個人化網址不屬於你的帳號" }, 403);

  if (namespace) {
    const owner = await aliasHistoryOwner(env, namespace);
    if (owner && owner !== user.id) return json({ error: "這組個人化網址曾由其他會員使用，不能轉讓" }, 409);
  }

  const publicSlug = body.slug ? normalizeSlug(String(body.slug)) : await generatePublicSlug(env, namespace);
  if (!publicSlug) return json({ error: "短碼暫時無法產生，請再試一次" }, 503);
  if (!isValidSlug(publicSlug)) return json({ error: "短碼需為 3–50 字元，只能使用英文、數字、-、_，且不能是系統保留字" }, 400);
  if (await routeUnavailable(env, namespace, publicSlug)) return json({ error: "這個短碼在此個人化網址下已被使用或曾被刪除" }, 409);

  const id = crypto.randomUUID();
  let expiresAt: string | null = null;
  if (body.expires_at) {
    const parsed = new Date(body.expires_at);
    if (Number.isNaN(parsed.getTime())) return json({ error: "到期日格式不正確" }, 400);
    expiresAt = parsed.toISOString();
  }

  await env.DB.prepare(`
    INSERT INTO short_links (
      id, owner_user_id, slug, public_slug, namespace_slug, destination_url, title, note,
      preview_title, preview_image_url, metadata_checked_at, status, created_at, updated_at,
      expires_at, redirect_type, click_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 'active', datetime('now'), datetime('now'), ?, 302, 0)
  `).bind(id, user.id, internalSlug(), publicSlug, namespace, destination, body.title || null, body.note || null, expiresAt).run();

  if (namespace) await recordAliasOwnership(env, namespace, user.id);
  await refreshMetadata(request, env, ctx, id);
  return json({ link: { id, slug: publicSlug, namespace_slug: namespace, destination_url: destination, short_url: fullShortUrl(new URL(request.url).origin, namespace, publicSlug) } }, 201);
}

async function updateLink(request: Request, env: Env, ctx: ExecutionContext, user: User, id: string): Promise<Response> {
  const link = await env.DB.prepare(`
    SELECT *, COALESCE(public_slug, slug) AS public_slug
    FROM short_links
    WHERE id = ? AND owner_user_id = ?
    LIMIT 1
  `).bind(id, user.id).first<LinkRow>();
  if (!link) return json({ error: "找不到短網址" }, 404);

  const body = await request.json().catch(() => ({})) as Record<string, string>;
  const destination = body.destination_url !== undefined ? String(body.destination_url).trim() : link.destination_url;
  if (!isAllowedDestination(destination)) return json({ error: "只允許 http / https 網址" }, 400);
  const currentPublicSlug = String(link.public_slug || link.slug);
  const nextPublicSlug = body.slug !== undefined ? normalizeSlug(String(body.slug)) : currentPublicSlug;
  if (!isValidSlug(nextPublicSlug)) return json({ error: "短碼需為 3–50 字元，只能使用英文、數字、-、_" }, 400);
  const currentNamespace = normalizeAlias(link.namespace_slug);
  const nextNamespace = body.namespace_slug !== undefined ? normalizeAlias(body.namespace_slug) : currentNamespace;
  const superAdmin = await isSuperAdmin(env, user);
  if (!nextNamespace && !superAdmin) return json({ error: "一般會員的短網址必須使用個人化網址" }, 400);

  if (nextNamespace && nextNamespace !== currentNamespace && !(await ownsAlias(env, user.id, nextNamespace))) {
    return json({ error: "這組個人化網址不屬於你的帳號" }, 403);
  }
  if (nextNamespace) {
    const owner = await aliasHistoryOwner(env, nextNamespace);
    if (owner && owner !== user.id) return json({ error: "這組個人化網址曾由其他會員使用，不能轉讓" }, 409);
  }

  const routeChanged = nextNamespace.toLowerCase() !== currentNamespace.toLowerCase() || nextPublicSlug.toLowerCase() !== currentPublicSlug.toLowerCase();
  if (routeChanged && await routeUnavailable(env, nextNamespace, nextPublicSlug, id)) {
    return json({ error: "這個短碼在此個人化網址下已被使用或曾被刪除" }, 409);
  }

  await env.DB.prepare(`
    UPDATE short_links
    SET public_slug = ?, namespace_slug = ?, destination_url = ?, title = ?, note = ?, updated_at = datetime('now')
    WHERE id = ? AND owner_user_id = ?
  `).bind(nextPublicSlug, nextNamespace, destination, body.title ?? link.title, body.note ?? link.note, id, user.id).run();

  if (nextNamespace) await recordAliasOwnership(env, nextNamespace, user.id);
  if (destination !== link.destination_url) await refreshMetadata(request, env, ctx, id);
  return json({ ok: true, slug: nextPublicSlug, namespace_slug: nextNamespace, short_url: fullShortUrl(new URL(request.url).origin, nextNamespace, nextPublicSlug) });
}

async function deleteLink(env: Env, user: User, id: string): Promise<Response> {
  const result = await env.DB.prepare(`DELETE FROM short_links WHERE id = ? AND owner_user_id = ?`).bind(id, user.id).run();
  if (!result.meta.changes) return json({ error: "找不到短網址" }, 404);
  return json({ ok: true });
}

async function linkQr(request: Request, env: Env, user: User, id: string): Promise<Response> {
  const link = await env.DB.prepare(`
    SELECT COALESCE(public_slug, slug) AS public_slug, namespace_slug
    FROM short_links
    WHERE id = ? AND owner_user_id = ?
    LIMIT 1
  `).bind(id, user.id).first<{ public_slug: string; namespace_slug: string }>();
  if (!link) return json({ error: "找不到短網址" }, 404);
  const shortUrl = fullShortUrl(new URL(request.url).origin, link.namespace_slug || "", link.public_slug);
  const svg = new QRCode({ content: shortUrl, padding: 4, width: 512, height: 512, ecl: "M", join: true }).svg();
  return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "content-disposition": `inline; filename="${link.public_slug}.svg"`, "cache-control": "private, max-age=300" } });
}

async function refreshMetadata(request: Request, env: Env, ctx: ExecutionContext, id: string): Promise<void> {
  const target = new URL(`/api/links/${id}/metadata`, request.url);
  const headers = new Headers();
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  try {
    await baseWorker.fetch(new Request(target, { method: "POST", headers }), env, ctx);
  } catch (error) {
    console.warn("metadata refresh failed", error);
  }
}

async function redirectPublicRoute(request: Request, env: Env, ctx: ExecutionContext, namespace: string, publicSlug: string): Promise<Response> {
  const link = await env.DB.prepare(`
    SELECT *
    FROM short_links
    WHERE lower(COALESCE(namespace_slug, '')) = lower(?)
      AND lower(COALESCE(public_slug, slug)) = lower(?)
    LIMIT 1
  `).bind(namespace, publicSlug).first<LinkRow>();
  if (!link || link.status !== "active") return new Response("Short link not found", { status: 404 });
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return new Response("Short link expired", { status: 410 });
  if (!isAllowedDestination(link.destination_url)) return new Response("Unsafe destination", { status: 400 });
  ctx.waitUntil(recordClick(request, env, link));
  return Response.redirect(link.destination_url, link.redirect_type || 302);
}

async function recordClick(request: Request, env: Env, link: LinkRow): Promise<void> {
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
      env.DB.prepare(`
        INSERT INTO link_clicks (id, short_link_id, clicked_at, referrer, country, device_type, browser, os, anonymized_ip_hash, user_agent_summary)
        VALUES (?, ?, datetime('now'), ?, ?, ?, ?, ?, ?, ?)
      `).bind(crypto.randomUUID(), link.id, referrer, country, summary.device, summary.browser, summary.os, ipHash, summary.summary)
    ]);
  } catch (error) {
    console.error("click analytics failed", error);
  }
}

function summarizeUa(ua: string): { device: string; browser: string; os: string; summary: string } {
  const value = ua.toLowerCase();
  const device = /mobile|iphone|android/.test(value) ? "mobile" : /ipad|tablet/.test(value) ? "tablet" : "desktop";
  const browser = value.includes("edg/") ? "Edge" : value.includes("chrome/") ? "Chrome" : value.includes("safari/") ? "Safari" : value.includes("firefox/") ? "Firefox" : "Other";
  const os = value.includes("iphone") || value.includes("ipad") ? "iOS" : value.includes("android") ? "Android" : value.includes("windows") ? "Windows" : value.includes("mac os") ? "macOS" : value.includes("linux") ? "Linux" : "Other";
  return { device, browser, os, summary: `${device}/${browser}/${os}` };
}
