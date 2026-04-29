// app/api/me/consent/route.ts — Track 8 cookie-consent registry endpoint.
//
// POST stores or updates the calling user's cookie preferences. Safe to call
// when the visitor isn't signed in (we just persist locally — endpoint
// returns 401 and the caller falls back to localStorage).

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  analytics?: boolean;
  marketing?: boolean;
  functional?: boolean;
};

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, message: "Supabase not configured." },
      { status: 501 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const sb = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userResult } = await sb.auth.getUser();
  const user = userResult?.user;
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]?.trim() ?? null : null;
  const ua = req.headers.get("user-agent");

  const row = {
    user_id: user.id,
    analytics: Boolean(body.analytics),
    marketing: Boolean(body.marketing),
    functional: Boolean(body.functional),
    consented_at: new Date().toISOString(),
    ip,
    user_agent: ua,
  };

  const { error } = await sb
    .from("cookie_consents")
    .upsert(row, { onConflict: "user_id" });
  if (error) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
