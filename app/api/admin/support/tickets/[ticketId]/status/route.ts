// app/api/admin/support/tickets/[ticketId]/status/route.ts — Track 7
// patch endpoint for status / priority / assignee. Audit-logged.
//
// AUTH: support.reply

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  defaultSlaDueAt,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/admin/support";

export async function POST(
  req: Request,
  ctx: { params: Promise<{ ticketId: string }> }
) {
  await requirePerm(req, "support.reply");
  const { ticketId } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;

  const update: Record<string, unknown> = {};
  if (typeof obj.status === "string") {
    if (!(TICKET_STATUSES as string[]).includes(obj.status)) {
      return Response.json({ ok: false, error: "Invalid status." }, { status: 422 });
    }
    update.status = obj.status as TicketStatus;
  }
  if (typeof obj.priority === "string") {
    if (!(TICKET_PRIORITIES as string[]).includes(obj.priority)) {
      return Response.json({ ok: false, error: "Invalid priority." }, { status: 422 });
    }
    update.priority = obj.priority as TicketPriority;
    // Re-roll the SLA when priority changes.
    update.sla_due_at = defaultSlaDueAt(obj.priority as TicketPriority);
  }
  if ("assigned_to" in obj) {
    const v = obj.assigned_to;
    if (v === null) update.assigned_to = null;
    else if (typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v))
      update.assigned_to = v;
    else
      return Response.json(
        { ok: false, error: "Invalid assigned_to." },
        { status: 422 }
      );
  }

  if (Object.keys(update).length === 0) {
    return Response.json({ ok: false, error: "Nothing to update." }, { status: 422 });
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const { data: before } = await supa
    .from("support_tickets")
    .select("id, status, priority, assigned_to, sla_due_at")
    .eq("id", ticketId)
    .maybeSingle();
  if (!before) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  return audit(
    "support.ticket.update",
    { kind: "ticket", id: ticketId },
    { before, after: { ...before, ...update } },
    async () => {
      const { error } = await supa
        .from("support_tickets")
        .update(update)
        .eq("id", ticketId);
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true });
    }
  );
}
