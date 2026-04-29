import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 86400; // place descriptions barely change — cache 24h

// Wikipedia REST page summary. Free, global, no key.
//   GET /api/intel/wikipedia?title=Tokyo
//
// Returns: { ok, title, extract, description, imageUrl?, pageUrl }

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim();
  const lang = (searchParams.get("lang") || "en").toLowerCase();
  if (!title) {
    return NextResponse.json(
      { ok: false, error: "title required" },
      { status: 400 }
    );
  }
  try {
    const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      title
    )}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "voyage-app (+https://travel-app-tan-gamma.vercel.app)",
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
    });
    if (res.status === 404) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }
    if (!res.ok) throw new Error(`wikipedia ${res.status}`);
    const data = (await res.json()) as {
      title?: string;
      description?: string;
      extract?: string;
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
      content_urls?: { desktop?: { page?: string } };
    };
    return NextResponse.json({
      ok: true,
      title: data.title ?? title,
      description: data.description,
      extract: data.extract,
      imageUrl: data.originalimage?.source ?? data.thumbnail?.source,
      pageUrl: data.content_urls?.desktop?.page,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "wikipedia failed" },
      { status: 502 }
    );
  }
}
