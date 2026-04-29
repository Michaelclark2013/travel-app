"use client";

// Tracker panel: invitees, expense list, settle-up summary, CSV export, share-per-person.

import { useMemo, useState } from "react";
import {
  CATEGORY_ICON,
  CATEGORY_LABEL,
  computeBalances,
  exportCsv,
  expenseTotalsByCategory,
  settle,
  totalsByPerson,
  tripPeople,
  type Transfer,
} from "@/lib/expenses";
import { toast } from "@/lib/toast";
import AddExpenseSheet from "./AddExpenseSheet";
import type { ExpenseCategory, Trip, TripExpense } from "@/lib/types";

type Tab = "expenses" | "people" | "settle";

export default function ExpenseTracker({
  trip,
  currentUserName,
  onChange,
}: {
  trip: Trip;
  currentUserName: string;
  onChange: (next: Trip) => void;
}) {
  const [tab, setTab] = useState<Tab>("expenses");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [inviteName, setInviteName] = useState("");

  const people = useMemo(() => tripPeople(trip, currentUserName), [
    trip,
    currentUserName,
  ]);
  // Solo mode = only the current user is on the trip. We collapse the UI to
  // pure "log + categorize + total" — no split, no settle, no people tab.
  const solo = people.length === 1;

  const balances = useMemo(() => computeBalances(trip, people), [trip, people]);
  const transfers = useMemo(() => settle(balances), [balances]);
  const byCategory = useMemo(() => expenseTotalsByCategory(trip), [trip]);
  const byPerson = useMemo(() => totalsByPerson(trip, people), [trip, people]);

  const grandTotalUsd = (trip.expenses ?? []).reduce(
    (s, e) => s + e.amountUsd,
    0
  );

  function addExpense(e: TripExpense) {
    const next: Trip = {
      ...trip,
      expenses: [...(trip.expenses ?? []), e],
    };
    onChange(next);
    toast.success(`Added · ${e.description}`);
  }

  function removeExpense(id: string) {
    const victim = trip.expenses?.find((e) => e.id === id);
    if (!victim) return;
    onChange({
      ...trip,
      expenses: (trip.expenses ?? []).filter((e) => e.id !== id),
    });
    toast.undo(`Removed · ${victim.description}`, () => {
      onChange({
        ...trip,
        expenses: [...(trip.expenses ?? []).filter((e) => e.id !== id), victim],
      });
    });
  }

  function inviteByName() {
    const name = inviteName.trim();
    if (!name) return;
    const exists = (trip.invitees ?? []).some(
      (i) => (i.name ?? i.email).toLowerCase() === name.toLowerCase()
    );
    if (exists || name.toLowerCase() === currentUserName.toLowerCase()) {
      toast.info(`${name} is already on the trip.`);
      setInviteName("");
      return;
    }
    onChange({
      ...trip,
      invitees: [
        ...(trip.invitees ?? []),
        { email: `${slug(name)}@local`, name, status: "joined" },
      ],
    });
    setInviteName("");
    toast.success(`Added ${name}`);
  }

  function removeInvitee(email: string) {
    onChange({
      ...trip,
      invitees: (trip.invitees ?? []).filter((i) => i.email !== email),
    });
  }

  function downloadCsv() {
    const csv = exportCsv(trip, people);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `voyage-expenses-${trip.id.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareSummary(person: string) {
    const lines: string[] = [];
    lines.push(`Voyage trip — ${trip.destination} · ${trip.startDate} → ${trip.endDate}`);
    lines.push("");
    const t = byPerson.find((x) => x.person === person)!;
    const b = balances.find((x) => x.person === person)!;
    lines.push(`${person}'s summary:`);
    lines.push(`  Paid: $${t.paidUsd.toFixed(2)}`);
    lines.push(`  Fair share: $${t.fairShareUsd.toFixed(2)}`);
    lines.push(
      `  Net: ${b.balanceUsd >= 0 ? "owed" : "owes"} $${Math.abs(
        b.balanceUsd
      ).toFixed(2)}`
    );
    const myTransfers = transfers.filter(
      (tr) => tr.from === person || tr.to === person
    );
    if (myTransfers.length > 0) {
      lines.push("");
      lines.push("Settle-up:");
      for (const tr of myTransfers) {
        lines.push(
          tr.from === person
            ? `  ${person} → ${tr.to}: $${tr.amountUsd.toFixed(2)}`
            : `  ${tr.from} → ${person}: $${tr.amountUsd.toFixed(2)}`
        );
      }
    }
    const text = lines.join("\n");
    if (navigator.share) {
      try {
        await navigator.share({ title: `Trip costs · ${person}`, text });
        return;
      } catch {}
    }
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${person}'s summary`);
  }

  // When the user goes solo→group, force them off any tab that isn't expenses.
  const visibleTabs = solo
    ? ([{ id: "expenses", label: "All expenses" }] as const)
    : ([
        { id: "expenses", label: "All expenses" },
        { id: "people", label: `People (${people.length})` },
        { id: "settle", label: "Settle up" },
      ] as const);

  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--accent)] uppercase">
            // 💸 EXPENSES
          </div>
          <div className="text-lg font-semibold mt-1">
            {solo
              ? `Spent so far · $${grandTotalUsd.toFixed(2)}`
              : `Trip ledger · $${grandTotalUsd.toFixed(2)} total`}
          </div>
          {solo && (trip.expenses?.length ?? 0) === 0 && (
            <div className="text-xs text-[var(--muted)] mt-1">
              Track what this trip costs you. Snap receipts on the go.
            </div>
          )}
        </div>
        <div className="flex gap-2">
          {solo && (
            <button
              onClick={() => setTab("people")}
              className="btn-ghost text-xs px-3 py-2"
            >
              + Add a friend
            </button>
          )}
          <button
            onClick={() => setSheetOpen(true)}
            className="btn-primary text-sm px-4 py-2"
          >
            + Add expense
          </button>
        </div>
      </div>

      {!solo && (
        <div className="mt-4 flex gap-2 text-xs">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full border px-3 py-1.5 ${
                tab === t.id
                  ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--border)] hover:bg-white/5"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {(solo || tab === "expenses") && (
        <ExpensesView
          trip={trip}
          byCategory={byCategory}
          onRemove={removeExpense}
          onShareCsv={downloadCsv}
          solo={solo}
        />
      )}

      {!solo && tab === "people" && (
        <PeopleView
          trip={trip}
          inviteName={inviteName}
          setInviteName={setInviteName}
          onInvite={inviteByName}
          onRemove={removeInvitee}
          byPerson={byPerson}
          balances={balances}
        />
      )}

      {solo && tab === "people" && (
        <SoloInviteView
          inviteName={inviteName}
          setInviteName={setInviteName}
          onInvite={inviteByName}
        />
      )}

      {!solo && tab === "settle" && (
        <SettleView
          transfers={transfers}
          byPerson={byPerson}
          balances={balances}
          onShare={shareSummary}
          onCsv={downloadCsv}
        />
      )}

      <AddExpenseSheet
        open={sheetOpen}
        people={people}
        defaultPayer={currentUserName}
        onClose={() => setSheetOpen(false)}
        onSave={addExpense}
      />
    </div>
  );
}

function ExpensesView({
  trip,
  byCategory,
  onRemove,
  onShareCsv,
  solo,
}: {
  trip: Trip;
  byCategory: { category: ExpenseCategory; totalUsd: number; count: number }[];
  onRemove: (id: string) => void;
  onShareCsv: () => void;
  solo?: boolean;
}) {
  const expenses = trip.expenses ?? [];
  if (expenses.length === 0) {
    return (
      <div className="mt-5 text-center text-sm text-[var(--muted)] py-8">
        No expenses yet. Tap{" "}
        <span className="text-white">+ Add expense</span> to log the first one
        — receipts get parsed automatically.
      </div>
    );
  }
  return (
    <div className="mt-5 space-y-4">
      {byCategory.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {byCategory.map((c) => (
            <span
              key={c.category}
              className="rounded-full border border-[var(--border)] bg-[var(--card-strong)] px-2.5 py-1 text-xs"
            >
              {CATEGORY_ICON[c.category]} {CATEGORY_LABEL[c.category]} · $
              {c.totalUsd.toFixed(0)}
            </span>
          ))}
        </div>
      )}

      <ul className="space-y-2">
        {expenses
          .slice()
          .sort((a, b) => b.date.localeCompare(a.date))
          .map((e) => (
            <li
              key={e.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 flex items-start gap-3"
            >
              <span className="text-xl shrink-0">
                {CATEGORY_ICON[(e.category ?? "other") as ExpenseCategory]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{e.description}</div>
                <div className="text-xs text-[var(--muted)] mt-0.5 truncate">
                  {e.date}
                  {!solo && (
                    <>
                      {" · paid by "}
                      <strong>{e.paidBy}</strong>
                      {" · split "}
                      {e.splitAmong.length} way{e.splitAmong.length === 1 ? "" : "s"}
                    </>
                  )}
                  {e.parsedByAi && " · ✦ parsed from receipt"}
                </div>
                {e.notes && (
                  <div className="text-[11px] text-[var(--muted)] italic mt-1">
                    {e.notes}
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-sm font-semibold">
                  ${e.amountUsd.toFixed(2)}
                </div>
                {e.currency && e.currency !== "USD" && e.amountOriginal && (
                  <div className="text-[10px] text-[var(--muted)]">
                    {e.amountOriginal.toFixed(2)} {e.currency}
                  </div>
                )}
                <button
                  onClick={() => onRemove(e.id)}
                  className="text-[10px] text-[var(--muted)] hover:text-rose-300 mt-1"
                >
                  remove
                </button>
              </div>
            </li>
          ))}
      </ul>
      <button
        onClick={onShareCsv}
        className="btn-ghost text-xs px-3 py-1.5"
      >
        ⇣ Export CSV
      </button>
    </div>
  );
}

function PeopleView({
  trip,
  inviteName,
  setInviteName,
  onInvite,
  onRemove,
  byPerson,
  balances,
}: {
  trip: Trip;
  inviteName: string;
  setInviteName: (s: string) => void;
  onInvite: () => void;
  onRemove: (email: string) => void;
  byPerson: ReturnType<typeof totalsByPerson>;
  balances: ReturnType<typeof computeBalances>;
}) {
  return (
    <div className="mt-5 space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onInvite();
        }}
        className="flex gap-2"
      >
        <input
          value={inviteName}
          onChange={(e) => setInviteName(e.target.value)}
          placeholder="Add by name (Sarah, Diego…)"
          className="input flex-1"
        />
        <button type="submit" className="btn-primary text-sm px-4">
          Add
        </button>
      </form>

      <ul className="space-y-2">
        {byPerson.map((p) => {
          const balance = balances.find((b) => b.person === p.person)!;
          const invitee = (trip.invitees ?? []).find(
            (i) => (i.name ?? i.email) === p.person
          );
          return (
            <li
              key={p.person}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 flex items-center gap-3"
            >
              <div className="h-9 w-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-mono text-sm font-semibold flex items-center justify-center shrink-0">
                {p.person.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium">{p.person}</div>
                <div className="text-xs text-[var(--muted)] mt-0.5">
                  paid ${p.paidUsd.toFixed(2)} · share ${p.fairShareUsd.toFixed(2)}
                </div>
              </div>
              <div
                className={`text-sm font-semibold shrink-0 ${
                  balance.balanceUsd > 0.01
                    ? "text-emerald-300"
                    : balance.balanceUsd < -0.01
                    ? "text-rose-300"
                    : "text-[var(--muted)]"
                }`}
              >
                {balance.balanceUsd > 0
                  ? `+$${balance.balanceUsd.toFixed(2)}`
                  : balance.balanceUsd < 0
                  ? `–$${Math.abs(balance.balanceUsd).toFixed(2)}`
                  : "$0.00"}
              </div>
              {invitee && (
                <button
                  onClick={() => onRemove(invitee.email)}
                  aria-label="Remove"
                  className="text-[var(--muted)] hover:text-rose-300 ml-1"
                >
                  ×
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SettleView({
  transfers,
  byPerson,
  balances,
  onShare,
  onCsv,
}: {
  transfers: Transfer[];
  byPerson: ReturnType<typeof totalsByPerson>;
  balances: ReturnType<typeof computeBalances>;
  onShare: (person: string) => void;
  onCsv: () => void;
}) {
  return (
    <div className="mt-5 space-y-4">
      {transfers.length === 0 ? (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-3 text-sm text-emerald-200">
          ✓ All settled up — no one owes anyone anything.
        </div>
      ) : (
        <ul className="space-y-2">
          {transfers.map((t, i) => (
            <li
              key={i}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 flex items-center gap-3"
            >
              <div className="text-sm flex-1">
                <span className="font-medium">{t.from}</span>{" "}
                <span className="text-[var(--muted)]">pays</span>{" "}
                <span className="font-medium">{t.to}</span>
              </div>
              <div className="text-lg font-semibold tracking-tight">
                ${t.amountUsd.toFixed(2)}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="text-xs font-mono uppercase tracking-[0.18em] text-[var(--muted)] pt-2">
        // SHARE PER PERSON
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {byPerson.map((p) => {
          const b = balances.find((x) => x.person === p.person)!;
          return (
            <button
              key={p.person}
              onClick={() => onShare(p.person)}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 text-left hover:border-[var(--border-strong)]"
            >
              <div className="text-sm font-medium">{p.person}</div>
              <div className="text-xs text-[var(--muted)] mt-0.5">
                Net{" "}
                {b.balanceUsd >= 0
                  ? `+$${b.balanceUsd.toFixed(2)}`
                  : `–$${Math.abs(b.balanceUsd).toFixed(2)}`}
                · tap to send
              </div>
            </button>
          );
        })}
      </div>

      <button onClick={onCsv} className="btn-ghost text-xs px-3 py-1.5">
        ⇣ Export full ledger (CSV)
      </button>
    </div>
  );
}

function SoloInviteView({
  inviteName,
  setInviteName,
  onInvite,
}: {
  inviteName: string;
  setInviteName: (s: string) => void;
  onInvite: () => void;
}) {
  return (
    <div className="mt-5 space-y-3">
      <div className="text-sm text-[var(--muted)]">
        Solo trip right now — add anyone you want to split costs with and the
        ledger will switch to group mode automatically.
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onInvite();
        }}
        className="flex gap-2"
      >
        <input
          value={inviteName}
          onChange={(e) => setInviteName(e.target.value)}
          placeholder="Add by name (Sarah, Diego…)"
          className="input flex-1"
        />
        <button type="submit" className="btn-primary text-sm px-4">
          Add
        </button>
      </form>
    </div>
  );
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
