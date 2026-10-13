import QRCode from "qrcode-svg";
import type { Env, PersonalAlias, ShortLink, User } from "./types";
import { appJs, homePage, simplePage, styles } from "./ui";
import { iconPng, iconSvg, manifestJson, serviceWorkerJs } from "./pwa";
import { clearCookie, html, isAllowedDestination, isValidNamespace, isValidSlug, json, normalizeSlug, parseCookies, sha256 } from "./security";
import { getUserFromRequest, listLinks, revokeSession } from "./db";
import { enrichStarryUser, finishStarryAuth, startStarryAuth } from "./starrySso";

const RATE_WINDOW_MINUTES = 10;
const RATE_MAX_CREATES = 30;
const MAX_CUSTOM_ALIASES = 4;
const RANDOM_SLUG_ALPHABET = "AFHKRWY23456789";
const RANDOM_SLUG_LENGTH = 4;
const RANDOM_SLUG_ATTEMPTS = 64;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path === "/styles.css") return new Response(styles, { headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" } });
    if (path === "/app.js") return new Response(appJs, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" } });
    if (path === "/manifest.webmanifest") return new Response(manifestJson, { headers: { "content-type": "application/manifest+json; charset=utf-8", "cache-control": "public, max-age=3600" } });
    if (path === "/sw.js") return new Response(serviceWorkerJs, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-cache", "service-worker-allowed": "/" } });
    if (path === "/icon.svg") return new Response(iconSvg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "cache-control": "public, max-age=604800, immutable" } });
    if (path === "/icon-192.png") return iconPng(192);
    if (path === "/icon-512.png") return iconPng(512);
    if (path === "/robots.txt") return new Response("User-agent: *\nDisallow: /api/\nDisallow: /auth/\n", { headers: { "content-type": "text/plain" } });

    if (request.method === "GET" && path === "/") return html(homePage());
    if (request.method === "GET" && path === "/privacy") return html(simplePage("隱私權政策", `<p>繁星任意門會保存會員基本登入資料、會員建立的短網址、個人化網址與服務運作所需的基本點擊統計。服務不以分析目的保存完整 IP；如啟用匿名雜湊，只用於防濫用與基本統計。</p><p>會員身份與固定個人資料由 Starry ID 中央會員系統驗證；短網址、個人化網址、網址預覽與點擊資料仍由繁星任意門獨立保存。</p>`));
    if (request.method === "GET" && path === "/terms") return html(simplePage("服務條款", `<p>禁止使用本服務散布釣魚、惡意程式、詐騙、侵權或其他違法內容。平台可停用疑似濫用的短網址或帳號。</p><p>短網址可能因安全、維護或政策需要而暫停服務。</p>`));

    if (request.method === "GET" && (path === "/auth/starry" || path === "/auth/google" || path === "/auth/google/callback")) return startStarryAuth();
    if (request.method === "GET" && path === "/auth/callback") return finishStarryAuth(request, env);

    if (path.startsWith("/api/")) return handleApi(request, env);

    const nested = path.match(/^\/([a-zA-Z0-9_-]{2,32})\/([a-zA-Z0-9_-]{3,50})$/);
    if (request.method === "GET" && nested) return redirectByRoute(request, env, ctx, nested[2].toLowerCase(), nested[1].toLowerCase());

    if (request.method === "GET" && /^\/[a-zA-Z0-9_-]{3,50}$/.test(path)) {
      return redirectByRoute(request, env, ctx, path.slice(1).toLowerCase(), "");
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

  if (request.method === "GET" && path === "/api/aliases") {
    const enriched = await enrichStarryUser(env, user);
    await syncStarryAlias(env, user.id, enriched.starry_profile_url || null);
    return json({ aliases: await listAliases(env, user.id), max_custom: MAX_CUSTOM_ALIASES });
  }

  if (request.method === "POST" && path === "/api/aliases") {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const slug = normalizeSlug(String(body.slug || ""));
    if (!isValidNamespace(slug)) return json({ error: "個人化網址需為 2–32 字元，只能使用英文小寫、數字、-、_" }, 400);
    const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM personal_aliases WHERE owner_user_id = ? AND kind = 'custom'`).bind(user.id).first<{ n: number }>();
    if (Number(count?.n || 0) >= MAX_CUSTOM_ALIASES) return json({ error: `自訂個人化網址最多 ${MAX_CUSTOM_ALIASES} 組` }, 409);
    const localOwner = await env.DB.prepare(`SELECT owner_user_id FROM personal_aliases WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first<{ owner_user_id: string }>();
    if (localOwner) return json({ error: "這組個人化網址已被使用" }, 409);
    const centralOwner = await env.STARRY_ID_DB.prepare(`SELECT userId FROM public_cards WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first<{ userId: string }>();
    if (centralOwner) return json({ error: "這組網址是 Starry ID 公開頁編號，不能作為自訂帳號" }, 409);
    await env.DB.prepare(`INSERT INTO personal_aliases (id, owner_user_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, 'custom', datetime('now'), datetime('now'))`)
      .bind(crypto.randomUUID(), user.id, slug).run();
    return json({ aliases: await listAliases(env, user.id) }, 201);
  }

  const aliasMatch = path.match(/^\/api\/aliases\/([0-9a-f-]{36})$/i);
  if (request.method === "DELETE" && aliasMatch) {
    const result = await env.DB.prepare(`DELETE FROM personal_aliases WHERE id = ? AND owner_user_id = ? AND kind = 'custom'`).bind(aliasMatch[1], user.id).run();
    if (!result.meta.changes) return json({ error: "找不到可刪除的自訂網址" }, 404);
    return json({ ok: true, aliases: await listAliases(env, user.id) });
  }

  if (request.method === "GET" && path === "/api/links") return json({ links: await listLinks(env, user.id) });

  if (request.method === "POST" && path === "/api/links") {
    const allowed = await checkCreateRate(env, user.id);
    if (!allowed) return json({ error: `建立速度過快，請 ${RATE_WINDOW_MINUTES} 分鐘後再試` }, 429);
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const destination = String(body.destination_url || "").trim();
    if (!isAllowedDestination(destination)) return json({ error: "只允許 http / https 網址" }, 400);
    const namespace = normalizeSlug(String(body.namespace_slug || ""));
    if (namespace && !(await ownsAlias(env, user.id, namespace))) return json({ error: "這組個人化網址不屬於你的帳號" }, 403);
    const slug = body.slug ? normalizeSlug(String(body.slug)) : await generateSlug(env);
    if (!slug) return json({ error: "短碼暫時無法產生，請再試一次" }, 503);
    if (!isValidSlug(slug)) return json({ error: "短碼需為 3–50 字元，只能使用英文小寫、數字、-、_，且不能是系統保留字" }, 400);
    const exists = await env.DB.prepare(`SELECT id FROM short_links WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first();
    if (exists) return json({ error: "這個短碼已被使用" }, 409);
    const id = crypto.randomUUID();
    const expiresAt = body.expires_at ? new Date(body.expires_at).toISOString() : null;
    const metadata = await readDestinationMetadata(destination);
    await env.DB.prepare(`
      INSERT INTO short_links (id, owner_user_id, slug, namespace_slug, destination_url, title, note, preview_title, preview_image_url, metadata_checked_at, status, created_at, updated_at, expires_at, redirect_type, click_count)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 'active', datetime('now'), datetime('now'), ?, 302, 0)
    `).bind(id, user.id, slug, namespace, destination, body.title || null, body.note || null, metadata.title, metadata.image, expiresAt).run();
    return json({ link: { id, slug, namespace_slug: namespace, destination_url: destination, short_url: fullShortUrl(url.origin, namespace, slug) } }, 201);
  }

  const m = path.match(/^\/api\/links\/([0-9a-f-]{36})(?:\/(toggle|qr\.svg|metadata))?$/i);
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

  if (request.method === "POST" && action === "metadata") {
    const metadata = await readDestinationMetadata(link.destination_url);
    await env.DB.prepare(`UPDATE short_links SET preview_title = ?, preview_image_url = ?, metadata_checked_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND owner_user_id = ?`)
      .bind(metadata.title, metadata.image, id, user.id).run();
    return json({ ok: true, preview_title: metadata.title, preview_image_url: metadata.image });
  }

  if (request.method === "GET" && action === "qr.svg") {
    const shortUrl = fullShortUrl(url.origin, link.namespace_slug || "", link.slug);
    const svg = new QRCode({ content: shortUrl, padding: 4, width: 512, height: 512, ecl: "M", join: true }).svg();
    return new Response(svg, { headers: { "content-type": "image/svg+xml; charset=utf-8", "content-disposition": `inline; filename="${link.slug}.svg"`, "cache-control": "private, max-age=300" } });
  }

  if (request.method === "PUT" && !action) {
    const body = await request.json().catch(() => ({})) as Record<string, string>;
    const destination = body.destination_url !== undefined ? String(body.destination_url).trim() : link.destination_url;
    if (!isAllowedDestination(destination)) return json({ error: "只允許 http / https 網址" }, 400);
    const nextSlug = body.slug !== undefined ? normalizeSlug(String(body.slug)) : link.slug;
    if (!isValidSlug(nextSlug)) return json({ error: "短碼需為 3–50 字元，只能使用英文小寫、數字、-、_" }, 400);
    if (nextSlug !== link.slug) {
      const collision = await env.DB.prepare(`SELECT id FROM short_links WHERE lower(slug) = lower(?) AND id <> ? LIMIT 1`).bind(nextSlug, id).first();
      if (collision) return json({ error: "這個短碼已被使用" }, 409);
    }
    const nextNamespace = body.namespace_slug !== undefined ? normalizeSlug(String(body.namespace_slug)) : (link.namespace_slug || "");
    if (nextNamespace && !(await ownsAlias(env, user.id, nextNamespace))) return json({ error: "這組個人化網址不屬於你的帳號" }, 403);
    let previewTitle = link.preview_title;
    let previewImage = link.preview_image_url;
    let metadataCheckedAt = link.metadata_checked_at;
    if (destination !== link.destination_url) {
      const metadata = await readDestinationMetadata(destination);
      previewTitle = metadata.title;
      previewImage = metadata.image;
      metadataCheckedAt = new Date().toISOString();
    }
    await env.DB.prepare(`UPDATE short_links SET slug = ?, namespace_slug = ?, destination_url = ?, title = ?, note = ?, preview_title = ?, preview_image_url = ?, metadata_checked_at = ?, updated_at = datetime('now') WHERE id = ? AND owner_user_id = ?`)
      .bind(nextSlug, nextNamespace, destination, body.title ?? link.title, body.note ?? link.note, previewTitle, previewImage, metadataCheckedAt, id, user.id).run();
    return json({ ok: true, slug: nextSlug, namespace_slug: nextNamespace, short_url: fullShortUrl(url.origin, nextNamespace, nextSlug) });
  }

  return json({ error: "Not found" }, 404);
}

async function listAliases(env: Env, userId: string): Promise<PersonalAlias[]> {
  const result = await env.DB.prepare(`SELECT id, owner_user_id, slug, kind, created_at, updated_at FROM personal_aliases WHERE owner_user_id = ? ORDER BY CASE kind WHEN 'starry' THEN 0 ELSE 1 END, created_at ASC`).bind(userId).all<PersonalAlias>();
  return result.results || [];
}

async function syncStarryAlias(env: Env, userId: string, profileUrl: string | null): Promise<void> {
  if (!profileUrl) return;
  let slug = "";
  try {
    const parts = new URL(profileUrl).pathname.split("/").filter(Boolean);
    slug = normalizeSlug(decodeURIComponent(parts.at(-1) || ""));
  } catch { return; }
  if (!isValidNamespace(slug)) return;
  await env.DB.prepare(`DELETE FROM personal_aliases WHERE owner_user_id = ? AND kind = 'custom' AND lower(slug) = lower(?)`).bind(userId, slug).run();
  const occupied = await env.DB.prepare(`SELECT owner_user_id FROM personal_aliases WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first<{ owner_user_id: string }>();
  if (occupied && occupied.owner_user_id !== userId) return;
  const existing = await env.DB.prepare(`SELECT id FROM personal_aliases WHERE owner_user_id = ? AND kind = 'starry' LIMIT 1`).bind(userId).first<{ id: string }>();
  if (existing) {
    await env.DB.prepare(`UPDATE personal_aliases SET slug = ?, updated_at = datetime('now') WHERE id = ?`).bind(slug, existing.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO personal_aliases (id, owner_user_id, slug, kind, created_at, updated_at) VALUES (?, ?, ?, 'starry', datetime('now'), datetime('now'))`).bind(crypto.randomUUID(), userId, slug).run();
  }
}

async function ownsAlias(env: Env, userId: string, slug: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT id FROM personal_aliases WHERE owner_user_id = ? AND lower(slug) = lower(?) LIMIT 1`).bind(userId, slug).first();
  return Boolean(row);
}

function fullShortUrl(origin: string, namespace: string, slug: string): string {
  return namespace ? `${origin}/${namespace}/${slug}` : `${origin}/${slug}`;
}

async function redirectByRoute(request: Request, env: Env, ctx: ExecutionContext, slug: string, namespace: string): Promise<Response> {
  const link = await env.DB.prepare(`SELECT * FROM short_links WHERE lower(slug) = lower(?) AND lower(namespace_slug) = lower(?) LIMIT 1`).bind(slug, namespace).first<ShortLink>();
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

async function generateSlug(env: Env): Promise<string | null> {
  for (let attempt = 0; attempt < RANDOM_SLUG_ATTEMPTS; attempt++) {
    const bytes = new Uint8Array(RANDOM_SLUG_LENGTH);
    crypto.getRandomValues(bytes);
    let slug = "";
    for (const b of bytes) slug += RANDOM_SLUG_ALPHABET[b % RANDOM_SLUG_ALPHABET.length];
    const exists = await env.DB.prepare(`SELECT 1 FROM short_links WHERE lower(slug) = lower(?) LIMIT 1`).bind(slug).first();
    if (!exists) return slug;
  }
  return null;
}

async function checkCreateRate(env: Env, userId: string): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM short_links WHERE owner_user_id = ? AND created_at >= datetime('now', ?)`)
    .bind(userId, `-${RATE_WINDOW_MINUTES} minutes`).first<{ n: number }>();
  return Number(row?.n || 0) < RATE_MAX_CREATES;
}

function isPrivateMetadataHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:")) return true;
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const a = Number(match[1]); const b = Number(match[2]);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}

function safeMetadataUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol) || isPrivateMetadataHost(url.hostname)) return null;
    return url;
  } catch { return null; }
}

function decodeEntities(value: string): string {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).trim();
}

function metaContent(htmlText: string, names: string[]): string | null {
  const wanted = new Set(names.map(v => v.toLowerCase()));
  for (const match of htmlText.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const attrs: Record<string, string> = {};
    for (const attr of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[attr[1].toLowerCase()] = attr[2] ?? attr[3] ?? attr[4] ?? "";
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (wanted.has(key) && attrs.content) return decodeEntities(attrs.content);
  }
  return null;
}

async function readDestinationMetadata(destination: string): Promise<{ title: string | null; image: string | null }> {
  let current = safeMetadataUrl(destination);
  if (!current) return { title: null, image: null };
  try {
    for (let hop = 0; hop < 4; hop++) {
      const response = await fetch(current.toString(), {
        redirect: "manual",
        headers: { "accept": "text/html,application/xhtml+xml", "user-agent": "Mozilla/5.0 (compatible; StarryAnywhereDoor/1.0; +https://go.starry.phd/)" },
        signal: AbortSignal.timeout(4500)
      });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return { title: null, image: null };
        current = safeMetadataUrl(new URL(location, current).toString());
        if (!current) return { title: null, image: null };
        continue;
      }
      if (!response.ok) return { title: null, image: null };
      const type = response.headers.get("content-type") || "";
      if (!type.toLowerCase().includes("text/html")) return { title: null, image: null };
      const length = Number(response.headers.get("content-length") || 0);
      if (length > 2_000_000) return { title: null, image: null };
      const text = (await response.text()).slice(0, 600_000);
      const ogTitle = metaContent(text, ["og:title", "twitter:title"]);
      const titleMatch = text.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
      const title = (ogTitle || (titleMatch ? decodeEntities(titleMatch[1].replace(/<[^>]+>/g, "")) : "")).slice(0, 300) || null;
      const rawImage = metaContent(text, ["og:image", "twitter:image", "twitter:image:src"]);
      let image: string | null = null;
      if (rawImage) {
        try {
          const resolved = new URL(rawImage, current);
          if (resolved.protocol === "https:" && !isPrivateMetadataHost(resolved.hostname)) image = resolved.toString().slice(0, 2000);
        } catch { image = null; }
      }
      return { title, image };
    }
  } catch (error) {
    console.error("metadata fetch failed", error);
  }
  return { title: null, image: null };
}
