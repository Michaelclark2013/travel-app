import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

// Returns iframe-friendly HTML for a trip — drop-in for blogs, Substacks, etc.
// Usage: <iframe src="https://voyage.app/api/v1/embed/<trip-id>" />
//
// Track F (SEO): the response now also carries og:/twitter: meta + an OEmbed
// `<link rel="alternate">` so social previews render correctly when someone
// pastes the embed URL directly into Slack/Discord/iMessage. The OEmbed
// endpoint is currently a TODO — kept the link so we can wire it later
// without changing the public URL surface.

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return new Response(notConfigured(), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  const sb = createClient(url, anon);
  const { data } = await sb
    .from("trips")
    .select("destination,start_date,end_date,travelers,vibes,itinerary")
    .eq("id", id)
    .maybeSingle();

  if (!data) {
    return new Response(notFound(), {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  const stops =
    Array.isArray(data.itinerary) ? data.itinerary.reduce(
      (n: number, d: { items?: unknown[] }) => n + (d.items?.length ?? 0),
      0
    ) : 0;

  const html = renderEmbed({
    destination: data.destination,
    start: data.start_date,
    end: data.end_date,
    travelers: data.travelers,
    vibes: data.vibes ?? [],
    days: Array.isArray(data.itinerary) ? data.itinerary.length : 0,
    stops,
    tripId: id,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Allow iframing on any site.
      "content-security-policy": "frame-ancestors *",
      "x-frame-options": "ALLOWALL",
      "cache-control": "public, max-age=300, s-maxage=600",
    },
  });
}

function renderEmbed(t: {
  destination: string;
  start: string;
  end: string;
  travelers: number;
  vibes: string[];
  days: number;
  stops: number;
  tripId: string;
}) {
  const startLabel = new Date(t.start).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const endLabel = new Date(t.end).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const vibes = t.vibes.slice(0, 4).join(" · ");
  const tripUrl = `${SITE_URL}/trips/${t.tripId}`;
  const ogImage = `${SITE_URL}/trips/${t.tripId}/opengraph-image`;
  const ogTitle = `${t.destination} · Voyage trip`;
  const ogDescription = `${startLabel} — ${endLabel} · ${t.travelers} traveler${
    t.travelers === 1 ? "" : "s"
  } · ${t.days} days, ${t.stops} stops.`;
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escape(ogTitle)}</title>
<meta name="description" content="${escape(ogDescription)}" />
<meta property="og:type" content="article" />
<meta property="og:site_name" content="Voyage" />
<meta property="og:title" content="${escape(ogTitle)}" />
<meta property="og:description" content="${escape(ogDescription)}" />
<meta property="og:image" content="${escape(ogImage)}" />
<meta property="og:url" content="${escape(tripUrl)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:site" content="@voyageapp" />
<meta name="twitter:title" content="${escape(ogTitle)}" />
<meta name="twitter:description" content="${escape(ogDescription)}" />
<meta name="twitter:image" content="${escape(ogImage)}" />
<link rel="canonical" href="${escape(tripUrl)}" />
<link rel="alternate" type="application/json+oembed" href="${escape(SITE_URL)}/api/v1/oembed?url=${encodeURIComponent(tripUrl)}" title="${escape(ogTitle)}" />
<style>
  html,body{margin:0;background:#07080d;color:#e8eaf0;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
  a{color:inherit;text-decoration:none}
  .card{display:block;padding:24px;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:rgba(255,255,255,.03);max-width:560px;margin:auto}
  .eyebrow{font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#22d3ee}
  h2{font-size:32px;letter-spacing:-0.02em;margin:8px 0 4px;font-weight:600}
  .meta{color:#8a90a3;font-size:14px}
  .vibes{margin-top:14px;color:#8a90a3;font-size:12px}
  .stats{margin-top:18px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .stat{padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px}
  .stat b{display:block;font-size:20px;font-weight:600}
  .stat span{font-size:10px;color:#8a90a3;letter-spacing:.18em;text-transform:uppercase;font-family:ui-monospace,Menlo,monospace}
  .cta{margin-top:18px;display:inline-block;padding:8px 14px;background:linear-gradient(180deg,#2dd4ff,#0ab8d6);color:#001218;font-weight:600;border-radius:9999px;font-size:13px}
  .footer{margin-top:14px;font-size:11px;color:#5a6075;font-family:ui-monospace,Menlo,monospace}
</style></head>
<body>
<a class="card" href="https://voyage.app/trips/${escape(t.tripId)}" target="_top" rel="noopener">
  <div class="eyebrow">// VOYAGE TRIP</div>
  <h2>${escape(t.destination)}</h2>
  <div class="meta">${startLabel} — ${endLabel} · ${t.travelers} traveler${t.travelers === 1 ? "" : "s"}</div>
  ${t.vibes.length ? `<div class="vibes">${escape(vibes)}</div>` : ""}
  <div class="stats">
    <div class="stat"><b>${t.days}</b><span>days</span></div>
    <div class="stat"><b>${t.stops}</b><span>stops</span></div>
    <div class="stat"><b>${t.travelers}</b><span>travelers</span></div>
  </div>
  <div class="cta">Open in Voyage →</div>
  <div class="footer">// powered by voyage</div>
</a>
</body></html>`;
}

function escape(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    c === "&"
      ? "&amp;"
      : c === "<"
      ? "&lt;"
      : c === ">"
      ? "&gt;"
      : c === '"'
      ? "&quot;"
      : "&#39;"
  );
}

function notConfigured() {
  return `<!doctype html><body style="font:14px system-ui;background:#07080d;color:#8a90a3;padding:24px">
  Voyage embed needs Supabase configured to load trip data.
</body>`;
}

function notFound() {
  return `<!doctype html><body style="font:14px system-ui;background:#07080d;color:#8a90a3;padding:24px">
  Trip not found.
</body>`;
}
