import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const preview = await readFile(new URL('../src/youtubePreview.ts', import.meta.url), 'utf8');
const db = await readFile(new URL('../src/db.ts', import.meta.url), 'utf8');

test('YouTube preview always has a deterministic thumbnail fallback', () => {
  assert.match(preview, /i\.ytimg\.com\/vi\/\$\{id\}\/hqdefault\.jpg/);
  assert.match(preview, /youtubeVideoId/);
  assert.match(preview, /youtu\.be/);
  assert.match(preview, /shorts/);
});

test('YouTube title uses multiple providers before page fallback', () => {
  assert.match(preview, /youtube\.com\/oembed/);
  assert.match(preview, /noembed\.com\/embed/);
  assert.match(preview, /fetchPageTitle/);
});

test('link list hydrates old YouTube records before returning them', () => {
  assert.match(db, /hydrateYouTubePreviews/);
  assert.match(db, /return hydrateYouTubePreviews\(env, result\.results \|\| \[\]\)/);
  assert.match(preview, /UPDATE short_links/);
  assert.match(preview, /preview_title = \?, preview_image_url = \?/);
});
