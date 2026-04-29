// app/api/status.rss/route.ts — Track 6 RSS feed of public incidents.
//
// WHAT
//   GET /api/status.rss
//     -> RSS 2.0 XML, last 30 days of public incidents.
//
// HAND-ROLLED
//   We deliberately don't pull a dep — RSS 2.0 is a simple format and the
//   surface area is small. We escape every text node we emit so an incident
//   title with `<` or `&` can't break the feed.
//
// AUTH
//   None — public endpoint.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_BASE_URL (for absolute links).

import { getSupabaseAdmin } from "@/lib/supabase-server";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function rfc822(iso: string): string {
  // RSS 2.0 uses RFC-822 dates. Date.toUTCString() produces a compatible form.
  return new Date(iso).toUTCString();
}

function baseUrl(req: Request): string {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "https://voyage.app";
  }
}

export async function GET(req: Request) {
  const origin = baseUrl(req);
  const supa = getSupabaseAdmin();

  let items: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    started_at: string;
    resolved_at: string | null;
  }> = [];

  if (supa) {
    const cutoff = new Date(Date.now() - THIRTY_DAYS_MS).toISOString();
    const { data } = await supa
      .from("incidents")
      .select("id,title,severity,status,started_at,resolved_at")
      .eq("public", true)
      .gte("started_at", cutoff)
      .order("started_at", { ascending: false });
    items = data ?? [];
  }

  const channelTitle = "Voyage Status";
  const channelLink = `${origin}/status`;
  const channelDesc = "Operational status and incident history for Voyage.";

  const itemXml = items
    .map((i) => {
      const link = `${origin}/status#${encodeURIComponent(i.id)}`;
      const title = `[${i.severity.toUpperCase()}] ${i.title}`;
      const description =
        `Status: ${i.status}. Started ${i.started_at}` +
        (i.resolved_at ? `, resolved ${i.resolved_at}.` : ".");
      return `    <item>
      <title>${xmlEscape(title)}</title>
      <link>${xmlEscape(link)}</link>
      <guid isPermaLink="false">${xmlEscape(i.id)}</guid>
      <pubDate>${xmlEscape(rfc822(i.started_at))}</pubDate>
      <description>${xmlEscape(description)}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${xmlEscape(channelTitle)}</title>
    <link>${xmlEscape(channelLink)}</link>
    <description>${xmlEscape(channelDesc)}</description>
    <language>en-us</language>
    <lastBuildDate>${xmlEscape(new Date().toUTCString())}</lastBuildDate>
${itemXml}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}
