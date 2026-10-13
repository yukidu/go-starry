import type { Env, ShortLink } from "./types";

const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtu.be", "youtube-nocookie.com"]);
const PREVIEW_FETCH_LIMIT = 8;

export function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!YOUTUBE_HOSTS.has(host)) return null;

    let id = "";
    if (host === "youtu.be") {
      id = url.pathname.split("/").filter(Boolean)[0] || "";
    } else if (url.pathname === "/watch") {
      id = url.searchParams.get("v") || "";
    } else {
      const parts = url.pathname.split("/").filter(Boolean);
      if (["shorts", "live", "embed"].includes(parts[0] || "")) id = parts[1] || "";
    }

    return /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export function youtubeThumbnailUrl(value: string): string | null {
  const id = youtubeVideoId(value);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function cleanTitle(value: unknown): string | null {
  const title = String(value || "").replace(/\s+/g, " ").trim();
  return title ? title.slice(0, 300) : null;
}

function safeThumbnail(value: unknown, fallback: string): string {
  try {
    const url = new URL(String(value || ""));
    const host = url.hostname.toLowerCase();
    if (url.protocol === "https:" && (host === "i.ytimg.com" || host.endsWith(".ytimg.com"))) {
      return url.toString().slice(0, 2000);
    }
  } catch {}
  return fallback;
}

async function fetchJsonPreview(endpoint: string, fallbackImage: string): Promise<{ title: string | null; image: string } | null> {
  try {
    const response = await fetch(endpoint, {
      headers: {
        "accept": "application/json",
        "user-agent": "Mozilla/5.0 (compatible; StarryAnywhereDoor/1.0; +https://go.starry.phd/)"
      },
      signal: AbortSignal.timeout(2200)
    });
    if (!response.ok) return null;
    const data = await response.json() as { title?: unknown; thumbnail_url?: unknown };
    return {
      title: cleanTitle(data.title),
      image: safeThumbnail(data.thumbnail_url, fallbackImage)
    };
  } catch {
    return null;
  }
}

async function fetchPageTitle(canonical: string): Promise<string | null> {
  try {
    const response = await fetch(canonical, {
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "zh-TW,zh;q=0.9,en;q=0.7",
        "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130 Safari/537.36"
      },
      signal: AbortSignal.timeout(2200)
    });
    if (!response.ok) return null;
    const text = (await response.text()).slice(0, 500_000);
    const meta = text.match(/<meta[^>]+(?:name|property)=["'](?:title|og:title)["'][^>]+content=["']([^"']+)["']/i)
      || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:title|og:title)["']/i);
    if (meta?.[1]) return cleanTitle(meta[1].replace(/&quot;/gi, '"').replace(/&amp;/gi, "&"));
    const title = text.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    return title ? cleanTitle(title.replace(/<[^>]+>/g, "").replace(/&quot;/gi, '"').replace(/&amp;/gi, "&")) : null;
  } catch {
    return null;
  }
}

export async function fetchYouTubePreview(destination: string): Promise<{ title: string | null; image: string } | null> {
  const id = youtubeVideoId(destination);
  if (!id) return null;

  const image = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  const canonical = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
  const providers = [
    `https://www.youtube.com/oembed?url=${encodeURIComponent(canonical)}&format=json`,
    `https://noembed.com/embed?url=${encodeURIComponent(canonical)}`
  ];

  for (const endpoint of providers) {
    const preview = await fetchJsonPreview(endpoint, image);
    if (preview?.title) return preview;
  }

  return { title: await fetchPageTitle(canonical), image };
}

export async function hydrateYouTubePreviews(env: Env, links: ShortLink[]): Promise<ShortLink[]> {
  const hydrated = links.map(link => {
    const fallback = youtubeThumbnailUrl(link.destination_url);
    return fallback && !link.preview_image_url ? { ...link, preview_image_url: fallback } : link;
  });

  const candidates = hydrated
    .filter(link => youtubeVideoId(link.destination_url) && !link.preview_title)
    .slice(0, PREVIEW_FETCH_LIMIT);

  if (!candidates.length) return hydrated;

  const byId = new Map(hydrated.map(link => [link.id, link]));
  await Promise.allSettled(candidates.map(async link => {
    const preview = await fetchYouTubePreview(link.destination_url);
    if (!preview) return;

    const current = byId.get(link.id);
    if (!current) return;
    const next: ShortLink = {
      ...current,
      preview_title: preview.title || current.preview_title,
      preview_image_url: preview.image || current.preview_image_url,
      metadata_checked_at: new Date().toISOString()
    };
    byId.set(link.id, next);

    await env.DB.prepare(`
      UPDATE short_links
      SET preview_title = ?, preview_image_url = ?, metadata_checked_at = datetime('now'), updated_at = datetime('now')
      WHERE id = ? AND owner_user_id = ?
    `).bind(next.preview_title, next.preview_image_url, link.id, link.owner_user_id).run();
  }));

  return hydrated.map(link => byId.get(link.id) || link);
}
