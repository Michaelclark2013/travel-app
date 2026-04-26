"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Plane,
  Hotel as HotelIcon,
  Settings2,
  Plus,
  Trash2,
  Utensils,
  Wallet,
} from "lucide-react";
import type {
  EmergencyContact,
  FrequentFlyerEntry,
  TripPreferences,
} from "@/lib/types";

const DIET_OPTIONS = [
  "Vegetarian",
  "Vegan",
  "Pescatarian",
  "Gluten-free",
  "Dairy-free",
  "Nut allergy",
  "Shellfish allergy",
  "Halal",
  "Kosher",
  "Low-sodium",
];

const CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "CAD",
  "AUD",
  "CHF",
  "MXN",
  "CNY",
  "INR",
  "KRW",
  "THB",
];

export function TripPreferencesPanel({
  value,
  onChange,
  defaultOpen = false,
  storageKey,
}: {
  value: TripPreferences | undefined;
  onChange: (next: TripPreferences) => void;
  defaultOpen?: boolean;
  /** Persist open/closed state across page loads. */
  storageKey?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "1") setOpen(true);
    else if (saved === "0") setOpen(false);
  }, [storageKey]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  const prefs: TripPreferences = value ?? {};

  function patch(p: Partial<TripPreferences>) {
    onChange({ ...prefs, ...p, updatedAt: new Date().toISOString() });
  }

  function summary(): string {
    const bits: string[] = [];
    if (prefs.travelStyle) bits.push(cap(prefs.travelStyle));
    if (prefs.preferredAirline) bits.push(prefs.preferredAirline);
    if (prefs.seatPreference && prefs.seatPreference !== "no-preference") {
      bits.push(`${cap(prefs.seatPreference)} seat`);
    }
    if (prefs.dailyBudgetUsd) bits.push(`$${prefs.dailyBudgetUsd}/day`);
    if (prefs.dietaryRestrictions?.length) {
      bits.push(`${prefs.dietaryRestrictions.length} dietary`);
    }
    return bits.slice(0, 4).join(" · ");
  }

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Settings2
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left min-w-0">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              TRIP PREFERENCES
            </div>
            <div className="text-sm mt-0.5 truncate">
              {summary() || "Set preferences for flights, hotels, dining, and more"}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.75} className="flex-none" aria-hidden />
        ) : (
          <ChevronDown size={18} strokeWidth={1.75} className="flex-none" aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--edge)] px-6 py-5 space-y-6">
          <Section icon={Settings2} title="Travel style">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {(["luxury", "budget", "adventure", "relaxation", "business"] as const).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      patch({ travelStyle: prefs.travelStyle === s ? undefined : s })
                    }
                    className={
                      "px-3 py-2 text-sm rounded-md border transition " +
                      (prefs.travelStyle === s
                        ? "border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]")
                    }
                  >
                    {cap(s)}
                  </button>
                )
              )}
            </div>
          </Section>

          <Section icon={Plane} title="Flights">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Preferred airline">
                <input
                  className="input"
                  placeholder="e.g. Delta, ANA"
                  value={prefs.preferredAirline ?? ""}
                  onChange={(e) =>
                    patch({ preferredAirline: e.target.value || undefined })
                  }
                />
              </Field>
              <Field label="Seat preference">
                <select
                  className="input"
                  value={prefs.seatPreference ?? "no-preference"}
                  onChange={(e) =>
                    patch({ seatPreference: e.target.value as TripPreferences["seatPreference"] })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="window">Window</option>
                  <option value="aisle">Aisle</option>
                  <option value="middle">Middle</option>
                </select>
              </Field>
            </div>
            <FrequentFlyerEditor
              entries={prefs.frequentFlyer ?? []}
              onChange={(frequentFlyer) => patch({ frequentFlyer })}
            />
          </Section>

          <Section icon={HotelIcon} title="Hotels">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Room type">
                <input
                  className="input"
                  placeholder="e.g. Suite, City view"
                  value={prefs.roomType ?? ""}
                  onChange={(e) => patch({ roomType: e.target.value || undefined })}
                />
              </Field>
              <Field label="Bed size">
                <select
                  className="input"
                  value={prefs.bedSize ?? "no-preference"}
                  onChange={(e) =>
                    patch({ bedSize: e.target.value as TripPreferences["bedSize"] })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="twin">Twin</option>
                  <option value="double">Double</option>
                  <option value="queen">Queen</option>
                  <option value="king">King</option>
                </select>
              </Field>
              <Field label="Floor preference">
                <select
                  className="input"
                  value={prefs.floorPreference ?? "no-preference"}
                  onChange={(e) =>
                    patch({
                      floorPreference: e.target.value as TripPreferences["floorPreference"],
                    })
                  }
                >
                  <option value="no-preference">No preference</option>
                  <option value="low">Low floor</option>
                  <option value="mid">Mid floor</option>
                  <option value="high">High floor</option>
                </select>
              </Field>
              <Field label="Smoking">
                <select
                  className="input"
                  value={prefs.smokingPreference ?? "non-smoking"}
                  onChange={(e) =>
                    patch({
                      smokingPreference: e.target
                        .value as TripPreferences["smokingPreference"],
                    })
                  }
                >
                  <option value="non-smoking">Non-smoking</option>
                  <option value="smoking">Smoking</option>
                </select>
              </Field>
            </div>
          </Section>

          <Section icon={Utensils} title="Dining">
            <div className="text-xs text-[var(--muted)] mb-2">Dietary restrictions</div>
            <div className="flex flex-wrap gap-2">
              {DIET_OPTIONS.map((d) => {
                const active = prefs.dietaryRestrictions?.includes(d) ?? false;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      const cur = prefs.dietaryRestrictions ?? [];
                      const next = active ? cur.filter((x) => x !== d) : [...cur, d];
                      patch({
                        dietaryRestrictions: next.length > 0 ? next : undefined,
                      });
                    }}
                    className={
                      "px-3 py-1.5 text-xs rounded-full border transition " +
                      (active
                        ? "border-[var(--accent)] text-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]")
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section icon={Wallet} title="Budget & currency">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Daily budget (USD)">
                <input
                  className="input"
                  inputMode="numeric"
                  placeholder="e.g. 250"
                  value={prefs.dailyBudgetUsd ?? ""}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    patch({ dailyBudgetUsd: isNaN(n) ? undefined : n });
                  }}
                />
              </Field>
              <Field label="Preferred currency">
                <select
                  className="input"
                  value={prefs.preferredCurrency ?? "USD"}
                  onChange={(e) => patch({ preferredCurrency: e.target.value })}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          <Section icon={AlertCircle} title="Safety & insurance">
            <EmergencyContactsEditor
              entries={prefs.emergencyContacts ?? []}
              onChange={(emergencyContacts) => patch({ emergencyContacts })}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
              <Field label="Insurance provider">
                <input
                  className="input"
                  value={prefs.insurance?.provider ?? ""}
                  onChange={(e) =>
                    patch({
                      insurance: { ...prefs.insurance, provider: e.target.value || undefined },
                    })
                  }
                />
              </Field>
              <Field label="Policy number">
                <input
                  className="input"
                  value={prefs.insurance?.policyNumber ?? ""}
                  onChange={(e) =>
                    patch({
                      insurance: {
                        ...prefs.insurance,
                        policyNumber: e.target.value || undefined,
                      },
                    })
                  }
                />
              </Field>
              <Field label="24h support phone">
                <input
                  className="input"
                  value={prefs.insurance?.phone ?? ""}
                  onChange={(e) =>
                    patch({
                      insurance: { ...prefs.insurance, phone: e.target.value || undefined },
                    })
                  }
                />
              </Field>
            </div>
          </Section>

          <Section icon={Settings2} title="Notes">
            <textarea
              className="input"
              rows={3}
              placeholder="Special requirements, accessibility needs, must-do experiences…"
              value={prefs.notes ?? ""}
              onChange={(e) => patch({ notes: e.target.value || undefined })}
              style={{ height: "auto", padding: "12px 14px", fontSize: 13 }}
            />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Plane;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3 text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase">
        <Icon size={14} strokeWidth={1.75} aria-hidden />
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[var(--muted)] mb-1 text-xs">{label}</div>
      {children}
    </label>
  );
}

function FrequentFlyerEditor({
  entries,
  onChange,
}: {
  entries: FrequentFlyerEntry[];
  onChange: (next: FrequentFlyerEntry[] | undefined) => void;
}) {
  function update(idx: number, p: Partial<FrequentFlyerEntry>) {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...p } : e));
    onChange(next.length > 0 ? next : undefined);
  }
  function remove(idx: number) {
    const next = entries.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  }
  return (
    <div className="mt-3">
      <div className="text-xs text-[var(--muted)] mb-2">Frequent flyer numbers</div>
      <div className="space-y-2">
        {entries.map((e, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              className="input flex-none"
              style={{ width: 140 }}
              placeholder="Airline"
              value={e.airline}
              onChange={(ev) => update(i, { airline: ev.target.value })}
            />
            <input
              className="input flex-1"
              placeholder="Number"
              value={e.number}
              onChange={(ev) => update(i, { number: ev.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-2"
              aria-label="Remove"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...entries, { airline: "", number: "" }])}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <Plus size={12} strokeWidth={1.75} aria-hidden />
        Add airline
      </button>
    </div>
  );
}

function EmergencyContactsEditor({
  entries,
  onChange,
}: {
  entries: EmergencyContact[];
  onChange: (next: EmergencyContact[] | undefined) => void;
}) {
  function update(idx: number, p: Partial<EmergencyContact>) {
    const next = entries.map((e, i) => (i === idx ? { ...e, ...p } : e));
    onChange(next.length > 0 ? next : undefined);
  }
  function remove(idx: number) {
    const next = entries.filter((_, i) => i !== idx);
    onChange(next.length > 0 ? next : undefined);
  }
  return (
    <div>
      <div className="text-xs text-[var(--muted)] mb-2">Emergency contacts</div>
      <div className="space-y-2">
        {entries.map((c, i) => (
          <div key={i} className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto] gap-2 items-center">
            <input
              className="input"
              placeholder="Name"
              value={c.name}
              onChange={(ev) => update(i, { name: ev.target.value })}
            />
            <input
              className="input"
              placeholder="Relation"
              value={c.relation}
              onChange={(ev) => update(i, { relation: ev.target.value })}
            />
            <input
              className="input"
              placeholder="Phone"
              value={c.phone}
              onChange={(ev) => update(i, { phone: ev.target.value })}
            />
            <button
              type="button"
              onClick={() => remove(i)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-2 justify-self-end"
              aria-label="Remove"
            >
              <Trash2 size={14} strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() =>
          onChange([...entries, { name: "", relation: "", phone: "" }])
        }
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <Plus size={12} strokeWidth={1.75} aria-hidden />
        Add contact
      </button>
    </div>
  );
}

function cap(s: string): string {
  if (!s) return s;
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
