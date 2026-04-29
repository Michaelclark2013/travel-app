import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Returns a JSON dump of everything we have on the calling user. Requires the
// caller to be authenticated via Supabase (Authorization: Bearer <jwt>) — when
// Supabase isn't configured, returns a clear message.
//
// Track 8 enhancement: when the dsar_requests table exists, log the request
// so the compliance team has a paper trail (and so the user-side privacy page
// can show "Your previous exports").

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, message: "Supabase not configured. Use the in-browser export from /profile." },
      { status: 501 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Per-request client carries the user's JWT, so RLS limits results to their rows.
  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Fan out to every user-owned table we have. RLS enforces ownership on each
  // .eq("user_id", user.id) — a misconfigured policy would simply return [].
  const queries = await Promise.allSettled([
    sb.from("trips").select("*").eq("user_id", user.id),
    sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
    sb.from("wallet_items").select("*").eq("user_id", user.id),
    sb.from("moments").select("*").eq("user_id", user.id),
    sb.from("likes").select("*").eq("user_id", user.id),
    sb.from("comments").select("*").eq("author_id", user.id),
    sb.from("follows").select("*").or(`follower_id.eq.${user.id},followee_id.eq.${user.id}`),
    sb.from("dm_messages").select("*").eq("from_user_id", user.id),
    sb.from("cookie_consents").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const pick = (i: number) =>
    queries[i]?.status === "fulfilled"
      ? (queries[i] as PromiseFulfilledResult<{ data: unknown }>).value.data
      : null;

  const dump = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    profile: pick(1),
    trips: pick(0) ?? [],
    wallet: pick(2) ?? [],
    moments: pick(3) ?? [],
    likes: pick(4) ?? [],
    comments: pick(5) ?? [],
    follows: pick(6) ?? [],
    dmMessages: pick(7) ?? [],
    cookieConsent: pick(8),
  };

  // Best-effort DSAR row. Non-fatal if the table is missing on older schemas.
  try {
    await sb.from("dsar_requests").insert({
      id: `dsar-${Date.now().toString(36)}`,
      user_id: user.id,
      kind: "export",
      status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      notes: "Self-service inline export.",
    });
  } catch {
    /* table may not exist yet on older deployments */
  }

  return new NextResponse(JSON.stringify(dump, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="voyage-export-${user.id.slice(0, 8)}.json"`,
    },
  });
}
