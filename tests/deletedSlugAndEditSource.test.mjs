import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL('../migrations/0005_reserve_deleted_short_slugs.sql', import.meta.url), 'utf8');
const ui = await readFile(new URL('../src/uiV6.ts', import.meta.url), 'utf8');
const index = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');

test('deleted short codes are permanently reserved', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS reserved_short_slugs/i);
  assert.match(migration, /BEFORE DELETE ON short_links/i);
  assert.match(migration, /INSERT OR IGNORE INTO reserved_short_slugs/i);
  assert.match(migration, /BEFORE INSERT ON short_links/i);
  assert.match(migration, /deleted short code cannot be reused/i);
  assert.match(migration, /BEFORE UPDATE OF slug ON short_links/i);
});

test('existing short links can edit their source URL', () => {
  assert.ok(ui.includes('id="editDestination"'));
  assert.ok(ui.includes("editDestination.value=link.destination_url||''"));
  assert.ok(ui.includes("destination_url:$('#editDestination')?.value||''"));
  assert.match(index, /body\.destination_url !== undefined/);
  assert.match(index, /destination !== link\.destination_url/);
});
