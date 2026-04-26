"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  ChevronDown,
  ChevronUp,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import {
  generatePacking,
  loadPacking,
  savePacking,
  type PackingCategory,
  type PackingItem,
} from "@/lib/packing";
import type { Trip } from "@/lib/types";

const CATEGORY_TITLES: Record<PackingCategory, string> = {
  clothes: "Clothes",
  toiletries: "Toiletries",
  electronics: "Electronics",
  documents: "Documents",
  medications: "Medications",
  gear: "Gear",
};

export function TripPackingPanel({
  trip,
  storageKey,
}: {
  trip: Trip;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const v = window.localStorage.getItem(storageKey);
    if (v === "1") setOpen(true);
  }, [storageKey]);

  const [items, setItems] = useState<PackingItem[]>(() => loadPacking(trip.id));
  const [newItem, setNewItem] = useState("");
  const [newCat, setNewCat] = useState<PackingCategory>("clothes");

  function persist(next: PackingItem[]) {
    setItems(next);
    savePacking(trip.id, next);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  function regenerate() {
    persist(generatePacking(trip));
  }

  function addItem() {
    if (!newItem.trim()) return;
    persist([
      ...items,
      {
        id: `pck-c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tripId: trip.id,
        category: newCat,
        label: newItem.trim(),
        packed: false,
        custom: true,
      },
    ]);
    setNewItem("");
  }

  const grouped = useMemo(() => {
    const m: Record<PackingCategory, PackingItem[]> = {
      clothes: [],
      toiletries: [],
      electronics: [],
      documents: [],
      medications: [],
      gear: [],
    };
    for (const it of items) m[it.category].push(it);
    return m;
  }, [items]);

  const total = items.length;
  const packed = items.filter((i) => i.packed).length;

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Briefcase
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left min-w-0">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              PACKING LIST
            </div>
            <div className="text-sm mt-0.5 truncate">
              {total === 0
                ? "Generate a list tailored to this trip"
                : `${packed} of ${total} packed`}
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
        <div className="border-t border-[var(--edge)] px-6 py-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-[var(--muted)]">
              Suggestions based on destination, season, trip length, and your
              preferences.
            </div>
            <button
              onClick={regenerate}
              className="btn-steel px-3 py-1.5 text-xs inline-flex items-center gap-2"
            >
              <RefreshCw size={12} strokeWidth={1.75} aria-hidden />
              {total === 0 ? "Generate" : "Regenerate"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {(Object.keys(grouped) as PackingCategory[]).map((cat) => {
              const list = grouped[cat];
              if (list.length === 0) return null;
              return (
                <div key={cat} className="border border-[var(--border)] rounded-lg p-3">
                  <div className="text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase mb-2">
                    {CATEGORY_TITLES[cat]}
                  </div>
                  <ul className="space-y-1.5">
                    {list.map((it) => (
                      <li key={it.id} className="flex items-center gap-2 group">
                        <button
                          type="button"
                          onClick={() =>
                            persist(
                              items.map((x) =>
                                x.id === it.id ? { ...x, packed: !x.packed } : x
                              )
                            )
                          }
                          className={`flex-none h-4 w-4 rounded border ${
                            it.packed
                              ? "bg-[var(--accent)] border-[var(--accent)]"
                              : "border-[var(--border-strong)]"
                          }`}
                          aria-pressed={it.packed}
                        />
                        <span
                          className={`text-sm flex-1 ${
                            it.packed
                              ? "line-through text-[var(--muted)]"
                              : ""
                          }`}
                        >
                          {it.label}
                        </span>
                        <button
                          onClick={() =>
                            persist(items.filter((x) => x.id !== it.id))
                          }
                          className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--danger)]"
                          aria-label="Remove"
                        >
                          <Trash2 size={12} strokeWidth={1.75} aria-hidden />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              className="input flex-1"
              placeholder="Add an item…"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addItem();
              }}
            />
            <select
              className="input"
              style={{ width: "auto", padding: "8px 12px", fontSize: 13 }}
              value={newCat}
              onChange={(e) => setNewCat(e.target.value as PackingCategory)}
            >
              {(Object.keys(CATEGORY_TITLES) as PackingCategory[]).map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_TITLES[c]}
                </option>
              ))}
            </select>
            <button
              onClick={addItem}
              className="btn-primary px-3 py-2 text-xs inline-flex items-center gap-1"
            >
              <Plus size={12} strokeWidth={1.75} aria-hidden />
              Add
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
