import { ICON_192_BASE64, ICON_512_BASE64 } from "./iconData";

export const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="#0d1328"/><rect x="104" y="72" width="304" height="368" rx="76" fill="none" stroke="#ffe282" stroke-width="20"/><rect x="154" y="134" width="204" height="270" rx="44" fill="#111c3a" stroke="#7fb4ff" stroke-width="8"/><path d="M256 92l14 37 38 14-38 14-14 37-14-37-38-14 38-14z" fill="#fff5b5"/><circle cx="312" cy="278" r="10" fill="#ffe17a"/><circle cx="170" cy="106" r="7" fill="#d1e5ff"/><circle cx="362" cy="182" r="6" fill="#d1e5ff"/><circle cx="144" cy="324" r="5" fill="#d1e5ff"/></svg>`;

export const manifestJson = JSON.stringify({
  id: "/",
  name: "繁星任意門",
  short_name: "繁星任意門",
  description: "Starry.phd 生態系短網址與分享入口",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#f6f7fb",
  theme_color: "#0d1328",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
    { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
  ]
});

export const serviceWorkerJs = `
const CACHE='starry-anywhere-door-v11';
const SHELL=['/','/styles.css?v11','/app.js?v11','/manifest.webmanifest','/icon.svg','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)));self.skipWaiting()});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))));self.clients.claim()});
self.addEventListener('fetch',event=>{const req=event.request;if(req.method!=='GET')return;const url=new URL(req.url);if(url.origin!==location.origin||url.pathname.startsWith('/api/')||url.pathname.startsWith('/auth/'))return;event.respondWith(fetch(req).then(response=>{const clone=response.clone();caches.open(CACHE).then(cache=>cache.put(req,clone));return response}).catch(()=>caches.match(req).then(hit=>hit||caches.match('/'))))});
`;

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer as ArrayBuffer;
}

export function iconPng(size: 192 | 512): Response {
  const bytes = decodeBase64(size === 192 ? ICON_192_BASE64 : ICON_512_BASE64);
  return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800, immutable" } });
}
