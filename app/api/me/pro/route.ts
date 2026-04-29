// app/api/me/pro/route.ts — Track 5
//
// WHAT
//   GET — returns the calling user's pro_entitlements row (or null).
//
// AUTH
//   Bearer token in Authorization header (Supabase user JWT). Without it,
//   returns 401. We use the user-scoped client (RLS) to read the row, so
//   the policy `pro_entitlements_self_read` does the gating.
//
// WHY
//   The new useProEntitlement() hook in lib/pro-entitlement.ts hits this
//   route on first paint. Server-side gating logic should query
//   pro_entitlements directly with the service role; clients use this
//   endpoint.
//
// ENV VARS
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ entitlement: null, configured: false });
  }

  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return NextResponse.json({ entitlement: null }, { status: 401 });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ entitlement: null }, { status: 401 });
  }

  const { data, error } = await userClient
    .from("pro_entitlements")
    .select(
      "user_id, source, status, current_period_end, cancel_at_period_end, expires_at, stripe_customer_id, stripe_subscription_id"
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { entitlement: null, error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ entitlement: data ?? null });
}
