import { LegalShell } from "../_layout";

export const metadata = { title: "Terms of Service · Voyage" };

export default function Terms() {
  return (
    <LegalShell title="Terms of Service" updated="April 26, 2026">
      <p>
        Welcome to Voyage (&quot;Voyage,&quot; &quot;we,&quot; &quot;us&quot;).
        By creating an account or using the service, you agree to these terms.
        If you don&apos;t agree, please don&apos;t use Voyage.
      </p>

      <h2 className="text-xl font-semibold mt-10">1. What Voyage is</h2>
      <p>
        Voyage is a travel-planning tool. We help you compare ways to get
        somewhere, draft a day-by-day itinerary, save trips, and discover
        nearby places. We do not currently process bookings or payments
        ourselves — when you click &quot;Book,&quot; we redirect you to a third-party
        supplier (an airline, hotel, or marketplace) that handles the
        transaction directly with you. Voyage may earn a referral commission
        on these redirects; this never increases your price.
      </p>

      <h2 className="text-xl font-semibold mt-10">2. Your account</h2>
      <p>
        You&apos;re responsible for keeping your account credentials secure
        and for any activity under your account. You must be at least 13
        years old (or the age of digital consent in your country, whichever
        is higher).
      </p>

      <h2 className="text-xl font-semibold mt-10">3. Acceptable use</h2>
      <p>Don&apos;t use Voyage to:</p>
      <ul className="list-disc pl-6 space-y-1.5">
        <li>Scrape, mirror, or resell our content or supplier data.</li>
        <li>
          Abuse our APIs (we rate-limit and may suspend accounts that
          consume disproportionate resources).
        </li>
        <li>
          Harass other users or post anything illegal, infringing, or
          deceptive (relevant in shared trips and the guides marketplace).
        </li>
        <li>Reverse-engineer the service or attempt to bypass security.</li>
      </ul>

      <h2 className="text-xl font-semibold mt-10">4. Information accuracy</h2>
      <p>
        Prices, schedules, and availability shown on Voyage come from
        third-party data sources and may be inaccurate, out of date, or
        unavailable when you click through. <strong>Always confirm price
        and availability with the supplier before completing a booking.</strong>
        Voyage isn&apos;t liable for losses caused by relying on data shown
        in the app.
      </p>

      <h2 className="text-xl font-semibold mt-10">5. Bookings are between you and the supplier</h2>
      <p>
        When you book through a partner link, your contract is with that
        supplier — not Voyage. Refunds, cancellations, changes, and
        disputes are governed by the supplier&apos;s terms.
      </p>

      <h2 className="text-xl font-semibold mt-10">6. AI-generated content</h2>
      <p>
        Itineraries, suggestions, and other content are generated
        automatically and provided as-is. Use judgment — verify
        restaurant hours, attraction availability, and travel times.
      </p>

      <h2 className="text-xl font-semibold mt-10">7. Your content</h2>
      <p>
        You retain ownership of trips, notes, and other content you create.
        You grant Voyage a worldwide, royalty-free license to host, store,
        display, and process that content as needed to operate the
        service. We don&apos;t sell your trip data.
      </p>

      <h2 className="text-xl font-semibold mt-10">8. Termination</h2>
      <p>
        You can delete your account anytime from <a href="/profile" className="underline">your profile</a>.
        We may suspend accounts that violate these terms or pose a security
        risk.
      </p>

      <h2 className="text-xl font-semibold mt-10">9. No warranty</h2>
      <p>
        Voyage is provided &quot;as is,&quot; without warranties of any
        kind. We don&apos;t guarantee uninterrupted service or that the
        information shown is correct.
      </p>

      <h2 className="text-xl font-semibold mt-10">10. Liability cap</h2>
      <p>
        To the fullest extent permitted by law, Voyage&apos;s total
        liability for any claim is limited to the greater of (a) what you
        paid us in the past 12 months or (b) US $100.
      </p>

      <h2 className="text-xl font-semibold mt-10">11. Changes</h2>
      <p>
        We may update these terms. If the changes are material we&apos;ll
        notify you by email or in-app. Continued use after the change
        means you accept the new terms.
      </p>

      <h2 className="text-xl font-semibold mt-10">12. Contact</h2>
      <p>
        Questions? <a href="mailto:hello@voyage.app" className="underline">hello@voyage.app</a>.
      </p>
    </LegalShell>
  );
}
