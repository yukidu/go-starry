import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const policy = await readFile(new URL('../src/policyV9.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/indexV9.ts', import.meta.url), 'utf8');
const router = await readFile(new URL('../src/routerV9.ts', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/uiV9.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0006_personalization_governance.sql', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.toml', import.meta.url), 'utf8');

test('four-character readable code space stays 50,625 per personalization namespace', () => {
  assert.match(policy, /RANDOM_SLUG_ALPHABET = "AFHKRWY23456789"/);
  assert.match(policy, /RANDOM_SLUG_LENGTH = 4/);
  assert.equal(15 ** 4, 50_625);
  assert.match(worker, /generatePublicSlug\(env, namespace\)/);
  assert.match(worker, /lower\(COALESCE\(namespace_slug, ''\)\) = lower\(\?\)/);
});

test('custom alias protects Starry member and Amway seven-digit formats', () => {
  assert.match(policy, /\^n\\d\{7\}\$/);
  assert.match(policy, /\^\\d\{7\}\$/);
  assert.match(policy, /Starry ID 會員編號保留格式/);
  assert.match(policy, /安麗直銷商編號保留格式/);
});

test('ordinary members must choose a personalization namespace while super admins may omit it', () => {
  assert.match(worker, /if \(!namespace && !superAdmin\)/);
  assert.match(worker, /建立短網址前必須選擇一組個人化網址/);
  assert.match(worker, /if \(!nextNamespace && !superAdmin\)/);
  assert.match(policy, /role = 'super_admin'/);
  assert.match(policy, /starry_app_roles/);
});

test('deleted short routes are reserved per namespace, not globally', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reserved_short_routes/);
  assert.match(migration, /PRIMARY KEY \(namespace_slug, public_slug\)/);
  assert.match(migration, /reserve_short_route_before_delete/);
  assert.match(migration, /idx_links_public_route_unique/);
  assert.match(migration, /namespace_slug COLLATE NOCASE, public_slug COLLATE NOCASE/);
});

test('personalization aliases cannot transfer after they have produced public links', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS alias_ownership_history/);
  assert.match(worker, /aliasHistoryOwner/);
  assert.match(worker, /recordAliasOwnership/);
  assert.match(worker, /曾由其他會員使用，不能轉讓/);
});

test('ranking and admin personalization pages are implemented with privacy rules', () => {
  assert.match(worker, /path === "\/api\/ranking"/);
  assert.match(worker, /trim\(COALESCE\(namespace_slug, ''\)\) <> ''/);
  assert.match(ui, /只顯示個人化網址，不顯示會員姓名或其他個人資料/);
  assert.match(worker, /\/api\/admin\/personalization/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reserved_aliases/);
});

test('link filter is only shown when a member has at least two personalization URLs', () => {
  assert.match(ui, /currentAliases\.length>=2/);
  assert.match(ui, /linkAliasFilter/);
});

test('system and authentication routes win before personalized short-link routing', () => {
  assert.match(router, /path\.startsWith\("\/auth\/"\)/);
  assert.match(router, /BASE_SYSTEM_PATHS\.has\(path\)/);
  assert.match(router, /return baseWorker\.fetch\(request, env, ctx\)/);
  assert.match(router, /return governanceWorker\.fetch\(request, env, ctx\)/);
  assert.match(router, /"\/privacy"/);
  assert.match(router, /"\/terms"/);
  assert.match(router, /"\/sw\.js"/);
});

test('v9 protected router is the production entry point', () => {
  assert.match(wrangler, /main = "src\/routerV9\.ts"/);
});
