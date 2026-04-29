import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Returns a JSON dump of everything we have on the calling user. Requires the
// caller to be authenticated via Supabase (Authorization: Bearer <jwt>) — when
// Supabase isn't configured, returns a clear message.

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

  const [{ data: trips }, { data: profile }, { data: wallet }] =
    await Promise.all([
      sb.from("trips").select("*").eq("user_id", user.id),
      sb.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      sb.from("wallet_items").select("*").eq("user_id", user.id),
    ]);

  const dump = {
    exportedAt: new Date().toISOString(),
    user: {
      id: user.id,
      email: user.email,
      created_at: user.created_at,
    },
    profile,
    trips: trips ?? [],
    wallet: wallet ?? [],
  };

  return new NextResponse(JSON.stringify(dump, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="voyage-export-${user.id.slice(0, 8)}.json"`,
    },
  });
}
