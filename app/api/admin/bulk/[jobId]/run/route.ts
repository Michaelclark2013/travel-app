// app/api/admin/bulk/[jobId]/run/route.ts — Track 2.
//
// WHAT
//   POST /api/admin/bulk/[jobId]/run
//   Worker entrypoint. Claims the job (queued -> running) and processes it
//   to completion in batches of 50, updating progress after each batch so
//   Supabase Realtime subscribers see the row tick.
//
// WHY a route handler rather than an async-job worker
//   We don't have a separate worker process; the simplest "fire and
//   forget" is for the UI (or a follow-up cron) to POST this endpoint
//   right after enqueue. Routes can take up to 60s on Vercel hobby; for
//   1000 rows × 50/batch that's 20 batches, well within that envelope at
//   typical Postgres write rates. If the request is killed mid-run, the
//   job's progress was committed per-batch and the next POST will resume.
//
// AUTH
//   `content.delete` — any admin who can run a destructive bulk action can
//   trigger the worker.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { runJob, getJob } from "@/lib/admin/bulk";
import { requirePerm } from "@/lib/admin/rbac";

// Allow up to 60s for the worker to process a full job in one call.
export const maxDuration = 60;

export async function POST(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  await requirePerm(req, "content.delete");
  const { jobId } = await ctx.params;
  const before = await getJob(jobId);
  if (!before) {
    return Response.json({ ok: false, error: "not found" }, { status: 404 });
  }

  return audit(
    "bulk.run",
    { kind: "bulk_job", id: jobId },
    { before: { progress: before.progress, status: before.status }, after: { triggered: true } },
    async () => {
      const after = await runJob(jobId);
      return Response.json({ ok: true, job: after });
    }
  );
}
