// Expense math + settle-up engine. All amounts are USD-canonical so we can mix
// foreign-currency expenses without losing precision.

import type { ExpenseCategory, Trip, TripExpense } from "./types";

export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  lodging: "Lodging",
  transport: "Transport",
  parking: "Parking",
  food: "Food & dining",
  activities: "Activities",
  groceries: "Groceries",
  shopping: "Shopping",
  fees: "Fees & visas",
  other: "Other",
};

export const CATEGORY_ICON: Record<ExpenseCategory, string> = {
  lodging: "🏨",
  transport: "🚆",
  parking: "🅿️",
  food: "🍽",
  activities: "🎟",
  groceries: "🛒",
  shopping: "🛍",
  fees: "📄",
  other: "•",
};

export type Person = string;

/** Per-person net balance: positive = owed, negative = owes. */
export type Balance = { person: Person; balanceUsd: number };

/** A simplified IOU. */
export type Transfer = { from: Person; to: Person; amountUsd: number };

export function tripPeople(trip: Trip, currentUserName: string): Person[] {
  const set = new Set<Person>();
  set.add(currentUserName);
  for (const inv of trip.invitees ?? []) {
    set.add(inv.name ?? inv.email);
  }
  for (const e of trip.expenses ?? []) {
    set.add(e.paidBy);
    for (const p of e.splitAmong) set.add(p);
  }
  return [...set];
}

/** Compute share per person for one expense. */
function shareFor(e: TripExpense, person: Person): number {
  if (e.splitMode === "custom" && e.customSplitsUsd) {
    return e.customSplitsUsd.find((s) => s.person === person)?.amountUsd ?? 0;
  }
  if (e.splitMode === "single-payer") {
    return e.paidBy === person ? e.amountUsd : 0;
  }
  // Default: equal across splitAmong.
  if (!e.splitAmong.includes(person)) return 0;
  return e.amountUsd / Math.max(1, e.splitAmong.length);
}

export function computeBalances(trip: Trip, people: Person[]): Balance[] {
  const totals = new Map<Person, number>(people.map((p) => [p, 0]));
  for (const e of trip.expenses ?? []) {
    // Payer is owed the full expense amount; everyone in the split owes their share.
    totals.set(e.paidBy, (totals.get(e.paidBy) ?? 0) + e.amountUsd);
    for (const p of new Set([...e.splitAmong, e.paidBy])) {
      const share = shareFor(e, p);
      if (share > 0) totals.set(p, (totals.get(p) ?? 0) - share);
    }
  }
  return [...totals.entries()].map(([person, balanceUsd]) => ({
    person,
    balanceUsd: Math.round(balanceUsd * 100) / 100,
  }));
}

/**
 * Greedy settle-up — produces the minimum number of transfers to zero out all
 * balances. Classic textbook algorithm: pair the most-owed with the most-debt,
 * settle the smaller of the two, recurse.
 */
export function settle(balances: Balance[]): Transfer[] {
  // Copy + filter near-zero balances.
  const eps = 0.005;
  const owed = balances.filter((b) => b.balanceUsd > eps).map((b) => ({ ...b }));
  const owes = balances.filter((b) => b.balanceUsd < -eps).map((b) => ({ ...b }));
  owed.sort((a, b) => b.balanceUsd - a.balanceUsd);
  owes.sort((a, b) => a.balanceUsd - b.balanceUsd);

  const transfers: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < owed.length && j < owes.length) {
    const credit = owed[i];
    const debit = owes[j];
    const amount = Math.min(credit.balanceUsd, -debit.balanceUsd);
    if (amount > eps) {
      transfers.push({
        from: debit.person,
        to: credit.person,
        amountUsd: Math.round(amount * 100) / 100,
      });
      credit.balanceUsd -= amount;
      debit.balanceUsd += amount;
    }
    if (credit.balanceUsd <= eps) i++;
    if (debit.balanceUsd >= -eps) j++;
  }
  return transfers;
}

export function expenseTotalsByCategory(
  trip: Trip
): { category: ExpenseCategory; totalUsd: number; count: number }[] {
  const map = new Map<ExpenseCategory, { totalUsd: number; count: number }>();
  for (const e of trip.expenses ?? []) {
    const cat = (e.category ?? "other") as ExpenseCategory;
    const cur = map.get(cat) ?? { totalUsd: 0, count: 0 };
    cur.totalUsd += e.amountUsd;
    cur.count += 1;
    map.set(cat, cur);
  }
  return [...map.entries()]
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
}

export function totalsByPerson(trip: Trip, people: Person[]) {
  const paid = new Map<Person, number>(people.map((p) => [p, 0]));
  const owed = new Map<Person, number>(people.map((p) => [p, 0]));
  for (const e of trip.expenses ?? []) {
    paid.set(e.paidBy, (paid.get(e.paidBy) ?? 0) + e.amountUsd);
    for (const p of new Set([...e.splitAmong, e.paidBy])) {
      owed.set(p, (owed.get(p) ?? 0) + shareFor(e, p));
    }
  }
  return people.map((p) => ({
    person: p,
    paidUsd: Math.round((paid.get(p) ?? 0) * 100) / 100,
    fairShareUsd: Math.round((owed.get(p) ?? 0) * 100) / 100,
  }));
}

/** Full per-person CSV export. */
export function exportCsv(trip: Trip, people: Person[]): string {
  const rows: string[] = [];
  rows.push(
    "date,description,category,amount_usd,paid_by,split_among,each_share_usd"
  );
  for (const e of trip.expenses ?? []) {
    const each = (e.amountUsd / Math.max(1, e.splitAmong.length)).toFixed(2);
    rows.push(
      [
        e.date,
        csv(e.description),
        e.category ?? "other",
        e.amountUsd.toFixed(2),
        csv(e.paidBy),
        csv(e.splitAmong.join("; ")),
        each,
      ].join(",")
    );
  }
  rows.push("");
  rows.push("--- BALANCES ---");
  rows.push("person,paid_usd,fair_share_usd,net_usd");
  const totals = totalsByPerson(trip, people);
  const balances = computeBalances(trip, people);
  for (const t of totals) {
    const b = balances.find((x) => x.person === t.person)!;
    rows.push(
      [csv(t.person), t.paidUsd.toFixed(2), t.fairShareUsd.toFixed(2), b.balanceUsd.toFixed(2)].join(
        ","
      )
    );
  }
  rows.push("");
  rows.push("--- WHO PAYS WHOM ---");
  rows.push("from,to,amount_usd");
  for (const t of settle(balances)) {
    rows.push([csv(t.from), csv(t.to), t.amountUsd.toFixed(2)].join(","));
  }
  return rows.join("\n");
}

function csv(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}
