"use client";

import { useMemo, useRef, useState } from "react";
import {
  Car,
  Hotel as HotelIcon,
  type LucideIcon,
  Plane,
  Ship,
  Ticket,
  TrainFront,
  Utensils,
} from "lucide-react";
import {
  type Confirmation,
  type ConfirmationType,
  type CategoryTotal,
  formatMoney,
  summarize,
} from "@/lib/wallet";
import { vendorLogoUrl } from "@/lib/wallet-rules";
import { qrDataUrl } from "@/lib/qr";
import { mockFlightStatus } from "@/lib/disruptions";

export const CATEGORY_META: Record<
  ConfirmationType,
  { label: string; Icon: LucideIcon; accent: string }
> = {
  flight: { label: "Flight", Icon: Plane, accent: "#22d3ee" },
  hotel: { label: "Hotel", Icon: HotelIcon, accent: "#a78bfa" },
  car: { label: "Rental car", Icon: Car, accent: "#f59e0b" },
  restaurant: { label: "Dining", Icon: Utensils, accent: "#fb7185" },
  activity: { label: "Activity", Icon: Ticket, accent: "#34d399" },
  train: { label: "Train", Icon: TrainFront, accent: "#60a5fa" },
  cruise: { label: "Cruise", Icon: Ship, accent: "#38bdf8" },
};

export function formatDate(s: string): string {
  return new Date(s).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function FlightStatusBadge({ c }: { c: Confirmation }) {
  const snap = mockFlightStatus(c);
  const palette: Record<string, string> = {
    "on-time": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    boarding: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    delayed: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    cancelled: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    arrived: "bg-white/10 text-[var(--muted)] border-[var(--border)]",
    scheduled: "bg-white/10 text-[var(--muted)] border-[var(--border)]",
  };
  const label =
    snap.status === "delayed"
      ? `Delayed +${snap.delayMinutes}m`
      : snap.status.replace(/-/g, " ");
  const cls = palette[snap.status] ?? palette.scheduled;
  return (
    <div className="mt-1 inline-flex items-center gap-2 flex-wrap text-[10px]">
      <span
        className={`uppercase tracking-wider px-1.5 py-0.5 rounded border font-medium ${cls}`}
      >
        {label}
      </span>
      {snap.gate && (
        <span className="text-[var(--muted)] font-mono">
          Gate {snap.gate} · T{snap.terminal}
        </span>
      )}
    </div>
  );
}

// Brand logo with graceful fallback to the category Lucide icon. Clearbit
// returns 404 for unknown domains, so we render the fallback if loading fails.
function BrandLogo({
  vendor,
  type,
  size = 32,
  px = 64,
}: {
  vendor: string;
  type: ConfirmationType;
  /** Rendered size in pixels. */
  size?: number;
  /** Pixel resolution to request from Clearbit. */
  px?: number;
}) {
  const meta = CATEGORY_META[type];
  const url = vendorLogoUrl(vendor, px);
  const [errored, setErrored] = useState(false);
  const showLogo = url && !errored;

  return (
    <div
      className="flex-none flex items-center justify-center rounded-lg overflow-hidden"
      style={{
        width: size,
        height: size,
        background: showLogo ? "#ffffff" : `${meta.accent}1a`,
        color: meta.accent,
        boxShadow: showLogo ? "0 0 0 1px var(--border)" : `0 0 24px ${meta.accent}33 inset`,
      }}
      aria-hidden
    >
      {showLogo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url!}
          alt=""
          width={size}
          height={size}
          style={{ width: size, height: size, objectFit: "contain" }}
          onError={() => setErrored(true)}
          loading="lazy"
        />
      ) : (
        <meta.Icon size={Math.round(size * 0.55)} strokeWidth={1.75} />
      )}
    </div>
  );
}

// ============================================================================
// Card (used by wallet + share view)
// ============================================================================

export function ConfirmationCard({
  c,
  onUpdate,
  onDelete,
  readOnly,
}: {
  c: Confirmation;
  onUpdate?: (p: Partial<Confirmation>) => void;
  onDelete?: () => void;
  readOnly?: boolean;
}) {
  const meta = CATEGORY_META[c.type];
  const [editing, setEditing] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [drag, setDrag] = useState(0);
  const startX = useRef<number | null>(null);

  const date = formatDate(c.date);

  function onTouchStart(e: React.TouchEvent) {
    if (readOnly) return;
    startX.current = e.touches[0].clientX;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (readOnly || startX.current == null) return;
    const dx = e.touches[0].clientX - startX.current;
    if (dx < 0) setDrag(Math.max(dx, -120));
  }
  function onTouchEnd() {
    if (readOnly) return;
    if (drag < -80) {
      if (typeof window !== "undefined" && window.confirm("Delete this confirmation?")) {
        onDelete?.();
        return;
      }
    }
    setDrag(0);
    startX.current = null;
  }

  if (editing && !readOnly) {
    return (
      <EditCard
        c={c}
        onCancel={() => setEditing(false)}
        onSave={(patch) => {
          onUpdate?.(patch);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div className="relative overflow-hidden">
      {drag < -10 && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-6 text-[var(--danger)] font-medium text-sm pointer-events-none">
          Release to delete
        </div>
      )}
      <div
        className="steel p-5 transition-transform"
        style={{ transform: drag ? `translateX(${drag}px)` : undefined }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandLogo vendor={c.vendor} type={c.type} size={36} px={72} />
            <div className="min-w-0">
              <div className="font-bold truncate">{c.title}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
                {c.vendor} · {meta.label}
              </div>
              {c.type === "flight" && <FlightStatusBadge c={c} />}
            </div>
          </div>
          <div className="text-right flex-none">
            {c.totalOriginal != null && c.currency ? (
              <>
                <div className="text-lg font-bold tracking-tight">
                  {formatMoney(c.totalOriginal, c.currency)}
                </div>
                {c.currency !== "USD" && c.totalUsd != null && (
                  <div className="text-[11px] text-[var(--muted)]">
                    ≈ {formatMoney(c.totalUsd, "USD")}
                  </div>
                )}
              </>
            ) : c.totalUsd != null ? (
              <div className="text-lg font-bold tracking-tight">
                {formatMoney(c.totalUsd, "USD")}
              </div>
            ) : null}
          </div>
        </div>

        {(c.from || c.to) && (
          <div className="mt-3 text-sm font-medium flex items-center gap-2">
            <span>{c.from ?? "—"}</span>
            <span className="text-[var(--muted)]">→</span>
            <span>{c.to ?? "—"}</span>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-[var(--muted)]">When</div>
            <div className="font-medium mt-0.5">
              {date}
              {c.time ? ` · ${c.time}` : ""}
              {c.endDate ? ` → ${formatDate(c.endDate)}` : ""}
            </div>
          </div>
          <div>
            <div className="text-[var(--muted)]">Reference</div>
            <button
              onClick={() => setShowQr((v) => !v)}
              className="font-medium mt-0.5 font-mono tracking-wide hover:text-[var(--accent)] transition-colors"
              title="Show QR"
            >
              {c.reference}
            </button>
          </div>
        </div>

        {showQr && (
          <div className="mt-4 flex items-center justify-center bg-white rounded-md p-3">
            <img
              src={qrDataUrl(c.reference, { size: 160 })}
              alt={`QR code for ${c.reference}`}
              width={160}
              height={160}
            />
          </div>
        )}

        {!readOnly && (
          <div className="mt-4 flex items-center justify-end gap-3 text-xs text-[var(--muted)]">
            <button
              onClick={() => setShowQr((v) => !v)}
              className="hover:text-[var(--foreground)]"
            >
              {showQr ? "Hide QR" : "Show QR"}
            </button>
            <span className="opacity-30">·</span>
            <button
              onClick={() => setEditing(true)}
              className="hover:text-[var(--foreground)]"
            >
              Edit
            </button>
            <span className="opacity-30">·</span>
            <button
              onClick={() => {
                if (
                  typeof window !== "undefined" &&
                  window.confirm("Delete this confirmation?")
                ) {
                  onDelete?.();
                }
              }}
              className="hover:text-[var(--danger)]"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function EditCard({
  c,
  onCancel,
  onSave,
}: {
  c: Confirmation;
  onCancel: () => void;
  onSave: (patch: Partial<Confirmation>) => void;
}) {
  const [title, setTitle] = useState(c.title);
  const [vendor, setVendor] = useState(c.vendor);
  const [reference, setReference] = useState(c.reference);
  const [date, setDate] = useState(c.date);
  const [endDate, setEndDate] = useState(c.endDate ?? "");
  const [time, setTime] = useState(c.time ?? "");
  const [from, setFrom] = useState(c.from ?? "");
  const [to, setTo] = useState(c.to ?? "");
  const [amount, setAmount] = useState(
    c.totalOriginal != null
      ? String(c.totalOriginal)
      : c.totalUsd != null
        ? String(c.totalUsd)
        : ""
  );
  const [currency, setCurrency] = useState(c.currency ?? "USD");

  return (
    <div className="steel p-5">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Title">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Vendor">
          <input className="input" value={vendor} onChange={(e) => setVendor(e.target.value)} />
        </Field>
        <Field label="Reference">
          <input
            className="input"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="End date">
          <input
            className="input"
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
        <Field label="Time">
          <input className="input" value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="From">
          <input className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <input className="input" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Amount">
          <input
            className="input"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </Field>
        <Field label="Currency">
          <select
            className="input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {[
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
            ].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={onCancel} className="btn-steel px-4 py-2 text-sm">
          Cancel
        </button>
        <button
          onClick={() => {
            const num = parseFloat(amount);
            onSave({
              title,
              vendor,
              reference: reference.toUpperCase(),
              date,
              endDate: endDate || undefined,
              time: time || undefined,
              from: from || undefined,
              to: to || undefined,
              totalOriginal: !isNaN(num) ? num : undefined,
              currency: !isNaN(num) ? currency : undefined,
            });
          }}
          className="btn-primary px-5 py-2 text-sm"
        >
          Save
        </button>
      </div>
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

// ============================================================================
// Timeline view
// ============================================================================

export function TimelineView({ items }: { items: Confirmation[] }) {
  const days = useMemo(() => {
    const m: Record<string, Confirmation[]> = {};
    for (const c of items) {
      (m[c.date] ??= []).push(c);
      if (c.endDate && c.endDate > c.date) {
        const start = new Date(c.date);
        const end = new Date(c.endDate);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const key = d.toISOString().slice(0, 10);
          if (key !== c.date) {
            (m[key] ??= []).push({ ...c, time: undefined });
          }
        }
      }
    }
    return Object.entries(m)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, list]) => ({
        date,
        items: list.sort((a, b) =>
          (a.time ?? "00:00").localeCompare(b.time ?? "00:00")
        ),
      }));
  }, [items]);

  if (days.length === 0) {
    return (
      <div className="steel mt-10 p-12 text-center text-[var(--muted)]">
        Nothing on the timeline yet.
      </div>
    );
  }

  return (
    <div className="mt-6 relative">
      <div className="absolute left-[88px] top-0 bottom-0 w-px bg-[var(--border-strong)]" />
      <div className="space-y-6">
        {days.map((day) => (
          <div key={day.date} className="relative">
            <div className="flex items-start gap-6">
              <div className="w-20 flex-none text-right">
                <div className="text-xs uppercase text-[var(--muted)] tracking-wider">
                  {new Date(day.date).toLocaleDateString(undefined, {
                    weekday: "short",
                  })}
                </div>
                <div className="text-2xl font-bold leading-none mt-1">
                  {new Date(day.date).getDate()}
                </div>
                <div className="text-xs text-[var(--muted)] mt-1">
                  {new Date(day.date).toLocaleDateString(undefined, { month: "short" })}
                </div>
              </div>
              <div className="relative flex-none mt-2">
                <div className="h-3 w-3 rounded-full bg-[var(--accent)] glow-ring relative z-10" />
              </div>
              <div className="flex-1 space-y-2 pb-2">
                {day.items.map((c) => (
                  <TimelineItem key={c.id + day.date} c={c} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimelineItem({ c }: { c: Confirmation }) {
  const meta = CATEGORY_META[c.type];
  return (
    <div
      className="steel p-3 flex items-center gap-3"
      style={{ borderLeft: `3px solid ${meta.accent}` }}
    >
      <BrandLogo vendor={c.vendor} type={c.type} size={28} px={56} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">{c.title}</div>
        <div className="text-xs text-[var(--muted)] truncate">
          {c.vendor}
          {c.from && c.to ? ` · ${c.from} → ${c.to}` : ""}
        </div>
      </div>
      <div className="text-right flex-none">
        <div className="text-sm font-mono">{c.time ?? "—"}</div>
        {c.totalOriginal != null && c.currency && (
          <div className="text-[11px] text-[var(--muted)]">
            {formatMoney(c.totalOriginal, c.currency)}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Spending dashboard
// ============================================================================

export function SpendingView({
  summary,
}: {
  summary: ReturnType<typeof summarize>;
}) {
  const max = Math.max(1, ...summary.byType.map((t) => t.totalUsd));
  const total = summary.totalUsd;
  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="steel p-6">
        <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
          Total spend
        </div>
        <div className="text-4xl font-bold tracking-tight mt-2">
          {formatMoney(total, "USD")}
        </div>
        <div className="text-xs text-[var(--muted)] mt-2">
          across {summary.byType.reduce((s, b) => s + b.count, 0)} confirmations
        </div>

        <div className="mt-6 space-y-3">
          {summary.byType.map((row) => (
            <CategoryBar key={row.type} row={row} max={max} />
          ))}
        </div>
      </div>

      <div className="steel p-6">
        <div className="text-xs text-[var(--muted)] uppercase tracking-wider">
          Category mix
        </div>
        <DonutChart byType={summary.byType} />
        {summary.byCurrency.length > 0 && (
          <div className="mt-6">
            <div className="text-xs text-[var(--muted)] uppercase tracking-wider mb-2">
              By currency
            </div>
            <div className="space-y-2">
              {summary.byCurrency.map((cur) => (
                <div
                  key={cur.currency}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="font-mono">{cur.currency}</div>
                  <div className="text-right">
                    <div>{formatMoney(cur.totalOriginal, cur.currency)}</div>
                    {cur.currency !== "USD" && (
                      <div className="text-[11px] text-[var(--muted)]">
                        ≈ {formatMoney(cur.totalUsd, "USD")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CategoryBar({ row, max }: { row: CategoryTotal; max: number }) {
  const meta = CATEGORY_META[row.type];
  const pct = max > 0 ? (row.totalUsd / max) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <div className="flex items-center gap-2">
          <span style={{ color: meta.accent }} aria-hidden>
            <meta.Icon size={14} strokeWidth={1.75} />
          </span>
          <span>{meta.label}</span>
          <span className="text-[var(--muted)] text-xs">({row.count})</span>
        </div>
        <div className="font-mono">{formatMoney(row.totalUsd, "USD")}</div>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: meta.accent }}
        />
      </div>
    </div>
  );
}

function DonutChart({ byType }: { byType: CategoryTotal[] }) {
  const total = byType.reduce((s, b) => s + b.totalUsd, 0);
  if (total <= 0) {
    return (
      <div className="mt-6 text-sm text-[var(--muted)]">
        Add bookings with amounts to see the breakdown.
      </div>
    );
  }
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  // Precompute cumulative offsets so the render path is purely functional.
  const segments = byType.reduce<{ offset: number; rows: { row: CategoryTotal; offset: number }[] }>(
    (acc, row) => {
      const frac = row.totalUsd / total;
      if (frac <= 0) return acc;
      acc.rows.push({ row, offset: acc.offset });
      acc.offset += circumference * frac;
      return acc;
    },
    { offset: 0, rows: [] }
  ).rows;
  return (
    <div className="mt-4 flex items-center gap-6">
      <svg width="160" height="160" viewBox="-80 -80 160 160" className="flex-none">
        <circle r={radius} fill="none" stroke="var(--border)" strokeWidth="18" />
        {segments.map(({ row, offset }) => {
          const frac = row.totalUsd / total;
          const len = circumference * frac;
          const dasharray = `${len} ${circumference - len}`;
          return (
            <circle
              key={row.type}
              r={radius}
              fill="none"
              stroke={CATEGORY_META[row.type].accent}
              strokeWidth="18"
              strokeDasharray={dasharray}
              strokeDashoffset={-offset}
              transform="rotate(-90)"
            />
          );
        })}
      </svg>
      <div className="flex-1 space-y-1.5 text-xs">
        {byType.map((row) => {
          const frac = total > 0 ? (row.totalUsd / total) * 100 : 0;
          return (
            <div key={row.type} className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: CATEGORY_META[row.type].accent }}
                />
                {CATEGORY_META[row.type].label}
              </span>
              <span className="font-mono text-[var(--muted)]">
                {frac.toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
