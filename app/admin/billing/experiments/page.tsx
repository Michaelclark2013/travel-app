// app/admin/billing/experiments/page.tsx — Track 5 pricing experiments stub.
//
// WHAT
//   Placeholder. Pricing experiments depend on Track 6's flag system; this
//   page renders the intended IA so the nav link survives, but real
//   variant management lives behind /admin/flags once that's built.
//
// TODO(track-6)
//   - Wire to feature flags so price-tier variants can be assigned via
//     the Track 6 flag system.
//   - Show conversion / ARPU per variant once the metric pipeline lands.
//   - Surface "freeze experiment" controls + winner declaration UI.
//
// AUTH
//   billing.read.

import Link from "next/link";

export default function ExperimentsPage() {
  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          BILLING / EXPERIMENTS
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          Pricing experiments
        </h1>
      </header>
      <div style={{ marginBottom: 12 }}>
        <Link
          href="/admin/billing"
          style={{ color: "#93c5fd", fontSize: 12, textDecoration: "none" }}
        >
          ← Subscriptions
        </Link>
      </div>
      <div
        style={{
          padding: 24,
          background: "#11151a",
          border: "1px dashed #2a3340",
          borderRadius: 8,
          fontSize: 14,
          opacity: 0.85,
          maxWidth: 720,
          lineHeight: 1.5,
        }}
      >
        <p style={{ marginTop: 0 }}>
          Pricing experiments live on top of Track 6&apos;s feature-flag
          system. When that ships, this page will list active price-tier
          variants, traffic split, conversion / ARPU per variant, and a
          &quot;declare winner&quot; control.
        </p>
        <p>
          For now, head to{" "}
          <Link
            href="/admin/flags"
            style={{ color: "#93c5fd", textDecoration: "none" }}
          >
            /admin/flags
          </Link>{" "}
          to manage the underlying flags.
        </p>
        <p style={{ marginBottom: 0 }}>
          Track 6 owns: <code style={{ color: "#93c5fd" }}>flags.read</code>,{" "}
          <code style={{ color: "#93c5fd" }}>flags.write</code>,{" "}
          <code style={{ color: "#93c5fd" }}>flags.kill</code>.
        </p>
      </div>
    </div>
  );
}
