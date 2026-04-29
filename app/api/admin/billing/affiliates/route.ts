// app/api/admin/billing/affiliates/route.ts — Track 5 affiliate revenue.
//
// WHAT
//   GET ?from=ISO&to=ISO&partner=&format=json|csv
//     -> json: { rows, monthly: { "2026-04": { gross, count }, ... }, totals }
//     -> csv:  text/csv attachment.
//
// SOURCE
//   public.affiliate_conversions. Travelpayouts postbacks land here via
//   /api/v1/affiliates/postback (out of scope for Track 5 — Track 8 owns
//   inbound postback handlers; we just provide the read surface).
//
// AUTH
//   billing.read.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: Request) {
  await requirePerm(req, "billing.read");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const partner = url.searchParams.get("partner");
  const format = (url.searchParams.get("format") ?? "json").toLowerCase();

  let q = supa
    .from("affiliate_conversions")
    .select(
      "id, marker, click_id, booking_id, partner, amount_usd, currency, status, occurred_at, payout_status, payout_at"
    )
    .order("occurred_at", { ascending: false })
    .limit(2000);

  if (from) q = q.gte("occurred_at", from);
  if (to) q = q.lte("occurred_at", to);
  if (partner) q = q.eq("partner", partner);

  const { data, error } = await q;
  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
  const rows = data ?? [];

  if (format === "csv") {
    const csv = toCsv(rows);
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="affiliates-${Date.now()}.csv"`,
      },
    });
  }

  // Aggregate by YYYY-MM bucket.
  const monthly: Record<string, { gross: number; count: number }> = {};
  let total = 0;
  let unpaid = 0;
  for (const r of rows) {
    const k = (r.occurred_at ?? "").slice(0, 7);
    if (!k) continue;
    const amt = Number(r.amount_usd ?? 0);
    monthly[k] ??= { gross: 0, count: 0 };
    monthly[k].gross += amt;
    monthly[k].count += 1;
    total += amt;
    if (r.payout_status !== "paid") unpaid += amt;
  }

  return Response.json({
    rows,
    monthly,
    totals: {
      gross: round2(total),
      unpaid: round2(unpaid),
      count: rows.length,
    },
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toCsv(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return "id,marker,click_id,booking_id,partner,amount_usd,currency,status,occurred_at,payout_status,payout_at\n";
  }
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => escape(r[h])).join(","));
  return lines.join("\n") + "\n";
}
