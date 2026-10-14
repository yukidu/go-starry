import governanceWorker from "./indexV9";
import type { Env } from "./types";
import { appJs, styles } from "./uiV10";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === "/styles.css") {
      return new Response(styles, {
        headers: { "content-type": "text/css; charset=utf-8", "cache-control": "public, max-age=300" }
      });
    }
    if (path === "/app.js") {
      return new Response(appJs, {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=300" }
      });
    }
    return governanceWorker.fetch(request, env, ctx);
  }
};
