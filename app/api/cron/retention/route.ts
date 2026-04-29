// app/api/cron/retention/route.ts — Track 8.
//
// Runs daily at 03:00 UTC (see vercel.json). Reads retention_policies and
// deletes rows older than ttl_days from each named table. The job is
// idempotent — running it twice in a row is fine.
//
// Auth model:
//   - Vercel cron sends an `Authorization: Bearer <CRON_SECRET>` header. We
//     check that secret here. In dev, the route is open so you can hit it
//     manually with curl.

import { auditFireAndForget } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Each entry says how to find the "age" column on a table. Most use
// created_at; admin_audit uses ts; abuse_reports/support_tickets default to
// created_at. Anything not in this map is treated as created_at.
const AGE_COLS: Record<string, string> = {
  admin_audit: "ts",
};

export async function GET(req: Request) {
  return runRetention(req);
}

export async function POST(req: Request) {
  return runRetention(req);
}

async function runRetention(req: Request): Promise<Response> {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const got = req.headers.get("authorization") ?? "";
    if (got !== `Bearer ${expected}`) {
      return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  const { data: policies, error } = await supa
    .from("retention_policies")
    .select("table_name, ttl_days");
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const summary: Record<string, { purged: number; cutoff: string; error?: string }> = {};

  for (const p of policies ?? []) {
    const ageCol = AGE_COLS[p.table_name] ?? "created_at";
    const cutoff = new Date(Date.now() - p.ttl_days * 24 * 60 * 60 * 1000).toISOString();
    try {
      // Count first so we can report rows-purged. Then delete.
      const { count } = await supa
        .from(p.table_name)
        .select("*", { count: "exact", head: true })
        .lt(ageCol, cutoff);
      const { error: delErr } = await supa
        .from(p.table_name)
        .delete()
        .lt(ageCol, cutoff);

      if (delErr) {
        summary[p.table_name] = { purged: 0, cutoff, error: delErr.message };
        continue;
      }
      summary[p.table_name] = { purged: count ?? 0, cutoff };

      await supa
        .from("retention_policies")
        .update({
          last_run_at: new Date().toISOString(),
          last_purged: count ?? 0,
        })
        .eq("table_name", p.table_name);
    } catch (e) {
      summary[p.table_name] = {
        purged: 0,
        cutoff,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  auditFireAndForget(
    "compliance.retention.cron",
    { kind: "system", id: "retention-cron" },
    { after: summary }
  );

  return Response.json({ ok: true, summary });
}
