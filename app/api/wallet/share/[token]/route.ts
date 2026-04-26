import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Public read-only endpoint for shared wallet snapshots. The page also reads
// directly from Supabase via the public anon key, but this route is useful for
// crawlers, link previews, and clients without JS. The token itself is the only
// auth — anyone with it can view.

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return NextResponse.json(
      { ok: false, error: "Sharing requires Supabase to be configured." },
      { status: 503 }
    );
  }

  const sb = createClient(url, key);
  const { data, error } = await sb
    .from("wallet_shares")
    .select("snapshot")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, snapshot: data.snapshot });
}
