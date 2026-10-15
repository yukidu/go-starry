import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None }
}).outputText;

async function evaluateBaseUi() {
  let source = await readFile(new URL('../src/ui.ts', import.meta.url), 'utf8');
  source = source.replaceAll('export const ', 'const ').replaceAll('export function ', 'function ');
  return new Function(`${transpile(source)}\nreturn {appJs,styles,homePage,simplePage};`)();
}

async function evaluateV6() {
  const base = await evaluateBaseUi();
  let source = await readFile(new URL('../src/uiV6.ts', import.meta.url), 'utf8');
  source = source.replace(
    /import \{[\s\S]*?\} from "\.\/ui";/,
    `const baseAppJs=${JSON.stringify(base.appJs)};const baseStyles=${JSON.stringify(base.styles)};const baseHomePage=()=>'';const baseSimplePage=()=>'';`
  );
  source = source.replaceAll('export const ', 'const ').replaceAll('export function ', 'function ');
  return new Function(`${transpile(source)}\nreturn {appJs,styles};`)();
}

async function evaluateV9() {
  const base = await evaluateV6();
  let source = await readFile(new URL('../src/uiV9.ts', import.meta.url), 'utf8');
  source = source.replace(
    /import \{[\s\S]*?\} from "\.\/uiV6";/,
    `const baseAppJs=${JSON.stringify(base.appJs)};const baseStyles=${JSON.stringify(base.styles)};const baseHomePage=()=>'';const baseSimplePage=()=>'';`
  );
  source = source.replaceAll('export const ', 'const ').replaceAll('export function ', 'function ');
  return new Function(`${transpile(source)}\nreturn {appJs,styles};`)();
}

async function evaluateV10() {
  const base = await evaluateV9();
  let source = await readFile(new URL('../src/uiV10.ts', import.meta.url), 'utf8');
  source = source.replace(
    /import \{ appJs as baseAppJs, styles as baseStyles \} from "\.\/uiV9";/,
    `const baseAppJs=${JSON.stringify(base.appJs)};const baseStyles=${JSON.stringify(base.styles)};`
  );
  source = source.replaceAll('export const ', 'const ');
  return new Function(`${transpile(source)}\nreturn {appJs,styles};`)();
}

test('v10 browser-delivered app.js stays syntactically valid', async () => {
  const { appJs } = await evaluateV10();
  assert.equal(typeof appJs, 'string');
  assert.doesNotThrow(() => new Function(appJs));
});

test('v10 replaces browser-native confirmations and alerts with Starry dialogs', async () => {
  const { appJs, styles } = await evaluateV10();
  assert.match(appJs, /function starryAlert/);
  assert.match(appJs, /function starryConfirm/);
  assert.match(appJs, /window\.alert=message/);
  assert.doesNotMatch(appJs, /\bconfirm\(/);
  assert.match(styles, /starry-dialog-backdrop/);
  assert.match(styles, /starry-dialog-card/);
});

test('v10 upgrades native selects and intercepts native validation bubbles', async () => {
  const { appJs, styles } = await evaluateV10();
  assert.match(appJs, /function enhanceSelect/);
  assert.match(appJs, /starry-select-shell/);
  assert.match(appJs, /addEventListener\('invalid'/);
  assert.match(styles, /starry-native-select/);
  assert.match(styles, /starry-select-menu/);
});

test('production v11 keeps the v10 experience layer and serves v11 assets', async () => {
  const router = await readFile(new URL('../src/routerV9.ts', import.meta.url), 'utf8');
  const indexV11 = await readFile(new URL('../src/indexV11.ts', import.meta.url), 'utf8');
  const indexV10 = await readFile(new URL('../src/indexV10.ts', import.meta.url), 'utf8');
  assert.match(router, /from "\.\/indexV11"/);
  assert.match(indexV11, /from "\.\/indexV10"/);
  assert.match(indexV11, /from "\.\/uiV11"/);
  assert.match(indexV11, /path === "\/styles\.css"/);
  assert.match(indexV11, /path === "\/app\.js"/);
  assert.match(indexV10, /from "\.\/uiV10"/);
});
