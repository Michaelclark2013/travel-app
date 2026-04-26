"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  MapPin,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  addCommitment,
  buildDayPlan,
  clearDismissed,
  deleteCommitment,
  dismissSuggestion,
  buildSuggestionSignature,
  eachTripDate,
  formatTimeRange,
  loadCommitments,
  loadCommitmentsAsync,
  loadDismissed,
  tripWallet,
  updateCommitment,
} from "@/lib/commitments";
import type {
  Commitment,
  CommitmentPriority,
  DayPlan,
  DayPlanItem,
  Trip,
} from "@/lib/types";

const SUGGESTION_COLORS: Record<string, string> = {
  meal: "#34d399",
  activity: "#a78bfa",
  transit: "#94a3b8",
  buffer: "#64748b",
};

const WALLET_ICON_COLOR: Record<string, string> = {
  flight: "#22d3ee",
  hotel: "#a78bfa",
  car: "#f59e0b",
  restaurant: "#fb7185",
  activity: "#34d399",
  train: "#60a5fa",
  cruise: "#38bdf8",
};

export function TripCommitmentsPanel({
  trip,
  storageKey,
}: {
  trip: Trip;
  storageKey?: string;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "0") setOpen(false);
    else if (saved === "1") setOpen(true);
  }, [storageKey]);

  const [commitments, setCommitments] = useState<Commitment[]>(() =>
    loadCommitments(trip.id)
  );
  const [editing, setEditing] = useState<Commitment | "new" | null>(null);
  const [dismissedRev, setDismissedRev] = useState(0);

  useEffect(() => {
    let cancelled = false;
    loadCommitmentsAsync(trip.id).then((fresh) => {
      if (!cancelled) setCommitments(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, [trip.id]);

  function refresh() {
    setCommitments(loadCommitments(trip.id));
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (storageKey && typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next ? "1" : "0");
    }
  }

  const dates = useMemo(() => eachTripDate(trip), [trip]);
  const dismissed = useMemo(
    () => loadDismissed(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dismissedRev]
  );
  const wallet = useMemo(() => tripWallet(trip), [trip]);

  const plans: DayPlan[] = useMemo(
    () =>
      dates.map((date) =>
        buildDayPlan({ date, trip, commitments, wallet, dismissed })
      ),
    [dates, trip, commitments, wallet, dismissed]
  );

  return (
    <div className="steel mt-6 overflow-hidden">
      <button
        onClick={toggle}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 hover:bg-white/[0.02] transition"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3 min-w-0">
          <Pin
            size={18}
            strokeWidth={1.75}
            className="text-[var(--accent)] flex-none"
            aria-hidden
          />
          <div className="text-left min-w-0">
            <div className="text-xs font-bold tracking-[0.2em] text-[var(--muted)]">
              FIXED COMMITMENTS
            </div>
            <div className="text-sm mt-0.5 truncate">
              {commitments.length === 0
                ? "Add the things you can't miss — meetings, weddings, conferences"
                : `${commitments.length} pinned · plan filled around them`}
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
        <div className="border-t border-[var(--edge)] px-6 py-5 space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm text-[var(--muted)]">
              Pin meetings, weddings, conferences. We&apos;ll fit suggestions into
              the gaps based on your trip preferences.
            </div>
            <button
              onClick={() => setEditing("new")}
              className="btn-primary px-4 py-2 text-sm inline-flex items-center gap-2"
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden />
              Add commitment
            </button>
          </div>

          {editing && (
            <CommitmentEditor
              trip={trip}
              initial={editing === "new" ? null : editing}
              onCancel={() => setEditing(null)}
              onSave={(c, isNew) => {
                if (isNew) addCommitment(c);
                else updateCommitment(c.id, c);
                setEditing(null);
                refresh();
              }}
              onDelete={(id) => {
                deleteCommitment(id);
                setEditing(null);
                refresh();
              }}
            />
          )}

          {commitments.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {[...commitments]
                .sort((a, b) =>
                  `${a.date} ${a.startTime ?? "00:00"}`.localeCompare(
                    `${b.date} ${b.startTime ?? "00:00"}`
                  )
                )
                .map((c) => (
                  <CommitmentRow
                    key={c.id}
                    c={c}
                    onEdit={() => setEditing(c)}
                  />
                ))}
            </div>
          )}

          <div className="pt-2">
            <div className="text-xs font-bold tracking-[0.18em] text-[var(--muted)] uppercase mb-3">
              Day-by-day plan
            </div>
            <div className="space-y-5">
              {plans.map((plan) => (
                <DayPlanView
                  key={plan.date}
                  plan={plan}
                  trip={trip}
                  onDismiss={(label) => {
                    dismissSuggestion(buildSuggestionSignature(trip.id, plan.date, label));
                    setDismissedRev((n) => n + 1);
                  }}
                  onRereplan={() => {
                    clearDismissed(trip.id, plan.date);
                    setDismissedRev((n) => n + 1);
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// One-row commitment summary
// ============================================================================

function CommitmentRow({
  c,
  onEdit,
}: {
  c: Commitment;
  onEdit: () => void;
}) {
  const dateLabel = new Date(c.date).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return (
    <div className="border border-[var(--border)] rounded-lg p-3 flex items-start gap-3 hover:border-[var(--border-strong)] transition">
      <div
        className="flex-none flex h-8 w-8 items-center justify-center rounded-md"
        style={{
          background: c.priority === "must" ? "var(--accent-soft)" : "rgba(255,255,255,0.04)",
          color: c.priority === "must" ? "var(--accent)" : "var(--muted)",
        }}
        aria-hidden
      >
        <CalendarClock size={15} strokeWidth={1.75} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-medium truncate">{c.title}</div>
        <div className="text-xs text-[var(--muted)] mt-0.5">
          {dateLabel}
          {c.allDay
            ? " · All day"
            : c.startTime
              ? ` · ${c.startTime}${c.endTime ? `–${c.endTime}` : ""}`
              : ""}
        </div>
        {c.address && (
          <div className="text-xs text-[var(--muted)] mt-0.5 truncate flex items-center gap-1">
            <MapPin size={11} strokeWidth={1.75} aria-hidden />
            {c.address}
          </div>
        )}
      </div>
      <button
        onClick={onEdit}
        className="text-[var(--muted)] hover:text-[var(--foreground)] p-1.5 rounded"
        aria-label="Edit"
      >
        <Pencil size={13} strokeWidth={1.75} aria-hidden />
      </button>
    </div>
  );
}

// ============================================================================
// Editor
// ============================================================================

function CommitmentEditor({
  trip,
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  trip: Trip;
  initial: Commitment | null;
  onSave: (c: Commitment, isNew: boolean) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const isNew = initial === null;
  const [title, setTitle] = useState(initial?.title ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [date, setDate] = useState(initial?.date ?? trip.startDate);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "");
  const [endTime, setEndTime] = useState(initial?.endTime ?? "");
  const [allDay, setAllDay] = useState<boolean>(initial?.allDay ?? false);
  const [priority, setPriority] = useState<CommitmentPriority>(
    initial?.priority ?? "must"
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <div className="border border-[var(--border-strong)] rounded-lg p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
        <Field label="Title">
          <input
            className="input"
            placeholder="e.g. Marriage at Villa San Giorgio"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Address">
          <input
            className="input"
            placeholder="Where you need to be"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label="Date">
          <input
            className="input"
            type="date"
            value={date}
            min={trip.startDate}
            max={trip.endDate}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="Priority">
          <select
            className="input"
            value={priority}
            onChange={(e) => setPriority(e.target.value as CommitmentPriority)}
          >
            <option value="must">Can&apos;t miss</option>
            <option value="flexible">Flexible</option>
          </select>
        </Field>
        {!allDay && (
          <>
            <Field label="Start time">
              <input
                className="input"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </Field>
            <Field label="End time">
              <input
                className="input"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </Field>
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-[var(--muted)] mt-2">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
          />
          All day (multi-day events: enter the same date for each day)
        </label>
      </div>
      <Field label="Notes">
        <textarea
          className="input"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          style={{ height: "auto", padding: "10px 12px", fontSize: 13 }}
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <div>
          {!isNew && initial && (
            <button
              onClick={() => onDelete(initial.id)}
              className="text-xs text-[var(--muted)] hover:text-[var(--danger)] inline-flex items-center gap-1"
            >
              <Trash2 size={12} strokeWidth={1.75} aria-hidden />
              Delete
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-steel px-4 py-2 text-sm">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!title.trim()) return;
              const c: Commitment = {
                id: initial?.id ?? `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                tripId: trip.id,
                title: title.trim(),
                address: address.trim() || undefined,
                date,
                startTime: !allDay && startTime ? startTime : undefined,
                endTime: !allDay && endTime ? endTime : undefined,
                allDay,
                priority,
                notes: notes.trim() || undefined,
                createdAt: initial?.createdAt ?? new Date().toISOString(),
              };
              onSave(c, isNew);
            }}
            className="btn-primary px-5 py-2 text-sm"
          >
            {isNew ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ""}`}>
      <div className="text-[var(--muted)] mb-1 text-xs">{label}</div>
      {children}
    </label>
  );
}

// ============================================================================
// Day plan view — vertical day column with fixed + suggestion blocks
// ============================================================================

function DayPlanView({
  plan,
  trip,
  onDismiss,
  onRereplan,
}: {
  plan: DayPlan;
  trip: Trip;
  onDismiss: (label: string) => void;
  onRereplan: () => void;
}) {
  void trip;
  const date = new Date(plan.date);
  const hasItems = plan.items.length > 0;

  return (
    <div className="border border-[var(--border)] rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-[var(--edge)] bg-white/[0.02]">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--muted)]">
            {date.toLocaleDateString(undefined, { weekday: "long" })}
          </div>
          <div className="text-sm font-bold">
            {date.toLocaleDateString(undefined, { month: "long", day: "numeric" })}
          </div>
        </div>
        <button
          onClick={onRereplan}
          className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] inline-flex items-center gap-1.5"
          title="Reset dismissed suggestions and re-plan this day"
        >
          <RefreshCw size={12} strokeWidth={1.75} aria-hidden />
          Re-plan
        </button>
      </div>
      {!hasItems && (
        <div className="px-4 py-6 text-sm text-center text-[var(--muted)]">
          No commitments on this day. Pin one above and we&apos;ll fill the gaps.
        </div>
      )}
      {hasItems && (
        <ul className="divide-y divide-[var(--edge)]">
          {plan.items.map((item) => (
            <DayPlanRow key={`${plan.date}-${item.id}`} item={item} onDismiss={onDismiss} />
          ))}
        </ul>
      )}
    </div>
  );
}

function DayPlanRow({
  item,
  onDismiss,
}: {
  item: DayPlanItem;
  onDismiss: (label: string) => void;
}) {
  if (item.kind === "commitment") {
    return (
      <li className="px-4 py-3 flex items-start gap-3 bg-[var(--accent-soft)]/40">
        <div className="w-20 flex-none text-xs font-mono">
          {item.commitment.allDay
            ? "ALL DAY"
            : formatTimeRange(item.startMin, item.endMin)}
        </div>
        <div
          className="h-2 w-2 rounded-full mt-1.5 flex-none"
          style={{ background: "var(--accent)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium flex items-center gap-2">
            <Pin size={12} strokeWidth={1.75} className="text-[var(--accent)]" aria-hidden />
            {item.commitment.title}
            {item.commitment.priority === "must" && (
              <span className="text-[10px] uppercase tracking-wider bg-[var(--accent-soft)] text-[var(--accent)] px-1.5 py-0.5 rounded">
                Pinned
              </span>
            )}
          </div>
          {item.commitment.address && (
            <div className="text-xs text-[var(--muted)] mt-0.5 flex items-center gap-1">
              <MapPin size={11} strokeWidth={1.75} aria-hidden />
              {item.commitment.address}
            </div>
          )}
          {item.commitment.notes && (
            <div className="text-xs text-[var(--muted)] mt-1">{item.commitment.notes}</div>
          )}
        </div>
      </li>
    );
  }
  if (item.kind === "wallet") {
    const accent = WALLET_ICON_COLOR[item.icon] ?? "#94a3b8";
    return (
      <li className="px-4 py-3 flex items-start gap-3">
        <div className="w-20 flex-none text-xs font-mono">
          {formatTimeRange(item.startMin, item.endMin)}
        </div>
        <div
          className="h-2 w-2 rounded-full mt-1.5 flex-none"
          style={{ background: accent }}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.label}</div>
          <div className="text-xs text-[var(--muted)] mt-0.5">
            {item.vendor} · from your wallet
          </div>
        </div>
      </li>
    );
  }
  // suggestion
  const accent = SUGGESTION_COLORS[item.type] ?? "#94a3b8";
  return (
    <li className="px-4 py-3 flex items-start gap-3 group">
      <div className="w-20 flex-none text-xs font-mono text-[var(--muted)]">
        {formatTimeRange(item.startMin, item.endMin)}
      </div>
      <div
        className="h-2 w-2 rounded-full mt-1.5 flex-none"
        style={{ background: accent, opacity: 0.7 }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          <span className="text-[var(--muted)] mr-2 text-[10px] uppercase tracking-wider">
            {item.type}
          </span>
          <span className="font-medium">{item.label}</span>
        </div>
        <div className="text-xs text-[var(--muted)] mt-0.5">{item.detail}</div>
      </div>
      {(item.type === "meal" || item.type === "activity") && (
        <button
          onClick={() => onDismiss(item.label)}
          className="opacity-0 group-hover:opacity-100 text-[var(--muted)] hover:text-[var(--danger)] p-1 rounded"
          title="Dismiss this suggestion"
          aria-label="Dismiss"
        >
          <X size={13} strokeWidth={1.75} aria-hidden />
        </button>
      )}
    </li>
  );
}
