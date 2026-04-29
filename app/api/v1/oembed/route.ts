// Track F (SEO): OEmbed endpoint. Returns rich-preview JSON for any Voyage
// trip URL, per the OEmbed protocol (https://oembed.com).
//
// Usage:
//   GET /api/v1/oembed?url=https://voyage.app/trips/<id>
//   → { type:"rich", html:"<iframe …>", width:560, height:480, … }
//
// We only resolve URLs that match /trips/<id>; anything else gets a 404.
// The HTML payload is the same iframe we recommend in /developers, so a
// blogger can pull it via Substack's link-preview pipeline and end up with
// the embed actually inlined into the post.

import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/seo";

export const runtime = "nodejs";

const TRIP_RE = /\/trips\/([^/?#]+)/;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const target = u.searchParams.get("url");
  if (!target) return new NextResponse("missing ?url", { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new NextResponse("bad url", { status: 400 });
  }

  // Only allow URLs hosted on this site to prevent the endpoint becoming an
  // open redirect / SSRF helper.
  if (parsed.origin !== SITE_URL) {
    return new NextResponse("foreign url", { status: 403 });
  }

  const m = TRIP_RE.exec(parsed.pathname);
  if (!m) return new NextResponse("unsupported url", { status: 404 });
  const tripId = m[1];

  const embedUrl = `${SITE_URL}/api/v1/embed/${encodeURIComponent(tripId)}`;
  const thumb = `${SITE_URL}/trips/${encodeURIComponent(tripId)}/opengraph-image`;

  return NextResponse.json(
    {
      version: "1.0",
      type: "rich",
      provider_name: "Voyage",
      provider_url: SITE_URL,
      title: "Voyage trip",
      html: `<iframe src="${embedUrl}" width="560" height="480" frameborder="0" allowfullscreen></iframe>`,
      width: 560,
      height: 480,
      thumbnail_url: thumb,
      thumbnail_width: 1200,
      thumbnail_height: 630,
      cache_age: 600,
    },
    {
      headers: { "cache-control": "public, max-age=600, s-maxage=3600" },
    }
  );
}
