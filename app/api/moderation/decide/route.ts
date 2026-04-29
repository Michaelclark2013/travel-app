// app/api/moderation/decide/route.ts — Track 3 admin decision endpoint.
//
// WHAT
//   POST { queueId, decision: 'approve'|'reject'|'escalate'|'unhide' }
//     -> { ok: true }
//
//   Updates the moderation_queue row with the admin's decision and applies
//   the side-effect on the target:
//     - 'approve'  -> clear hidden_at (in case it was auto-hidden)
//     - 'reject'   -> set hidden_at = now()
//     - 'escalate' -> no target change; just flips status
//     - 'unhide'   -> clear hidden_at without changing the queue row's
//                     status (used by the abuse-reports flow)
//
//   Wraps the mutation in audit() so admin_audit gets a before/after.
//
// AUTH
//   moderation.action — admins/super_admins. (`support` only has review.)

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const VALID = new Set(["approve", "reject", "escalate", "unhide"]);

export async function POST(req: Request) {
  const { adminId } = await requirePerm(req, "moderation.action");

  let body: { queueId?: string; decision?: string };
  try {
    body = (await req.json()) as { queueId?: string; decision?: string };
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
  const queueId = body.queueId ?? "";
  const decision = body.decision ?? "";
  if (!queueId || !VALID.has(decision)) {
    return Response.json(
      { ok: false, error: "Body must be { queueId, decision }." },
      { status: 400 }
    );
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const { data: row, error: rowErr } = await supa
    .from("moderation_queue")
    .select("id, target_kind, target_id, status, scores")
    .eq("id", queueId)
    .maybeSingle();
  if (rowErr || !row) {
    return Response.json(
      { ok: false, error: rowErr?.message ?? "Queue row not found." },
      { status: 404 }
    );
  }

  const newStatus =
    decision === "approve"
      ? "approved"
      : decision === "reject"
      ? "rejected"
      : decision === "escalate"
      ? "escalated"
      : row.status; // 'unhide' keeps current status
  const targetTable =
    row.target_kind === "moment"
      ? "moments"
      : row.target_kind === "comment"
      ? "comments"
      : row.target_kind === "dm"
      ? "dm_messages"
      : null;

  const before = { status: row.status };
  const after = { status: newStatus, decision, decidedBy: adminId };

  return audit(
    `moderation.${decision}`,
    { kind: "moderation_queue", id: queueId },
    { before, after },
    async () => {
      const nowIso = new Date().toISOString();
      // Update the queue row.
      const { error: updErr } = await supa
        .from("moderation_queue")
        .update({
          status: newStatus,
          admin_decision: decision,
          decided_by: adminId,
          decided_at: nowIso,
        })
        .eq("id", queueId);
      if (updErr) {
        return Response.json(
          { ok: false, error: updErr.message },
          { status: 500 }
        );
      }

      // Side-effect on the target row.
      if (targetTable) {
        if (decision === "reject") {
          await supa
            .from(targetTable)
            .update({ hidden_at: nowIso })
            .eq("id", row.target_id);
        } else if (decision === "approve" || decision === "unhide") {
          await supa
            .from(targetTable)
            .update({ hidden_at: null })
            .eq("id", row.target_id);
        }
      }

      return Response.json({ ok: true });
    }
  );
}
