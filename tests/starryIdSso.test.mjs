import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Go Starry routes login through Starry ID instead of direct Google OAuth', async () => {
  const source = await read('src/index.ts');
  assert.match(source, /\/auth\/starry/);
  assert.match(source, /startStarryAuth/);
  assert.match(source, /\/auth\/callback/);
  assert.match(source, /finishStarryAuth/);
  assert.doesNotMatch(source, /oauth2\.googleapis\.com\/token/);
  assert.doesNotMatch(source, /openidconnect\.googleapis\.com\/v1\/userinfo/);
});

test('central callback consumes one-time gostarry ticket and preserves local app accounts', async () => {
  const source = await read('src/starrySso.ts');
  assert.match(source, /https:\/\/id\.starry\.phd/);
  assert.match(source, /APP_ID = "gostarry"/);
  assert.match(source, /starry_app_auth_codes/);
  assert.match(source, /DELETE FROM starry_app_auth_codes/);
  assert.match(source, /STARRY_ID_DB/);
  assert.match(source, /starry_identities/);
  assert.match(source, /lower\(email\) = lower\(\?\)/);
  assert.match(source, /createSession/);
  assert.match(source, /starry_session/);
});

test('existing Go Starry sessions can recover central Starry profile by exact email', async () => {
  const source = await read('src/starrySso.ts');
  assert.match(source, /findCentralProfileByEmail/);
  assert.match(source, /lower\(trim\(u\.primaryEmail\)\) = lower\(trim\(\?\)\)/);
  assert.match(source, /INSERT OR IGNORE INTO starry_identities/);
  assert.match(source, /central\.avatar \|\| central\.googleAvatar/);
  assert.match(source, /central\.approvedRank \|\| central\.rank/);
  assert.match(source, /UPDATE users\s+SET display_name = \?, avatar_url = \?/);
});

test('Go Starry keeps business data in its own D1 while binding central Starry ID D1', async () => {
  const wrangler = await read('wrangler.toml');
  const migration = await read('migrations/0002_starry_id_sso.sql');
  assert.match(wrangler, /binding = "DB"/);
  assert.match(wrangler, /database_name = "go-starry-db"/);
  assert.match(wrangler, /binding = "STARRY_ID_DB"/);
  assert.match(wrangler, /database_name = "starry_id_db"/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS starry_identities/);
  assert.match(migration, /FOREIGN KEY \(local_user_id\) REFERENCES users\(id\) ON DELETE CASCADE/);
});

test('public login UI points to Starry ID', async () => {
  const ui = await read('src/ui.ts');
  assert.match(ui, /href="\/auth\/starry"/);
  assert.match(ui, /使用 Starry ID 登入/);
});

test('member identity shows central rank and links avatar and name to public Starry ID card', async () => {
  const source = await read('src/starrySso.ts');
  const index = await read('src/index.ts');
  const ui = await read('src/ui.ts');
  assert.match(source, /approvedRank/);
  assert.match(source, /public_cards/);
  assert.match(source, /starry_rank/);
  assert.match(source, /starry_profile_url/);
  assert.match(source, /https:\/\/id\.starry\.phd/);
  assert.match(source, /amwayId/);
  assert.match(source, /centralProfileSlug/);
  assert.match(source, /const desiredSlug = amwaySlug \|\| String\(card\.cardNumber/);
  assert.match(index, /enrichStarryUser/);
  assert.match(ui, /id="meRank"/);
  assert.match(ui, /id="avatarLink"/);
  assert.match(ui, /id="nameLink"/);
  assert.match(ui, /starry_profile_url/);
});

test('production workflow no longer depends on a Go Starry Google client secret', async () => {
  const workflow = await read('.github/workflows/deploy.yml');
  assert.match(workflow, /Verify Starry ID central SSO routes/);
  assert.match(workflow, /https:\/\/go\.starry\.phd\/auth\/starry/);
  assert.match(workflow, /https:\/\/id\.starry\.phd\/auth\/gostarry/);
  assert.doesNotMatch(workflow, /GOOGLE_CLIENT_SECRET/);
  assert.doesNotMatch(workflow, /wrangler secret put GOOGLE_CLIENT_ID/);
});
