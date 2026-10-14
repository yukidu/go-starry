import baseWorker from "./index";
import governanceWorker from "./indexV9";
import type { Env } from "./types";

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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;

    // System/auth routes must win before personalized `/:namespace/:slug` routing.
    // Without this guard `/auth/starry` looks like namespace=auth + slug=starry.
    if (isBaseSystemRoute(path)) return baseWorker.fetch(request, env, ctx);

    return governanceWorker.fetch(request, env, ctx);
  }
};
