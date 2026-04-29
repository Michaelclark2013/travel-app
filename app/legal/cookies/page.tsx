import { LegalShell } from "../_layout";

export const metadata = { title: "Cookie Policy · Voyage" };

export default function Cookies() {
  return (
    <LegalShell title="Cookie Policy" updated="April 26, 2026">
      <p>
        Voyage uses a small number of cookies and similar technologies
        (localStorage, IndexedDB) to run the service. This page explains
        what each one does and how to control them.
      </p>

      <h2 className="text-xl font-semibold mt-10">Strictly necessary</h2>
      <p>These cannot be turned off — without them the app doesn&apos;t work.</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Auth session</strong> — keeps you signed in (Supabase).</li>
        <li><strong>Local cache</strong> — your trips, wallet items, and preferences are stored in your browser so the app works offline.</li>
        <li><strong>Cookie preference</strong> — remembers whether you accepted optional cookies.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10">Analytics (optional)</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          <strong>PostHog</strong> — measures feature usage so we know what
          to build next. Anonymous unless you&apos;re signed in.
        </li>
      </ul>

      <h2 className="text-xl font-semibold mt-10">Error monitoring (optional)</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>
          <strong>Sentry</strong> — captures unhandled errors so we can fix
          them. Includes your user ID and the URL of the page that broke.
        </li>
      </ul>

      <h2 className="text-xl font-semibold mt-10">Affiliate attribution</h2>
      <p>
        When you click a &quot;Book&quot; link, the destination site
        (Skyscanner, Booking.com, etc.) sets its own cookies. These are
        governed by the partner&apos;s privacy policy, not ours. We
        receive a referral marker indicating the click came from Voyage,
        which earns us a commission if you book.
      </p>

      <h2 className="text-xl font-semibold mt-10">How to control cookies</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Use the cookie banner the first time you visit.</li>
        <li>Change your choice anytime by clearing your browser&apos;s site data and reloading.</li>
        <li>Most browsers let you block all cookies, but the auth session won&apos;t work without one.</li>
      </ul>
    </LegalShell>
  );
}
