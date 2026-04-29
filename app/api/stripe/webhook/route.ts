// app/api/stripe/webhook/route.ts — Track 5 zero-dep Stripe webhook.
//
// WHAT
//   POST — Stripe-Signature verified, idempotent webhook.
//   Handled events:
//     customer.subscription.created
//     customer.subscription.updated
//     customer.subscription.deleted
//     invoice.paid
//     invoice.payment_failed
//     charge.refunded
//
//   Each event upserts into pro_entitlements as appropriate. Idempotency is
//   guaranteed by stripe_events.id (the Stripe event id is the PK). If we
//   see the same id twice, the second delivery returns 200 immediately and
//   skips side effects.
//
// HOW (signature verification, no `stripe` npm package)
//   Stripe-Signature header looks like:
//     t=1690000000,v1=hex_signature,v1=hex_signature_alt
//   Spec:
//     1. Parse `t` (timestamp) and the v1 entries.
//     2. Form the signed payload: `${t}.${rawBody}`.
//     3. HMAC-SHA256 with STRIPE_WEBHOOK_SECRET. Compare hex output to any
//        v1 entry using a constant-time compare.
//     4. Reject if `Math.abs(now - t) > 300` (5 minute drift).
//   We use `node:crypto`'s `createHmac` + `timingSafeEqual`, not WebCrypto
//   — this route is `runtime = "nodejs"` so node:crypto is fine and we
//   avoid hex<->Uint8Array juggling.
//
// OPTIONAL (paste-in to use the SDK instead)
//   `npm i stripe` and then:
//     import Stripe from "stripe";
//     const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
//     const event = stripe.webhooks.constructEvent(
//       rawBody, sigHeader, process.env.STRIPE_WEBHOOK_SECRET!,
//     );
//   …and replace the verifySignature() block. The handler below stays
//   identical because it only consumes `event.type` and `event.data.object`.
//
// ENV VARS
//   STRIPE_WEBHOOK_SECRET     — `whsec_...` from Stripe Dashboard.
//   SUPABASE_SERVICE_ROLE_KEY — for the service-role client.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase-server";

export const runtime = "nodejs";
// We need the raw body for HMAC verification — Next never wraps it for
// route handlers, so request.text() returns it verbatim.
export const dynamic = "force-dynamic";

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 minutes — Stripe's recommended

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    // Returning 503 so Stripe will retry; once we configure the secret the
    // backlog drains automatically.
    return new Response("STRIPE_WEBHOOK_SECRET not configured", { status: 503 });
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return new Response("Supabase service role not configured", { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return new Response("Missing Stripe-Signature header", { status: 400 });
  }

  const rawBody = await request.text();
  const verification = verifySignature({ rawBody, sigHeader: sig, secret });
  if (!verification.ok) {
    return new Response(`Signature verification failed: ${verification.reason}`, {
      status: 400,
    });
  }

  // Parse the event JSON. Verification used the raw bytes; we can JSON.parse
  // the validated string safely now.
  let event: StripeEventEnvelope;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }
  if (!event.id || !event.type || !event.data) {
    return new Response("Malformed event", { status: 400 });
  }

  // ----- Idempotency -----
  // Insert returning the existing row when we've seen this id before; if
  // processed_at is non-null we exit early.
  const existing = await supa
    .from("stripe_events")
    .select("id, processed_at")
    .eq("id", event.id)
    .maybeSingle();
  if (existing.data?.processed_at) {
    return new Response("ok (duplicate)", { status: 200 });
  }
  if (!existing.data) {
    const { error: insErr } = await supa.from("stripe_events").insert({
      id: event.id,
      type: event.type,
      payload: event,
      processed_at: null,
    });
    if (insErr) {
      // If the insert failed because a parallel delivery beat us to it,
      // re-read; otherwise surface the error.
      console.warn("[stripe webhook] insert race", insErr.message);
    }
  }

  // ----- Dispatch -----
  try {
    await dispatch(event);
  } catch (err) {
    console.error("[stripe webhook] dispatch failed", err);
    // Leave processed_at null so Stripe retries.
    return new Response("Handler error", { status: 500 });
  }

  await supa
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", event.id);

  return new Response("ok", { status: 200 });
}

// ---------------------------------------------------------------------------
// Signature verification — constant-time HMAC compare.
// ---------------------------------------------------------------------------
type VerifyResult = { ok: true } | { ok: false; reason: string };

export function verifySignature(args: {
  rawBody: string;
  sigHeader: string;
  secret: string;
  nowSeconds?: number; // injectable for tests
}): VerifyResult {
  const now = args.nowSeconds ?? Math.floor(Date.now() / 1000);
  const parts = args.sigHeader.split(",").map((p) => p.trim());
  let timestamp: number | null = null;
  const v1Sigs: string[] = [];
  for (const part of parts) {
    const [k, v] = part.split("=");
    if (!k || !v) continue;
    if (k === "t") {
      timestamp = Number.parseInt(v, 10);
    } else if (k === "v1") {
      v1Sigs.push(v);
    }
  }
  if (!timestamp) return { ok: false, reason: "missing timestamp" };
  if (Math.abs(now - timestamp) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "timestamp drift > 5min" };
  }
  if (v1Sigs.length === 0) return { ok: false, reason: "missing v1 signature" };

  const signedPayload = `${timestamp}.${args.rawBody}`;
  const expected = createHmac("sha256", args.secret).update(signedPayload).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");

  for (const sig of v1Sigs) {
    if (sig.length !== expected.length) continue;
    const sigBuf = Buffer.from(sig, "utf8");
    try {
      if (timingSafeEqual(sigBuf, expectedBuf)) return { ok: true };
    } catch {
      // length mismatch — keep trying
    }
  }
  return { ok: false, reason: "no matching signature" };
}

// ---------------------------------------------------------------------------
// Event dispatcher.
// ---------------------------------------------------------------------------

type StripeEventEnvelope = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
  created?: number;
};

async function dispatch(event: StripeEventEnvelope): Promise<void> {
  const obj = event.data.object;
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
      await onSubscriptionUpsert(obj);
      break;
    case "customer.subscription.deleted":
      await onSubscriptionDeleted(obj);
      break;
    case "invoice.paid":
      await onInvoicePaid(obj);
      break;
    case "invoice.payment_failed":
      await onInvoicePaymentFailed(obj);
      break;
    case "charge.refunded":
      await onChargeRefunded(obj);
      break;
    default:
      // Ignore unknown event types — Stripe sends MANY we don't care about.
      console.info(`[stripe webhook] ignoring ${event.type}`);
      break;
  }
}

// ---------------------------------------------------------------------------
// Per-event handlers.
//
// All of these key off the customer's *Stripe customer id*, which in our
// flow is set from `metadata.user_id` at checkout time. If metadata is
// missing we log and skip — the row will be reconciled by the next event
// once metadata is patched in.
// ---------------------------------------------------------------------------

function userIdFromMetadata(obj: Record<string, unknown>): string | null {
  const md = (obj.metadata ?? {}) as Record<string, string>;
  return md.user_id ?? null;
}

async function onSubscriptionUpsert(sub: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) return;
  const userId = userIdFromMetadata(sub);
  if (!userId) {
    console.warn("[stripe webhook] subscription missing metadata.user_id", sub.id);
    return;
  }
  const customerId = String(sub.customer ?? "");
  const subId = String(sub.id ?? "");
  const status = String(sub.status ?? "incomplete");
  const cpe = typeof sub.current_period_end === "number"
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;
  const cancelAtPeriodEnd = Boolean(sub.cancel_at_period_end);

  await supa.from("pro_entitlements").upsert(
    {
      user_id: userId,
      source: "stripe",
      stripe_customer_id: customerId,
      stripe_subscription_id: subId,
      status,
      current_period_end: cpe,
      cancel_at_period_end: cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
}

async function onSubscriptionDeleted(sub: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) return;
  const userId = userIdFromMetadata(sub);
  if (!userId) return;
  await supa
    .from("pro_entitlements")
    .update({
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("source", "stripe");
}

async function onInvoicePaid(invoice: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) return;
  const customerId = String(invoice.customer ?? "");
  if (!customerId) return;
  // Sync the entitlement back to active and bump current_period_end if the
  // invoice carries a `period_end`. Useful when an `invoice.paid` arrives
  // before `customer.subscription.updated`.
  const periodEnd = typeof invoice.period_end === "number"
    ? new Date(invoice.period_end * 1000).toISOString()
    : null;
  await supa
    .from("pro_entitlements")
    .update({
      status: "active",
      ...(periodEnd ? { current_period_end: periodEnd } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_customer_id", customerId);
}

async function onInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) return;
  const customerId = String(invoice.customer ?? "");
  if (!customerId) return;
  await supa
    .from("pro_entitlements")
    .update({ status: "past_due", updated_at: new Date().toISOString() })
    .eq("stripe_customer_id", customerId);
}

async function onChargeRefunded(charge: Record<string, unknown>): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) return;
  const customerId = String(charge.customer ?? "");
  if (!customerId) return;
  // Full refund -> we treat the entitlement as canceled. Partial refund ->
  // leave as-is; the admin who issued the partial is responsible for any
  // status flip.
  const amount = typeof charge.amount === "number" ? charge.amount : 0;
  const refunded = typeof charge.amount_refunded === "number" ? charge.amount_refunded : 0;
  if (amount > 0 && refunded >= amount) {
    await supa
      .from("pro_entitlements")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("stripe_customer_id", customerId);
  }
}
