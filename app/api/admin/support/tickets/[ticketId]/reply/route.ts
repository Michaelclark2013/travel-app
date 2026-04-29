// app/api/admin/support/tickets/[ticketId]/reply/route.ts — Track 7
// admin replies. Logs the message, optionally emails the customer, audits.
//
// AUTH: support.reply

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";

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
  const obj = (body ?? {}) as Record<string, unknown>;
  const text = typeof obj.body === "string" ? obj.body.trim() : "";
  const sendEmailFlag = obj.send_email !== false; // default: true
  if (!text) {
    return Response.json({ ok: false, error: "Reply body is required." }, { status: 422 });
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const { data: ticket, error: tErr } = await supa
    .from("support_tickets")
    .select("id, email, subject, status")
    .eq("id", ticketId)
    .maybeSingle();
  if (tErr) {
    return Response.json({ ok: false, error: tErr.message }, { status: 500 });
  }
  if (!ticket) {
    return Response.json({ ok: false, error: "Ticket not found." }, { status: 404 });
  }

  return audit(
    "support.reply",
    { kind: "ticket", id: ticketId },
    { before: { status: ticket.status }, after: { status: "pending", reply_chars: text.length } },
    async () => {
      const { error: mErr } = await supa.from("support_messages").insert({
        ticket_id: ticketId,
        from_kind: "admin",
        from_id: adminId,
        body: text,
      });
      if (mErr) {
        return Response.json({ ok: false, error: mErr.message }, { status: 500 });
      }

      // Pending = waiting on customer.
      await supa
        .from("support_tickets")
        .update({ status: "pending" })
        .eq("id", ticketId);

      if (sendEmailFlag && ticket.email) {
        const subject = ticket.subject?.startsWith("Re:")
          ? ticket.subject
          : `Re: ${ticket.subject ?? "your message"} [${ticketId}]`;
        // Body is plaintext; convert newlines to <br> for HTML send.
        const html = text
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
        void sendEmail({
          to: ticket.email,
          subject: subject.includes(`[${ticketId}]`) ? subject : `${subject} [${ticketId}]`,
          html: `<div style="font-family:system-ui,sans-serif;line-height:1.5">${html}</div>`,
          text,
        }).catch(() => {});
      }

      return Response.json({ ok: true });
    }
  );
}
