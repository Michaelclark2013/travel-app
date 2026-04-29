"use client";

// Global search overlay. Opens from any page via the magnifying-glass in Nav,
// the `/` keyboard shortcut, or programmatically. Searches across:
//  - Users (mock + your follows)
//  - Hashtags (extracted from mock + own moments)
//  - Places (your destinations / mock locations)
//  - Your saved trips
//
// All sections render as ranked rows; pick one to navigate.

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Hash,
  MapPin,
  Search as SearchIcon,
  Sparkles,
  X,
} from "lucide-react";
import {
  avatarStyle,
  MOCK_USERS,
  type MockUser,
} from "@/lib/social";
import { extractTags } from "@/lib/markup";
import { keptMemories, reconcileMemories } from "@/lib/memory-roll";
import { loadTrips } from "@/lib/storage";
import { type Trip } from "@/lib/types";
import { isMultiStop, routeSummary } from "@/lib/trip-stops";

const EVENT = "voyage:open-search";

/** Open the overlay from anywhere. */
export function openGlobalSearch() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT));
}

export default function GlobalSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [trips, setTrips] = useState<Trip[]>([]);

  useEffect(() => {
    const onOpen = () => {
      setOpen(true);
    };
    window.addEventListener(EVENT, onOpen);
    return () => window.removeEventListener(EVENT, onOpen);
  }, []);

  // Listen for `/` to open search globally (matches Shortcuts.tsx behavior).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const term = q.trim().toLowerCase();

  const userHits = useMemo<MockUser[]>(() => {
    if (!term) return MOCK_USERS.slice(0, 5);
    return MOCK_USERS.filter(
      (u) =>
        u.username.toLowerCase().includes(term) ||
        u.displayName.toLowerCase().includes(term) ||
        u.bio.toLowerCase().includes(term)
    ).slice(0, 8);
  }, [term]);

  const tagHits = useMemo(() => {
    const all = new Set<string>();
    for (const u of MOCK_USERS) {
      for (const m of u.moments) {
        for (const t of extractTags(`${m.caption} ${m.location}`)) {
          all.add(t);
        }
        // Also seed from raw words in locations so common places surface.
        const word = m.location.split(",")[0].trim().toLowerCase().replace(/[^a-z0-9]/g, "");
        if (word) all.add(word);
      }
    }
    if (typeof window !== "undefined") {
      reconcileMemories();
      for (const m of keptMemories()) {
        for (const t of extractTags(`${m.caption ?? ""} ${m.location ?? ""}`)) {
          all.add(t);
        }
      }
    }
    const tags = [...all];
    if (!term) return tags.slice(0, 6);
    return tags.filter((t) => t.includes(term)).slice(0, 8);
  }, [term]);

  const placeHits = useMemo(() => {
    const places = new Set<string>();
    for (const u of MOCK_USERS) {
      for (const m of u.moments) {
        const last = m.location.split(",").pop()?.trim();
        if (last) places.add(last);
      }
    }
    if (typeof window !== "undefined") {
      for (const m of keptMemories()) {
        if (m.location) places.add(m.location.split(",").pop()!.trim());
      }
    }
    const list = [...places];
    if (!term) return list.slice(0, 5);
    return list
      .filter((p) => p.toLowerCase().includes(term))
      .slice(0, 8);
  }, [term]);

  // Saved trips — only loaded once when overlay opens.
  useEffect(() => {
    if (open) {
      try {
        setTrips(loadTrips());
      } catch {}
    }
  }, [open]);
  const tripHits = useMemo(() => {
    if (!term) return trips.slice(0, 4);
    return trips
      .filter(
        (t) =>
          t.destination.toLowerCase().includes(term) ||
          t.origin.toLowerCase().includes(term) ||
          t.vibes.some((v) => v.toLowerCase().includes(term))
      )
      .slice(0, 6);
  }, [trips, term]);

  if (!open) return null;

  function close() {
    setOpen(false);
  }
  function go(href: string) {
    close();
    router.push(href);
  }

  return (
    <div
      className="fixed inset-0 z-[78] flex items-start justify-center pt-20 px-4"
      role="dialog"
      aria-label="Search"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={close}
      />
      <div
        className="relative w-full max-w-xl rounded-2xl border border-[var(--border-strong)] shadow-2xl overflow-hidden"
        style={{ background: "var(--background-soft)" }}
      >
        {/* Search bar */}
        <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-3">
          <SearchIcon
            size={16}
            strokeWidth={1.75}
            className="text-[var(--muted)] shrink-0"
          />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search travelers, places, hashtags, your trips…"
            className="flex-1 bg-transparent border-0 outline-none text-base placeholder:text-[var(--muted)]"
          />
          <button
            onClick={close}
            className="text-[var(--muted)] hover:text-white"
            aria-label="Close"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          {userHits.length > 0 && (
            <Section title="People">
              <ul className="space-y-1">
                {userHits.map((u) => (
                  <li key={u.id}>
                    <button
                      onClick={() => go(`/u/${u.username}`)}
                      className="w-full flex items-center gap-3 rounded-lg p-2 hover:bg-white/5 text-left"
                    >
                      <div
                        className="h-9 w-9 rounded-full shrink-0"
                        style={avatarStyle(u.hue)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {u.displayName}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] truncate">
                          @{u.username} · {u.bio}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tagHits.length > 0 && (
            <Section title="Hashtags">
              <ul className="flex flex-wrap gap-1.5">
                {tagHits.map((t) => (
                  <li key={t}>
                    <Link
                      href={`/tag/${t}`}
                      onClick={close}
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 text-[var(--accent)] px-3 py-1.5 text-xs hover:border-[var(--accent)]/60"
                    >
                      <Hash size={11} strokeWidth={2} />
                      {t}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {placeHits.length > 0 && (
            <Section title="Places">
              <ul className="space-y-1">
                {placeHits.map((p) => (
                  <li key={p}>
                    <button
                      onClick={() => go(`/plan?destination=${encodeURIComponent(p)}`)}
                      className="w-full flex items-center gap-3 rounded-lg p-2 hover:bg-white/5 text-left"
                    >
                      <div className="h-9 w-9 rounded-lg bg-[var(--card-strong)] flex items-center justify-center text-[var(--muted)] shrink-0">
                        <MapPin size={14} strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{p}</div>
                        <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--accent)] flex items-center gap-1">
                          <Sparkles size={9} strokeWidth={2.4} />
                          Plan a trip here
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {tripHits.length > 0 && (
            <Section title="Your trips">
              <ul className="space-y-1">
                {tripHits.map((t) => (
                  <li key={t.id}>
                    <button
                      onClick={() => go(`/trips/${t.id}`)}
                      className="w-full flex items-center gap-3 rounded-lg p-2 hover:bg-white/5 text-left"
                    >
                      <div className="h-9 w-9 rounded-lg bg-[var(--card-strong)] flex items-center justify-center text-lg shrink-0">
                        ✈
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {routeSummary(t)}
                          {isMultiStop(t) && (
                            <span className="ml-1 text-[10px] text-[var(--muted)] font-mono uppercase tracking-[0.14em]">
                              · {(t.stops ?? []).length} stops
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[var(--muted)] truncate">
                          {t.startDate} → {t.endDate}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {!term && (
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)] px-1 pt-2">
              Tip — press{" "}
              <kbd className="px-1.5 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--card-strong)] font-mono text-[10px]">
                /
              </kbd>{" "}
              from any page to open search.
            </div>
          )}

          {term &&
            userHits.length === 0 &&
            tagHits.length === 0 &&
            placeHits.length === 0 &&
            tripHits.length === 0 && (
              <div className="text-center py-10 text-sm text-[var(--muted)]">
                Nothing matches&nbsp;
                <span className="text-white">&quot;{q}&quot;</span>.
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2 px-1">
        // {title}
      </div>
      {children}
    </div>
  );
}
