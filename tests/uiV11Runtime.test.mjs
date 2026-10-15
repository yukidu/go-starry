import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

async function getV11AppJs() {
  let source = await readFile(new URL('../src/uiV11.ts', import.meta.url), 'utf8');
  source = source
    .replace(/import \{ appJs as baseAppJs, styles as baseStyles \} from "\.\/uiV10";/, `const baseAppJs=''; const baseStyles='';`)
    .replace(/import \{ simplePage as baseSimplePage \} from "\.\/uiV6";/, `const baseSimplePage=()=>'';`)
    .replaceAll('export const ', 'const ')
    .replaceAll('export function ', 'function ');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
  }).outputText;
  return new Function(`${transpiled}\nreturn appJs;`)();
}

test('v11 QR generator browser script is valid JavaScript', async () => {
  const appJs = await getV11AppJs();
  assert.equal(typeof appJs, 'string');
  assert.doesNotThrow(() => new Function(appJs));
  assert.match(appJs, /qrGenerateV11/);
  assert.match(appJs, /qrDownloadPngV11/);
});
