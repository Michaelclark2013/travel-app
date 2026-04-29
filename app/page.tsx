import Link from "next/link";
import { websiteLd } from "@/lib/seo";

const PRESETS = [
  { city: "Tokyo", code: "TYO", days: 7, vibe: "Food & culture", emoji: "🗼" },
  { city: "Lisbon", code: "LIS", days: 5, vibe: "Coast & tiles", emoji: "🌊" },
  { city: "Mexico City", code: "MEX", days: 4, vibe: "Markets & art", emoji: "🌮" },
  { city: "Reykjavík", code: "REK", days: 6, vibe: "Nature & hot springs", emoji: "🌋" },
  { city: "Marrakech", code: "RAK", days: 5, vibe: "Souks & sunsets", emoji: "🕌" },
  { city: "Buenos Aires", code: "BUE", days: 6, vibe: "Tango & steak", emoji: "💃" },
];

export default function Home() {
  return (
    <div>
      {/* Track F (SEO): schema.org/WebSite + sitelinks-search-box hint. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: websiteLd() }}
      />
      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 pt-20 md:pt-24 pb-12">
        <div className="text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--card-strong)] px-3 py-1.5 text-[10px] font-mono tracking-[0.18em] text-[var(--muted)] uppercase backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
            All systems nominal · AI · v0.1.0
          </p>
          <h1 className="mt-8 text-5xl md:text-7xl font-semibold tracking-tight leading-[1.02]">
            Plan your next trip.
            <br />
            <span className="text-[var(--accent)] text-glow">Atom by atom.</span>
          </h1>
          <p className="mt-6 text-lg md:text-xl text-[var(--muted)] max-w-2xl mx-auto">
            From cheapest flights to neighborhood-clustered itineraries —
            Voyage routes your entire trip in one place.
          </p>
          <div className="mt-10 flex items-center justify-center">
            <Link
              href="/sign-in"
              className="btn-primary inline-flex items-center gap-2 px-8 py-3.5 font-medium text-base"
            >
              Launch Voyage
              <span aria-hidden>→</span>
            </Link>
          </div>
          <p className="mt-4 text-xs text-[var(--muted)] font-mono">
            Free · No sign-up · 30 seconds to first trip
          </p>

          <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--border)]">
            <Stat value="12,400+" label="Destinations" />
            <Stat value="0.7s" label="Avg plan time" />
            <Stat value="∞" label="Re-routes" />
            <Stat value="99.9%" label="Uptime" />
          </div>
        </div>
      </section>

      {/* FEATURE 1 — Cost compare */}
      <Feature
        eyebrow="// 01 · TRUE COST COMPARE"
        title="Drive or fly? Get the honest answer."
        body="Other apps show the headline fare. Voyage adds gas, tolls, parking, baggage, transfers, resort fees, even foreign-transaction fees. The cheapest option is highlighted with the all-in number."
      >
        <div className="surface rounded-2xl p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
                // ROUTING · COST COMPARE
              </div>
              <div className="text-sm text-[var(--muted)] mt-1">
                NYC ⇄ Lisbon · 2,793 mi
              </div>
            </div>
            <div className="font-mono text-xs text-[var(--muted)]">
              Driving saves $355
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">🚗</span>
                <div className="font-medium">Drive</div>
              </div>
              <div className="mt-3 text-xs space-y-1 text-[var(--muted)] font-mono">
                <Row k="Gas" v="$349" />
                <Row k="Tolls" v="$126" />
                <Row k="Parking" v="$72" />
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-between items-baseline">
                <span className="text-xs text-[var(--muted)] uppercase tracking-wider font-mono">
                  Total
                </span>
                <span className="text-2xl font-semibold">$1,129</span>
              </div>
            </div>
            <div className="rounded-xl bg-[var(--card-strong)] border border-[var(--border)] p-4">
              <div className="flex items-center gap-2">
                <span className="text-xl">✈️</span>
                <div className="font-medium">Fly</div>
              </div>
              <div className="mt-3 text-xs space-y-1 text-[var(--muted)] font-mono">
                <Row k="Fare × 2" v="$1,324" />
                <Row k="Bags" v="$70" />
                <Row k="Transfers" v="$160" />
              </div>
              <div className="mt-3 pt-3 border-t border-[var(--border)] flex justify-between items-baseline">
                <span className="text-xs text-[var(--muted)] uppercase tracking-wider font-mono">
                  Total
                </span>
                <span className="text-2xl font-semibold">$1,484</span>
              </div>
            </div>
          </div>
        </div>
      </Feature>

      {/* FEATURE 2 — Day-by-day */}
      <Feature
        reverse
        eyebrow="// 02 · DAY-BY-DAY ROUTING"
        title="Your day, atomically planned."
        body="Voyage clusters stops by neighborhood and computes walk, transit, or drive times between every leg. Real days that flow."
      >
        <div className="surface rounded-2xl p-5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase">
            DAY 2 · TUESDAY, MAY 10
          </div>
          <div className="font-semibold text-lg mt-1">Tokyo · Shibuya</div>
          <div className="mt-4 space-y-1 text-sm">
            <ItRow time="08:30" title="Breakfast at Onibus Coffee" hood="Shibuya" />
            <Leg minutes={9} mode="walk" km={0.6} />
            <ItRow time="10:00" title="Meiji Shrine" hood="Shibuya" />
            <Leg minutes={14} mode="transit" km={2.1} />
            <ItRow time="12:30" title="Lunch — Afuri ramen" hood="Harajuku" />
            <Leg minutes={6} mode="walk" km={0.5} />
            <ItRow time="14:30" title="teamLab Borderless" hood="Toyosu" />
          </div>
        </div>
      </Feature>

      {/* FEATURE 3 — Live companion */}
      <Feature
        eyebrow="// 03 · LIVE TRIP COMPANION"
        title="Voyage stays with you on the trip."
        body="Most apps disappear after you book. Voyage tells you when to leave, what's next, and re-plans your day if your flight delays, weather turns, or a place is closed."
      >
        <div className="surface rounded-2xl p-5">
          <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-[var(--accent)]">
            <span className="h-2 w-2 rounded-full bg-[var(--accent)] pulse-dot" />
            <span>● LIVE — TUESDAY, MAY 10</span>
          </div>
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <div className="text-xs text-[var(--muted)]">Up next at 14:30</div>
              <div className="text-xl font-semibold tracking-tight mt-1">
                teamLab Borderless
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">
                Toyosu · 14 min by transit
              </div>
            </div>
            <div className="rounded-xl bg-[var(--accent-soft)] border border-[var(--accent)]/40 p-4">
              <div className="font-mono text-[10px] tracking-[0.18em] text-[var(--accent)]">
                LEAVE IN
              </div>
              <div className="text-3xl font-semibold tracking-tight mt-1">
                12 min
              </div>
            </div>
          </div>
        </div>
      </Feature>

      {/* FEATURE 4 — Group */}
      <Feature
        reverse
        eyebrow="// 04 · TRAVEL TOGETHER"
        title="The friend-trip group chat, finally solved."
        body="Invite friends. Vote on stays. Split expenses. Voyage is the shared brain for the whole group."
      >
        <div className="surface rounded-2xl p-5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase">
            TRAVELING TOGETHER
          </div>
          <div className="text-lg font-semibold mt-1">4 travelers</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/40 text-[var(--accent)] px-3 py-1 text-xs font-medium">
              Mike (you)
            </span>
            <span className="rounded-full bg-white/8 border border-[var(--border)] px-3 py-1 text-xs">
              Sarah
            </span>
            <span className="rounded-full bg-white/8 border border-[var(--border)] px-3 py-1 text-xs">
              Diego
            </span>
            <span className="rounded-full bg-white/8 border border-[var(--border)] px-3 py-1 text-xs">
              Hiro
            </span>
          </div>
          <div className="mt-5 pt-4 border-t border-[var(--border)] flex justify-between items-baseline">
            <span className="text-xs text-[var(--muted)]">Total trip spend</span>
            <div className="text-right">
              <div className="text-xl font-semibold tracking-tight">$2,840</div>
              <div className="text-xs text-[var(--muted)]">$710 per person</div>
            </div>
          </div>
        </div>
      </Feature>

      {/* FEATURE 5 — Wallet */}
      <Feature
        eyebrow="// 05 · TRIP WALLET"
        title="Every confirmation, in one place."
        body="Forward any travel email — flights, hotels, Resy, Klook, Airbnb. Voyage parses it, links it to the right day, and shows you the total spend."
      >
        <div className="surface rounded-2xl p-5 space-y-2.5">
          <ConfRow icon="✈️" title="Flight booked" detail="Delta DL182 · DLG7H9" amount="$872" />
          <ConfRow icon="🏨" title="Stay booked" detail="Hilton Tokyo · HLT-44A21" amount="$1,440" />
          <ConfRow icon="🍽️" title="Dinner reservation" detail="Sushi Saito · OT-8821-K" amount="—" />
          <ConfRow icon="🎟️" title="SkyTree tickets" detail="Klook · KLK-99213-T" amount="$84" />
        </div>
      </Feature>

      {/* FEATURE 6 — Points */}
      <Feature
        reverse
        eyebrow="// 06 · POINTS-AWARE BOOKING"
        title="The right card, every single time."
        body="Tell us which cards you have. Voyage tells you which one to use for every booking — flights, hotels, dining, rental cars."
      >
        <div className="surface rounded-2xl p-5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)]">
            BEST CARD FOR YOUR FLIGHT
          </div>
          <div className="mt-3 rounded-xl bg-[var(--card-strong)] border border-[var(--border)] p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Chase Sapphire Reserve</div>
              <div className="font-mono text-[10px] text-[var(--muted)]">VISA</div>
            </div>
            <div className="text-sm text-[var(--muted)] mt-2">
              5× points on flights via Chase Travel
            </div>
            <div className="text-xs text-[var(--accent)] mt-1 font-mono">
              ~10% effective return · 4,360 pts on this booking
            </div>
          </div>
        </div>
      </Feature>

      {/* FEATURE 7 — Inspire */}
      <Feature
        eyebrow="// 07 · SEE IT. PLAN IT."
        title="From a TikTok to a real trip."
        body="Saw a Reel? Paste it. Voyage figures out the destination, picks up the vibe, and builds a full trip around it."
      >
        <div className="surface rounded-2xl p-5">
          <div className="rounded-lg bg-[var(--card-strong)] border border-[var(--border)] p-3 text-xs italic text-[var(--muted)]">
            &quot;Just saw this insane TikTok of someone in Tokyo doing
            omakase and rooftop bars at sunset…&quot;
          </div>
          <div className="mt-4 font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // WHAT WE FOUND
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-[var(--muted)]">Destination</div>
              <div className="text-lg font-semibold mt-0.5">Tokyo</div>
            </div>
            <div>
              <div className="text-xs text-[var(--muted)]">Vibes</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-white/8 border border-[var(--border)] px-2 py-0.5 text-xs">
                  Food
                </span>
                <span className="rounded-full bg-white/8 border border-[var(--border)] px-2 py-0.5 text-xs">
                  Nightlife
                </span>
              </div>
            </div>
          </div>
        </div>
      </Feature>

      {/* FEATURE 8 — Guides */}
      <Feature
        reverse
        eyebrow="// 08 · LOCAL GUIDES MARKETPLACE"
        title="Buy a local's plan in one tap."
        body="Curated trips from creators and locals. Pay once, import every stop into your own itinerary."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <GuidePreview
            city="Tokyo"
            title="Tokyo on Coffee"
            handle="@lia.brews"
            price={9}
            rating={4.9}
            reviews={312}
          />
          <GuidePreview
            city="Lisbon"
            title="Lisbon Like a Local"
            handle="@diogo.lx"
            price={12}
            rating={4.8}
            reviews={521}
          />
        </div>
      </Feature>

      {/* FEATURE 9 — Profile */}
      <Feature
        eyebrow="// 09 · PROFILE THAT LEARNS"
        title="It gets better with every trip."
        body="Voyage remembers your walking pace, food preferences, and travel rhythms — and bakes them into every future plan."
      >
        <div className="surface rounded-2xl p-5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)]">
            YOUR TRAVEL PERSONA
          </div>
          <div className="mt-3 text-xl font-semibold tracking-tight">
            The food-driven, transit-friendly duo.
          </div>
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <MiniStat v="14" l="Trips" />
            <MiniStat v="412" l="Stops" />
            <MiniStat v="6 days" l="Avg length" />
            <MiniStat v="2" l="Travelers" />
          </div>
        </div>
      </Feature>

      {/* FEATURE 10 — Disruption */}
      <Feature
        reverse
        eyebrow="// 10 · AUTO RE-PLAN"
        title="One tap to re-plan your day."
        body="Flight delayed? Restaurant closed? Weather turned? Voyage rewrites the rest of your day in seconds."
      >
        <div className="surface rounded-2xl p-5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)]">
            ⚡ RE-PLANNED · DAY 3
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-[var(--muted)] mb-1">BEFORE</div>
              <div className="rounded-lg bg-[var(--card-strong)] border border-[var(--border)] p-3 space-y-1.5 text-xs line-through opacity-50">
                <div>14:00 · Outdoor walk</div>
                <div>15:30 · Open-air market</div>
                <div>17:00 · Rooftop sunset</div>
              </div>
            </div>
            <div>
              <div className="text-xs text-[var(--accent)] mb-1">AFTER (rain)</div>
              <div className="rounded-lg bg-[var(--accent-soft)] border border-[var(--accent)]/40 p-3 space-y-1.5 text-xs">
                <div>14:00 · Indoor museum</div>
                <div>15:30 · Covered arcade</div>
                <div>17:00 · Hotel bar drinks</div>
              </div>
            </div>
          </div>
        </div>
      </Feature>

      {/* DESTINATION PRESETS */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-8">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase">
              // 11 · DISCOVER
            </div>
            <h2 className="text-2xl font-semibold mt-1">
              Need inspiration?
            </h2>
          </div>
          <Link
            href="/plan"
            className="text-sm text-[var(--muted)] hover:text-[var(--foreground)] font-mono"
          >
            Plan custom →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRESETS.map((p) => (
            <Link
              key={p.city}
              href={`/plan?destination=${encodeURIComponent(p.city)}&days=${p.days}`}
              className="group surface relative overflow-hidden rounded-2xl p-6 hover:border-[var(--accent)]/40 hover:shadow-[0_0_0_1px_var(--accent-soft),0_8px_40px_-10px_var(--accent-glow)] transition"
            >
              <div className="flex items-center justify-between">
                <div className="text-4xl">{p.emoji}</div>
                <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase">
                  {p.code}
                </div>
              </div>
              <div className="mt-5 font-semibold text-lg">{p.city}</div>
              <div className="text-sm text-[var(--muted)] mt-1">
                {p.days} days · {p.vibe}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="surface rounded-2xl p-10 md:p-14 text-center">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight">
            Ready to go somewhere?
          </h2>
          <p className="mt-4 text-[var(--muted)] max-w-xl mx-auto">
            Free forever. No credit card. Plan your first trip in under a minute.
          </p>
          <Link
            href="/sign-in"
            className="btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 mt-8 text-base font-medium"
          >
            Launch Voyage →
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="bg-[var(--background)]/80 px-6 py-6 text-left">
      <div className="font-mono text-2xl md:text-3xl font-semibold tracking-tight">
        {value}
      </div>
      <div className="mt-1 text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)]">
        {label}
      </div>
    </div>
  );
}

function Feature({
  eyebrow,
  title,
  body,
  children,
  reverse = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
  reverse?: boolean;
}) {
  return (
    <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <div
        className={`grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-14 items-center ${
          reverse ? "lg:[direction:rtl]" : ""
        }`}
      >
        <div className={reverse ? "lg:[direction:ltr]" : ""}>
          <div className="font-mono text-xs tracking-[0.18em] text-[var(--accent)]">
            {eyebrow}
          </div>
          <h2 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
            {title}
          </h2>
          <p className="mt-5 text-lg text-[var(--muted)] leading-relaxed">
            {body}
          </p>
        </div>
        <div className={reverse ? "lg:[direction:ltr]" : ""}>{children}</div>
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between">
      <span>{k}</span>
      <span>{v}</span>
    </div>
  );
}

function ItRow({
  time,
  title,
  hood,
}: {
  time: string;
  title: string;
  hood: string;
}) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="text-xs font-mono text-[var(--muted)] w-12 shrink-0">
        {time}
      </span>
      <span className="font-medium flex-1 truncate">{title}</span>
      <span className="text-xs text-[var(--muted)]">{hood}</span>
    </div>
  );
}

function Leg({
  minutes,
  mode,
  km,
}: {
  minutes: number;
  mode: string;
  km: number;
}) {
  const icon = mode === "walk" ? "🚶" : mode === "drive" ? "🚗" : "🚇";
  return (
    <div className="pl-12 py-1 text-xs text-[var(--muted)]">
      {icon} {minutes} min by {mode} · {km} km
    </div>
  );
}

function ConfRow({
  icon,
  title,
  detail,
  amount,
}: {
  icon: string;
  title: string;
  detail: string;
  amount: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[var(--card-strong)] border border-[var(--border)] p-3">
      <div className="text-xl">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-sm">{title}</div>
        <div className="text-xs text-[var(--muted)] truncate font-mono">
          {detail}
        </div>
      </div>
      <div className="font-semibold text-sm">{amount}</div>
    </div>
  );
}

function GuidePreview({
  city,
  title,
  handle,
  price,
  rating,
  reviews,
}: {
  city: string;
  title: string;
  handle: string;
  price: number;
  rating: number;
  reviews: number;
}) {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-mono text-[var(--muted)]">{city}</span>
        <span className="font-bold">${price}</span>
      </div>
      <div className="font-semibold text-lg mt-2">{title}</div>
      <div className="mt-3 flex justify-between text-xs text-[var(--muted)]">
        <span>{handle}</span>
        <span>
          ⭐ {rating} · {reviews}
        </span>
      </div>
    </div>
  );
}

function MiniStat({ v, l }: { v: string; l: string }) {
  return (
    <div>
      <div className="text-xl font-semibold tracking-tight">{v}</div>
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)] mt-0.5">
        {l}
      </div>
    </div>
  );
}
