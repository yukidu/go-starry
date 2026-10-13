import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function getGeneratedAppJs() {
  const source = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');
  const withoutExports = source
    .replaceAll('export const ', 'const ')
    .replaceAll('export function ', 'function ');
  const transpiled = ts.transpileModule(withoutExports, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None
    }
  }).outputText;
  return new Function(`${transpiled}\nreturn appJs;`)();
}

test('browser-delivered app.js is valid JavaScript', async () => {
  const appJs = await getGeneratedAppJs();
  assert.equal(typeof appJs, 'string');
  assert.doesNotThrow(() => new Function(appJs));
});

test('app initialization does not require localStorage to be available at parse time', async () => {
  const appJs = await getGeneratedAppJs();
  assert.doesNotMatch(appJs, /let selectedAlias=localStorage\.getItem\(/);
});
