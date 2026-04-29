"use client";

// Composite component for the Memory Roll experience on the profile page.
// Renders three sections in vertical order:
//  1. Memory Roll card  — the "Catch a Moment" CTA + processing counter
//  2. Ready Moments     — list with Keep / Discard per moment (only shows when there are any)
//  3. Travel Journal    — grid/timeline of kept (filtered) moments
//
// The capture screen itself lives at /profile/capture (built in a follow-up).
// This component links there; for now it also accepts a "demo capture" path
// that picks an image via <input type="file"> so the lifecycle is fully
// exercisable without the camera.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyFilm,
  captureMoment,
  deleteMemory,
  discardMemory,
  keepMemory,
  keptMemories,
  loadMemories,
  processingMemories,
  readyInLabel,
  readyMemories,
  reconcileMemories,
  type Memory,
} from "@/lib/memory-roll";
import { toast } from "@/lib/toast";

export default function MemoryRoll() {
  // Single source of truth for this widget — refreshed on demand.
  const [memories, setMemories] = useState<Memory[]>([]);
  // Tick state: forces a re-render every 30s so the "Ready in 47 m" label
  // updates and any moments crossing the boundary surface in Ready Moments.
  const [, setTick] = useState(0);

  function refresh() {
    setMemories(reconcileMemories());
  }

  useEffect(() => {
    refresh();
    const id = window.setInterval(() => {
      refresh();
      setTick((t) => t + 1);
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const processing = useMemo(() => processingMemories(memories), [memories]);
  const ready = useMemo(() => readyMemories(memories), [memories]);
  const kept = useMemo(() => keptMemories(memories), [memories]);

  // Demo capture — opens the file picker. The real flow uses /profile/capture
  // (full-screen camera). This is the temporary stand-in until that route ships.
  const fileRef = useRef<HTMLInputElement>(null);

  async function onDemoFile(file: File) {
    const dataUri = await readFileAsDataUri(file);
    const m = captureMoment({ imageDataUri: dataUri });
    setMemories(reconcileMemories());
    toast.success("Moment Saved — Processing", {
      durationMs: 4000,
      actionLabel: "View",
      onAction: () => {
        document
          .getElementById(`mem-${m.id}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
    });
  }

  async function onKeep(m: Memory) {
    try {
      const filtered = await applyFilm(m.imageDataUri);
      keepMemory(m.id, filtered);
      refresh();
      toast.success("Added to Travel Journal");
    } catch {
      toast.error("Couldn't apply the filter — try again.");
    }
  }

  function onDiscard(m: Memory) {
    discardMemory(m.id);
    refresh();
    toast.undo("Moment discarded", () => {
      // Restore by flipping status back. We use deleteMemory + a re-add so the
      // undo is cleaner than maintaining a "trash" state.
      deleteMemory(m.id);
      const restored: Memory = { ...m, status: "ready", decidedAt: undefined };
      // Direct write — bypass the lib's push-to-front so order is preserved.
      const all = loadMemories();
      window.localStorage.setItem(
        `voyage:memory-roll:${(JSON.parse(window.localStorage.getItem("voyage:session") || "{}") as { id?: string }).id ?? ""}`,
        JSON.stringify([restored, ...all])
      );
      refresh();
    });
  }

  return (
    <div className="space-y-6">
      <RollCard
        processing={processing.length}
        ready={ready.length}
        onDemoCapture={() => fileRef.current?.click()}
      />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onDemoFile(f);
          e.target.value = "";
        }}
      />

      {processing.length > 0 && (
        <ProcessingStrip processing={processing} />
      )}

      {ready.length > 0 && (
        <ReadyMomentsSection
          ready={ready}
          onKeep={onKeep}
          onDiscard={onDiscard}
        />
      )}

      <TravelJournalSection kept={kept} />
    </div>
  );
}

// -----------------------------------------------------------------------------

function RollCard({
  processing,
  ready,
  onDemoCapture,
}: {
  processing: number;
  ready: number;
  onDemoCapture: () => void;
}) {
  return (
    <div
      className="surface rounded-2xl p-5 relative overflow-hidden"
      style={{
        background: `radial-gradient(700px 280px at 88% 0%, rgba(34,211,238,0.12), transparent 65%), var(--background-soft)`,
      }}
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase">
            // 📸 MEMORY ROLL
          </div>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Catch the trip, not the take.
          </h2>
          <p className="mt-1.5 text-sm text-[var(--muted)] max-w-md">
            Snap a moment. No preview. It quietly processes for a while, then
            shows up later — kept ones land in your Travel Journal with a
            warm film look.
          </p>
        </div>
        <div className="hidden sm:flex flex-col items-end gap-2">
          <div className="font-mono text-[10px] tracking-[0.16em] text-[var(--muted)] uppercase">
            ▣ {processing} processing · ◉ {ready} ready
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link
          href="/profile/capture"
          className="btn-primary px-5 py-3 text-sm font-medium"
        >
          📷 Catch a Moment
        </Link>
        <button
          onClick={onDemoCapture}
          className="btn-ghost px-3 py-3 text-xs"
          title="Use until /profile/capture (full-screen camera) ships"
        >
          Demo capture (pick a photo)
        </button>
      </div>
      <div className="mt-3 sm:hidden font-mono text-[10px] tracking-[0.16em] text-[var(--muted)] uppercase">
        {processing} processing · {ready} ready
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

function ProcessingStrip({ processing }: { processing: Memory[] }) {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase">
        // PROCESSING ({processing.length})
      </div>
      <ul className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        {processing.map((m) => (
          <li
            key={m.id}
            id={`mem-${m.id}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 text-center"
          >
            <div className="aspect-square rounded-lg bg-black/40 flex items-center justify-center text-2xl">
              ⏳
            </div>
            <div className="mt-2 font-mono text-[10px] tracking-[0.16em] text-[var(--muted)] uppercase">
              {readyInLabel(m)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -----------------------------------------------------------------------------

function ReadyMomentsSection({
  ready,
  onKeep,
  onDiscard,
}: {
  ready: Memory[];
  onKeep: (m: Memory) => void;
  onDiscard: (m: Memory) => void;
}) {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // READY MOMENTS
          </div>
          <div className="text-lg font-semibold mt-1">
            {ready.length} moment{ready.length === 1 ? "" : "s"} waiting on you
          </div>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {ready.map((m) => (
          <li
            key={m.id}
            id={`mem-${m.id}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 flex flex-col sm:flex-row gap-4"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.imageDataUri}
              alt="A captured moment"
              className="w-full sm:w-40 sm:h-40 h-48 object-cover rounded-lg border border-[var(--border)]"
            />
            <div className="flex-1 min-w-0 flex flex-col">
              <div className="font-mono text-[10px] tracking-[0.16em] text-[var(--muted)] uppercase">
                Captured{" "}
                {new Date(m.capturedAt).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
              <div className="mt-1 text-sm text-[var(--muted)]">
                Decide whether this one&apos;s a keeper. Kept moments get the
                film look applied and join your Travel Journal.
              </div>
              <div className="mt-auto pt-3 flex gap-2">
                <button
                  onClick={() => onKeep(m)}
                  className="btn-primary text-sm px-4 py-2 flex-1 sm:flex-none"
                >
                  Keep
                </button>
                <button
                  onClick={() => onDiscard(m)}
                  className="btn-ghost text-sm px-4 py-2 flex-1 sm:flex-none"
                >
                  Discard
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// -----------------------------------------------------------------------------

function TravelJournalSection({ kept }: { kept: Memory[] }) {
  // Group kept moments by capture month for a light timeline feel.
  const groups = useMemo(() => {
    const map = new Map<string, Memory[]>();
    for (const m of kept) {
      const d = new Date(m.capturedAt);
      const key = d.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
      const cur = map.get(key) ?? [];
      cur.push(m);
      map.set(key, cur);
    }
    // Sort newest month first.
    return [...map.entries()].sort((a, b) =>
      new Date(b[1][0].capturedAt).getTime() -
      new Date(a[1][0].capturedAt).getTime() > 0
        ? 1
        : -1
    );
  }, [kept]);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // 📓 TRAVEL JOURNAL
          </div>
          <div className="text-lg font-semibold mt-1">
            {kept.length === 0
              ? "Your journal — empty for now."
              : `${kept.length} moment${kept.length === 1 ? "" : "s"} kept`}
          </div>
        </div>
      </div>

      {kept.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Catch your first moment to start filling this in.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {groups.map(([month, items]) => (
            <div key={month}>
              <div className="font-mono text-[10px] tracking-[0.18em] text-[var(--muted)] uppercase mb-2">
                {month}
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2">
                {items.map((m) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={m.id}
                    src={m.filteredDataUri ?? m.imageDataUri}
                    alt="Travel journal moment"
                    className="aspect-square w-full object-cover rounded-md border border-[var(--border)] hover:border-[var(--border-strong)] cursor-zoom-in"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}
