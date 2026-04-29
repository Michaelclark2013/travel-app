// app/api/admin/metrics/concurrent/route.ts — Track 4 RPC bridge for the
// live "users now" panel. The client component polls this on every Realtime
// signal so the front end never holds the service-role key.

import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/admin/rbac";
import { fetchConcurrent } from "@/lib/admin/metrics-data";
import { auditFireAndForget } from "@/lib/admin/audit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    await requirePerm(req, "metrics.read");
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const windowMinutes = Math.max(
    1,
    Math.min(60, Number(url.searchParams.get("window") ?? "5"))
  );

  const active = await fetchConcurrent(windowMinutes);

  // Lightweight observability: log a "metrics.read" trail row at most once
  // per minute per admin via the auditFireAndForget mechanism. (Track 1's
  // helper is already idempotent-safe — duplicate rows are fine; we just
  // don't want to log every 30s heartbeat.)
  if ((Date.now() / 1000) % 60 < 1) {
    auditFireAndForget(
      "metrics.read.concurrent",
      { kind: "metric", id: "concurrent" },
      { after: { active, windowMinutes } }
    );
  }

  return NextResponse.json({ active, windowMinutes });
}
