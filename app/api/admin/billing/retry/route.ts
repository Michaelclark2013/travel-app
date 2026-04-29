// app/api/admin/billing/retry/route.ts — Track 5 retry a failed invoice.
//
// WHAT
//   POST { invoiceId } -> { ok, invoice }

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { retryInvoice, stripeConfigured } from "@/lib/admin/stripe";

type Body = { invoiceId?: string };

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
  if (!body.invoiceId) {
    return Response.json({ error: "invoiceId required" }, { status: 400 });
  }

  return audit(
    "billing.retry",
    { kind: "stripe_invoice", id: body.invoiceId },
    { before: null, after: null },
    async () => {
      const inv = await retryInvoice(body.invoiceId!);
      return Response.json({ ok: true, invoice: inv });
    }
  );
}
