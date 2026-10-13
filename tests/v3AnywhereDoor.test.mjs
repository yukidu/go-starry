import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('v3 branding and PWA shell use Starry Anywhere Door identity', async () => {
  const ui = await read('src/ui.ts');
  const index = await read('src/index.ts');
  const pwa = await read('src/pwa.ts');
  assert.match(ui, /繁星任意門/);
  assert.match(ui, /class="site-nav"/);
  assert.match(ui, /class="menu-panel"/);
  assert.match(ui, /backdrop-filter:blur\(14px\)/);
  assert.match(index, /\/manifest\.webmanifest/);
  assert.match(index, /\/sw\.js/);
  assert.match(index, /\/icon-192\.png/);
  assert.match(pwa, /name: "繁星任意門"/);
  assert.match(pwa, /display: "standalone"/);
  assert.match(ui, /beforeinstallprompt/);
  assert.match(ui, /serviceWorker\.register\('\/sw\.js'\)/);
});

test('QR stays in-page and supports download plus native sharing', async () => {
  const ui = await read('src/ui.ts');
  assert.match(ui, /id="qrModal"/);
  assert.match(ui, /id="downloadQr"/);
  assert.match(ui, /id="shareQr"/);
  assert.match(ui, /navigator\.share/);
  assert.match(ui, /navigator\.canShare/);
  assert.match(ui, /new File\(\[qrBlob\]/);
  assert.doesNotMatch(ui, /open\('\/api\/links/);
});

test('personalized URL aliases support one Starry identity plus four custom aliases', async () => {
  const index = await read('src/index.ts');
  const migration = await read('migrations/0003_anywhere_door.sql');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS personal_aliases/);
  assert.match(migration, /kind IN \('starry','custom'\)/);
  assert.match(index, /MAX_CUSTOM_ALIASES = 4/);
  assert.match(index, /syncStarryAlias/);
  assert.match(index, /starry_profile_url/);
  assert.match(index, /public_cards/);
  assert.match(index, /\/api\/aliases/);
  assert.match(index, /nested = path\.match/);
  assert.match(index, /namespace_slug/);
});

test('link routes remain backwards compatible while nested personalized routes are supported', async () => {
  const index = await read('src/index.ts');
  assert.match(index, /redirectByRoute\(request, env, ctx, nested\[2\]\.toLowerCase\(\), nested\[1\]\.toLowerCase\(\)\)/);
  assert.match(index, /path\.slice\(1\)\.toLowerCase\(\), ""/);
  assert.match(index, /fullShortUrl/);
  assert.match(index, /body\.slug !== undefined/);
  assert.match(index, /UPDATE short_links SET slug = \?, namespace_slug = \?/);
});

test('link records auto-fetch original page title and image with SSRF guards', async () => {
  const index = await read('src/index.ts');
  const migration = await read('migrations/0003_anywhere_door.sql');
  const ui = await read('src/ui.ts');
  assert.match(migration, /preview_title/);
  assert.match(migration, /preview_image_url/);
  assert.match(migration, /metadata_checked_at/);
  assert.match(index, /readDestinationMetadata/);
  assert.match(index, /isPrivateMetadataHost/);
  assert.match(index, /og:title/);
  assert.match(index, /og:image/);
  assert.match(index, /redirect: "manual"/);
  assert.match(ui, /原頁標題/);
  assert.match(ui, /preview_image_url/);
  assert.match(ui, /\/metadata/);
});

test('the new URL can be edited from link history', async () => {
  const ui = await read('src/ui.ts');
  const index = await read('src/index.ts');
  assert.match(ui, /data-edit/);
  assert.match(ui, /id="editModal"/);
  assert.match(ui, /id="editSlug"/);
  assert.match(ui, /method:'PUT'/);
  assert.match(index, /nextSlug/);
  assert.match(index, /collision/);
});
