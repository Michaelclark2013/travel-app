"use client";

// app/admin/billing/[customerId]/page.tsx — Track 5 customer detail.
//
// WHAT
//   Subscription history, invoices, charges, refund/comp/coupon/cancel/retry
//   actions. The route param `customerId` accepts either a Stripe customer
//   id (`cus_...`) or a Voyage user uuid; the API resolves either.
//
// AUTH
//   billing.read for the page; the action buttons hit endpoints that
//   require billing.refund / billing.comp respectively, server-enforced.
//
// ENV VARS
//   None directly.

import { use, useEffect, useState } from "react";
import Link from "next/link";

type Entitlement = {
  user_id: string;
  source: "stripe" | "comp" | "manual";
  status: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  expires_at: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  granted_by: string | null;
  granted_at: string;
};

type StripeCustomer = {
  id: string;
  email?: string | null;
  name?: string | null;
  delinquent?: boolean;
};

type StripeSubscription = {
  id: string;
  status: string;
  current_period_end: number;
  cancel_at_period_end: boolean;
};

type StripeInvoice = {
  id: string;
  status: string;
  amount_paid: number;
  amount_due: number;
  currency: string;
  hosted_invoice_url?: string | null;
  created: number;
  number?: string | null;
};

type StripeCharge = {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  status: string;
  created: number;
  refunded: boolean;
  dispute?: string | null;
};

type Detail = {
  entitlement: Entitlement | null;
  customer: StripeCustomer | null;
  subscriptions: StripeSubscription[];
  invoices: StripeInvoice[];
  charges: StripeCharge[];
  stripe: { configured: boolean; error?: string };
};

export default function CustomerDetailPage({
  params,
}: {
  params: Promise<{ customerId: string }>;
}) {
  const { customerId } = use(params);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/admin/billing/customer?id=${encodeURIComponent(customerId)}`,
        { credentials: "include" }
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? `Failed (${res.status})`);
      } else {
        setDetail(data);
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  async function action(path: string, body: unknown, label: string) {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFlash(`${label} failed: ${data.error ?? res.status}`);
      } else {
        setFlash(`${label} succeeded.`);
        await load();
      }
    } catch {
      setFlash(`${label} failed (network).`);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <div style={{ opacity: 0.6, fontSize: 14 }}>Loading…</div>;
  }
  if (error) {
    return (
      <div
        style={{
          padding: "8px 10px",
          background: "#3a1f25",
          border: "1px solid #6b2d35",
          borderRadius: 6,
          fontSize: 13,
        }}
      >
        {error}
      </div>
    );
  }
  if (!detail) return null;

  const subId = detail.entitlement?.stripe_subscription_id ?? null;
  const userId = detail.entitlement?.user_id ?? null;

  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          BILLING / CUSTOMER
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          {detail.customer?.email ?? customerId}
        </h1>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {detail.customer?.id ?? detail.entitlement?.stripe_customer_id ?? "—"}
        </div>
      </header>

      <Link
        href="/admin/billing"
        style={{ color: "#93c5fd", fontSize: 12, textDecoration: "none" }}
      >
        ← All subscriptions
      </Link>

      {flash && (
        <div
          style={{
            marginTop: 12,
            padding: "8px 10px",
            background: "#1f2630",
            border: "1px solid #2a3340",
            borderRadius: 6,
            fontSize: 13,
          }}
        >
          {flash}
        </div>
      )}

      {!detail.stripe.configured && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#1f2630",
            border: "1px dashed #3b4654",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          STRIPE_SECRET_KEY not configured — Stripe data unavailable. Comp
          actions still work against Supabase.
        </div>
      )}
      {detail.stripe.error && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#3a1f25",
            border: "1px solid #6b2d35",
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          Stripe: {detail.stripe.error}
        </div>
      )}

      {/* Entitlement card */}
      <Section title="Entitlement">
        <KV>
          <Row label="User" value={detail.entitlement?.user_id ?? "—"} />
          <Row label="Source" value={detail.entitlement?.source ?? "—"} />
          <Row label="Status" value={detail.entitlement?.status ?? "—"} />
          <Row
            label="Period end"
            value={detail.entitlement?.current_period_end ?? "—"}
          />
          <Row
            label="Expires at"
            value={detail.entitlement?.expires_at ?? "—"}
          />
          <Row
            label="Cancel at end"
            value={detail.entitlement?.cancel_at_period_end ? "yes" : "no"}
          />
        </KV>
      </Section>

      {/* Actions */}
      <Section title="Actions">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {/* Comp N months */}
          <CompButton
            disabled={busy || !userId}
            onSubmit={(months) =>
              action(
                "/api/admin/billing/comp",
                { userId, months },
                `Comp ${months}m`
              )
            }
          />
          {/* Apply coupon */}
          <CouponButton
            disabled={busy || !subId}
            onSubmit={(couponId) =>
              action(
                "/api/admin/billing/coupon",
                { subscriptionId: subId, couponId },
                "Apply coupon"
              )
            }
          />
          {/* Cancel */}
          <button
            disabled={busy || !subId}
            onClick={() =>
              action(
                "/api/admin/billing/cancel",
                { subscriptionId: subId, atPeriodEnd: true },
                "Cancel at period end"
              )
            }
            style={{ ...buttonStyle, opacity: !subId ? 0.5 : 1 }}
          >
            Cancel at period end
          </button>
          <button
            disabled={busy || !subId}
            onClick={() => {
              if (!confirm("Cancel immediately? This is destructive.")) return;
              void action(
                "/api/admin/billing/cancel",
                { subscriptionId: subId, atPeriodEnd: false },
                "Cancel now"
              );
            }}
            style={{
              ...buttonStyle,
              borderColor: "#6b2d35",
              opacity: !subId ? 0.5 : 1,
            }}
          >
            Cancel now
          </button>
        </div>
      </Section>

      {/* Subscriptions */}
      <Section title="Subscriptions">
        {detail.subscriptions.length === 0 ? (
          <Empty>No subscriptions.</Empty>
        ) : (
          <Table
            head={["ID", "Status", "Period end", "Cancel?", ""]}
            rows={detail.subscriptions.map((s) => [
              s.id,
              <code key={`s-${s.id}`} style={{ color: "#93c5fd" }}>
                {s.status}
              </code>,
              new Date(s.current_period_end * 1000).toISOString().slice(0, 10),
              s.cancel_at_period_end ? "yes" : "no",
              null,
            ])}
          />
        )}
      </Section>

      {/* Invoices */}
      <Section title="Invoices">
        {detail.invoices.length === 0 ? (
          <Empty>No invoices.</Empty>
        ) : (
          <Table
            head={["Number", "Status", "Paid", "Due", "Created", ""]}
            rows={detail.invoices.map((i) => [
              i.number ?? i.id.slice(0, 12),
              <code key={`i-${i.id}`} style={{ color: "#93c5fd" }}>
                {i.status}
              </code>,
              fmtMoney(i.amount_paid, i.currency),
              fmtMoney(i.amount_due, i.currency),
              new Date(i.created * 1000).toISOString().slice(0, 10),
              i.status === "open" || i.status === "uncollectible" ? (
                <button
                  key={`i-r-${i.id}`}
                  disabled={busy}
                  onClick={() =>
                    action(
                      "/api/admin/billing/retry",
                      { invoiceId: i.id },
                      "Retry payment"
                    )
                  }
                  style={buttonStyle}
                >
                  Retry
                </button>
              ) : i.hosted_invoice_url ? (
                <a
                  key={`i-l-${i.id}`}
                  href={i.hosted_invoice_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: "#93c5fd", fontSize: 12 }}
                >
                  Open
                </a>
              ) : null,
            ])}
          />
        )}
      </Section>

      {/* Charges */}
      <Section title="Charges & refunds">
        {detail.charges.length === 0 ? (
          <Empty>No charges.</Empty>
        ) : (
          <Table
            head={["ID", "Amount", "Refunded", "Status", "Dispute", ""]}
            rows={detail.charges.map((c) => [
              c.id.slice(0, 12),
              fmtMoney(c.amount, c.currency),
              fmtMoney(c.amount_refunded, c.currency),
              <code key={`c-${c.id}`} style={{ color: "#93c5fd" }}>
                {c.status}
              </code>,
              c.dispute ? (
                <span key={`d-${c.id}`} style={{ color: "#fca5a5" }}>
                  {c.dispute}
                </span>
              ) : (
                "—"
              ),
              c.amount_refunded < c.amount ? (
                <RefundButton
                  key={`r-${c.id}`}
                  disabled={busy}
                  onSubmit={(amount, reason) =>
                    action(
                      "/api/admin/billing/refund",
                      { chargeId: c.id, amount, reason },
                      "Refund"
                    )
                  }
                />
              ) : null,
            ])}
          />
        )}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline action buttons w/ tiny inline forms
// ---------------------------------------------------------------------------
function CompButton({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (months: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [months, setMonths] = useState(1);
  if (!open) {
    return (
      <button
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={buttonStyle}
      >
        Comp months…
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <input
        type="number"
        min={1}
        max={60}
        value={months}
        onChange={(e) => setMonths(Number(e.target.value))}
        style={{ ...inputStyle, width: 60 }}
      />
      <button
        disabled={disabled}
        onClick={() => {
          onSubmit(months);
          setOpen(false);
        }}
        style={buttonStyle}
      >
        Comp
      </button>
      <button onClick={() => setOpen(false)} style={buttonStyle}>
        Cancel
      </button>
    </span>
  );
}

function CouponButton({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (couponId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  if (!open) {
    return (
      <button
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={{ ...buttonStyle, opacity: disabled ? 0.5 : 1 }}
      >
        Apply coupon…
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <input
        placeholder="coupon id"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        style={{ ...inputStyle, width: 140 }}
      />
      <button
        disabled={disabled || !code}
        onClick={() => {
          onSubmit(code);
          setOpen(false);
        }}
        style={buttonStyle}
      >
        Apply
      </button>
      <button onClick={() => setOpen(false)} style={buttonStyle}>
        Cancel
      </button>
    </span>
  );
}

function RefundButton({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (amount: number | undefined, reason: "duplicate" | "fraudulent" | "requested_by_customer") => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<"duplicate" | "fraudulent" | "requested_by_customer">("requested_by_customer");
  if (!open) {
    return (
      <button
        disabled={disabled}
        onClick={() => setOpen(true)}
        style={buttonStyle}
      >
        Refund…
      </button>
    );
  }
  return (
    <span style={{ display: "inline-flex", gap: 4 }}>
      <input
        placeholder="cents (blank=full)"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        style={{ ...inputStyle, width: 110 }}
      />
      <select
        value={reason}
        onChange={(e) =>
          setReason(e.target.value as "duplicate" | "fraudulent" | "requested_by_customer")
        }
        style={{ ...inputStyle, width: 150 }}
      >
        <option value="requested_by_customer">requested_by_customer</option>
        <option value="duplicate">duplicate</option>
        <option value="fraudulent">fraudulent</option>
      </select>
      <button
        disabled={disabled}
        onClick={() => {
          const a = amount.trim() ? Number(amount) : undefined;
          onSubmit(a, reason);
          setOpen(false);
        }}
        style={buttonStyle}
      >
        Refund
      </button>
      <button onClick={() => setOpen(false)} style={buttonStyle}>
        Cancel
      </button>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Layout primitives
// ---------------------------------------------------------------------------
function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: 24 }}>
      <div
        style={{
          fontSize: 11,
          opacity: 0.7,
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {title.toUpperCase()}
      </div>
      {children}
    </section>
  );
}

function KV({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
        padding: 12,
        display: "grid",
        gridTemplateColumns: "1fr 2fr",
        rowGap: 6,
        columnGap: 12,
        fontSize: 12,
      }}
    >
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <div style={{ opacity: 0.6 }}>{label}</div>
      <div>{value}</div>
    </>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: 12,
        background: "#11151a",
        border: "1px dashed #2a3340",
        borderRadius: 8,
        fontSize: 13,
        opacity: 0.6,
      }}
    >
      {children}
    </div>
  );
}

function Table({
  head,
  rows,
}: {
  head: React.ReactNode[];
  rows: React.ReactNode[][];
}) {
  return (
    <div
      style={{
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ background: "#0e1217", opacity: 0.7 }}>
            {head.map((h, i) => (
              <th key={i} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: "1px solid #1f2630" }}>
              {r.map((cell, j) => (
                <td key={j} style={td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function fmtMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
}

const buttonStyle: React.CSSProperties = {
  background: "#1f2630",
  border: "1px solid #2a3340",
  color: "#e6e8eb",
  padding: "6px 12px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
  cursor: "pointer",
};

const inputStyle: React.CSSProperties = {
  background: "#0b0d10",
  border: "1px solid #2a3340",
  color: "#e6e8eb",
  padding: "6px 8px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
};

const th: React.CSSProperties = {
  textAlign: "left",
  padding: "8px 12px",
  fontWeight: 500,
};

const td: React.CSSProperties = {
  padding: "8px 12px",
  verticalAlign: "top",
};
