import baseWorker from "./index";
import governanceWorker from "./indexV10";
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

async function withAccountSwitchMenu(response: Response): Promise<Response> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("text/html")) return response;

  const source = await response.text();
  if (source.includes('id="menuSwitchAccount"')) {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(source, { status: response.status, statusText: response.statusText, headers });
  }

  const marker = '<div class="menu-footer"><button id="menuLogout"';
  if (!source.includes(marker)) {
    const headers = new Headers(response.headers);
    headers.delete("content-length");
    return new Response(source, { status: response.status, statusText: response.statusText, headers });
  }

  const replacement = '<div class="menu-footer"><a id="menuSwitchAccount" class="menu-item" href="/auth/switch"><span class="menu-icon">⇄</span>切換 Google 帳號</a><button id="menuLogout"';
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("cache-control", "no-store");
  return new Response(source.replace(marker, replacement), {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (method === "GET" && path === "/auth/switch") {
      return switchGoogleAccount(request, env, ctx);
    }

    // Explicit account-choice mode bypasses an existing Starry ID session so the
    // central Google sign-in screen is shown instead of silently reusing the last account.
    if (
      method === "GET" &&
      (path === "/auth/starry" || path === "/auth/google") &&
      url.searchParams.get("choose") === "1"
    ) {
      return Response.redirect(STARRY_ID_GO_STARRY_CHOOSE_ACCOUNT, 302);
    }

    // System/auth routes must win before personalized `/:namespace/:slug` routing.
    // Without this guard `/auth/starry` looks like namespace=auth + slug=starry.
    if (isBaseSystemRoute(path)) {
      return withAccountSwitchMenu(await baseWorker.fetch(request, env, ctx));
    }

    return withAccountSwitchMenu(await governanceWorker.fetch(request, env, ctx));
  }
};
