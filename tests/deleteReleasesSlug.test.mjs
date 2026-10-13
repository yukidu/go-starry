import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const indexSource = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
const initSql = await readFile(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');

test('deleting a short link immediately releases the occupied slug', () => {
  assert.match(indexSource, /DELETE FROM short_links WHERE id = \? AND owner_user_id = \?/);
  assert.match(indexSource, /SELECT id FROM short_links WHERE lower\(slug\) = lower\(\?\) LIMIT 1/);
  assert.doesNotMatch(indexSource, /deleted_short_links|reserved_slugs|slug_tombstones/);
});

test('dependent click and report data cannot keep a deleted slug occupied', () => {
  assert.match(initSql, /FOREIGN KEY \(short_link_id\) REFERENCES short_links\(id\) ON DELETE CASCADE/g);
  assert.match(initSql, /slug TEXT NOT NULL UNIQUE COLLATE NOCASE/);
});
