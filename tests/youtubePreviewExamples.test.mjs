import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preview = await readFile(new URL('../src/youtubePreview.ts', import.meta.url), 'utf8');

test('known production YouTube URL formats are covered by parser rules', () => {
  assert.match(preview, /host === "youtu\.be"/);
  assert.match(preview, /url\.pathname === "\/watch"/);
  assert.match(preview, /url\.searchParams\.get\("v"\)/);
  assert.match(preview, /\["shorts", "live", "embed"\]/);
});
