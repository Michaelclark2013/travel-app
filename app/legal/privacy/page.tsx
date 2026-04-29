import { LegalShell } from "../_layout";

export const metadata = { title: "Privacy Policy · Voyage" };

export default function Privacy() {
  return (
    <LegalShell title="Privacy Policy" updated="April 26, 2026">
      <p>
        Voyage takes your privacy seriously. This policy explains what we
        collect, why, who we share it with, and how to control your data.
      </p>

      <h2 className="text-xl font-semibold mt-10">What we collect</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Account info</strong> — name, email, password (hashed). Stored in Supabase.</li>
        <li><strong>Trip data</strong> — destinations, dates, traveler counts, vibes, itineraries you build, saved trips, and any preferences (passport name, dietary restrictions, frequent-flyer numbers, etc.) that you choose to enter.</li>
        <li><strong>Wallet items</strong> — confirmation emails you forward or paste. We parse these to populate your trip wallet.</li>
        <li><strong>Approximate location</strong> — only when you tap &quot;Use my location&quot; on the Nearby page. We don&apos;t track your location in the background.</li>
        <li><strong>Device + usage</strong> — IP address, browser, pages visited, error reports. Used for analytics, abuse prevention, and debugging.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10">How we use it</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Run the service (auth, save trips, generate itineraries).</li>
        <li>Show you the right flights, hotels, and partner links.</li>
        <li>Improve the product (which features get used, where errors happen).</li>
        <li>Send transactional emails (confirmations, password resets).</li>
        <li>Comply with legal obligations.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your personal data. We do not show
        third-party advertising on Voyage.
      </p>

      <h2 className="text-xl font-semibold mt-10">Who we share with (sub-processors)</h2>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Supabase</strong> — auth and database hosting.</li>
        <li><strong>Vercel</strong> — application hosting.</li>
        <li><strong>Amadeus</strong> — flight and hotel search (we send the search query, not your identity).</li>
        <li><strong>Mapbox</strong> — geocoding and driving distance.</li>
        <li><strong>Travelpayouts / Skyscanner / Booking.com / Hotellook / Airalo</strong> — when you click an outbound &quot;Book&quot; link, the partner sees a referral marker so they can attribute the booking to Voyage. We don&apos;t share your name or email.</li>
        <li><strong>Sentry</strong> — error monitoring (may include your user ID and the URL where the error occurred).</li>
        <li><strong>PostHog</strong> — product analytics (anonymous unless you&apos;re signed in).</li>
        <li><strong>Resend</strong> — transactional email delivery.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10">Your rights</h2>
      <p>You can:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li><strong>Access &amp; export</strong> your data — request via <a href="mailto:privacy@voyage.app" className="underline">privacy@voyage.app</a> or download a JSON dump from your <a href="/profile" className="underline">profile</a>.</li>
        <li><strong>Delete</strong> your account and all associated data — one click from your profile.</li>
        <li><strong>Correct</strong> any information by editing your profile or trips.</li>
        <li><strong>Opt out</strong> of analytics by declining the cookie banner.</li>
        <li><strong>Object</strong> or <strong>restrict</strong> processing — email <a href="mailto:privacy@voyage.app" className="underline">privacy@voyage.app</a>.</li>
      </ul>
      <p>
        EU users: your legal basis for our processing is contract
        performance (running the service you signed up for), legitimate
        interest (analytics, abuse prevention), and consent (optional
        cookies).
      </p>
      <p>
        California users: under CCPA/CPRA you have the right to know,
        delete, correct, and opt out of &quot;sale or sharing&quot; of
        personal information. We don&apos;t sell or share for cross-context
        behavioral advertising.
      </p>

      <h2 className="text-xl font-semibold mt-10">Retention</h2>
      <p>
        We keep your account data while your account is active. When you
        delete your account, we remove your trips, wallet items, and
        profile within 30 days. We may retain anonymized analytics and
        legally required records (tax, fraud prevention).
      </p>

      <h2 className="text-xl font-semibold mt-10">Children</h2>
      <p>
        Voyage isn&apos;t directed at children under 13 (or 16 in the EU).
        Don&apos;t use Voyage if you&apos;re below the age of digital
        consent in your country.
      </p>

      <h2 className="text-xl font-semibold mt-10">Security</h2>
      <p>
        We use TLS for all traffic, hash passwords, and apply Supabase
        row-level security so users can&apos;t see each other&apos;s data.
        No system is perfectly secure — if you discover a vulnerability,
        please email <a href="mailto:security@voyage.app" className="underline">security@voyage.app</a>.
      </p>

      <h2 className="text-xl font-semibold mt-10">Contact</h2>
      <p>
        Privacy questions: <a href="mailto:privacy@voyage.app" className="underline">privacy@voyage.app</a>.
      </p>
    </LegalShell>
  );
}
