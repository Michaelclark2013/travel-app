// app/api/admin/metrics/cohort/route.ts — Track 4 drill-down endpoint.
// Returns the user_ids array for a single (cohort_week, day) cell.

import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/admin/rbac";
import { fetchRetentionCohort } from "@/lib/admin/metrics-data";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "metrics.read");
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const week = url.searchParams.get("week") ?? "";
  const day = (url.searchParams.get("day") ?? "d1") as "d1" | "d7" | "d30";

  // We don't have a per-cell RPC by design — the dashboard already loads the
  // full 12-week table. Drill-down filters in JS to keep the SQL surface
  // small. This is fine at the cohort scale we're targeting (12 rows).
  const all = await fetchRetentionCohort();
  const row = all.find((r) => r.cohort_week.startsWith(week));
  if (!row) {
    return NextResponse.json({
      cohort_week: week,
      day,
      user_ids: [] as string[],
    });
  }

  // We currently only have a single user_ids array per cohort regardless of
  // day; refining per-D{1,7,30} would require an additional RPC. For now,
  // the deeplink lands on the cohort itself; the day is preserved in the
  // payload so the UI can label correctly.
  return NextResponse.json({
    cohort_week: row.cohort_week,
    day,
    user_ids: row.user_ids,
  });
}
