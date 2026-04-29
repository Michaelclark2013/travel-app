// app/api/admin/support/tickets/[ticketId]/note/route.ts — Track 7
// internal notes (yellow). Never emailed to the customer.
//
// AUTH: support.reply (notes are an admin-only operation; reply perm
// captures "can write to a ticket" which we treat as a superset of
// internal-note authoring).

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ticketId: string }> }
) {
  const { adminId } = await requirePerm(req, "support.reply");
  const { ticketId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const text = typeof (body as { body?: unknown })?.body === "string"
    ? (body as { body: string }).body.trim()
    : "";
  if (!text) {
    return Response.json({ ok: false, error: "Note body is required." }, { status: 422 });
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  // Confirm ticket exists
  const { data: ticket } = await supa
    .from("support_tickets")
    .select("id")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) {
    return Response.json({ ok: false, error: "Ticket not found." }, { status: 404 });
  }

  const { error } = await supa.from("support_messages").insert({
    ticket_id: ticketId,
    from_kind: "note",
    from_id: adminId,
    body: text,
  });
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
