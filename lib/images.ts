"use client";

// ===========================================================================
// Image resolver — gives every place / city / restaurant / activity in the app
// a real photo. Sources, in priority order:
//   1. Wikipedia REST summary  (no key, great for cities + landmarks)
//   2. Unsplash search         (NEXT_PUBLIC_UNSPLASH_ACCESS_KEY required)
//   3. Gradient SVG fallback   (always available)
//
// Resolved URLs are cached in localStorage so the lookup runs at most once
// per (kind, query) pair, and so the chosen photo stays stable between
// page loads (Unsplash search results are not deterministic).
// ===========================================================================

export type LocationImageKind =
  | "city"
  | "landmark"
  | "restaurant"
  | "hotel"
  | "activity"
  | "transit"
  | "generic";

export type LocationImage = {
  url: string;
  /** "wikipedia" | "unsplash" | "gradient" */
  source: "wikipedia" | "unsplash" | "gradient";
  attribution?: string;
};

const CACHE_KEY = "voyage:image-cache:v1";
const NEGATIVE_TTL_MS = 1000 * 60 * 60 * 24; // 24h
const POSITIVE_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30d

type CacheEntry = {
  result: LocationImage | null;
  expiresAt: number;
};

function loadCache(): Record<string, CacheEntry> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function saveCache(map: Record<string, CacheEntry>) {
  if (typeof window === "undefined") return;
  // Keep cache from growing without bound.
  const entries = Object.entries(map);
  if (entries.length > 500) {
    entries.sort((a, b) => b[1].expiresAt - a[1].expiresAt);
    map = Object.fromEntries(entries.slice(0, 400));
  }
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors (private mode, quota)
  }
}

function cacheKey(kind: LocationImageKind, name: string, context?: string) {
  return `${kind}|${name.toLowerCase()}|${(context ?? "").toLowerCase()}`.slice(0, 200);
}

// Optional API key — if absent, Unsplash falls through to the gradient.
function unsplashKey(): string | undefined {
  const k = process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY;
  return k && k.trim().length > 0 ? k.trim() : undefined;
}

// ----- Query construction -----

function buildQuery(
  kind: LocationImageKind,
  name: string,
  context?: string
): string {
  const ctx = context?.trim();
  switch (kind) {
    case "city":
      return ctx ? `${name} ${ctx} city skyline` : `${name} city`;
    case "landmark":
      return ctx ? `${name} ${ctx} landmark` : `${name} landmark`;
    case "restaurant":
      return ctx ? `${name} restaurant ${ctx}` : `${name} restaurant`;
    case "hotel":
      return ctx ? `${name} hotel ${ctx}` : `${name} hotel`;
    case "activity":
      return ctx ? `${name} ${ctx}` : name;
    case "transit":
      return ctx ? `${name} train station ${ctx}` : `${name} transportation`;
    default:
      return ctx ? `${name} ${ctx}` : name;
  }
}

// ----- Wikipedia summary -----

async function wikipediaImage(query: string): Promise<LocationImage | null> {
  try {
    // Use the search endpoint to find the most likely article, then fetch
    // its summary (which exposes thumbnail.source + originalimage.source).
    const searchUrl =
      `https://en.wikipedia.org/w/rest.php/v1/search/title?q=${encodeURIComponent(query)}&limit=1`;
    const search = await fetch(searchUrl);
    if (!search.ok) return null;
    const sj = await search.json();
    const title: string | undefined = sj?.pages?.[0]?.key;
    if (!title) return null;

    const summaryUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const sum = await fetch(summaryUrl);
    if (!sum.ok) return null;
    const j = await sum.json();
    const url = j?.thumbnail?.source ?? j?.originalimage?.source;
    if (!url) return null;
    // Bump the thumbnail to a wider version when possible. Wikipedia thumbnails
    // include the desired pixel width in the URL — bump to 1200.
    const upscaled = typeof url === "string" ? url.replace(/\/(\d+)px-/g, "/1200px-") : url;
    return {
      url: upscaled,
      source: "wikipedia",
      attribution: `Wikipedia · ${j?.title ?? title}`,
    };
  } catch {
    return null;
  }
}

// ----- Unsplash search -----

async function unsplashImage(query: string): Promise<LocationImage | null> {
  const key = unsplashKey();
  if (!key) return null;
  try {
    const url = `https://api.unsplash.com/search/photos?per_page=3&orientation=landscape&query=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
    });
    if (!res.ok) return null;
    const j = await res.json();
    const first = j?.results?.[0];
    const photoUrl: string | undefined =
      first?.urls?.regular ?? first?.urls?.full ?? first?.urls?.small;
    if (!photoUrl) return null;
    const author = first?.user?.name;
    return {
      url: photoUrl,
      source: "unsplash",
      attribution: author ? `Photo by ${author} on Unsplash` : "Unsplash",
    };
  } catch {
    return null;
  }
}

// ----- Gradient fallback -----

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function gradientImage(name: string): LocationImage {
  const h = hash(name);
  const hue = h % 360;
  // Two complementary hues for a moodier gradient.
  const c1 = `hsl(${hue} 55% 30%)`;
  const c2 = `hsl(${(hue + 50) % 360} 55% 14%)`;
  const c3 = `hsl(${(hue + 200) % 360} 45% 22%)`;
  const safe = name
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 750">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${c1}"/>
        <stop offset="0.6" stop-color="${c2}"/>
        <stop offset="1" stop-color="${c3}"/>
      </linearGradient>
      <radialGradient id="r" cx="20%" cy="0%" r="60%">
        <stop offset="0" stop-color="rgba(255,255,255,0.18)"/>
        <stop offset="1" stop-color="rgba(255,255,255,0)"/>
      </radialGradient>
    </defs>
    <rect width="1200" height="750" fill="url(#g)"/>
    <rect width="1200" height="750" fill="url(#r)"/>
    <text x="60" y="640" font-family="-apple-system, system-ui, sans-serif" font-size="84" font-weight="700" fill="rgba(255,255,255,0.92)" letter-spacing="-2">${safe}</text>
  </svg>`;
  return {
    url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    source: "gradient",
  };
}

// ===========================================================================
// Public API
// ===========================================================================

export async function resolveLocationImage(
  kind: LocationImageKind,
  name: string,
  context?: string
): Promise<LocationImage> {
  const cleaned = name.trim();
  if (!cleaned) return gradientImage("Voyage");
  const k = cacheKey(kind, cleaned, context);

  const cache = loadCache();
  const hit = cache[k];
  if (hit && hit.expiresAt > Date.now()) {
    if (hit.result) return hit.result;
  }

  const query = buildQuery(kind, cleaned, context);

  // 1. Wikipedia for cities / landmarks.
  let result: LocationImage | null = null;
  if (kind === "city" || kind === "landmark") {
    result = await wikipediaImage(cleaned + (context ? ` ${context}` : ""));
  }

  // 2. Unsplash for everything else (and as fallback for cities w/o Wikipedia hits).
  if (!result) result = await unsplashImage(query);

  // 3. Gradient last resort.
  const final = result ?? gradientImage(cleaned);

  cache[k] = {
    result: final,
    expiresAt:
      Date.now() + (final.source === "gradient" ? NEGATIVE_TTL_MS : POSITIVE_TTL_MS),
  };
  saveCache(cache);
  return final;
}

export function clearImageCache() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CACHE_KEY);
}
