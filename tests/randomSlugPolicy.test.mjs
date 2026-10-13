import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

test('automatic short links use the approved four-character readable alphabet', () => {
  const match = source.match(/const RANDOM_SLUG_ALPHABET = "([^"]+)";/);
  assert.ok(match, 'RANDOM_SLUG_ALPHABET must be declared');

  const alphabet = match[1];
  assert.equal(alphabet, 'AFHKRWY23456789');
  assert.equal(alphabet.length, 15);
  assert.equal(new Set(alphabet).size, 15);
  assert.equal(15 ** 4, 50_625);

  assert.match(source, /const RANDOM_SLUG_LENGTH = 4;/);
  assert.match(source, /new Uint8Array\(RANDOM_SLUG_LENGTH\)/);
  assert.match(source, /RANDOM_SLUG_ALPHABET\[b % RANDOM_SLUG_ALPHABET\.length\]/);
  assert.doesNotMatch(source, /abcdefghjkmnpqrstuvwxyz23456789/);
  assert.doesNotMatch(source, /randomToken\(/);
});
