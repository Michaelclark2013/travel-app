"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Lab = {
  id: string;
  eyebrow: string;
  title: string;
  blurb: string;
  status: "shipped" | "preview" | "coming";
  details: string[];
};

const LABS: Lab[] = [
  {
    id: "trip-doctor",
    eyebrow: "// 00a",
    title: "Trip Doctor",
    blurb:
      "Auto-scans every saved trip with Claude — surfaces conflicts, timing crunches, fatigue traps, closures, and other issues you'd never catch.",
    status: "shipped",
    details: [
      "Runs once per trip on /trips/[id], cached by a fingerprint of the itinerary",
      "Severity-tagged findings: critical · warning · fyi",
      "Categorized: timing, logistics, weather, openness, transit, budget, energy, documentation, health",
      "Re-scan button when you've made changes",
      "Heuristic mock when ANTHROPIC_API_KEY isn't set",
    ],
  },
  {
    id: "screenshot-intel",
    eyebrow: "// 00",
    title: "Screenshot intelligence",
    blurb:
      "Drop in a confirmation, ticket, hours screenshot, weather alert — Voyage's vision agent reads it and edits your trip around it.",
    status: "shipped",
    details: [
      "Drop, paste (⌘V), or pick any image on /plan or any /trips/[id]",
      "Claude Sonnet vision parses + classifies (confirmation, hours, weather, etc.)",
      "Suggests structured actions: add itinerary item, save to wallet, flag conflict, warn",
      "Falls back to a deterministic stub when ANTHROPIC_API_KEY is missing",
    ],
  },
  {
    id: "multi-stop",
    eyebrow: "// 01a",
    title: "Multi-stop trips",
    blurb:
      "Plan vacations that hit multiple cities. Reorder, set nights per stop, end-date auto-calculates.",
    status: "shipped",
    details: [
      "Tap '+ Add a second stop' on /plan to open the route builder",
      "Per-stop nights drive the trip end date",
      "Itinerary days are tagged + grouped by stop on the trip detail page",
      "Trips list + Wrapped recap render the full route (Tokyo → Kyoto → Osaka)",
    ],
  },
  {
    id: "agent",
    eyebrow: "// 01",
    title: "AI travel agent",
    blurb:
      "Chat with Voyage anywhere in the app. Memory across trips, tool access to the full planner.",
    status: "shipped",
    details: [
      "Persistent chat in the bottom-right of every authed page",
      "Tools: search flights, search hotels, compare drive vs fly, visa lookup, weather, list trips, draft itinerary",
      "Falls back to a heuristic responder until ANTHROPIC_API_KEY is set",
    ],
  },
  {
    id: "voice",
    eyebrow: "// 02",
    title: "Voice mode",
    blurb:
      "“Hey Voyage, what's next?” while driving. iOS-first via the SpeechRecognizer + AVSpeechSynthesizer APIs.",
    status: "preview",
    details: [
      "Web preview: Web Speech API (Chrome / iOS Safari 16.4+)",
      "Native iOS: deeper integration via Capacitor wrapper",
      "Press-and-hold a Live Activity widget to talk; reply spoken back",
    ],
  },
  {
    id: "ar",
    eyebrow: "// 03",
    title: "AR signs & menus",
    blurb:
      "Point your phone at any sign or menu — instant translation, with context (price in USD, dish recommendations).",
    status: "coming",
    details: [
      "Apple Vision framework (iOS/iPadOS)",
      "On-device translation via Apple Translation",
      "Anchored AR overlay with Voyage glyphs",
    ],
  },
  {
    id: "ios",
    eyebrow: "// 04",
    title: "Native iOS deep integration",
    blurb:
      "Live Activities, widgets, Apple Wallet, Maps app extension, Shortcuts.",
    status: "coming",
    details: [
      "Live Activities — countdown to departure, next stop on the Dynamic Island",
      "Widgets — today's plan + budget burn-down on the home screen",
      "Apple Wallet — boarding cards / hotel keys auto-imported",
      "Maps extension — “Add to Voyage” on any pin",
      "Shortcuts — “Hey Siri, what's next on my trip?”",
      "Handoff between iPhone and Mac",
    ],
  },
  {
    id: "wrapped",
    eyebrow: "// 05",
    title: "Trip Wrapped",
    blurb:
      "End-of-trip recap page — auto-generated, shareable. Like Spotify Wrapped.",
    status: "shipped",
    details: [
      "Available at /trips/[id]/wrapped",
      "Auto-extracts stats from saved itinerary",
      "Web Share API + Save-as-PDF",
      "Coming next: animated video render via Remotion",
    ],
  },
  {
    id: "embed",
    eyebrow: "// 06",
    title: "Voyage everywhere",
    blurb:
      "Public JSON + iframe embeds so any blog or partner can drop in a Voyage trip card.",
    status: "shipped",
    details: [
      "GET /api/v1/trips/{id} — JSON",
      "<iframe src=/api/v1/embed/{id}> — drop-in card",
      "Docs at /developers",
    ],
  },
  {
    id: "predict",
    eyebrow: "// 07",
    title: "Price prediction",
    blurb:
      "Hopper-style “buy now / wait” verdict on every flight + hotel.",
    status: "preview",
    details: [
      "Stub model right now — calls a deterministic forecaster",
      "Real impl: log every Amadeus quote into Postgres, train a per-route regression",
      "Watch list with notifications when target hits",
    ],
  },
  {
    id: "photo",
    eyebrow: "// 08",
    title: "Photo-truth layer",
    blurb:
      "Verified guest photos for every hotel — stops you from getting catfished by 2009 marketing shots.",
    status: "preview",
    details: [
      "Badge today: deterministic match-score from a stub model",
      "Real impl: vision-similarity pipeline against public guest photos",
      "Stale-listing flag triggers refund-help flow",
    ],
  },
];

const TABS = [
  { id: "all", label: "All" },
  { id: "shipped", label: "Shipped" },
  { id: "preview", label: "Preview" },
  { id: "coming", label: "Coming" },
] as const;

export default function LabsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("all");
  const [voiceSupport, setVoiceSupport] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoiceSupport(
      typeof (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition !==
        "undefined" ||
        typeof (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition !==
          "undefined"
    );
  }, []);

  const filtered = tab === "all" ? LABS : LABS.filter((l) => l.status === tab);

  return (
    <div className="mx-auto max-w-4xl px-6 py-16">
      <div className="font-mono text-xs tracking-[0.18em] text-[var(--accent)] uppercase mb-3">
        // VOYAGE · LABS
      </div>
      <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
        What we&apos;re building next.
      </h1>
      <p className="mt-4 text-lg text-[var(--muted)] max-w-2xl">
        Voyage is the trip OS. Here&apos;s what&apos;s shipped, what&apos;s in
        preview, and what&apos;s coming. Native iOS features need the iOS app
        wrapper — we&apos;ll ship that with App Store submission.
      </p>

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1.5 ${
              tab === t.id
                ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-8 space-y-4">
        {filtered.map((l) => (
          <LabCard key={l.id} lab={l} voiceSupport={voiceSupport} />
        ))}
      </div>

      <div className="mt-12 text-sm">
        <Link href="/" className="text-[var(--muted)] hover:text-white">
          ← Back to Voyage
        </Link>
      </div>
    </div>
  );
}

function LabCard({ lab, voiceSupport }: { lab: Lab; voiceSupport: boolean | null }) {
  const status = (() => {
    if (lab.status === "shipped")
      return { label: "Shipped", cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40" };
    if (lab.status === "preview")
      return { label: "Preview", cls: "bg-sky-500/15 text-sky-200 border-sky-500/40" };
    return { label: "Coming", cls: "bg-white/5 text-[var(--muted)] border-[var(--border)]" };
  })();

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] tracking-[0.18em] text-[var(--accent)]">
            {lab.eyebrow}
          </div>
          <div className="mt-1 text-xl font-semibold">{lab.title}</div>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-prose">{lab.blurb}</p>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${status.cls}`}>
          {status.label}
        </span>
      </div>
      <ul className="mt-4 text-xs text-[var(--muted)] space-y-1.5">
        {lab.details.map((d) => (
          <li key={d}>• {d}</li>
        ))}
      </ul>
      {lab.id === "voice" && voiceSupport === false && (
        <div className="mt-3 text-xs text-amber-300">
          Your browser doesn&apos;t support the Web Speech API. iOS Safari 16.4+
          / Chrome desktop work today.
        </div>
      )}
    </div>
  );
}
