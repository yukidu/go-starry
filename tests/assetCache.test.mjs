import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const security = await readFile(new URL('../src/security.ts', import.meta.url), 'utf8');
const pwa = await readFile(new URL('../src/pwa.ts', import.meta.url), 'utf8');

test('HTML cache-busts mutable CSS and JS assets', () => {
  assert.ok(security.includes('const UI_ASSET_VERSION = "v11"'));
  assert.ok(security.includes('href="/styles.css?${UI_ASSET_VERSION}"'));
  assert.ok(security.includes('src="/app.js?${UI_ASSET_VERSION}"'));
  assert.ok(security.includes('"cache-control": "no-store"'));
});

test('PWA shell cache uses the same v11 mutable assets', () => {
  assert.ok(pwa.includes("starry-anywhere-door-v11"));
  assert.ok(pwa.includes("/styles.css?v11"));
  assert.ok(pwa.includes("/app.js?v11"));
});
