import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const security = await readFile(new URL('../src/security.ts', import.meta.url), 'utf8');
const pwa = await readFile(new URL('../src/pwa.ts', import.meta.url), 'utf8');

test('HTML cache-busts mutable CSS and JS assets', () => {
  assert.match(security, /UI_ASSET_VERSION\s*=\s*"v4"/);
  assert.match(security, /href=\\"\/styles\.css\?\$\{UI_ASSET_VERSION\}\\"/);
  assert.match(security, /src=\\"\/app\.js\?\$\{UI_ASSET_VERSION\}\\"/);
  assert.match(security, /"cache-control":\s*"no-store"/);
});

test('PWA shell cache uses the same v4 mutable assets', () => {
  assert.match(pwa, /starry-anywhere-door-v4/);
  assert.match(pwa, /\/styles\.css\?v4/);
  assert.match(pwa, /\/app\.js\?v4/);
});
