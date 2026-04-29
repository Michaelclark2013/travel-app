// app/api/admin/billing/cancel/route.ts — Track 5 manual subscription cancel.
//
// WHAT
//   POST { subscriptionId, atPeriodEnd: boolean } -> { ok, subscription }
//
// AUTH
//   billing.refund (cancellation refunds money/value).

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { cancelSubscription, stripeConfigured } from "@/lib/admin/stripe";

type Body = { subscriptionId?: string; atPeriodEnd?: boolean };

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
  if (!body.subscriptionId) {
    return Response.json({ error: "subscriptionId required" }, { status: 400 });
  }
  const atPeriodEnd = body.atPeriodEnd !== false;

  return audit(
    "billing.cancel",
    { kind: "stripe_subscription", id: body.subscriptionId },
    { before: { atPeriodEnd }, after: null },
    async () => {
      const sub = await cancelSubscription(body.subscriptionId!, atPeriodEnd);
      return Response.json({ ok: true, subscription: sub });
    }
  );
}
