// app/api/cron/anomaly/route.ts — Track 9 daily anomaly detection.
//
// WHAT
//   GET /api/cron/anomaly
//     1. Recompute user_baselines (per-hour rates of follows/captures/api
//        calls) for users active in the last 30 days.
//     2. Compare each user's last-24h activity against their baseline +
//        rolling stddev. Anything beyond 3 sigma is enqueued into the
//        Track 3 moderation_queue table with category 'anomaly'.
//
// AUTH
//   Vercel Cron POSTs with the CRON_SECRET header. We accept that OR an
//   admin session with metrics.write — the latter lets ops trigger the
//   recompute manually from /admin/metrics.
//
// SHAPE
//   Pure SQL with window functions where possible to keep the work in the
//   database. JS sticks around to wire the stages together and write the
//   moderation rows.
//
// ENV VARS
//   CRON_SECRET, SUPABASE_SERVICE_ROLE_KEY.

import { getSupabaseAdmin } from "@/lib/supabase-server";
import { hasPerm } from "@/lib/admin/rbac";
import { getAdminFromRequest } from "@/lib/admin/session";

const SIGMA_THRESHOLD = 3;

function authorized(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const headerSecret = req.headers.get("x-cron-secret");
  const expected = process.env.CRON_SECRET;
  if (expected && (querySecret === expected || headerSecret === expected)) {
    return Promise.resolve(true);
  }
  // Fall back to an admin session with metrics.write — useful for manual runs.
  return getAdminFromRequest(req).then((s) =>
    !!s && s.mfa && hasPerm(s.role, "metrics.write")
  );
}

export async function GET(req: Request) {
  if (!(await authorized(req))) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  // ---- Stage 1: recompute baselines ----------------------------------------
  // We aggregate per-user counts in the JS layer (Supabase JS doesn't expose
  // raw window functions through PostgREST), but the heavy lifting is just
  // SELECT count + group, which Postgres handles fine.
  const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  const recentSince = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // Pull per-user counts over the 30d window.
  const [followsRows, momentsRows, recentFollows, recentMoments] = await Promise.all([
    supa
      .from("follows")
      .select("follower_id,created_at")
      .gte("created_at", since),
    supa
      .from("moments")
      .select("user_id,created_at")
      .gte("created_at", since),
    supa
      .from("follows")
      .select("follower_id,created_at")
      .gte("created_at", recentSince),
    supa
      .from("moments")
      .select("user_id,created_at")
      .gte("created_at", recentSince),
  ]);

  type Counts = Map<string, number>;
  const followsByUser: Counts = new Map();
  for (const r of (followsRows.data ?? []) as Array<{ follower_id: string }>) {
    followsByUser.set(r.follower_id, (followsByUser.get(r.follower_id) ?? 0) + 1);
  }
  const momentsByUser: Counts = new Map();
  for (const r of (momentsRows.data ?? []) as Array<{ user_id: string }>) {
    momentsByUser.set(r.user_id, (momentsByUser.get(r.user_id) ?? 0) + 1);
  }
  const recentFollowsByUser: Counts = new Map();
  for (const r of (recentFollows.data ?? []) as Array<{ follower_id: string }>) {
    recentFollowsByUser.set(
      r.follower_id,
      (recentFollowsByUser.get(r.follower_id) ?? 0) + 1
    );
  }
  const recentMomentsByUser: Counts = new Map();
  for (const r of (recentMoments.data ?? []) as Array<{ user_id: string }>) {
    recentMomentsByUser.set(
      r.user_id,
      (recentMomentsByUser.get(r.user_id) ?? 0) + 1
    );
  }

  // Build per-user baseline rows. 30 days * 24h = 720 hour buckets.
  const HOURS_30D = 30 * 24;
  const allUsers = new Set<string>([
    ...followsByUser.keys(),
    ...momentsByUser.keys(),
  ]);

  // Compute stddev as the population stddev of the 30 daily counts. A simple
  // approximation that catches order-of-magnitude shifts without needing a
  // full per-hour histogram.
  // Per-user daily counts:
  function dailyHistogram(rows: { ts: string }[]): number[] {
    const buckets = new Array(30).fill(0);
    const now = Date.now();
    for (const r of rows) {
      const t = new Date(r.ts).getTime();
      const dayIdx = 29 - Math.floor((now - t) / (24 * 3600 * 1000));
      if (dayIdx >= 0 && dayIdx < 30) buckets[dayIdx] += 1;
    }
    return buckets;
  }
  function stddev(arr: number[]): number {
    if (arr.length === 0) return 0;
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length;
    return Math.sqrt(variance);
  }

  // Group raw rows by user once, then derive histograms.
  const followRowsByUser = new Map<string, { ts: string }[]>();
  for (const r of (followsRows.data ?? []) as Array<{
    follower_id: string;
    created_at: string;
  }>) {
    const arr = followRowsByUser.get(r.follower_id) ?? [];
    arr.push({ ts: r.created_at });
    followRowsByUser.set(r.follower_id, arr);
  }
  const momentRowsByUser = new Map<string, { ts: string }[]>();
  for (const r of (momentsRows.data ?? []) as Array<{
    user_id: string;
    created_at: string;
  }>) {
    const arr = momentRowsByUser.get(r.user_id) ?? [];
    arr.push({ ts: r.created_at });
    momentRowsByUser.set(r.user_id, arr);
  }

  const baselineUpserts: Array<{
    user_id: string;
    signups_per_hour: number;
    follows_per_hour: number;
    captures_per_hour: number;
    api_calls_per_hour: number;
    follows_stddev: number;
    captures_stddev: number;
    api_calls_stddev: number;
    last_recomputed_at: string;
  }> = [];

  const nowIso = new Date().toISOString();
  for (const userId of allUsers) {
    const followsRate = (followsByUser.get(userId) ?? 0) / HOURS_30D;
    const momentsRate = (momentsByUser.get(userId) ?? 0) / HOURS_30D;
    const followsHist = dailyHistogram(followRowsByUser.get(userId) ?? []);
    const momentsHist = dailyHistogram(momentRowsByUser.get(userId) ?? []);
    baselineUpserts.push({
      user_id: userId,
      signups_per_hour: 0, // signups happen once per user — placeholder for parity
      follows_per_hour: followsRate,
      captures_per_hour: momentsRate,
      api_calls_per_hour: 0, // wired when an API-call log lands
      follows_stddev: stddev(followsHist) / 24, // convert daily stddev → hourly
      captures_stddev: stddev(momentsHist) / 24,
      api_calls_stddev: 0,
      last_recomputed_at: nowIso,
    });
  }

  if (baselineUpserts.length > 0) {
    const { error: upsertErr } = await supa
      .from("user_baselines")
      .upsert(baselineUpserts, { onConflict: "user_id" });
    if (upsertErr) {
      console.error("[anomaly] baseline upsert failed", upsertErr);
    }
  }

  // ---- Stage 2: detect deviations & enqueue --------------------------------
  type Anomaly = {
    user_id: string;
    metric: "follows" | "captures";
    value_24h: number;
    baseline_24h: number;
    sigma: number;
  };
  const anomalies: Anomaly[] = [];

  for (const u of baselineUpserts) {
    // Expected over 24h = rate * 24. Stddev is per-hour; over 24h it scales
    // by sqrt(24) (variance adds across independent buckets).
    const sqrt24 = Math.sqrt(24);

    const followsBaseline24 = u.follows_per_hour * 24;
    const followsSigma24 = Math.max(u.follows_stddev * sqrt24, 0.5); // floor avoids div-by-zero
    const followsActual = recentFollowsByUser.get(u.user_id) ?? 0;
    const followsDelta = (followsActual - followsBaseline24) / followsSigma24;
    if (Math.abs(followsDelta) >= SIGMA_THRESHOLD && followsActual >= 5) {
      anomalies.push({
        user_id: u.user_id,
        metric: "follows",
        value_24h: followsActual,
        baseline_24h: followsBaseline24,
        sigma: followsDelta,
      });
    }

    const capturesBaseline24 = u.captures_per_hour * 24;
    const capturesSigma24 = Math.max(u.captures_stddev * sqrt24, 0.5);
    const capturesActual = recentMomentsByUser.get(u.user_id) ?? 0;
    const capturesDelta = (capturesActual - capturesBaseline24) / capturesSigma24;
    if (Math.abs(capturesDelta) >= SIGMA_THRESHOLD && capturesActual >= 5) {
      anomalies.push({
        user_id: u.user_id,
        metric: "captures",
        value_24h: capturesActual,
        baseline_24h: capturesBaseline24,
        sigma: capturesDelta,
      });
    }
  }

  // Surface to moderation_queue. Track 3 owns the table; we degrade
  // gracefully if it doesn't exist yet (the insert simply errors with the
  // missing-relation code and we log it).
  let surfaced = 0;
  if (anomalies.length > 0) {
    const rows = anomalies.map((a) => ({
      category: "anomaly",
      target_kind: "user",
      target_id: a.user_id,
      reason: `${a.metric} ${a.sigma >= 0 ? "spike" : "drop"} ${a.sigma.toFixed(1)}σ (24h=${a.value_24h}, baseline=${a.baseline_24h.toFixed(1)})`,
      severity: Math.abs(a.sigma) >= 5 ? "high" : "medium",
      created_at: nowIso,
    }));
    const { error, count } = await supa
      .from("moderation_queue")
      .insert(rows, { count: "exact" });
    if (error) {
      console.warn(
        "[anomaly] moderation_queue insert skipped (likely Track 3 table missing)",
        error.message
      );
    } else {
      surfaced = count ?? rows.length;
    }
  }

  return Response.json({
    ok: true,
    baselines_recomputed: baselineUpserts.length,
    anomalies_found: anomalies.length,
    moderation_rows_inserted: surfaced,
    threshold_sigma: SIGMA_THRESHOLD,
  });
}
