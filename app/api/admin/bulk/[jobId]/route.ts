// app/api/admin/bulk/[jobId]/route.ts — Track 2.
//
// WHAT
//   GET    /api/admin/bulk/[jobId]      — read current job state.
//   DELETE /api/admin/bulk/[jobId]      — cancel (flip status='cancelled').
//
// AUTH
//   `users.read` for GET (low bar — the row is non-sensitive metadata),
//   `content.delete` for DELETE (any admin who can run a bulk action can
//   cancel one).
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { cancelJob, getJob } from "@/lib/admin/bulk";
import { requirePerm } from "@/lib/admin/rbac";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  await requirePerm(req, "users.read");
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  return Response.json({ ok: true, job });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ jobId: string }> }
) {
  await requirePerm(req, "content.delete");
  const { jobId } = await ctx.params;
  const job = await getJob(jobId);
  if (!job) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  return audit(
    "bulk.cancel",
    { kind: "bulk_job", id: jobId },
    { before: { status: job.status }, after: { status: "cancelled" } },
    async () => {
      const ok = await cancelJob(jobId);
      return Response.json({ ok });
    }
  );
}
