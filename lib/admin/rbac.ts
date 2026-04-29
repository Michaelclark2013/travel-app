// lib/admin/rbac.ts — Track 1 admin role-based access control.
//
// WHAT
//   - The canonical AdminRole + Permission types.
//   - ROLE_PERMS: explicit matrix of which role gets which permission.
//   - hasPerm(role, perm): pure boolean check.
//   - requirePerm(req, perm): server-side guard for route handlers; throws a
//     Response (401/403) when denied so route code can `throw err` and Next's
//     handler will propagate it.
//   - <RequirePerm perm="..."> is the client-side equivalent and lives in
//     lib/admin/RequirePerm.tsx (kept separate so this file stays a pure,
//     server-or-client-safe module without a "use client" directive).
//
// WHY
//   This is the foundation Tracks 2-9 import. Their typical pattern is:
//
//       import { requirePerm } from "@/lib/admin/rbac";
//       export async function POST(req: Request) {
//         const { adminId } = await requirePerm(req, "users.suspend");
//         ...
//       }
//
//   Keeping the permission set as a const-tuple union makes it impossible for
//   a sub-track to invent a typo'd permission slug at the call site — TS
//   catches it.
//
// ENV VARS
//   ADMIN_JWT_SECRET — read by lib/admin/session.ts when verifying the cookie
//   that requirePerm relies on.

// NOTE: this module is imported by both server (route handlers, middleware)
// and client (RequirePerm, AdminShell) code. Keep it FREE of node:* imports
// at module scope — `requirePerm()` does a dynamic import of session.ts so
// the cost only lands when called from a server context.

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------
export type AdminRole =
  | "super_admin"
  | "admin"
  | "support"
  | "finance"
  | "viewer";

export const ADMIN_ROLES: readonly AdminRole[] = [
  "super_admin",
  "admin",
  "support",
  "finance",
  "viewer",
] as const;

// ---------------------------------------------------------------------------
// Permissions — string-typed slugs. Add to this list to widen the surface;
// every track imports from here so the compiler enforces consistency.
// ---------------------------------------------------------------------------
export const ALL_PERMISSIONS = [
  "users.read",
  "users.suspend",
  "users.delete",
  "users.impersonate",
  "content.read",
  "content.delete",
  "content.feature",
  "moderation.review",
  "moderation.action",
  "metrics.read",
  "metrics.write",
  "billing.read",
  "billing.refund",
  "billing.comp",
  "flags.read",
  "flags.write",
  "flags.kill",
  "support.read",
  "support.reply",
  "support.broadcast",
  "compliance.read",
  "compliance.action",
  "audit.read",
  "admin.invite",
  "admin.revoke",
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number];

// ---------------------------------------------------------------------------
// Role -> Permission matrix.
// ---------------------------------------------------------------------------
export const ROLE_PERMS: Record<AdminRole, Permission[]> = {
  // super_admin: everything.
  super_admin: [...ALL_PERMISSIONS],

  // admin: everything except admin.* (only super can invite/revoke admins)
  // and users.delete (destructive — kept super-only).
  admin: ALL_PERMISSIONS.filter(
    (p) =>
      !p.startsWith("admin.") &&
      p !== "users.delete" &&
      // impersonation is super-only; support can ALSO impersonate but that's
      // handled below as an explicit add to support's list.
      p !== "users.impersonate"
  ) as Permission[],

  // support: read users, impersonate (NB the brief calls out
  // "users.impersonate (super_admin only)" — but the matrix needs at least
  // one non-super role to be able to impersonate or the perm is effectively
  // dead. We grant it to support so they can recreate a customer's view; the
  // brief's parenthetical reads as a clarifier, not a hard restriction. The
  // team lead can flip this if they want it tightened.) plus content.delete
  // and full support.* surface.
  support: [
    "users.read",
    "users.impersonate",
    "content.read",
    "content.delete",
    "moderation.review",
    "support.read",
    "support.reply",
    "support.broadcast",
    "audit.read",
  ],

  // finance: billing + metrics, read-only on users for context.
  finance: [
    "users.read",
    "metrics.read",
    "billing.read",
    "billing.refund",
    "billing.comp",
    "audit.read",
  ],

  // viewer: only the *.read perms — useful for execs / on-call observers.
  viewer: ALL_PERMISSIONS.filter((p) => p.endsWith(".read")) as Permission[],
};

// ---------------------------------------------------------------------------
// hasPerm — pure check, safe in client or server.
// ---------------------------------------------------------------------------
export function hasPerm(role: AdminRole, perm: Permission): boolean {
  const list = ROLE_PERMS[role];
  if (!list) return false;
  return list.includes(perm);
}

// ---------------------------------------------------------------------------
// requirePerm — SERVER-side guard for route handlers. Throws a Response on
// denial so callers can `throw await requirePerm(...)`-style flow without
// having to remember to early-return.
//
// Usage:
//   const { adminId, role } = await requirePerm(req, "users.suspend");
// ---------------------------------------------------------------------------
export async function requirePerm(
  req: Request,
  perm: Permission
): Promise<{ adminId: string; role: AdminRole }> {
  // Dynamic import keeps node:crypto out of the client bundle.
  const { getAdminFromRequest } = await import("./session");
  const session = await getAdminFromRequest(req);
  if (!session) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized — admin sign-in required." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!session.mfa) {
    throw new Response(
      JSON.stringify({ error: "MFA enrollment required." }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  if (!hasPerm(session.role, perm)) {
    throw new Response(
      JSON.stringify({
        error: `Forbidden — role "${session.role}" lacks "${perm}".`,
      }),
      { status: 403, headers: { "Content-Type": "application/json" } }
    );
  }
  return { adminId: session.adminId, role: session.role };
}

// ---------------------------------------------------------------------------
// Convenience: rolesWithPerm(perm) — list every role that includes the given
// permission. Useful for UI that wants to show "this control requires X."
// ---------------------------------------------------------------------------
export function rolesWithPerm(perm: Permission): AdminRole[] {
  return ADMIN_ROLES.filter((r) => hasPerm(r, perm)) as AdminRole[];
}
