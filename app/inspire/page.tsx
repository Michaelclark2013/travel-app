"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import { LocationImageEl } from "@/components/LocationImage";
import { parseInspiration, type InspireResult } from "@/lib/inspire";

const EXAMPLES = [
  "I just saw this insane TikTok of someone in Tokyo doing an omakase and rooftop bars at sunset",
  "Saving this Reel of Lisbon — the tile shops, beaches in Cascais, the rooftop in Chiado",
  "Want to do Iceland's Ring Road, hot springs, glacier hike, and northern lights",
];

export default function InspirePage() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const [text, setText] = useState("");
  const [result, setResult] = useState<InspireResult | null>(null);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  function handleAnalyze() {
    if (!text.trim()) return;
    setResult(parseInspiration(text));
  }

  function handlePlanIt() {
    if (!result?.destination) return;
    const params = new URLSearchParams({
      destination: result.destination,
      days: "5",
    });
    router.push(`/plan?${params.toString()}`);
  }

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">
        See it. Plan it.
      </h1>
      <p className="text-[var(--muted)] mt-3">
        Paste a TikTok caption, describe a Reel you saw, or just brain-dump
        what you want to do. We&apos;ll figure out the destination and
        kickstart a trip.
      </p>

      <div className="steel mt-8 p-5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste a link or describe what you saw..."
          rows={5}
          className="w-full bg-black/40 border border-[var(--edge)] text-[var(--foreground)] p-4 outline-none focus:border-[var(--edge-light)] resize-none"
          style={{ fontSize: 15, lineHeight: 1.5 }}
        />
        <div className="mt-3 flex justify-between items-center flex-wrap gap-3">
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((ex, i) => (
              <button
                key={i}
                onClick={() => setText(ex)}
                className="text-xs text-[var(--muted)] hover:text-white border border-[var(--edge)] px-2.5 py-1"
              >
                Example {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={handleAnalyze}
            disabled={!text.trim()}
            className="btn-primary px-5 py-2.5 text-sm disabled:opacity-50"
          >
            Analyze
          </button>
        </div>
      </div>

      {result && (
        <div className="steel mt-6 overflow-hidden">
          {result.destination && (
            <LocationImageEl
              name={result.destination}
              kind="city"
              aspect="21/9"
              rounded="none"
              overlay
              className="w-full"
            />
          )}
          <div className="p-6">
          <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
            WHAT WE FOUND
          </div>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-[var(--muted)]">Destination</div>
              <div className="text-2xl font-bold tracking-tight mt-1">
                {result.destination ?? "Couldn't detect — try adding a city"}
              </div>
            </div>
            <div>
              <div className="text-sm text-[var(--muted)]">Vibes</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {result.vibes.length === 0 && (
                  <span className="text-sm text-[var(--muted)]">none yet</span>
                )}
                {result.vibes.map((v) => (
                  <span
                    key={v}
                    className="bg-white/8 border border-[var(--edge)] px-3 py-1 text-xs"
                  >
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {result.detectedActivities.length > 0 && (
            <div className="mt-5">
              <div className="text-sm text-[var(--muted)]">Activities mentioned</div>
              <ul className="mt-2 space-y-1 text-sm">
                {result.detectedActivities.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-6 flex justify-end">
            <button
              onClick={handlePlanIt}
              disabled={!result.destination}
              className="btn-primary px-6 py-3 text-sm disabled:opacity-50"
            >
              Plan a trip from this →
            </button>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
