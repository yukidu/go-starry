import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');

test('create form captures a stable form reference before async work', () => {
  assert.match(ui, /const form=e\.currentTarget/);
  assert.match(ui, /form\.reset\(\)/);
  assert.doesNotMatch(ui, /e\.currentTarget\.reset\(\)/);
  assert.match(ui, /writeText\(out\.link\.short_url\)\.catch\(\(\)=>\{\}\)/);
});

test('link cards show title, localized status and wrapped destination URLs', () => {
  assert.match(ui, /x\.title\?'<div class="link-title">'/);
  assert.match(ui, /x\.status==='active'\?'啟用中':'已停用'/);
  assert.match(ui, /\.dest\{white-space:normal;overflow-wrap:anywhere;word-break:break-word/);
  assert.match(ui, /\.link-main\{min-width:0\}/);
});
