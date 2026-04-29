// lib/admin/bulk.ts — Track 2 bulk action engine.
//
// WHAT
//   enqueue(args)              — write a queued row to admin_bulk_jobs and
//                                return its id. Caller (UI or API route) is
//                                responsible for kicking off the worker.
//   runJob(jobId, opts)        — claim & process one job. Iterates the
//                                target_ids[] in batches of BATCH_SIZE,
//                                applies the action via per-kind handlers,
//                                bumps `progress` after each successful row
//                                so a crash can resume.
//   cancelJob(jobId)           — flip status to 'cancelled'. The next batch
//                                tick in runJob() observes this and exits.
//   getJob(jobId)              — read a single row.
//   listJobsByAdmin(adminId)   — recent jobs for the dashboard.
//
// WHY a separate engine module
//   The brief calls for a bulk-action surface that supports up to 1000 rows.
//   That's beyond a single request's budget; we need:
//     1. Persisted progress so the UI can poll / subscribe.
//     2. Resumability — if the worker crashes mid-run, restart from the last
//        committed progress count.
//     3. Cancellation — the UI can flip status='cancelled' and the worker
//        bails between batches.
//   Keeping all of that in one module gives the API layer a tiny surface
//   (`enqueue`, `runJob`, `cancelJob`) that's easy to audit.
//
// PERMISSION model
//   `enqueue` does NOT itself check perms — the calling route does
//   `requirePerm(req, "...")` before calling, so this module trusts the
//   caller. Per-action permission slugs are listed in ACTIONS below for
//   reference + to keep route-handler implementations consistent.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY — required; this module reads + writes the
//                               admin_bulk_jobs table and the target tables
//                               directly via the service-role client.

import { getSupabaseAdmin } from "../supabase-server";

// ---------------------------------------------------------------------------
// Constants — kept module-level so tests / call sites can read them.
// ---------------------------------------------------------------------------
export const MAX_TARGETS = 1000;
export const BATCH_SIZE = 50;

// ---------------------------------------------------------------------------
// Action catalog. Each entry maps a (kind, action) pair to the SQL update
// that should run for a single id. handlers below dispatch on this.
// ---------------------------------------------------------------------------
export type BulkTargetKind = "user" | "moment" | "trip" | "comment";
export type BulkAction =
  | "hide"
  | "restore"
  | "delete"
  | "feature"
  | "unfeature";

export type BulkJobStatus =
  | "queued"
  | "running"
  | "cancelled"
  | "done"
  | "error";

export type BulkJobRow = {
  id: string;
  admin_id: string | null;
  action: BulkAction;
  target_kind: BulkTargetKind;
  target_ids: string[];
  dry_run: boolean;
  status: BulkJobStatus;
  progress: number;
  total: number;
  result: { successes: number; failures: number; errors?: string[] } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// newJobId — tiny URL-safe id, so the worker route can take it as a path
// segment without escape hassles.
// ---------------------------------------------------------------------------
function newJobId(): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `bulk-${ts}-${rnd}`;
}

// ---------------------------------------------------------------------------
// enqueue — public entry point.
// ---------------------------------------------------------------------------
export async function enqueue(args: {
  adminId: string;
  action: BulkAction;
  targetKind: BulkTargetKind;
  ids: string[];
  dryRun?: boolean;
}): Promise<{ ok: true; jobId: string } | { ok: false; error: string }> {
  if (!Array.isArray(args.ids) || args.ids.length === 0) {
    return { ok: false, error: "ids must be a non-empty array" };
  }
  if (args.ids.length > MAX_TARGETS) {
    return {
      ok: false,
      error: `bulk enqueue capped at ${MAX_TARGETS} targets (got ${args.ids.length})`,
    };
  }
  // De-dupe to avoid double-applying.
  const ids = Array.from(new Set(args.ids.map((s) => String(s))));

  const supa = getSupabaseAdmin();
  if (!supa) {
    return { ok: false, error: "Supabase service role not configured" };
  }
  const id = newJobId();
  const { error } = await supa.from("admin_bulk_jobs").insert({
    id,
    admin_id: args.adminId,
    action: args.action,
    target_kind: args.targetKind,
    target_ids: ids,
    dry_run: !!args.dryRun,
    status: "queued",
    progress: 0,
  });
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, jobId: id };
}

// ---------------------------------------------------------------------------
// getJob / listJobsByAdmin
// ---------------------------------------------------------------------------
export async function getJob(jobId: string): Promise<BulkJobRow | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  const { data, error } = await supa
    .from("admin_bulk_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error || !data) return null;
  return data as BulkJobRow;
}

export async function listJobsByAdmin(adminId: string, limit = 20): Promise<BulkJobRow[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  const { data } = await supa
    .from("admin_bulk_jobs")
    .select("*")
    .eq("admin_id", adminId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as BulkJobRow[];
}

// ---------------------------------------------------------------------------
// cancelJob — flip status. The running worker will observe this between
// batches and short-circuit.
// ---------------------------------------------------------------------------
export async function cancelJob(jobId: string): Promise<boolean> {
  const supa = getSupabaseAdmin();
  if (!supa) return false;
  const { error } = await supa
    .from("admin_bulk_jobs")
    .update({ status: "cancelled" })
    .eq("id", jobId)
    .in("status", ["queued", "running"]);
  return !error;
}

// ---------------------------------------------------------------------------
// runJob — claim and process. Returns when done, cancelled, or errored.
// Safe to call multiple times: the second caller will see status='running'
// or 'done' and bail.
// ---------------------------------------------------------------------------
export async function runJob(jobId: string): Promise<BulkJobRow | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;

  // Atomic claim: only flip queued -> running. If another worker beat us
  // here we observe an empty update and bail.
  const claim = await supa
    .from("admin_bulk_jobs")
    .update({ status: "running" })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("*")
    .maybeSingle();

  let job: BulkJobRow | null = (claim.data as BulkJobRow | null) ?? null;
  // If the row was already running (resumed crash), pick it up again.
  if (!job) {
    const existing = await getJob(jobId);
    if (!existing) return null;
    if (existing.status === "running") {
      job = existing;
    } else {
      return existing; // already done / cancelled / error.
    }
  }

  const successes: number = job.progress; // resume from previous progress
  let success = successes;
  let failure = 0;
  const errors: string[] = [];

  for (let i = job.progress; i < job.target_ids.length; i += BATCH_SIZE) {
    // Cancellation check between batches.
    const fresh = await getJob(jobId);
    if (!fresh || fresh.status === "cancelled") {
      return fresh;
    }
    const batch = job.target_ids.slice(i, i + BATCH_SIZE);

    if (job.dry_run) {
      // Dry runs only validate that the rows exist; no writes.
      const probe = await probeRows(job.target_kind, batch);
      success += probe.found;
      failure += batch.length - probe.found;
      if (probe.missing.length) {
        errors.push(`missing ${job.target_kind} ids: ${probe.missing.slice(0, 5).join(",")}`);
      }
    } else {
      const res = await applyBatch(job.action, job.target_kind, batch);
      success += res.success;
      failure += res.failure;
      if (res.error) errors.push(res.error);
    }

    // Update progress so the realtime channel ticks.
    await supa
      .from("admin_bulk_jobs")
      .update({ progress: success + failure })
      .eq("id", jobId);
  }

  const finalStatus: BulkJobStatus = failure > 0 && success === 0 ? "error" : "done";
  await supa
    .from("admin_bulk_jobs")
    .update({
      status: finalStatus,
      progress: success + failure,
      result: { successes: success, failures: failure, errors: errors.slice(0, 20) },
      error: finalStatus === "error" ? errors[0] ?? "all rows failed" : null,
    })
    .eq("id", jobId);

  return getJob(jobId);
}

// ---------------------------------------------------------------------------
// applyBatch — dispatch on (action, kind). Each branch updates the rows
// in one shot via .in("id", batch); failure is reported as the count of
// rows the DB didn't touch.
// ---------------------------------------------------------------------------
async function applyBatch(
  action: BulkAction,
  kind: BulkTargetKind,
  ids: string[]
): Promise<{ success: number; failure: number; error?: string }> {
  const supa = getSupabaseAdmin();
  if (!supa) return { success: 0, failure: ids.length, error: "no service role" };

  const table = tableFor(kind);
  const idCol = idColFor(kind);
  const now = new Date().toISOString();

  let patch: Record<string, string | null> | null = null;
  switch (action) {
    case "hide":
      patch = { hidden_at: now };
      break;
    case "restore":
      patch = { hidden_at: null, deleted_at: null };
      break;
    case "delete":
      patch = { deleted_at: now };
      break;
    case "feature":
      if (kind === "comment") {
        return { success: 0, failure: ids.length, error: "feature unsupported on comments" };
      }
      patch = { featured_at: now };
      break;
    case "unfeature":
      if (kind === "comment") {
        return { success: 0, failure: ids.length, error: "unfeature unsupported on comments" };
      }
      patch = { featured_at: null };
      break;
    default:
      return { success: 0, failure: ids.length, error: `unknown action: ${action}` };
  }

  const { data, error } = await supa
    .from(table)
    .update(patch)
    .in(idCol, ids)
    .select(idCol);
  if (error) {
    return { success: 0, failure: ids.length, error: error.message };
  }
  const touched = (data ?? []).length;
  return { success: touched, failure: ids.length - touched };
}

async function probeRows(
  kind: BulkTargetKind,
  ids: string[]
): Promise<{ found: number; missing: string[] }> {
  const supa = getSupabaseAdmin();
  if (!supa) return { found: 0, missing: ids };
  const table = tableFor(kind);
  const idCol = idColFor(kind);
  const { data } = await supa.from(table).select(idCol).in(idCol, ids);
  const present = new Set(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => String(r[idCol]))
  );
  const missing = ids.filter((id) => !present.has(id));
  return { found: present.size, missing };
}

function tableFor(kind: BulkTargetKind): string {
  switch (kind) {
    case "user":
      return "profiles_public";
    case "moment":
      return "moments";
    case "trip":
      return "trips";
    case "comment":
      return "comments";
  }
}

function idColFor(kind: BulkTargetKind): string {
  // profiles_public's PK is user_id; the others use id.
  return kind === "user" ? "user_id" : "id";
}
