"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { ExternalLink, Smartphone } from "lucide-react";

type Plan = {
  region: string;
  match: RegExp[];
  recommended: { gb: number; days: number; usd: number };
  options: { gb: number; days: number; usd: number }[];
};

const PLANS: Plan[] = [
  {
    region: "Japan",
    match: [/japan|tokyo|osaka|kyoto/i],
    recommended: { gb: 5, days: 15, usd: 16 },
    options: [
      { gb: 1, days: 7, usd: 5 },
      { gb: 3, days: 15, usd: 11 },
      { gb: 5, days: 15, usd: 16 },
      { gb: 10, days: 30, usd: 26 },
    ],
  },
  {
    region: "Europe (39 countries)",
    match: [/paris|france|london|uk|england|rome|italy|madrid|spain|berlin|germany|lisbon|portugal|amsterdam|netherlands|europe/i],
    recommended: { gb: 5, days: 15, usd: 19 },
    options: [
      { gb: 1, days: 7, usd: 5 },
      { gb: 3, days: 15, usd: 13 },
      { gb: 5, days: 15, usd: 19 },
      { gb: 10, days: 30, usd: 35 },
    ],
  },
  {
    region: "Southeast Asia",
    match: [/bangkok|thailand|singapore|bali|vietnam|saigon|hanoi|kuala lumpur|malaysia|indonesia|philippines/i],
    recommended: { gb: 3, days: 15, usd: 9 },
    options: [
      { gb: 1, days: 7, usd: 4 },
      { gb: 3, days: 15, usd: 9 },
      { gb: 10, days: 30, usd: 22 },
    ],
  },
  {
    region: "Mexico",
    match: [/mexico|cancun|cdmx/i],
    recommended: { gb: 3, days: 15, usd: 11 },
    options: [
      { gb: 1, days: 7, usd: 5 },
      { gb: 3, days: 15, usd: 11 },
      { gb: 10, days: 30, usd: 28 },
    ],
  },
  {
    region: "United States",
    match: [/usa|united states|new york|nyc|los angeles|la|san francisco|sfo|chicago|miami|seattle|boston/i],
    recommended: { gb: 5, days: 15, usd: 14 },
    options: [
      { gb: 1, days: 7, usd: 4 },
      { gb: 3, days: 15, usd: 10 },
      { gb: 5, days: 15, usd: 14 },
      { gb: 10, days: 30, usd: 24 },
    ],
  },
];

const FALLBACK: Plan = {
  region: "Global / unlisted",
  match: [],
  recommended: { gb: 5, days: 15, usd: 26 },
  options: [
    { gb: 1, days: 7, usd: 7 },
    { gb: 3, days: 15, usd: 17 },
    { gb: 5, days: 15, usd: 26 },
    { gb: 10, days: 30, usd: 42 },
  ],
};

function Inner() {
  const params = useSearchParams();
  const destination = params.get("destination") ?? "";
  const tripDays = Number(params.get("days") ?? 0);

  const matched = useMemo<Plan>(() => {
    if (!destination) return FALLBACK;
    return (
      PLANS.find((p) => p.match.some((re) => re.test(destination))) ?? FALLBACK
    );
  }, [destination]);

  const airaloUrl = `https://www.airalo.com/?utm_source=voyage&utm_medium=esim&search=${encodeURIComponent(destination || "")}`;

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <div className="flex items-center gap-3">
        <Smartphone size={22} strokeWidth={1.75} className="text-[var(--accent)]" aria-hidden />
        <h1 className="text-3xl font-bold tracking-tight">Travel eSIM</h1>
      </div>
      <p className="text-[var(--muted)] mt-2 max-w-prose">
        Skip the SIM-card kiosk and roaming charges. Buy a data plan online,
        scan the QR, and you&apos;re online before you land.
      </p>

      <div className="steel mt-8 p-6">
        <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
          {destination ? `RECOMMENDED FOR ${destination.toUpperCase()}` : "PICK A REGION"}
        </div>
        <div className="text-2xl font-bold tracking-tight mt-2">
          {matched.region}
        </div>
        <div className="mt-1 text-sm text-[var(--muted)]">
          {tripDays > 0
            ? `Your trip is ${tripDays} days — we'd recommend the ${matched.recommended.gb} GB plan ($${matched.recommended.usd}).`
            : `Most travelers pick the ${matched.recommended.gb} GB / ${matched.recommended.days}-day plan.`}
        </div>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {matched.options.map((opt) => (
            <a
              key={`${opt.gb}-${opt.days}`}
              href={airaloUrl}
              target="_blank"
              rel="noreferrer"
              className={`border rounded-xl p-4 hover:border-[var(--accent)] transition ${
                opt.gb === matched.recommended.gb &&
                opt.days === matched.recommended.days
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)]"
              }`}
            >
              <div className="text-2xl font-bold tracking-tight">
                {opt.gb} GB
              </div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {opt.days} days
              </div>
              <div className="text-lg font-bold mt-3">${opt.usd}</div>
              <div className="mt-2 text-[11px] text-[var(--muted)] flex items-center gap-1">
                Buy on Airalo
                <ExternalLink size={11} strokeWidth={1.75} aria-hidden />
              </div>
            </a>
          ))}
        </div>

        <div className="text-[11px] text-[var(--muted)] mt-5">
          Voyage may earn a referral fee. Pricing is approximate and updated
          via the partner provider.
        </div>
      </div>

      <div className="mt-8">
        <Link
          href="/trips"
          className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          ← Back to my trips
        </Link>
      </div>
    </div>
  );
}

export default function ESimPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
