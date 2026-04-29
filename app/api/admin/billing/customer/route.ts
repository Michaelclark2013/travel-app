// app/api/admin/billing/customer/route.ts — Track 5 single-customer view.
//
// WHAT
//   GET ?id=cus_X
//     -> {
//          entitlement: { ... } | null,
//          customer:    { ... } | null,
//          subscriptions: [...],
//          invoices:    [...],
//          charges:     [...],
//        }
//
//   Pulls entitlement from Supabase and the rest live from Stripe so the
//   admin always sees current truth. If STRIPE_SECRET_KEY isn't set, the
//   Stripe parts return null and the UI explains.
//
// AUTH
//   billing.read.
//
// ENV VARS
//   STRIPE_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  getCustomer,
  listCharges,
  listInvoices,
  listSubscriptions,
  stripeConfigured,
} from "@/lib/admin/stripe";

export async function GET(req: Request) {
  await requirePerm(req, "billing.read");

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return Response.json({ error: "missing id" }, { status: 400 });
  }

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const { data: entitlement } = await supa
    .from("pro_entitlements")
    .select(
      "user_id, source, status, current_period_end, cancel_at_period_end, expires_at, stripe_customer_id, stripe_subscription_id, granted_by, granted_at, updated_at"
    )
    .or(`stripe_customer_id.eq.${id},user_id.eq.${id}`)
    .maybeSingle();

  if (!stripeConfigured()) {
    return Response.json({
      entitlement: entitlement ?? null,
      customer: null,
      subscriptions: [],
      invoices: [],
      charges: [],
      stripe: { configured: false },
    });
  }

  const customerId = entitlement?.stripe_customer_id ?? id;
  if (!customerId.startsWith("cus_")) {
    // Treat the id as a Voyage user id — we couldn't resolve a Stripe customer.
    return Response.json({
      entitlement: entitlement ?? null,
      customer: null,
      subscriptions: [],
      invoices: [],
      charges: [],
      stripe: { configured: true, error: "no stripe_customer_id on file" },
    });
  }

  try {
    const [customer, subs, invs, chs] = await Promise.all([
      getCustomer(customerId).catch(() => null),
      listSubscriptions(customerId).catch(() => ({ data: [] })),
      listInvoices(customerId).catch(() => ({ data: [] })),
      listCharges(customerId).catch(() => ({ data: [] })),
    ]);

    return Response.json({
      entitlement: entitlement ?? null,
      customer,
      subscriptions: subs.data,
      invoices: invs.data,
      charges: chs.data,
      stripe: { configured: true },
    });
  } catch (err) {
    return Response.json(
      {
        entitlement: entitlement ?? null,
        customer: null,
        subscriptions: [],
        invoices: [],
        charges: [],
        stripe: {
          configured: true,
          error: err instanceof Error ? err.message : "stripe error",
        },
      },
      { status: 502 }
    );
  }
}
