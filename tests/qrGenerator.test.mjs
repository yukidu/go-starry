import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ui = await readFile(new URL('../src/uiV11.ts', import.meta.url), 'utf8');
const worker = await readFile(new URL('../src/indexV11.ts', import.meta.url), 'utf8');
const router = await readFile(new URL('../src/routerV9.ts', import.meta.url), 'utf8');
const security = await readFile(new URL('../src/security.ts', import.meta.url), 'utf8');

test('hamburger menu exposes a dedicated QR generator page', () => {
  assert.match(ui, /menuQrGenerator/);
  assert.match(ui, /href=\"\/qr-generator\"/);
  assert.match(router, /QR Code 產生器/);
  assert.match(router, /indexV11/);
});

test('QR generator supports text input, preview and PNG/SVG downloads', () => {
  assert.match(ui, /qrGeneratorFormV11/);
  assert.match(ui, /qrPreviewV11/);
  assert.match(ui, /下載 PNG/);
  assert.match(ui, /下載 SVG/);
  assert.match(ui, /qrDownloadPngV11/);
  assert.match(ui, /qrDownloadSvgV11/);
});

test('QR API requires login and limits content and image size', () => {
  assert.match(worker, /path === \"\/api\/qr-generator\"/);
  assert.match(worker, /getUserFromRequest/);
  assert.match(worker, /QR_MAX_CONTENT = 2000/);
  assert.match(worker, /new Set\(\[512, 1024, 1536\]\)/);
  assert.match(worker, /new QRCode/);
  assert.match(worker, /image\/svg\+xml/);
});

test('qr-generator is a reserved system route', () => {
  assert.match(security, /\"qr-generator\"/);
});
