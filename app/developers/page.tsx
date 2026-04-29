import Link from "next/link";

export const metadata = { title: "Developers · Voyage" };

export default function Developers() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <div className="font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase mb-3">
        // VOYAGE · DEVELOPERS
      </div>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
        Embed Voyage anywhere.
      </h1>
      <p className="mt-4 text-lg text-[var(--muted)]">
        Drop a Voyage trip card into a Substack, blog, or any HTML page.
        Read-only public trips are accessible via a simple JSON + iframe API.
      </p>

      <Section eyebrow="// 01" title="Trip JSON">
        <Code>{`GET /api/v1/trips/{id}

{
  "id": "trip-...",
  "destination": "Tokyo",
  "origin": "New York",
  "startDate": "2026-05-09",
  "endDate": "2026-05-15",
  "travelers": 2,
  "intent": "vacation",
  "vibes": ["Food", "Culture"],
  "transportMode": "transit",
  "itinerary": [...]
}`}</Code>
        <p className="mt-2 text-sm text-[var(--muted)]">
          CORS-enabled — call directly from the browser.
        </p>
      </Section>

      <Section eyebrow="// 02" title="Iframe embed">
        <Code>{`<iframe
  src="https://voyage.app/api/v1/embed/{id}"
  width="600" height="320"
  style="border:0;background:transparent"
  loading="lazy">
</iframe>`}</Code>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Renders a self-contained trip card with destination, dates, and key
          stats. Click-through opens the full trip in Voyage.
        </p>
      </Section>

      <Section eyebrow="// 03" title="Coming soon">
        <ul className="text-sm space-y-2 text-[var(--muted)]">
          <li>• OAuth — let users sign in with Voyage</li>
          <li>• Plan-trip widget — embed the planner anywhere</li>
          <li>• Webhooks — get notified on trip events</li>
          <li>• Affiliate API — share Voyage commissions</li>
        </ul>
      </Section>

      <div className="mt-12 text-sm">
        <Link href="/" className="text-[var(--muted)] hover:text-white">
          ← Back to Voyage
        </Link>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <div className="font-mono text-xs tracking-[0.18em] text-[var(--accent)]">
        {eyebrow}
      </div>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="surface rounded-xl p-4 overflow-x-auto text-xs font-mono text-[var(--foreground)]/90 leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}
