"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronUp, Coins } from "lucide-react";
import { USD_RATES } from "@/lib/wallet-rules";
import { detectLocale } from "@/lib/locale-detect";

const COMMON = [1, 5, 10, 20, 50, 100];

const DESTINATION_CURRENCY: { match: RegExp; code: string }[] = [
  { match: /tokyo|japan|kyoto|osaka/i, code: "JPY" },
  { match: /seoul|korea/i, code: "KRW" },
  { match: /bangkok|thailand/i, code: "THB" },
  { match: /paris|france|lyon/i, code: "EUR" },
  { match: /rome|italy|milan|venice/i, code: "EUR" },
  { match: /madrid|spain|barcelona/i, code: "EUR" },
  { match: /berlin|germany|munich/i, code: "EUR" },
  { match: /lisbon|portugal/i, code: "EUR" },
  { match: /amsterdam|netherlands/i, code: "EUR" },
  { match: /london|uk|england|scotland/i, code: "GBP" },
  { match: /toronto|montreal|vancouver|canada/i, code: "CAD" },
  { match: /sydney|melbourne|australia/i, code: "AUD" },
  { match: /mumbai|delhi|bangalore|india/i, code: "INR" },
  { match: /shanghai|beijing|china/i, code: "CNY" },
  { match: /mexico/i, code: "MXN" },
  { match: /switzerland|zurich|geneva/i, code: "CHF" },
];

export function detectDestinationCurrency(destination?: string): string {
  if (!destination) return "USD";
  for (const e of DESTINATION_CURRENCY) {
    if (e.match.test(destination)) return e.code;
  }
  return "USD";
}

export function CurrencyConverter({
  destination,
  initialAmount = 100,
  storageKey = "voyage:currency-converter:open",
}: {
  destination?: string;
  initialAmount?: number;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(false);
  // "from" defaults to user's home currency (London → GBP, Tokyo → JPY).
  const [from, setFrom] = useState(() => {
    if (typeof window === "undefined") return "USD";
    return detectLocale()?.currency ?? "USD";
  });
  const [to, setTo] = useState(detectDestinationCurrency(destination));
  const [amount, setAmount] = useState(initialAmount);
  // Real FX rates fetched from /api/intel/fx; keys are USD-based ratios.
  const [liveRates, setLiveRates] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(storageKey) === "1") setOpen(true);
  }, [storageKey]);

  useEffect(() => {
    setTo(detectDestinationCurrency(destination));
  }, [destination]);

  // Pull live USD-base rates once. open.er-api returns rate-per-USD (1 USD =
  // 0.93 EUR); we invert to match USD_RATES format (1 EUR = 1.07 USD), so the
  // conversion formula stays identical regardless of source.
  useEffect(() => {
    let aborted = false;
    fetch("/api/intel/fx?base=USD")
      .then((r) => r.json())
      .then((data) => {
        if (aborted || !data?.ok) return;
        const inverted: Record<string, number> = {};
        for (const [k, v] of Object.entries(
          data.rates as Record<string, number>
        )) {
          if (typeof v === "number" && v > 0) inverted[k] = 1 / v;
        }
        inverted.USD = 1;
        setLiveRates(inverted);
      })
      .catch(() => {});
    return () => {
      aborted = true;
    };
  }, []);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  const rates = liveRates ?? USD_RATES;
  const result = useMemo(() => {
    const fromUsd = rates[from] ?? 1;
    const toUsd = rates[to] ?? 1;
    return (amount * fromUsd) / toUsd;
  }, [amount, from, to, rates]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <Coins
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)] flex items-center gap-2">
              CURRENCY
              {liveRates && (
                <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-300 tracking-normal font-normal">
                  ● Live
                </span>
              )}
            </div>
            <div className="text-sm mt-0.5">
              1 {from} = {((rates[from] ?? 1) / (rates[to] ?? 1)).toFixed(4)} {to}
            </div>
          </div>
        </div>
        {open ? (
          <ChevronUp size={18} strokeWidth={1.75} aria-hidden />
        ) : (
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden />
        )}
      </button>

      {open && (
        <div className="border-t border-[var(--edge)] px-6 py-5">
          <div className="flex items-end gap-2 flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <div className="text-xs text-[var(--muted)] mb-1">From</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input flex-1"
                  value={amount}
                  onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                />
                <select
                  className="input"
                  style={{ width: "auto", padding: "8px 12px", fontSize: 13 }}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                >
                  {Object.keys(USD_RATES).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              onClick={swap}
              className="btn-steel p-2 mb-0.5"
              aria-label="Swap"
              title="Swap"
            >
              <ArrowLeftRight size={14} strokeWidth={1.75} aria-hidden />
            </button>
            <div className="flex-1 min-w-[120px]">
              <div className="text-xs text-[var(--muted)] mb-1">To</div>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input flex-1"
                  value={Math.round(result * 100) / 100}
                  readOnly
                />
                <select
                  className="input"
                  style={{ width: "auto", padding: "8px 12px", fontSize: 13 }}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                >
                  {Object.keys(USD_RATES).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <div className="text-xs text-[var(--muted)] mb-2">Common amounts</div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
              {COMMON.map((amt) => {
                const r = (amt * (USD_RATES[from] ?? 1)) / (USD_RATES[to] ?? 1);
                return (
                  <button
                    key={amt}
                    onClick={() => setAmount(amt)}
                    className="border border-[var(--border)] rounded-md px-2 py-2 hover:border-[var(--border-strong)] text-left"
                  >
                    <div className="font-mono">
                      {amt} {from}
                    </div>
                    <div className="text-[var(--muted)] mt-0.5">
                      {r.toFixed(2)} {to}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="text-[11px] text-[var(--muted)] mt-3">
            Rates are approximate and cached for offline use. Refresh manually
            for the latest.
          </div>
        </div>
      )}
    </div>
  );
}
