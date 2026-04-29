// app/api/admin/content/action/route.ts — Track 2 single-row content
// action helper. The bulk engine handles >1 ids; this is the synchronous
// path for "click hide on one moment" cases the UI uses for instant
// feedback before falling back to the bulk path.
//
// WHAT
//   POST /api/admin/content/action
//     body: { kind: 'moment'|'trip'|'comment', id, action: 'hide'|'restore'|'delete'|'feature'|'unfeature' }
//
// AUTH
//   content.delete for hide/restore/delete; content.feature for feature/unfeature.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { audit } from "@/lib/admin/audit";
import { requirePerm, type Permission } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const TABLES: Record<string, { table: string; idCol: string }> = {
  moment: { table: "moments", idCol: "id" },
  trip: { table: "trips", idCol: "id" },
  comment: { table: "comments", idCol: "id" },
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    id?: string;
    action?: string;
  };
  if (!body.kind || !body.id || !body.action) {
    return Response.json(
      { ok: false, error: "missing kind / id / action" },
      { status: 400 }
    );
  }
  const meta = TABLES[body.kind];
  if (!meta) {
    return Response.json(
      { ok: false, error: `unknown kind ${body.kind}` },
      { status: 400 }
    );
  }
  const perm: Permission =
    body.action === "feature" || body.action === "unfeature"
      ? "content.feature"
      : "content.delete";
  await requirePerm(req, perm);

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const now = new Date().toISOString();
  let patch: Record<string, string | null> = {};
  switch (body.action) {
    case "hide":
      patch = { hidden_at: now };
      break;
    case "restore":
      patch = { hidden_at: null, deleted_at: null };
      break;
    case "delete":
      patch = { deleted_at: now };
      break;
    case "feature":
      if (body.kind === "comment") {
        return Response.json(
          { ok: false, error: "feature unsupported on comments" },
          { status: 400 }
        );
      }
      patch = { featured_at: now };
      break;
    case "unfeature":
      if (body.kind === "comment") {
        return Response.json(
          { ok: false, error: "unfeature unsupported on comments" },
          { status: 400 }
        );
      }
      patch = { featured_at: null };
      break;
    default:
      return Response.json(
        { ok: false, error: `unknown action ${body.action}` },
        { status: 400 }
      );
  }

  const { data: before } = await supa
    .from(meta.table)
    .select("*")
    .eq(meta.idCol, body.id)
    .maybeSingle();

  return audit(
    `content.${body.kind}.${body.action}`,
    { kind: body.kind, id: body.id },
    { before: before ?? null, after: { ...(before ?? {}), ...patch } },
    async () => {
      const { error } = await supa
        .from(meta.table)
        .update(patch)
        .eq(meta.idCol, body.id);
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }
  );
}
