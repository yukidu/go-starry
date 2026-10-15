import baseWorker from "./index";
import governanceWorker from "./indexV11";
import type { Env } from "./types";

const STARRY_ID_GO_STARRY_LOGIN = "https://id.starry.phd/auth/gostarry";
const STARRY_ID_GO_STARRY_CHOOSE_ACCOUNT = `${STARRY_ID_GO_STARRY_LOGIN}?choose=1`;

const BASE_SYSTEM_PATHS = new Set([
  "/privacy",
  "/terms",
  "/manifest.webmanifest",
  "/sw.js",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/robots.txt"
]);

function isBaseSystemRoute(path: string): boolean {
  return path.startsWith("/auth/") || BASE_SYSTEM_PATHS.has(path);
}

async function switchGoogleAccount(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const logoutUrl = new URL(request.url);
  logoutUrl.pathname = "/api/logout";
  logoutUrl.search = "";

  const logoutHeaders = new Headers(request.headers);
  logoutHeaders.delete("content-length");
  logoutHeaders.delete("content-type");

  const logoutResponse = await baseWorker.fetch(new Request(logoutUrl.toString(), {
    method: "POST",
    headers: logoutHeaders
  }), env, ctx);

  const headers = new Headers({
    Location: STARRY_ID_GO_STARRY_CHOOSE_ACCOUNT,
    "Cache-Control": "no-store"
  });
  const clearSessionCookie = logoutResponse.headers.get("set-cookie");
  if (clearSessionCookie) headers.append("Set-Cookie", clearSessionCookie);

  return new Response(null, { status: 302, headers });
}

async function enhanceHtmlShell(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return response;

  let source = await response.text();

  if (!source.includes('id="menuQrGenerator"')) {
    const qrItem = '<a id="menuQrGenerator" class="menu-item" href="/qr-generator"><span class="menu-icon">▦</span>QR Code 產生器</a>';
    const ranking = /(<a id="menuRanking"[^>]*>[\s\S]*?<\/a>)/;
    const install = '<button class="menu-item" data-install>';
    if (ranking.test(source)) source = source.replace(ranking, `$1${qrItem}`);
    else if (source.includes(install)) source = source.replace(install, `${qrItem}${install}`);
  }

  if (!source.includes('id="menuSwitchAccount"')) {
    const marker = '<div class="menu-footer"><button id="menuLogout"';
    if (source.includes(marker)) {
      const replacement = '<div class="menu-footer"><a id="menuSwitchAccount" class="menu-item" href="/auth/switch"><span class="menu-icon">⇄</span>切換 Google 帳號</a><button id="menuLogout"';
      source = source.replace(marker, replacement);
    }
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  return new Response(source, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/auth/switch") {
      return switchGoogleAccount(request, env, ctx);
    }

    if (
      method === "GET" &&
      (path === "/auth/starry" || path === "/auth/google") &&
      url.searchParams.get("choose") === "1"
    ) {
      return Response.redirect(STARRY_ID_GO_STARRY_CHOOSE_ACCOUNT, 302);
    }

    if (isBaseSystemRoute(path)) {
      return enhanceHtmlShell(await baseWorker.fetch(request, env, ctx));
    }

    return enhanceHtmlShell(await governanceWorker.fetch(request, env, ctx));
  }
};
