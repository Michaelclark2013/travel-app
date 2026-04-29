// app/api/admin/billing/refund/route.ts — Track 5 issue Stripe refund.
//
// WHAT
//   POST { chargeId, amount?, reason? } -> { ok, refund }
//
// AUTH
//   billing.refund.
//
// AUDIT
//   Wrapped in audit("billing.refund", ...) so admin_audit captures who,
//   what, and the Stripe response.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { refundCharge, stripeConfigured } from "@/lib/admin/stripe";

type Body = {
  chargeId?: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
};

export async function POST(req: Request) {
  await requirePerm(req, "billing.refund");
  if (!stripeConfigured()) {
    return Response.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.chargeId) {
    return Response.json({ error: "chargeId required" }, { status: 400 });
  }

  return audit(
    "billing.refund",
    { kind: "stripe_charge", id: body.chargeId },
    { before: { chargeId: body.chargeId, amount: body.amount, reason: body.reason }, after: null },
    async () => {
      const refund = await refundCharge({
        chargeId: body.chargeId!,
        amount: body.amount,
        reason: body.reason,
        idempotencyKey: `refund-${body.chargeId}-${body.amount ?? "full"}`,
      });
      return Response.json({ ok: true, refund });
    }
  );
}
