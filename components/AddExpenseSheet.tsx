"use client";

// Bottom-sheet (mobile) / modal (desktop) for adding an expense fast. Includes:
// - Amount + currency (auto-converts to USD via /api/intel/fx)
// - Category chips
// - Who paid + who splits (multi-select)
// - Optional notes
// - Receipt upload that runs through the vision API to pre-fill amount + vendor

import { useEffect, useRef, useState } from "react";
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
} from "@/lib/expenses";
import { toast } from "@/lib/toast";
import type { ExpenseCategory, TripExpense } from "@/lib/types";

const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "MXN", "CAD", "AUD"];

const CATEGORIES: ExpenseCategory[] = [
  "lodging",
  "transport",
  "parking",
  "food",
  "activities",
  "groceries",
  "shopping",
  "fees",
  "other",
];

export default function AddExpenseSheet({
  open,
  people,
  defaultPayer,
  onClose,
  onSave,
}: {
  open: boolean;
  people: string[];
  defaultPayer: string;
  onClose: () => void;
  onSave: (e: TripExpense) => void;
}) {
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("food");
  const [paidBy, setPaidBy] = useState(defaultPayer);
  const [splitAmong, setSplitAmong] = useState<string[]>(people);
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptDataUri, setReceiptDataUri] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedByAi, setParsedByAi] = useState(false);
  const [fxRate, setFxRate] = useState<number | null>(null); // 1 unit currency in USD
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSplitAmong(people);
    setPaidBy(defaultPayer);
  }, [open, people, defaultPayer]);

  // Pull live FX whenever the user changes currency.
  useEffect(() => {
    if (currency === "USD") {
      setFxRate(1);
      return;
    }
    let aborted = false;
    fetch(`/api/intel/fx?base=USD`)
      .then((r) => r.json())
      .then((data) => {
        if (aborted || !data?.ok) return;
        const perDollar = (data.rates as Record<string, number>)[currency];
        if (perDollar && perDollar > 0) setFxRate(1 / perDollar);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, [currency]);

  if (!open) return null;

  const amt = Number(amount) || 0;
  const usd = currency === "USD" ? amt : amt * (fxRate ?? 1);

  function toggleSplit(p: string) {
    setSplitAmong((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  }

  async function handleReceipt(file: File) {
    setReceiptDataUri(URL.createObjectURL(file));
    setParseError(null);
    setParsing(true);
    try {
      const fd = new FormData();
      fd.append("image", file);
      fd.append(
        "context",
        "This is a travel-trip receipt. Extract amount, currency, vendor, and a category. Return your usual JSON shape."
      );
      const res = await fetch("/api/agent/vision", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);

      // Best-effort fill from facts (the schema is loose so we look for common labels).
      const facts: { label: string; value: string }[] = data.detected?.facts ?? [];
      const lower = (s: string) => s.toLowerCase();
      const findFact = (...needles: string[]) =>
        facts.find((f) =>
          needles.some((n) => lower(f.label).includes(n))
        )?.value;

      const amountFact = findFact("amount", "total", "price", "fare");
      if (amountFact) {
        const m = amountFact.match(/[\d,]+(\.\d+)?/);
        if (m) setAmount(m[0].replace(/,/g, ""));
      }
      const currencyFact = findFact("currency");
      if (currencyFact) {
        const m = currencyFact.match(/[A-Z]{3}/);
        if (m) setCurrency(m[0]);
      }
      const vendorFact = findFact("vendor", "merchant", "carrier", "hotel", "name");
      if (vendorFact) setDescription(vendorFact);

      // Map the kind to a category.
      const kind = data.detected?.kind ?? "";
      if (kind === "hotel-confirmation") setCategory("lodging");
      else if (kind === "flight-confirmation" || kind === "rental-car") setCategory("transport");
      else if (kind === "restaurant-reservation" || kind === "menu") setCategory("food");
      else if (kind === "ticket-or-event") setCategory("activities");
      else if (kind === "receipt") setCategory("other");
      setParsedByAi(true);
      toast.success("Receipt parsed — review and save");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't parse");
    } finally {
      setParsing(false);
    }

    // Stash the data URI for record-keeping (resize-free for now; capped by browser).
    const reader = new FileReader();
    reader.onload = () => setReceiptDataUri(reader.result as string);
    reader.readAsDataURL(file);
  }

  function save() {
    if (!amt || amt <= 0) {
      toast.error("Enter an amount");
      return;
    }
    if (!description.trim()) {
      toast.error("What was this for?");
      return;
    }
    if (splitAmong.length === 0) {
      toast.error("Pick at least one person to split with");
      return;
    }
    const expense: TripExpense = {
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      description: description.trim(),
      amountUsd: Math.round(usd * 100) / 100,
      amountOriginal: amt,
      currency,
      fxRateUsdPer: fxRate ?? undefined,
      paidBy,
      splitAmong: [...new Set(splitAmong)],
      splitMode: "equal",
      category,
      date,
      notes: notes.trim() || undefined,
      receiptDataUri: receiptDataUri ?? undefined,
      parsedByAi,
    };
    onSave(expense);
    reset();
    onClose();
  }

  function reset() {
    setAmount("");
    setDescription("");
    setNotes("");
    setReceiptDataUri(null);
    setParsedByAi(false);
    setParseError(null);
  }

  return (
    <div
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center"
      role="dialog"
      aria-label="Add expense"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl border border-[var(--border-strong)] shadow-2xl p-5"
        style={{
          background: "var(--background-soft)",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)",
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
              // ADD EXPENSE
            </div>
            <h3 className="text-xl font-semibold mt-1">New expense</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-[var(--muted)] hover:text-white text-2xl leading-none"
          >
            ×
          </button>
        </div>

        {/* Receipt upload — runs through vision API */}
        <div className="mb-4">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleReceipt(f);
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={parsing}
            className="w-full rounded-xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--card-strong)] hover:border-[var(--accent)] py-3 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {parsing ? (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
                Reading receipt…
              </>
            ) : receiptDataUri ? (
              <>
                ✓ Receipt attached{parsedByAi && " · auto-filled from photo"}
              </>
            ) : (
              <>📷 Snap or upload receipt (optional)</>
            )}
          </button>
          {parseError && (
            <div className="mt-2 text-xs text-rose-300">{parseError}</div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mb-1">
              Amount
            </label>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="input text-2xl font-semibold"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mb-1">
              Currency
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="input"
            >
              {COMMON_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        {currency !== "USD" && fxRate && (
          <div className="mt-1 text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.16em]">
            ≈ ${usd.toFixed(2)} USD · live rate
          </div>
        )}

        <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mt-4 mb-1">
          What was this for?
        </label>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Sushi dinner, hotel night 2, parking…"
          className="input"
        />

        <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mt-4 mb-1">
          Category
        </label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => {
            const active = category === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-full border px-2.5 py-1.5 text-xs flex items-center gap-1 transition ${
                  active
                    ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                    : "border-[var(--border)] hover:bg-white/5"
                }`}
              >
                <span aria-hidden>{CATEGORY_ICON[c]}</span>
                <span>{CATEGORY_LABEL[c]}</span>
              </button>
            );
          })}
        </div>

        {people.length > 1 && (
          <>
            <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mt-4 mb-1">
              Who paid?
            </label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="input"
            >
              {people.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>

            <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mt-4 mb-1">
              Split between
            </label>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSplitAmong(people)}
                className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:text-white"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSplitAmong([paidBy])}
                className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:text-white"
              >
                Just me
              </button>
              {people.map((p) => {
                const active = splitAmong.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleSplit(p)}
                    className={`rounded-full border px-2.5 py-1 text-xs transition ${
                      active
                        ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                        : "border-[var(--border)] hover:bg-white/5"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
            {splitAmong.length > 0 && amt > 0 && (
              <div className="mt-2 text-[11px] text-[var(--muted)]">
                ${(usd / splitAmong.length).toFixed(2)} per person
              </div>
            )}
          </>
        )}

        <details className="mt-4">
          <summary className="text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] cursor-pointer hover:text-white">
            More options
          </summary>
          <div className="mt-3 space-y-3">
            <div>
              <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </div>
            <div>
              <label className="block text-xs font-mono uppercase tracking-[0.16em] text-[var(--muted)] mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className="input"
                placeholder="Optional"
              />
            </div>
          </div>
        </details>

        <div className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="btn-ghost flex-1 px-4 py-2.5 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="btn-primary flex-1 px-4 py-2.5 text-sm font-medium"
          >
            Save expense
          </button>
        </div>
      </div>
    </div>
  );
}
