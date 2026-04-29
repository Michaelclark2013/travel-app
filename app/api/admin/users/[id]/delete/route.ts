// app/api/admin/users/[id]/delete/route.ts — Track 2.
//
// WHAT
//   POST /api/admin/users/[id]/delete  body: { reason?: string }
//   Soft-delete: sets profiles_public.deleted_at. Does NOT touch auth.users
//   (the brief says "soft-delete (sets deleted_at on a new column you'll
//   add)"). Hard delete is a separate, super-only flow we don't ship here.
//
// AUTH
//   `users.delete` permission. Per ROLE_PERMS, only super_admin gets this.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "users.delete");
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as { reason?: string };

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const { data: before } = await supa
    .from("profiles_public")
    .select("user_id, deleted_at")
    .eq("user_id", id)
    .maybeSingle();

  return audit(
    "user.soft_delete",
    { kind: "user", id },
    {
      before: before ?? { user_id: id, deleted_at: null },
      after: { user_id: id, deleted_at: new Date().toISOString(), reason: body.reason ?? null },
    },
    async () => {
      const { error } = await supa
        .from("profiles_public")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", id);
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }
  );
}
