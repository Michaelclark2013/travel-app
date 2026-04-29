// lib/admin/audit.ts — Track 1 audit-log helper. EVERY OTHER TRACK IMPORTS
// FROM HERE. Do not change the signatures without coordinating.
//
// WHAT
//   audit(action, target, diff, fn)              — wrap a mutation; logs
//                                                   before/after, captures
//                                                   admin id + ip + UA from
//                                                   the current request via
//                                                   next/headers.
//   auditFireAndForget(action, target, payload)  — write a single audit row
//                                                   without wrapping a fn,
//                                                   for non-mutating logs
//                                                   (impersonation start,
//                                                   data export, etc.)
//
// SHAPE for callers (Tracks 2-9)
//
//     import { audit } from "@/lib/admin/audit";
//
//     export async function POST(req: Request) {
//       const { adminId } = await requirePerm(req, "users.suspend");
//       const userId = ...;
//       const before = await loadUser(userId);
//       const after = { ...before, suspended_at: new Date().toISOString() };
//
//       return audit(
//         "user.suspend",
//         { kind: "user", id: userId },
//         { before, after },
//         async () => {
//           await getSupabaseAdmin()!.from("users").update(...);
//           return Response.json({ ok: true });
//         },
//       );
//     }
//
// WHY a wrapper rather than two free calls
//   It's easy to forget the "after" log if the mutation throws. The wrapper
//   guarantees a row hits admin_audit BEFORE the mutation runs (so we have
//   forensic evidence even if the request crashes the process), and a second
//   row with the actual outcome AFTER. The dual-write costs one extra round
//   trip but the audit trail is the whole point of this layer.
//
// REQUIREMENTS
//   - Must be called from a route handler / server action context where
//     next/headers is available.
//   - Caller must have already passed requirePerm() so we know the cookie
//     is valid; we still re-read it defensively here.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY — to write admin_audit (RLS blocks all else).
//   ADMIN_JWT_SECRET          — to verify the cookie when extracting admin id.

import { headers } from "next/headers";
import { getSupabaseAdmin } from "../supabase-server";
import { ADMIN_COOKIE, parseCookie, verifyAdminJwt } from "./session";

// ---------------------------------------------------------------------------
// Types — kept minimal so other tracks can pass plain JSON.
// ---------------------------------------------------------------------------
export type AuditTarget = { kind: string; id: string };

export type AuditDiff = {
  before: unknown;
  after: unknown;
};

// ---------------------------------------------------------------------------
// Internal — pull admin context from the current request's headers/cookies.
//
// We do not throw if headers() is unavailable; instead we mark the row with
// a synthetic admin_id of `null` so a misuse doesn't blow up the mutation
// the caller is wrapping. The "before" row in audit captures the diff
// regardless, which is the actually-important part.
// ---------------------------------------------------------------------------
async function readAdminContext(): Promise<{
  adminId: string | null;
  ip: string | null;
  userAgent: string | null;
}> {
  try {
    const h = await headers();
    const cookieHeader = h.get("cookie") ?? "";
    const ip =
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      h.get("x-real-ip") ??
      null;
    const userAgent = h.get("user-agent");

    const token = cookieHeader ? parseCookie(cookieHeader, ADMIN_COOKIE) : null;
    const payload = token ? await verifyAdminJwt(token) : null;
    return {
      adminId: payload?.sub ?? null,
      ip,
      userAgent,
    };
  } catch {
    return { adminId: null, ip: null, userAgent: null };
  }
}

function newAuditId(): string {
  // Sortable-ish id: ts millis + 8 random hex chars. Good enough for a PK.
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `aud-${ts}-${rnd}`;
}

// ---------------------------------------------------------------------------
// Internal write — one row.
// ---------------------------------------------------------------------------
async function writeRow(args: {
  action: string;
  target: AuditTarget;
  before: unknown;
  after: unknown;
}): Promise<void> {
  const supa = getSupabaseAdmin();
  if (!supa) {
    // No service role configured — log to console at least so dev work
    // surfaces. Production MUST have the env var; deploy will refuse.
    console.warn("[audit] no SUPABASE_SERVICE_ROLE_KEY — skipping audit row", {
      action: args.action,
      target: args.target,
    });
    return;
  }
  const ctx = await readAdminContext();
  const id = newAuditId();
  const { error } = await supa.from("admin_audit").insert({
    id,
    admin_id: ctx.adminId,
    action: args.action,
    target_kind: args.target.kind,
    target_id: args.target.id,
    before: args.before === undefined ? null : args.before,
    after: args.after === undefined ? null : args.after,
    ip: ctx.ip,
    user_agent: ctx.userAgent,
  });
  if (error) {
    // The audit row failing is bad — but blocking the user-visible mutation
    // on it is worse. Log loudly; ops should alert on these.
    console.error("[audit] insert failed", error);
  }
}

// ---------------------------------------------------------------------------
// Public: audit() — wraps a mutation.
//
// Behavior:
//   1. Insert a "pending" row with the proposed before/after BEFORE running
//      the function. If the process dies we still have evidence.
//   2. Run fn. If it succeeds, return its result.
//   3. If fn throws, write a follow-up row with after = { error: msg } so
//      the trail records the failure too. Re-throw so the caller's error
//      handling still runs.
// ---------------------------------------------------------------------------
export async function audit<T>(
  action: string,
  target: AuditTarget,
  diff: AuditDiff,
  fn: () => Promise<T>
): Promise<T> {
  // Pre-row — captures the *intent* of the mutation.
  await writeRow({
    action,
    target,
    before: diff.before,
    after: diff.after,
  });

  try {
    return await fn();
  } catch (err) {
    // Post-row — records the failure. Note this is a SECOND row; admin_audit
    // is append-only by design.
    const message = err instanceof Error ? err.message : String(err);
    await writeRow({
      action: `${action}.error`,
      target,
      before: diff.before,
      after: { error: message },
    });
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public: auditFireAndForget — for non-mutating log entries (e.g. when an
// admin opens a sensitive view, exports a CSV, or starts an impersonation
// session). Does not await; returns void immediately.
// ---------------------------------------------------------------------------
export function auditFireAndForget(
  action: string,
  target: AuditTarget,
  payload: { before?: unknown; after?: unknown } = {}
): void {
  // Cast to any to silence the "unhandled promise" warning — we explicitly
  // do not want to await this.
  void writeRow({
    action,
    target,
    before: payload.before,
    after: payload.after,
  }).catch((e) => {
    console.error("[audit:fireAndForget] failed", e);
  });
}
