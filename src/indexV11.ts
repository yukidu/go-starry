import QRCode from "qrcode-svg";
import experienceWorker from "./indexV10";
import type { Env } from "./types";
import { getUserFromRequest } from "./db";
import { html, json } from "./security";
import { appJs, qrGeneratorPage, styles } from "./uiV11";

const QR_SIZES = new Set([512, 1024, 1536]);
const QR_MAX_CONTENT = 2000;

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

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

    if (method === "GET" && path === "/qr-generator") {
      const user = await getUserFromRequest(request, env);
      if (!user) return Response.redirect(`${url.origin}/auth/starry`, 302);
      return html(qrGeneratorPage());
    }

    if (method === "POST" && path === "/api/qr-generator") {
      const user = await getUserFromRequest(request, env);
      if (!user) return json({ error: "請先登入" }, 401);

      const body = await request.json().catch(() => ({})) as { content?: string; size?: number };
      const content = String(body.content || "").trim();
      const size = Number(body.size || 1024);

      if (!content) return json({ error: "請先輸入網址或文字" }, 400);
      if (content.length > QR_MAX_CONTENT) return json({ error: `QR Code 內容最多 ${QR_MAX_CONTENT} 個字元` }, 400);
      if (!QR_SIZES.has(size)) return json({ error: "圖片尺寸不正確" }, 400);

      try {
        const svg = new QRCode({
          content,
          padding: 4,
          width: size,
          height: size,
          ecl: "M",
          join: true
        }).svg();
        return new Response(svg, {
          headers: {
            "content-type": "image/svg+xml; charset=utf-8",
            "content-disposition": 'inline; filename="starry-qr-code.svg"',
            "cache-control": "no-store"
          }
        });
      } catch (error) {
        console.error("QR generator failed", error);
        return json({ error: "內容太複雜，暫時無法產生 QR Code" }, 400);
      }
    }

    return experienceWorker.fetch(request, env, ctx);
  }
};
