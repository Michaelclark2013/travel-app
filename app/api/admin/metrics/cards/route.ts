// app/api/admin/metrics/cards/route.ts — Track 4 metric_cards CRUD.
// POST creates; GET lists. Both gated by metrics.write / metrics.read.

import { NextResponse } from "next/server";
import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import {
  METRIC_BUILDER_AGGS,
  METRIC_BUILDER_TABLES,
  type MetricBuilderAgg,
  type MetricBuilderTable,
} from "@/lib/admin/metrics-data";

export const runtime = "nodejs";

const ALLOWED_OPS = ["=", ">", "<", ">=", "<=", "<>"] as const;
type AllowedOp = (typeof ALLOWED_OPS)[number];

const IDENTIFIER = /^[a-z][a-z0-9_]*$/;

function newCardId(): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `mc-${ts}-${rnd}`;
}

export async function GET(req: Request) {
  try {
    await requirePerm(req, "metrics.read");
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const supa = getSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ cards: [] });
  }
  const { data } = await supa
    .from("metric_cards")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return NextResponse.json({ cards: data ?? [] });
}

export async function POST(req: Request) {
  let session: { adminId: string } | null = null;
  try {
    session = await requirePerm(req, "metrics.write");
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    name?: string;
    table?: string;
    agg?: string;
    column?: string;
    chart?: string;
    filter?: { key?: string; op?: string; value?: string };
  } | null;

  if (!body) {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // Validate everything before touching the DB. Mirror the SQL whitelist
  // exactly — the RPC will refuse anyway, but failing here gives a nicer
  // error message.
  const name = (body.name ?? "").toString().trim().slice(0, 80);
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const table = body.table as MetricBuilderTable;
  if (!METRIC_BUILDER_TABLES.includes(table)) {
    return NextResponse.json({ error: "invalid table" }, { status: 400 });
  }
  const agg = (body.agg ?? "count") as MetricBuilderAgg;
  if (!METRIC_BUILDER_AGGS.includes(agg)) {
    return NextResponse.json({ error: "invalid agg" }, { status: 400 });
  }
  let column: string | undefined;
  if (agg !== "count") {
    column = (body.column ?? "").toString().trim();
    if (!IDENTIFIER.test(column)) {
      return NextResponse.json(
        { error: "column required for avg/sum" },
        { status: 400 }
      );
    }
  }
  let filter: { key: string; op: AllowedOp; value: string } | undefined;
  if (body.filter && body.filter.key) {
    const key = body.filter.key.toString().trim();
    const op = (body.filter.op ?? "=") as AllowedOp;
    const value = (body.filter.value ?? "").toString();
    if (!IDENTIFIER.test(key)) {
      return NextResponse.json(
        { error: "invalid filter key" },
        { status: 400 }
      );
    }
    if (!ALLOWED_OPS.includes(op)) {
      return NextResponse.json(
        { error: "invalid filter op" },
        { status: 400 }
      );
    }
    filter = { key, op, value };
  }

  const config = {
    table,
    agg,
    ...(column ? { column } : {}),
    ...(filter ? { filter } : {}),
    chart: body.chart ?? "number",
  };

  const id = newCardId();
  const supa = getSupabaseAdmin();
  if (!supa) {
    return NextResponse.json({ error: "supabase not configured" }, { status: 503 });
  }

  return audit(
    "metrics.card.create",
    { kind: "metric_card", id },
    { before: null, after: { id, name, config } },
    async () => {
      const { error } = await supa
        .from("metric_cards")
        .insert({ id, name, config, created_by: session?.adminId ?? null });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true, id });
    }
  );
}
