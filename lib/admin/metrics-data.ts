// lib/admin/metrics-data.ts — Track 4 server-side data layer for the metrics
// dashboard. Centralizes the Supabase RPC calls so the page components stay
// presentational.
//
// All functions return null-or-empty defaults on error rather than throwing;
// the dashboard cards render an inline "no data" state when that happens so
// one broken query doesn't kill the whole page.

import { getSupabaseAdmin } from "../supabase-server";

// ---------------------------------------------------------------------------
// Types — mirror the RPC return shapes in 0013_metrics.sql.
// ---------------------------------------------------------------------------
export type DauWauMauRow = {
  day: string; // ISO date
  dau: number;
  wau: number;
  mau: number;
};

export type CohortRow = {
  cohort_week: string; // ISO date (Monday)
  cohort_size: number;
  d1: number;
  d7: number;
  d30: number;
  user_ids: string[];
};

export type FunnelRow = {
  step_index: number;
  step_name: string;
  user_count: number;
};

export type GeoRow = { country: string; users: number };
export type DeviceRow = { device: string; users: number };
export type CustomMetricRow = { label: string; value: number };

export type MetricCard = {
  id: string;
  name: string;
  config: {
    table: string;
    agg: "count" | "avg" | "sum";
    column?: string;
    filter?: { key: string; op: string; value: string };
  };
  created_by: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// fetchDauWauMau — 28 day default to drive the three sparklines.
// ---------------------------------------------------------------------------
export async function fetchDauWauMau(
  windowDays = 28
): Promise<DauWauMauRow[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  const { data, error } = await supa.rpc("get_dau_wau_mau", {
    window_days: windowDays,
  });
  if (error || !data) {
    if (error) console.warn("[metrics] get_dau_wau_mau failed", error.message);
    return [];
  }
  return (data as DauWauMauRow[]).map((r) => ({
    day: r.day,
    dau: Number(r.dau ?? 0),
    wau: Number(r.wau ?? 0),
    mau: Number(r.mau ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// fetchRetentionCohort — last 12 weeks by default.
// ---------------------------------------------------------------------------
export async function fetchRetentionCohort(): Promise<CohortRow[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  // Compute the trailing 12-week window in JS to avoid awkward SQL defaults
  // when older Postgres versions handle date arithmetic differently.
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 7 * 12);
  const cohortStart = start.toISOString().slice(0, 10);
  const cohortEnd = today.toISOString().slice(0, 10);

  const { data, error } = await supa.rpc("get_retention_cohort", {
    cohort_start: cohortStart,
    cohort_end: cohortEnd,
  });
  if (error || !data) {
    if (error)
      console.warn("[metrics] get_retention_cohort failed", error.message);
    return [];
  }
  return (data as CohortRow[]).map((r) => ({
    cohort_week: r.cohort_week,
    cohort_size: Number(r.cohort_size ?? 0),
    d1: Number(r.d1 ?? 0),
    d7: Number(r.d7 ?? 0),
    d30: Number(r.d30 ?? 0),
    user_ids: r.user_ids ?? [],
  }));
}

// ---------------------------------------------------------------------------
// fetchFunnel — pass the canonical step list. The dashboard's default is
//   signup → first trip → first moment → follow → DM → 7d return
// ---------------------------------------------------------------------------
export const DEFAULT_FUNNEL_STEPS = [
  "signup",
  "first_trip",
  "first_moment",
  "follow",
  "dm",
  "return_7d",
] as const;

export async function fetchFunnel(
  steps: readonly string[] = DEFAULT_FUNNEL_STEPS
): Promise<FunnelRow[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  const { data, error } = await supa.rpc("get_funnel", { steps });
  if (error || !data) {
    if (error) console.warn("[metrics] get_funnel failed", error.message);
    return [];
  }
  return (data as FunnelRow[]).map((r) => ({
    step_index: Number(r.step_index),
    step_name: r.step_name,
    user_count: Number(r.user_count ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// fetchGeoSplit + fetchDeviceSplit — same shape, different RPCs.
// ---------------------------------------------------------------------------
export async function fetchGeoSplit(): Promise<GeoRow[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  const { data, error } = await supa.rpc("get_geo_split");
  if (error || !data) {
    if (error) console.warn("[metrics] get_geo_split failed", error.message);
    return [];
  }
  return (data as GeoRow[]).map((r) => ({
    country: r.country,
    users: Number(r.users ?? 0),
  }));
}

export async function fetchDeviceSplit(): Promise<DeviceRow[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  const { data, error } = await supa.rpc("get_device_split");
  if (error || !data) {
    if (error) console.warn("[metrics] get_device_split failed", error.message);
    return [];
  }
  return (data as DeviceRow[]).map((r) => ({
    device: r.device,
    users: Number(r.users ?? 0),
  }));
}

// ---------------------------------------------------------------------------
// fetchConcurrent — single-row RPC; flatten to a number.
// ---------------------------------------------------------------------------
export async function fetchConcurrent(windowMinutes = 5): Promise<number> {
  const supa = getSupabaseAdmin();
  if (!supa) return 0;
  const { data, error } = await supa.rpc("get_concurrent_sessions", {
    window_minutes: windowMinutes,
  });
  if (error || !data) {
    if (error)
      console.warn("[metrics] get_concurrent_sessions failed", error.message);
    return 0;
  }
  const row = Array.isArray(data) ? data[0] : data;
  // PG returns { active_users } or { active_users: bigint } depending on
  // driver — handle both.
  const v =
    (row as { active_users?: number | string } | undefined)?.active_users ?? 0;
  return Number(v);
}

// ---------------------------------------------------------------------------
// Custom metrics
// ---------------------------------------------------------------------------
export async function listMetricCards(): Promise<MetricCard[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  const { data, error } = await supa
    .from("metric_cards")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data as MetricCard[];
}

export async function fetchCustomMetric(
  cardId: string
): Promise<CustomMetricRow | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  const { data, error } = await supa.rpc("get_custom_metric", {
    card_id: cardId,
  });
  if (error || !data) {
    if (error)
      console.warn("[metrics] get_custom_metric failed", error.message);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    label: (row as CustomMetricRow).label,
    value: Number((row as CustomMetricRow).value ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Whitelist for the metric builder UI. Mirrors the SQL whitelist exactly so
// the front end can't even *offer* a table the RPC would reject.
// ---------------------------------------------------------------------------
export const METRIC_BUILDER_TABLES = [
  "profiles_public",
  "trips",
  "moments",
  "likes",
  "follows",
  "dm_messages",
  "analytics_events",
] as const;
export type MetricBuilderTable = (typeof METRIC_BUILDER_TABLES)[number];

export const METRIC_BUILDER_AGGS = ["count", "avg", "sum"] as const;
export type MetricBuilderAgg = (typeof METRIC_BUILDER_AGGS)[number];

export const METRIC_BUILDER_CHARTS = ["number", "bar", "line"] as const;
export type MetricBuilderChart = (typeof METRIC_BUILDER_CHARTS)[number];
