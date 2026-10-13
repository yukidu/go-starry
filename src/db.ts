import type { Env, ShortLink, User } from "./types";
import { randomToken, sha256 } from "./security";
import { hydrateYouTubePreviews } from "./youtubePreview";

export async function getUserFromRequest(request: Request, env: Env): Promise<User | null> {
  const cookieHeader = request.headers.get("cookie") || "";
  const match = cookieHeader.match(/(?:^|;\s*)starry_session=([^;]+)/);
  if (!match) return null;
  const token = decodeURIComponent(match[1]);
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(`
    SELECT u.id, u.email, u.display_name, u.avatar_url, u.status
    FROM auth_sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > datetime('now')
    LIMIT 1
  `).bind(tokenHash).first<User>();
  if (!row || row.status !== "active") return null;
  return row;
}

export async function createSession(env: Env, userId: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  await env.DB.prepare(`
    INSERT INTO auth_sessions (id, user_id, token_hash, expires_at, created_at)
    VALUES (?, ?, ?, datetime('now', '+30 days'), datetime('now'))
  `).bind(crypto.randomUUID(), userId, tokenHash).run();
  return token;
}

export async function revokeSession(env: Env, token: string): Promise<void> {
  const tokenHash = await sha256(token);
  await env.DB.prepare(`UPDATE auth_sessions SET revoked_at = datetime('now') WHERE token_hash = ?`).bind(tokenHash).run();
}

export async function upsertGoogleUser(env: Env, profile: { sub: string; email: string; name?: string; picture?: string }): Promise<User> {
  const identity = await env.DB.prepare(`SELECT user_id FROM identities WHERE provider = 'google' AND provider_subject = ? LIMIT 1`).bind(profile.sub).first<{ user_id: string }>();
  let userId = identity?.user_id;

  if (!userId) {
    const existing = await env.DB.prepare(`SELECT id FROM users WHERE lower(email) = lower(?) LIMIT 1`).bind(profile.email).first<{ id: string }>();
    userId = existing?.id || crypto.randomUUID();
    if (!existing) {
      await env.DB.prepare(`
        INSERT INTO users (id, email, display_name, avatar_url, status, created_at, updated_at, last_login_at)
        VALUES (?, ?, ?, ?, 'active', datetime('now'), datetime('now'), datetime('now'))
      `).bind(userId, profile.email, profile.name || null, profile.picture || null).run();
    }
    await env.DB.prepare(`
      INSERT OR IGNORE INTO identities (id, user_id, provider, provider_subject, provider_email, created_at)
      VALUES (?, ?, 'google', ?, ?, datetime('now'))
    `).bind(crypto.randomUUID(), userId, profile.sub, profile.email).run();
  }

  await env.DB.prepare(`
    UPDATE users SET email = ?, display_name = ?, avatar_url = ?, updated_at = datetime('now'), last_login_at = datetime('now')
    WHERE id = ?
  `).bind(profile.email, profile.name || null, profile.picture || null, userId).run();

  const user = await env.DB.prepare(`SELECT id, email, display_name, avatar_url, status FROM users WHERE id = ?`).bind(userId).first<User>();
  if (!user) throw new Error("Failed to load user after OAuth upsert");
  return user;
}

export async function listLinks(env: Env, userId: string): Promise<ShortLink[]> {
  const result = await env.DB.prepare(`
    SELECT id, owner_user_id, slug, namespace_slug, destination_url, title, note,
           preview_title, preview_image_url, metadata_checked_at, status, created_at, updated_at,
           expires_at, redirect_type, click_count, last_clicked_at
    FROM short_links WHERE owner_user_id = ? ORDER BY created_at DESC LIMIT 500
  `).bind(userId).all<ShortLink>();
  return hydrateYouTubePreviews(env, result.results || []);
}
