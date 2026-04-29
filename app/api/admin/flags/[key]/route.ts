// app/api/admin/flags/[key]/route.ts — Track 6 single-flag DELETE.
//
// WHAT
//   DELETE /api/admin/flags/<key> — delete one flag, audit-logged. Requires
//   flags.write (kill switches must be deleted via this same route by an
//   admin with flags.kill since deletion is destructive).
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { deleteFlag, getFlagRow } from "@/lib/admin/flags";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ key: string }> }
) {
  await requirePerm(req, "flags.write");
  const { key } = await params;
  const before = await getFlagRow(key);
  if (!before) {
    return Response.json({ ok: false, error: "Flag not found." }, { status: 404 });
  }
  if (before.kind === "kill_switch") {
    await requirePerm(req, "flags.kill");
  }
  return audit(
    "flag.delete",
    { kind: "feature_flag", id: key },
    { before, after: null },
    async () => {
      const ok = await deleteFlag(key);
      if (!ok) {
        return Response.json(
          { ok: false, error: "Delete failed." },
          { status: 503 }
        );
      }
      return Response.json({ ok: true });
    }
  );
}
