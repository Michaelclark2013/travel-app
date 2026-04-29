// app/api/admin/billing/coupon/route.ts — Track 5 apply coupon to subscription.
//
// WHAT
//   POST { subscriptionId, couponId } -> { ok, subscription }

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { applyCoupon, stripeConfigured } from "@/lib/admin/stripe";

type Body = { subscriptionId?: string; couponId?: string };

export async function POST(req: Request) {
  await requirePerm(req, "billing.comp");
  if (!stripeConfigured()) {
    return Response.json({ error: "STRIPE_SECRET_KEY not set" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.subscriptionId || !body.couponId) {
    return Response.json(
      { error: "subscriptionId and couponId required" },
      { status: 400 }
    );
  }

  return audit(
    "billing.coupon",
    { kind: "stripe_subscription", id: body.subscriptionId },
    { before: null, after: { coupon: body.couponId } },
    async () => {
      const sub = await applyCoupon(body.subscriptionId!, body.couponId!);
      return Response.json({ ok: true, subscription: sub });
    }
  );
}
