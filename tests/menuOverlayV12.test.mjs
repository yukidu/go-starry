import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/uiV12.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/indexV11.ts', import.meta.url), 'utf8');

test('hamburger overlay covers the full page and keeps the menu above it', () => {
  assert.match(ui, /\.menu-overlay\{[\s\S]*inset:0;/);
  assert.match(ui, /background:rgba\(15,23,42,\.8\)/);
  assert.match(ui, /backdrop-filter:blur\(4px\)/);
  assert.match(ui, /-webkit-backdrop-filter:blur\(4px\)/);
  assert.match(ui, /prefers-color-scheme:dark/);
  assert.match(ui, /background:rgba\(3,8,18,\.8\)/);
  assert.match(worker, /import \{ styles \} from "\.\/uiV12"/);
});
