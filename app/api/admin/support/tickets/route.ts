// app/api/admin/support/tickets/route.ts — Track 7 ticket list API.
//
// WHAT
//   GET ?status=&priority=&assigned=&overdue=1&q=&cursor=&limit=
//     -> { rows, nextCursor }
//
// AUTH
//   Requires support.read.
//
// PAGINATION
//   Cursor is the (updated_at, id) pair, encoded "ts|id". Forward = older.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { TICKET_PRIORITIES, TICKET_STATUSES } from "@/lib/admin/support";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  await requirePerm(req, "support.read");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit")) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const status = url.searchParams.get("status");
  const priority = url.searchParams.get("priority");
  const assigned = url.searchParams.get("assigned");
  const overdue = url.searchParams.get("overdue") === "1";
  const q = url.searchParams.get("q");
  const cursor = url.searchParams.get("cursor");

  let query = supa
    .from("support_tickets")
    .select(
      "id, user_id, email, subject, status, priority, assigned_to, sla_due_at, created_at, updated_at"
    )
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);

  if (status && (TICKET_STATUSES as string[]).includes(status)) {
    query = query.eq("status", status);
  }
  if (priority && (TICKET_PRIORITIES as string[]).includes(priority)) {
    query = query.eq("priority", priority);
  }
  if (assigned === "me") {
    // The caller can scope to their own queue; we resolve via the cookie.
    // requirePerm has already verified the cookie is valid; re-read it
    // here lazily via a dynamic import.
    const { getAdminFromRequest } = await import("@/lib/admin/session");
    const session = await getAdminFromRequest(req);
    if (session?.adminId) query = query.eq("assigned_to", session.adminId);
  } else if (assigned === "none") {
    query = query.is("assigned_to", null);
  } else if (assigned && /^[0-9a-f-]{36}$/i.test(assigned)) {
    query = query.eq("assigned_to", assigned);
  }
  if (overdue) {
    query = query
      .lt("sla_due_at", new Date().toISOString())
      .neq("status", "resolved")
      .neq("status", "spam");
  }
  if (q) {
    // ilike OR across subject and email — Supabase doesn't expose `or()`
    // cleanly with multi-clause ilike, so we use the documented filter.
    const safe = q.replace(/[%,]/g, " ").slice(0, 80);
    query = query.or(`subject.ilike.%${safe}%,email.ilike.%${safe}%`);
  }
  if (cursor) {
    const [ts] = cursor.split("|");
    if (ts) query = query.lt("updated_at", ts);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  const rows = data ?? [];
  let nextCursor: string | null = null;
  let trimmed = rows;
  if (rows.length > limit) {
    trimmed = rows.slice(0, limit);
    const last = trimmed[trimmed.length - 1];
    if (last) nextCursor = `${last.updated_at}|${last.id}`;
  }
  return Response.json({ ok: true, rows: trimmed, nextCursor });
}
