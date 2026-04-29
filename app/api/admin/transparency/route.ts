// app/api/admin/transparency/route.ts — Track 3 transparency report.
//
// WHAT
//   GET ?days=<n>&format=<json|csv>
//     -> JSON or CSV summary of moderation activity over the trailing window.
//
//   Buckets per day x category:
//     - auto_approved
//     - auto_rejected
//     - pending  (still awaiting review at report time)
//     - human_approved
//     - human_rejected
//     - escalated
//   Plus aggregates of abuse_reports filed and resolved.
//
// AUTH
//   compliance.read — finance/admin/super_admin can run this; support/viewer
//   should NOT see the raw counts (privacy guardrail).
//
// CSV FORMAT
//   day,category,count
//   2026-04-29,auto_approved,142
//   2026-04-29,auto_rejected,8
//   …

import { auditFireAndForget } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEFAULT_DAYS = 30;
const MAX_DAYS = 365;

type QueueRow = {
  status: string;
  auto_action: string | null;
  admin_decision: string | null;
  created_at: string;
};

type ReportRow = {
  resolved_at: string | null;
  created_at: string;
};

export async function GET(req: Request) {
  await requirePerm(req, "compliance.read");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "no service role" }, { status: 503 });
  }

  const url = new URL(req.url);
  const days = Math.min(
    Math.max(1, Number(url.searchParams.get("days") ?? DEFAULT_DAYS) || DEFAULT_DAYS),
    MAX_DAYS
  );
  const format = url.searchParams.get("format") === "csv" ? "csv" : "json";
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const [{ data: queue }, { data: reports }] = await Promise.all([
    supa
      .from("moderation_queue")
      .select("status, auto_action, admin_decision, created_at")
      .gte("created_at", since)
      .limit(50_000),
    supa
      .from("abuse_reports")
      .select("resolved_at, created_at")
      .gte("created_at", since)
      .limit(50_000),
  ]);

  const byDay = new Map<string, Record<string, number>>();
  function bump(day: string, key: string): void {
    let m = byDay.get(day);
    if (!m) {
      m = {};
      byDay.set(day, m);
    }
    m[key] = (m[key] ?? 0) + 1;
  }

  for (const r of (queue ?? []) as QueueRow[]) {
    const day = r.created_at.slice(0, 10);
    if (r.auto_action === "auto-approved") bump(day, "auto_approved");
    else if (r.auto_action === "auto-rejected") bump(day, "auto_rejected");
    if (r.admin_decision === "approve") bump(day, "human_approved");
    else if (r.admin_decision === "reject") bump(day, "human_rejected");
    else if (r.admin_decision === "escalate") bump(day, "escalated");
    else if (r.status === "pending") bump(day, "pending_open");
  }
  for (const r of (reports ?? []) as ReportRow[]) {
    const day = r.created_at.slice(0, 10);
    bump(day, "reports_filed");
    if (r.resolved_at) {
      const rd = r.resolved_at.slice(0, 10);
      bump(rd, "reports_resolved");
    }
  }

  // Sort days ascending so CSV reads chronologically.
  const days_sorted = Array.from(byDay.keys()).sort();

  auditFireAndForget(
    "moderation.transparency_export",
    { kind: "report", id: `transparency-${days}d` },
    { after: { days, format, rows: days_sorted.length } }
  );

  if (format === "csv") {
    const lines = ["day,category,count"];
    for (const d of days_sorted) {
      const m = byDay.get(d) ?? {};
      for (const cat of Object.keys(m).sort()) {
        lines.push(`${d},${cat},${m[cat]}`);
      }
    }
    return new Response(lines.join("\n") + "\n", {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="transparency-${days}d.csv"`,
      },
    });
  }

  // JSON: per-day object plus a totals roll-up.
  const totals: Record<string, number> = {};
  const perDay: Array<{ day: string; counts: Record<string, number> }> = [];
  for (const d of days_sorted) {
    const counts = byDay.get(d) ?? {};
    perDay.push({ day: d, counts });
    for (const k of Object.keys(counts)) {
      totals[k] = (totals[k] ?? 0) + counts[k];
    }
  }
  return Response.json({ ok: true, days, since, perDay, totals });
}
