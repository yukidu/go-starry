import type { Env, User } from "./types";

export const APP_ID = "gostarry";
export const RANDOM_SLUG_ALPHABET = "AFHKRWY23456789";
export const RANDOM_SLUG_LENGTH = 4;
export const RANDOM_SLUG_ATTEMPTS = 128;
export const RANDOM_SLUG_SPACE = RANDOM_SLUG_ALPHABET.length ** RANDOM_SLUG_LENGTH;
export const MAX_CUSTOM_ALIASES = 4;

// Compatibility bootstrap only. Authorization is persisted and subsequently read from Starry ID central D1.
const SYSTEM_OWNER_EMAIL = "yukidu@gmail.com";
let centralRoleSchemaReady: Promise<void> | null = null;

export function normalizeAlias(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function customAliasRestriction(value: string): string | null {
  const slug = normalizeAlias(value);
  if (/^n\d{7}$/.test(slug)) return "不可使用 n 加 7 位數字，這是 Starry ID 會員編號保留格式";
  if (/^\d{7}$/.test(slug)) return "不可使用純 7 位數字，這是安麗直銷商編號保留格式";
  return null;
}

async function ensureCentralRoleSchema(env: Env): Promise<void> {
  if (!centralRoleSchemaReady) {
    centralRoleSchemaReady = env.STARRY_ID_DB.prepare(`
      CREATE TABLE IF NOT EXISTS starry_app_roles (
        userId TEXT NOT NULL,
        appId TEXT NOT NULL,
        role TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        PRIMARY KEY (userId, appId, role)
      )
    `).run().then(() => undefined).catch((error) => {
      centralRoleSchemaReady = null;
      throw error;
    });
  }
  await centralRoleSchemaReady;
}

export async function resolveStarryUserId(env: Env, user: User): Promise<string | null> {
  const mapping = await env.DB.prepare(`
    SELECT starry_user_id
    FROM starry_identities
    WHERE local_user_id = ?
    LIMIT 1
  `).bind(user.id).first<{ starry_user_id: string }>().catch(() => null);
  if (mapping?.starry_user_id) return String(mapping.starry_user_id);

  const central = await env.STARRY_ID_DB.prepare(`
    SELECT id FROM users
    WHERE lower(trim(primaryEmail)) = lower(trim(?))
    LIMIT 1
  `).bind(user.email).first<{ id: string }>().catch(() => null);
  return central?.id ? String(central.id) : null;
}

export async function isSuperAdmin(env: Env, user: User): Promise<boolean> {
  await ensureCentralRoleSchema(env);
  const starryUserId = await resolveStarryUserId(env, user);
  if (!starryUserId) return false;

  // One-time bootstrap for the existing Starry ecosystem owner; the role itself lives centrally afterward.
  if (String(user.email || "").trim().toLowerCase() === SYSTEM_OWNER_EMAIL) {
    const now = Date.now();
    await env.STARRY_ID_DB.prepare(`
      INSERT OR IGNORE INTO starry_app_roles (userId, appId, role, createdAt, updatedAt)
      VALUES (?, ?, 'super_admin', ?, ?)
    `).bind(starryUserId, APP_ID, now, now).run();
  }

  const row = await env.STARRY_ID_DB.prepare(`
    SELECT 1 AS ok
    FROM starry_app_roles
    WHERE userId = ?
      AND role = 'super_admin'
      AND (appId = ? OR appId = '*')
    LIMIT 1
  `).bind(starryUserId, APP_ID).first<{ ok: number }>();
  return Boolean(row?.ok);
}

export async function aliasHistoryOwner(env: Env, slug: string): Promise<string | null> {
  const row = await env.DB.prepare(`
    SELECT owner_user_id
    FROM alias_ownership_history
    WHERE lower(slug) = lower(?)
    LIMIT 1
  `).bind(slug).first<{ owner_user_id: string }>();
  return row?.owner_user_id ? String(row.owner_user_id) : null;
}

export async function recordAliasOwnership(env: Env, slug: string, ownerUserId: string): Promise<void> {
  if (!slug) return;
  const previous = await aliasHistoryOwner(env, slug);
  if (previous && previous !== ownerUserId) throw new Error("這組個人化網址曾由其他會員使用，不能轉讓");
  await env.DB.prepare(`
    INSERT INTO alias_ownership_history (slug, owner_user_id, first_used_at, last_used_at)
    VALUES (?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(slug) DO UPDATE SET last_used_at = datetime('now')
  `).bind(slug, ownerUserId).run();
}
