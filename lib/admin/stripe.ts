// lib/admin/stripe.ts — Track 5 Stripe REST wrapper.
//
// WHAT
//   A zero-dependency wrapper around the Stripe REST API. Every public
//   helper does a `fetch` against `https://api.stripe.com/v1/...` with
//   `Authorization: Bearer ${STRIPE_SECRET_KEY}` and form-urlencoded bodies
//   per Stripe's wire format. Returns parsed JSON.
//
// WHY no `stripe` npm package
//   Track 5 is explicit about shipping zero-dep. The `stripe` SDK adds ~3MB
//   to the build and pulls in node-fetch/qs polyfills we don't need on Next
//   16 / Node 22. Refunds and coupon application are simple POSTs; the SDK
//   doesn't earn its keep here.
//
//   If a future track wants the SDK back, the swap is mechanical: install
//   the package, replace the bodies of these helpers with the SDK calls,
//   and delete `formEncode`. The signatures stay the same.
//
// AUDITING
//   These helpers do NOT call audit() themselves. The route handlers that
//   call them are responsible for wrapping in audit(...) so the diff is
//   captured before the API request goes out (and the failure case is
//   captured after).
//
// ENV VARS
//   STRIPE_SECRET_KEY — sk_live_... or sk_test_...
//
// CANONICAL EXAMPLES
//   const customer = await stripeGET("/customers/cus_X");
//   const refund   = await stripePOST("/refunds", {
//     charge: "ch_X", amount: 1999, reason: "requested_by_customer",
//   });
//   const subUpd   = await stripePOST(`/subscriptions/${subId}`, {
//     cancel_at_period_end: "true",
//   });

const STRIPE_BASE = "https://api.stripe.com/v1";

/** Form-encode a flat object with Stripe's bracket notation for arrays. */
export function formEncode(
  body: Record<string, string | number | boolean | undefined | null | string[]>
): string {
  const parts: string[] = [];
  for (const [k, raw] of Object.entries(body)) {
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      raw.forEach((v, i) => {
        parts.push(`${encodeURIComponent(`${k}[${i}]`)}=${encodeURIComponent(String(v))}`);
      });
      continue;
    }
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(raw))}`);
  }
  return parts.join("&");
}

function authHeader(): string {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  return `Bearer ${key}`;
}

export type StripeError = {
  status: number;
  type?: string;
  code?: string;
  message: string;
  raw: unknown;
};

async function parseOrThrow(res: Response): Promise<unknown> {
  const json: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (json as { error?: { type?: string; code?: string; message?: string } } | null)?.error;
    const e: StripeError = {
      status: res.status,
      type: err?.type,
      code: err?.code,
      message: err?.message ?? `Stripe error ${res.status}`,
      raw: json,
    };
    // Surface as a thrown Error with structured fields for the audit trail.
    const thrown = new Error(e.message) as Error & { stripe?: StripeError };
    thrown.stripe = e;
    throw thrown;
  }
  return json;
}

/** GET /v1/{path} — `path` should start with a leading slash. */
export async function stripeGET<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: "GET",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  return (await parseOrThrow(res)) as T;
}

/** POST /v1/{path} with a form-encoded body. */
export async function stripePOST<T = unknown>(
  path: string,
  body: Record<string, string | number | boolean | undefined | null | string[]> = {},
  opts: { idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    Accept: "application/json",
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (opts.idempotencyKey) {
    headers["Idempotency-Key"] = opts.idempotencyKey;
  }
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: "POST",
    headers,
    body: formEncode(body),
    cache: "no-store",
  });
  return (await parseOrThrow(res)) as T;
}

/** DELETE /v1/{path}. */
export async function stripeDELETE<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${STRIPE_BASE}${path}`, {
    method: "DELETE",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
    },
    cache: "no-store",
  });
  return (await parseOrThrow(res)) as T;
}

/** True iff STRIPE_SECRET_KEY is configured. */
export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// ---------------------------------------------------------------------------
// Typed result shapes — minimal subsets, expanded as the admin UI needs them.
// ---------------------------------------------------------------------------
export type StripeCustomer = {
  id: string;
  email?: string | null;
  name?: string | null;
  created: number;
  delinquent?: boolean;
  metadata?: Record<string, string>;
  invoice_settings?: { default_payment_method?: string | null };
};

export type StripeSubscription = {
  id: string;
  customer: string;
  status:
    | "active"
    | "past_due"
    | "canceled"
    | "incomplete"
    | "incomplete_expired"
    | "trialing"
    | "unpaid";
  current_period_end: number;
  cancel_at_period_end: boolean;
  items: { data: Array<{ price: { id: string; unit_amount: number; recurring?: { interval: string } } }> };
};

export type StripeInvoice = {
  id: string;
  customer: string;
  status: string;
  amount_paid: number;
  amount_due: number;
  currency: string;
  hosted_invoice_url?: string | null;
  created: number;
  number?: string | null;
};

export type StripeCharge = {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  status: string;
  created: number;
  refunded: boolean;
  dispute?: string | null;
  invoice?: string | null;
};

// ---------------------------------------------------------------------------
// Convenience helpers — small wrappers for the most common admin actions.
// ---------------------------------------------------------------------------
export async function getCustomer(id: string): Promise<StripeCustomer> {
  return stripeGET<StripeCustomer>(`/customers/${encodeURIComponent(id)}`);
}

export async function listSubscriptions(customerId: string, status: string = "all") {
  const params = new URLSearchParams({ customer: customerId, status, limit: "20" });
  return stripeGET<{ data: StripeSubscription[] }>(`/subscriptions?${params}`);
}

export async function listInvoices(customerId: string) {
  const params = new URLSearchParams({ customer: customerId, limit: "20" });
  return stripeGET<{ data: StripeInvoice[] }>(`/invoices?${params}`);
}

export async function listCharges(customerId: string) {
  const params = new URLSearchParams({ customer: customerId, limit: "20" });
  return stripeGET<{ data: StripeCharge[] }>(`/charges?${params}`);
}

export async function refundCharge(args: {
  chargeId: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
  idempotencyKey?: string;
}) {
  return stripePOST<{ id: string; status: string; amount: number }>(
    "/refunds",
    {
      charge: args.chargeId,
      amount: args.amount,
      reason: args.reason,
    },
    { idempotencyKey: args.idempotencyKey }
  );
}

export async function cancelSubscription(subscriptionId: string, atPeriodEnd: boolean) {
  if (atPeriodEnd) {
    return stripePOST<StripeSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      cancel_at_period_end: "true",
    });
  }
  return stripeDELETE<StripeSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
}

export async function applyCoupon(subscriptionId: string, couponId: string) {
  return stripePOST<StripeSubscription>(`/subscriptions/${encodeURIComponent(subscriptionId)}`, {
    coupon: couponId,
  });
}

export async function retryInvoice(invoiceId: string) {
  return stripePOST<StripeInvoice>(`/invoices/${encodeURIComponent(invoiceId)}/pay`, {});
}
