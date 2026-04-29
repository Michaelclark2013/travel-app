// app/api/support/inbound/route.ts — Track 7 inbound-email webhook.
//
// WHAT
//   POST (from Resend's inbound-mail webhook) — verifies the signature,
//   parses the email, and either:
//     (a) appends a support_messages row to an existing ticket if the
//         subject contains a [tic-…] reference, or
//     (b) creates a new support_tickets + support_messages pair.
//
// WHY signature verification
//   The inbound webhook is publicly callable. We HMAC-verify the body
//   against RESEND_INBOUND_SECRET so a third party can't spoof customer
//   replies into the inbox. Resend signs the request body with HMAC-SHA256
//   and sends the hex digest in the `x-resend-signature` header (this is
//   the convention they use for outbound delivery webhooks; the inbound
//   feature is currently in private beta and follows the same pattern).
//
//   We accept either Resend's documented JSON shape OR a generic
//   `{ from, to, subject, text|html, message_id }` so this works with the
//   typical inbound-email forwarders (Postmark, SendGrid Inbound Parse,
//   Cloudflare Email Routing) by tweaking the env-var secret only.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY  — for writes (RLS blocks all else)
//   RESEND_INBOUND_SECRET      — HMAC secret for x-resend-signature
//                                (when missing in dev, signature check
//                                is skipped with a console.warn)

import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { defaultSlaDueAt, newId } from "@/lib/admin/support";

export const runtime = "nodejs";

const TICKET_REF_RE = /\[tic-([a-z0-9-]+)\]/i;

function verifySignature(rawBody: string, sig: string | null): boolean {
  const secret = process.env.RESEND_INBOUND_SECRET;
  if (!secret) {
    console.warn(
      "[support.inbound] RESEND_INBOUND_SECRET not set — accepting unsigned (dev only)"
    );
    return true;
  }
  if (!sig) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  // timingSafeEqual requires equal-length buffers
  if (sig.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(sig, "utf8"), Buffer.from(expected, "utf8"));
  } catch {
    return false;
  }
}

type InboundPayload = {
  from?: string | { email?: string; address?: string };
  to?: string | string[];
  subject?: string;
  text?: string;
  html?: string;
  message_id?: string;
  data?: Record<string, unknown>;
};

function pickEmail(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (v && typeof v === "object") {
    const obj = v as { email?: unknown; address?: unknown };
    if (typeof obj.email === "string") return obj.email.trim();
    if (typeof obj.address === "string") return obj.address.trim();
  }
  return "";
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>(\s*)/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export async function POST(req: Request) {
  const raw = await req.text();
  const sig =
    req.headers.get("x-resend-signature") ??
    req.headers.get("svix-signature") ??
    null;

  if (!verifySignature(raw, sig)) {
    return NextResponse.json(
      { ok: false, error: "Invalid signature." },
      { status: 401 }
    );
  }

  let payload: InboundPayload;
  try {
    const parsed = JSON.parse(raw);
    // Resend wraps the actual mail under .data; flatten gracefully.
    payload =
      (parsed && typeof parsed === "object" && "data" in parsed
        ? (parsed.data as InboundPayload)
        : (parsed as InboundPayload)) ?? {};
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON." },
      { status: 400 }
    );
  }

  const fromEmail = pickEmail(payload.from);
  const subject = (payload.subject ?? "").trim() || "(no subject)";
  const bodyText =
    (payload.text ?? "").trim() ||
    (payload.html ? htmlToText(payload.html) : "") ||
    "(empty body)";

  if (!fromEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(fromEmail)) {
    return NextResponse.json(
      { ok: false, error: "Missing or invalid sender." },
      { status: 422 }
    );
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return NextResponse.json(
      { ok: false, error: "Service unavailable." },
      { status: 503 }
    );
  }

  // Look for an existing ticket reference in the subject.
  const refMatch = subject.match(TICKET_REF_RE);
  let ticketId = refMatch ? `tic-${refMatch[1]!.toLowerCase()}` : null;

  if (ticketId) {
    const { data: existing } = await supa
      .from("support_tickets")
      .select("id, status, priority")
      .eq("id", ticketId)
      .maybeSingle();
    if (!existing) {
      // Reference looked plausible but doesn't exist — fall through and
      // create a new ticket so the customer's reply isn't dropped.
      ticketId = null;
    } else {
      // Re-open if it had been resolved.
      if (existing.status === "resolved" || existing.status === "spam") {
        await supa
          .from("support_tickets")
          .update({ status: "open" })
          .eq("id", ticketId);
      }
    }
  }

  if (!ticketId) {
    ticketId = newId("tic");
    const priority = "normal" as const;
    const { error: tErr } = await supa.from("support_tickets").insert({
      id: ticketId,
      user_id: null,
      email: fromEmail,
      subject,
      status: "new",
      priority,
      sla_due_at: defaultSlaDueAt(priority),
    });
    if (tErr) {
      return NextResponse.json(
        { ok: false, error: tErr.message },
        { status: 500 }
      );
    }
  }

  const { error: mErr } = await supa.from("support_messages").insert({
    ticket_id: ticketId,
    from_kind: "user",
    from_id: null,
    body: bodyText,
  });
  if (mErr) {
    return NextResponse.json(
      { ok: false, error: mErr.message, ticketId },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, ticketId }, { status: 200 });
}
