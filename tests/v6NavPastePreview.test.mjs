import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('top fixed navigation replaces three shortcuts with member identity', async () => {
  const ui = await read('src/uiV6.ts');
  const index = await read('src/index.ts');
  assert.match(index, /from "\.\/uiV6"/);
  assert.match(ui, /id="navMemberLink"/);
  assert.match(ui, /id="navAvatar"/);
  assert.match(ui, /id="navName"/);
  assert.match(ui, /id="navRank"/);
  assert.match(ui, /\.replace\(OLD_TOP_ACTIONS, MEMBER_TOP\)/);
  assert.match(ui, /starry_profile_url/);
  assert.match(ui, /starry_rank/);
});

test('destination URL field has an in-row paste button and safe clipboard fallback', async () => {
  const ui = await read('src/uiV6.ts');
  assert.match(ui, /id="destinationUrl"/);
  assert.match(ui, /id="pasteUrl"/);
  assert.match(ui, />貼上網址<\/button>/);
  assert.match(ui, /navigator\.clipboard\.readText/);
  assert.match(ui, /長按網址欄貼上/);
  assert.match(ui, /url-input-row/);
});

test('top explanatory alias paragraph is removed from rendered markup', async () => {
  const ui = await read('src/uiV6.ts');
  assert.match(ui, /\.replace\(OLD_ALIAS_HELP, ""\)/);
});

test('YouTube URLs use oEmbed title and deterministic thumbnail fallback', async () => {
  const index = await read('src/index.ts');
  const ui = await read('src/uiV6.ts');
  assert.match(index, /function youtubeVideoId/);
  assert.match(index, /youtube\.com\/oembed/);
  assert.match(index, /i\.ytimg\.com\/vi/);
  assert.match(index, /readYouTubeMetadata/);
  assert.match(ui, /refreshExistingYoutubePreviewsV6/);
  assert.match(ui, /\/metadata/);
});
