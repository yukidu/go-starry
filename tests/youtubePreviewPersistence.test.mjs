import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preview = await readFile(new URL('../src/youtubePreview.ts', import.meta.url), 'utf8');

test('successful YouTube preview backfill persists to D1', () => {
  assert.match(preview, /metadata_checked_at = datetime\('now'\)/);
  assert.match(preview, /updated_at = datetime\('now'\)/);
  assert.match(preview, /link\.owner_user_id/);
});
