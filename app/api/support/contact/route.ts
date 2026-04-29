// app/api/support/contact/route.ts — Track 7 public contact-form endpoint.
//
// WHAT
//   POST { email, subject, body, user_id? } -> creates a support_tickets +
//   support_messages row pair, fires an auto-acknowledgement email back to
//   the customer, returns { ok: true, ticketId }.
//
// WHY public + unauthenticated
//   The contact form lives on the marketing site and the in-app
//   "Help" sheet — both can be hit while signed-out. We accept user_id
//   when the caller has one (so the inbox can link back to the user) but
//   never trust it to authorize anything. There is no PII in the response
//   beyond the ticket id.
//
//   To prevent abuse we apply a tiny per-IP rate limit (in-memory, best
//   effort) and a length cap. A real WAF / Turnstile gate is a follow-up.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY — for inserts (RLS blocks all else)
//   RESEND_API_KEY            — auto-ack email (graceful no-op if missing)

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { sendEmail } from "@/lib/email";
import { defaultSlaDueAt, newId } from "@/lib/admin/support";

export const runtime = "nodejs";

const MAX_SUBJECT = 200;
const MAX_BODY = 10_000;

// Tiny per-IP token bucket. Resets at process restart. Good enough to
// blunt obvious abuse; a real solution lives at the edge.
const buckets = new Map<string, { tokens: number; ts: number }>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_PER_WINDOW = 5;

function rateLimit(ip: string): boolean {
  const now = Date.now();
  const cur = buckets.get(ip);
  if (!cur || now - cur.ts > RATE_WINDOW_MS) {
    buckets.set(ip, { tokens: 1, ts: now });
    return true;
  }
  if (cur.tokens >= RATE_MAX_PER_WINDOW) return false;
  cur.tokens += 1;
  return true;
}

export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  if (!rateLimit(ip)) {
    return NextResponse.json(
      { ok: false, error: "Too many requests — try again in a minute." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }

  const obj = (body ?? {}) as Record<string, unknown>;
  const email = typeof obj.email === "string" ? obj.email.trim() : "";
  const subject = typeof obj.subject === "string" ? obj.subject.trim() : "";
  const text = typeof obj.body === "string" ? obj.body.trim() : "";
  const userId =
    typeof obj.user_id === "string" && /^[0-9a-f-]{36}$/i.test(obj.user_id)
      ? obj.user_id
      : null;

  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "A valid email is required." },
      { status: 422 }
    );
  }
  if (!text) {
    return NextResponse.json(
      { ok: false, error: "Message body is required." },
      { status: 422 }
    );
  }
  if (subject.length > MAX_SUBJECT || text.length > MAX_BODY) {
    return NextResponse.json(
      { ok: false, error: "Message exceeds size limits." },
      { status: 413 }
    );
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return NextResponse.json(
      { ok: false, error: "Service unavailable." },
      { status: 503 }
    );
  }

  const ticketId = newId("tic");
  const priority = "normal" as const;
  const { error: tErr } = await supa.from("support_tickets").insert({
    id: ticketId,
    user_id: userId,
    email,
    subject: subject || "(no subject)",
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

  const { error: mErr } = await supa.from("support_messages").insert({
    ticket_id: ticketId,
    from_kind: "user",
    from_id: userId,
    body: text,
  });
  if (mErr) {
    // Best effort — the ticket exists; surface the error but don't roll back.
    return NextResponse.json(
      { ok: false, error: mErr.message, ticketId },
      { status: 500 }
    );
  }

  // Auto-acknowledgement (fire-and-forget; we don't fail the request on it).
  void sendEmail({
    to: email,
    subject: `Re: ${subject || "your message"} [${ticketId}]`,
    html: `<p>Thanks for reaching out — we got your message and will reply soon.</p>
           <p>Reference: <code>${ticketId}</code>.</p>
           <p>— Voyage Support</p>`,
    text: `Thanks for reaching out — we got your message and will reply soon.\n\nReference: ${ticketId}.\n\n— Voyage Support`,
  }).catch(() => {
    /* ignore — email is best-effort */
  });

  // Mirror to system message for the audit trail.
  void supa
    .from("support_messages")
    .insert({
      ticket_id: ticketId,
      from_kind: "system",
      body: `Auto-acknowledgement sent to ${email}.`,
    })
    .then(() => {});

  return NextResponse.json({ ok: true, ticketId }, { status: 201 });
}
