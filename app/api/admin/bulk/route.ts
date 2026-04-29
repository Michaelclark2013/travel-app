// app/api/admin/bulk/route.ts — Track 2 bulk job enqueue API.
//
// WHAT
//   POST /api/admin/bulk
//     body: { action, target_kind, ids: string[], dry_run?: boolean }
//     -> { ok, jobId } | { ok: false, error }
//   GET  /api/admin/bulk
//     -> { ok, jobs: BulkJobRow[] }    (recent jobs by current admin)
//
// AUTH
//   POST: requires the perm matching the action (content.delete /
//         content.feature / users.suspend etc).
//   GET:  any admin can list their own jobs; we use users.read as the
//         lowest-bar gate.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import {
  enqueue,
  listJobsByAdmin,
  type BulkAction,
  type BulkTargetKind,
} from "@/lib/admin/bulk";
import { requirePerm, type Permission } from "@/lib/admin/rbac";

function permFor(action: BulkAction, kind: BulkTargetKind): Permission {
  if (kind === "user") {
    if (action === "delete") return "users.delete";
    return "users.suspend";
  }
  if (action === "feature" || action === "unfeature") return "content.feature";
  if (action === "delete") return "content.delete";
  return "content.delete"; // hide / restore land here too
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: BulkAction;
    target_kind?: BulkTargetKind;
    ids?: string[];
    dry_run?: boolean;
  };

  const action = body.action;
  const targetKind = body.target_kind;
  const ids = Array.isArray(body.ids) ? body.ids : [];
  if (!action || !targetKind || ids.length === 0) {
    return Response.json(
      { ok: false, error: "missing action / target_kind / ids" },
      { status: 400 }
    );
  }

  const session = await requirePerm(req, permFor(action, targetKind));

  return audit(
    "bulk.enqueue",
    { kind: "bulk_job", id: `pending-${Date.now()}` },
    {
      before: null,
      after: { action, target_kind: targetKind, count: ids.length, dry_run: !!body.dry_run },
    },
    async () => {
      const res = await enqueue({
        adminId: session.adminId,
        action,
        targetKind,
        ids,
        dryRun: !!body.dry_run,
      });
      if (!res.ok) {
        return Response.json({ ok: false, error: res.error }, { status: 400 });
      }
      return Response.json({ ok: true, jobId: res.jobId });
    }
  );
}

export async function GET(req: Request) {
  const session = await requirePerm(req, "users.read");
  const jobs = await listJobsByAdmin(session.adminId);
  return Response.json({ ok: true, jobs });
}
