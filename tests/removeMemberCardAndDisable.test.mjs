import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/uiV6.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../migrations/0004_remove_link_disable.sql', import.meta.url), 'utf8');

test('page-level member card is removed while top navigation member identity remains', () => {
  assert.ok(ui.includes('OLD_MEMBER_CARD'));
  assert.ok(ui.includes('.replace(OLD_MEMBER_CARD, "")'));
  assert.ok(ui.includes('id="navMemberLink"'));
});

test('link active state and disable controls are removed from the rendered UI', () => {
  assert.ok(ui.includes('OLD_STATUS_BADGE'));
  assert.ok(ui.includes('OLD_TOGGLE_BUTTON'));
  assert.ok(ui.includes('OLD_TOGGLE_HANDLER'));
  assert.ok(ui.includes('.replace(OLD_STATUS_BADGE, "")'));
  assert.ok(ui.includes('.replace(OLD_TOGGLE_BUTTON, "")'));
  assert.ok(ui.includes('.replace(OLD_TOGGLE_HANDLER, "")'));
});

test('previously disabled links are restored during production migration', () => {
  assert.match(migration, /UPDATE short_links/);
  assert.match(migration, /SET status = 'active'/);
  assert.match(migration, /WHERE status <> 'active'/);
});
