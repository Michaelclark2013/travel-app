// app/api/admin/support/tickets/[ticketId]/route.ts — Track 7 single-ticket
// detail (ticket + messages).
//
// AUTH: support.read

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ ticketId: string }> }
) {
  await requirePerm(req, "support.read");
  const { ticketId } = await ctx.params;

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const [{ data: ticket, error: tErr }, { data: messages, error: mErr }] =
    await Promise.all([
      supa
        .from("support_tickets")
        .select(
          "id, user_id, email, subject, status, priority, assigned_to, sla_due_at, created_at, updated_at"
        )
        .eq("id", ticketId)
        .maybeSingle(),
      supa
        .from("support_messages")
        .select("id, ticket_id, from_kind, from_id, body, created_at")
        .eq("ticket_id", ticketId)
        .order("created_at", { ascending: true }),
    ]);

  if (tErr) {
    return Response.json({ ok: false, error: tErr.message }, { status: 500 });
  }
  if (!ticket) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }
  if (mErr) {
    return Response.json({ ok: false, error: mErr.message }, { status: 500 });
  }

  return Response.json({ ok: true, ticket, messages: messages ?? [] });
}
