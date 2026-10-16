import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/ecosystemSso.ts', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8');
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('繁星任意門 uses central Starry ID session + one-time ticket', () => {
  assert.match(source, /https:\/\/id\.starry\.phd/);
  assert.match(source, /api\/ecosystem\/session/);
  assert.match(source, /api\/apps\/gostarry\/ticket/);
  assert.match(source, /credentials:'include'/);
  assert.match(source, /\/auth\/callback\?code=/);
});

test('繁星任意門 never shares or directly clears the Starry ID cookie across subdomains', () => {
  assert.doesNotMatch(source, /Domain=\.starry\.phd/);
  assert.doesNotMatch(source, /starry_id_session/);
  assert.doesNotMatch(source, /DELETE FROM auth_sessions/);
});

test('Google account chooser stays inside 繁星任意門 and creates the central login first', () => {
  assert.match(source, /accounts\.google\.com\/gsi\/client/);
  assert.match(source, /api\/google-sync/);
  assert.match(source, /appId:'gostarry'/);
  assert.match(source, /登入繁星通行證/);
  assert.match(source, /完成後會留在繁星任意門/);
});

test('repo package and production route follow current Starry naming', () => {
  assert.equal(pkg.name, 'starry-go');
  assert.match(wrangler, /pattern = "go\.starry\.phd"/);
  assert.match(wrangler, /main = "src\/ecosystemSso\.ts"/);
});
