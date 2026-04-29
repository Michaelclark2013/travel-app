"use client";

// Drop, paste, or pick a screenshot. Voyage's vision agent looks at it and
// proposes edits to your trip — add an itinerary item, flag a conflict, save
// to wallet, etc. Mounted on /plan and on each /trips/[id].

import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/toast";

type Suggestion = {
  kind: string;
  title: string;
  body: string;
  payload?: Record<string, unknown>;
};

type Detected = {
  kind: string;
  confidence: number;
  summary: string;
  facts: { label: string; value: string }[];
};

type Result = {
  detected: Detected;
  suggestions: Suggestion[];
  source: "claude" | "mock";
};

const KIND_LABEL: Record<string, string> = {
  "flight-confirmation": "Flight confirmation",
  "hotel-confirmation": "Hotel booking",
  "rental-car": "Rental car",
  "restaurant-reservation": "Reservation",
  "ticket-or-event": "Ticket / event",
  "boarding-pass": "Boarding pass",
  receipt: "Receipt",
  menu: "Menu",
  "schedule-or-hours": "Schedule / hours",
  "weather-or-advisory": "Weather / advisory",
  "map-or-place": "Place / map",
  "message-or-recommendation": "Recommendation",
  other: "Other",
};

const SUGGESTION_ICON: Record<string, string> = {
  "add-itinerary-item": "➕",
  "add-wallet-item": "🎫",
  "flag-conflict": "⚠️",
  "update-budget": "💰",
  "add-stop": "📍",
  "update-preferences": "⚙️",
  warn: "⚠️",
  info: "ℹ️",
};

export default function ScreenshotIntel({
  context,
  onApply,
  compact = false,
}: {
  /** Brief text the AI should consider — destination, dates, etc. */
  context?: string;
  /** Optional: receive applied suggestions so the parent can mutate state. */
  onApply?: (s: Suggestion) => void;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Allow paste-from-clipboard while this widget is on screen.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (!e.clipboardData) return;
      const items = Array.from(e.clipboardData.items);
      const img = items.find((i) => i.type.startsWith("image/"));
      if (!img) return;
      const f = img.getAsFile();
      if (f) handleFile(f);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context]);

  async function handleFile(file: File) {
    setError(null);
    setResult(null);
    setBusy(true);
    setPreviewUrl(URL.createObjectURL(file));

    try {
      const fd = new FormData();
      fd.append("image", file);
      if (context) fd.append("context", context);
      const res = await fetch("/api/agent/vision", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResult({
        detected: data.detected,
        suggestions: data.suggestions,
        source: data.source,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function applySuggestion(s: Suggestion) {
    onApply?.(s);
    toast.success(`Applied · ${s.title}`);
  }

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // AI · SCREENSHOT INTEL
          </div>
          <div className="text-lg font-semibold mt-1">
            Drop in a screenshot — I&apos;ll plan around it.
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            Confirmations, tickets, hours, weather, friend recs — anything visible.
          </div>
        </div>
        {result?.source === "mock" && (
          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300 normal-case tracking-normal">
            Demo (no API key)
          </span>
        )}
      </div>

      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        className={`mt-4 block rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition ${
          drag
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-[var(--border-strong)] bg-[var(--card-strong)] hover:border-[var(--accent)]"
        } ${compact ? "py-4" : ""}`}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          // On mobile this lets the user snap a photo of a boarding pass /
          // restaurant menu / weather alert directly. Desktop browsers
          // ignore the attribute and just open the file picker.
          capture="environment"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        {busy ? (
          <div className="text-sm text-[var(--muted)] inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
            Analyzing…
          </div>
        ) : (
          <div>
            <div className="text-2xl mb-1">📎</div>
            <div className="text-sm font-medium">
              Drop, paste (⌘V), or{" "}
              <span className="text-[var(--accent)] underline-offset-2 underline">
                browse
              </span>
            </div>
            <div className="mt-1 text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.16em]">
              PNG · JPG · WEBP · ≤ 5 MB
            </div>
          </div>
        )}
      </label>

      {error && (
        <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      {previewUrl && result && (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-[160px_1fr] gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Screenshot"
            className="w-full md:max-w-[160px] rounded-lg border border-[var(--border)]"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                {KIND_LABEL[result.detected.kind] ?? result.detected.kind}
              </span>
              <span className="text-[10px] font-mono text-[var(--muted)]">
                {Math.round(result.detected.confidence * 100)}% confidence
              </span>
            </div>
            <p className="mt-2 text-sm text-[var(--foreground)]/90">
              {result.detected.summary}
            </p>
            {result.detected.facts.length > 0 && (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {result.detected.facts.map((f, i) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-[var(--hairline)] py-1">
                    <dt className="text-[var(--muted)]">{f.label}</dt>
                    <dd className="text-right">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
      )}

      {result && result.suggestions.length > 0 && (
        <div className="mt-5">
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase mb-2">
            // Suggested actions
          </div>
          <ul className="space-y-2">
            {result.suggestions.map((s, i) => (
              <li
                key={i}
                className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 flex items-start gap-3"
              >
                <span className="text-xl shrink-0">
                  {SUGGESTION_ICON[s.kind] ?? "•"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-[var(--muted)] mt-1">{s.body}</div>
                </div>
                {(s.kind === "add-itinerary-item" ||
                  s.kind === "add-wallet-item" ||
                  s.kind === "add-stop" ||
                  s.kind === "update-preferences" ||
                  s.kind === "update-budget") && (
                  <button
                    onClick={() => applySuggestion(s)}
                    className="btn-primary px-3 py-1 text-xs shrink-0"
                  >
                    Apply
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
