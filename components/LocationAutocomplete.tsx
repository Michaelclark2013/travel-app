"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Globe,
  Home,
  MapPin,
  Plane,
  Search,
  Utensils,
} from "lucide-react";
import {
  homeAirportPlace,
  loadRecentLocations,
  saveRecentLocation,
  searchLocations,
  type LocationData,
} from "@/lib/geocoding";

// Reusable input + dropdown for picking a real place. Two-way binds:
// the visible string + the structured LocationData (when one is picked).
export function LocationAutocomplete({
  value,
  onText,
  onPick,
  selected,
  placeholder,
  className,
  inputClassName = "input",
  showRecent = true,
  autoFocus = false,
}: {
  /** Visible text in the input. Parent owns this so users can free-type. */
  value: string;
  onText: (s: string) => void;
  /** Called when the user picks a real place from the dropdown. */
  onPick?: (loc: LocationData) => void;
  /** The currently-selected structured location (for icons / chip rendering). */
  selected?: LocationData | null;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  showRecent?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<LocationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  const recent = useMemo<LocationData[]>(
    () => (showRecent ? loadRecentLocations() : []),
    [showRecent]
  );
  const home = useMemo(() => (showRecent ? homeAirportPlace() : null), [showRecent]);

  // Click-outside to close.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  // Debounced search on input change.
  useEffect(() => {
    if (debounceRef.current != null) {
      window.clearTimeout(debounceRef.current);
    }
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      const r = await searchLocations(q);
      setResults(r);
      setLoading(false);
      setActiveIdx(-1);
    }, 220);
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [value]);

  const dropdown: { section: "recent" | "home" | "results"; items: LocationData[] }[] =
    [];
  if (open && value.trim().length < 2) {
    if (home) dropdown.push({ section: "home", items: [home] });
    if (recent.length > 0) dropdown.push({ section: "recent", items: recent });
  } else if (open && results.length > 0) {
    dropdown.push({ section: "results", items: results });
  }

  const flat = dropdown.flatMap((s) => s.items);

  function pick(loc: LocationData) {
    onText(loc.fullName);
    onPick?.(loc);
    saveRecentLocation(loc);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(flat.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0 && flat[activeIdx]) {
        e.preventDefault();
        pick(flat[activeIdx]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  let runningIdx = 0;

  return (
    <div ref={wrapperRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <Search
          size={14}
          strokeWidth={1.75}
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
        />
        <input
          type="text"
          className={inputClassName}
          style={{ paddingLeft: 34 }}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          autoFocus={autoFocus}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onText(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          aria-expanded={open}
          aria-autocomplete="list"
          role="combobox"
        />
      </div>

      {open && (dropdown.length > 0 || loading) && (
        <div
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-[var(--background-soft)] border border-[var(--border-strong)] rounded-xl shadow-2xl overflow-hidden"
          role="listbox"
        >
          {loading && (
            <div className="px-4 py-3 text-xs text-[var(--muted)]">
              Searching…
            </div>
          )}
          {dropdown.map((sec) => (
            <div key={sec.section}>
              <div className="px-4 pt-3 pb-1 text-[10px] font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
                {sec.section === "home"
                  ? "Home airport"
                  : sec.section === "recent"
                    ? "Recent"
                    : "Suggestions"}
              </div>
              <ul>
                {sec.items.map((loc) => {
                  const idx = runningIdx++;
                  const active = idx === activeIdx;
                  return (
                    <li key={loc.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          pick(loc);
                        }}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={
                          "w-full text-left px-4 py-2.5 flex items-center gap-3 transition " +
                          (active
                            ? "bg-white/[0.05]"
                            : "hover:bg-white/[0.025]")
                        }
                      >
                        <KindIcon kind={loc.kind} fromHome={sec.section === "home"} />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {loc.iata && loc.kind === "airport"
                              ? `${loc.iata} · ${loc.name}`
                              : loc.name}
                          </div>
                          <div className="text-xs text-[var(--muted)] truncate">
                            {loc.fullName !== loc.name ? loc.fullName : describePlace(loc)}
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {!loading && open && value.trim().length >= 2 && results.length === 0 && (
            <div className="px-4 py-3 text-xs text-[var(--muted)]">
              No matches. Try a city, airport code, or full address.
            </div>
          )}
        </div>
      )}

      {selected && (
        <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--muted)]">
          <KindIcon kind={selected.kind} small />
          <span className="truncate">{selected.fullName}</span>
        </div>
      )}
    </div>
  );
}

function KindIcon({
  kind,
  fromHome,
  small,
}: {
  kind: string;
  fromHome?: boolean;
  small?: boolean;
}) {
  const size = small ? 11 : 14;
  if (fromHome) return <Home size={size} strokeWidth={1.75} aria-hidden />;
  switch (kind) {
    case "airport":
      return <Plane size={size} strokeWidth={1.75} aria-hidden />;
    case "country":
    case "region":
      return <Globe size={size} strokeWidth={1.75} aria-hidden />;
    case "address":
    case "neighborhood":
      return <MapPin size={size} strokeWidth={1.75} aria-hidden />;
    case "poi":
      return <Building2 size={size} strokeWidth={1.75} aria-hidden />;
    default:
      // restaurants from POIs may surface as "poi" but mapbox can't always
      // tell — this fallback keeps the visual consistent.
      return kind === "restaurant" ? (
        <Utensils size={size} strokeWidth={1.75} aria-hidden />
      ) : (
        <MapPin size={size} strokeWidth={1.75} aria-hidden />
      );
  }
}

function describePlace(loc: LocationData): string {
  const parts: string[] = [];
  if (loc.kind && loc.kind !== "city") parts.push(loc.kind);
  if (loc.region) parts.push(loc.region);
  if (loc.country) parts.push(loc.country);
  return parts.join(" · ");
}
