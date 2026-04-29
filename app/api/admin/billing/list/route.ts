// app/api/admin/billing/list/route.ts — Track 5 subscription list.
//
// WHAT
//   GET ?tab=active|past_due|canceled|comps&q=<email|cus_id>&limit=&offset=
//     -> { rows: [...], total: number }
//
// AUTH
//   billing.read
//
// SOURCE
//   public.pro_entitlements joined to auth.users for email lookup. Comps tab
//   filters source='comp'; the others filter by status.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const TABS = new Set(["active", "past_due", "canceled", "comps"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  await requirePerm(req, "billing.read");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { rows: [], total: 0, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "active";
  if (!TABS.has(tab)) {
    return Response.json({ rows: [], total: 0, error: "bad tab" }, { status: 400 });
  }
  const q = (url.searchParams.get("q") ?? "").trim();
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

  let query = supa
    .from("pro_entitlements")
    .select(
      "user_id, source, status, current_period_end, cancel_at_period_end, expires_at, stripe_customer_id, stripe_subscription_id, granted_by, granted_at, updated_at",
      { count: "exact" }
    );

  if (tab === "comps") {
    query = query.eq("source", "comp");
  } else {
    query = query.eq("status", tab);
  }
  if (q) {
    if (q.startsWith("cus_")) {
      query = query.eq("stripe_customer_id", q);
    } else if (q.includes("@")) {
      // Cheaper than a join — look up the user id from auth.users by email.
      const { data: u } = await supa
        .from("users")
        .select("id")
        .ilike("email", q)
        .maybeSingle();
      if (u?.id) {
        query = query.eq("user_id", u.id);
      } else {
        return Response.json({ rows: [], total: 0 });
      }
    } else {
      query = query.eq("user_id", q);
    }
  }

  const { data, error, count } = await query
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return Response.json({ rows: [], total: 0, error: error.message }, { status: 500 });
  }

  return Response.json({ rows: data ?? [], total: count ?? 0 });
}
