import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function evaluateBaseUi() {
  const source = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');
  const withoutExports = source
    .replaceAll('export const ', 'const ')
    .replaceAll('export function ', 'function ');
  const transpiled = ts.transpileModule(withoutExports, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return new Function(`${transpiled}\nreturn { appJs, styles };`)();
}

async function getGeneratedV6AppJs() {
  const base = await evaluateBaseUi();
  let source = await readFile(new URL('../src/uiV6.ts', import.meta.url), 'utf8');
  source = source.replace(
    /import \{[\s\S]*?\} from "\.\/ui";/,
    `const baseAppJs=${JSON.stringify(base.appJs)};\nconst baseStyles=${JSON.stringify(base.styles)};\nconst baseHomePage=()=>'';\nconst baseSimplePage=()=>'';`
  );
  source = source
    .replaceAll('export const ', 'const ')
    .replaceAll('export function ', 'function ');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return new Function(`${transpiled}\nreturn appJs;`)();
}

test('v6 browser-delivered app.js is valid JavaScript', async () => {
  const appJs = await getGeneratedV6AppJs();
  assert.equal(typeof appJs, 'string');
  assert.doesNotThrow(() => new Function(appJs));
  assert.match(appJs, /pasteDestinationUrlV6/);
  assert.match(appJs, /hydrateTopMemberV6/);
});
