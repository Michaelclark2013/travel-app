// lib/admin/store.ts — Track 1 server-side admin store helpers.
//
// WHAT
//   Thin wrappers over the admin_roles / admin_invites tables so route
//   handlers don't have to know table names. All methods use the service
//   role client; never call from "use client" code.
//
// WHY
//   Centralizing the SQL keeps schema migrations to one file to update if
//   anything moves. Tracks 2-9 should NOT import from here directly — they
//   should only need lib/admin/audit.ts and lib/admin/rbac.ts. This module
//   is for Track 1's own routes (login/verify, invite/check, etc).
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL.
//   ADMIN_SEED_EMAILS — comma-separated list of email addresses that are
//                       implicit super_admins on first login (bootstraps
//                       the first admin without needing a SQL insert).

import { getSupabaseAdmin } from "../supabase-server";
import type { AdminRole } from "./rbac";

// ---------------------------------------------------------------------------
// Seed list — emails that are implicit super_admins. Set in Vercel.
// ---------------------------------------------------------------------------
export function isSeedAdmin(email: string): boolean {
  const raw = process.env.ADMIN_SEED_EMAILS ?? "";
  const list = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

// ---------------------------------------------------------------------------
// Find a Supabase auth.user.id by email. Used at login when we need to
// resolve which admin is signing in.
// ---------------------------------------------------------------------------
export async function findUserIdByEmail(email: string): Promise<string | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  // The auth schema lookup goes through the admin API.
  // Note: listUsers paginates; for the admin set we expect a small number
  // of users at most. For this MVP we filter client-side after fetching the
  // first page; team lead can swap for a server-side filter later.
  const cleaned = email.trim().toLowerCase();
  // The supa.auth.admin namespace is typed but listUsers' option shape has
  // shifted across SDK versions; cast to a loose record to stay forward
  // compatible with patch bumps.
  const adminAuth = (supa.auth as unknown as {
    admin: {
      listUsers: (
        opts: { page: number; perPage: number }
      ) => Promise<{
        data: { users: { id: string; email?: string | null }[] } | null;
      }>;
    };
  }).admin;
  const res = await adminAuth.listUsers({ page: 1, perPage: 200 });
  const users = res?.data?.users ?? [];
  const match = users.find(
    (u: { email?: string | null; id: string }) =>
      (u.email ?? "").toLowerCase() === cleaned
  );
  return match?.id ?? null;
}

// ---------------------------------------------------------------------------
// Lookup an admin's role + MFA state.
// ---------------------------------------------------------------------------
export type AdminRoleRow = {
  user_id: string;
  role: AdminRole;
  mfa_enrolled: boolean;
  mfa_secret_encrypted: Buffer | null;
};

export async function getAdminRole(
  userId: string
): Promise<AdminRoleRow | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  const { data, error } = await supa
    .from("admin_roles")
    .select("user_id, role, mfa_enrolled, mfa_secret_encrypted")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  // Postgres bytea comes back as a base64-prefixed string via PostgREST
  // ("\\x..."). Normalize to Buffer.
  let secret: Buffer | null = null;
  if (data.mfa_secret_encrypted) {
    const raw: unknown = data.mfa_secret_encrypted;
    if (typeof raw === "string" && raw.startsWith("\\x")) {
      secret = Buffer.from(raw.slice(2), "hex");
    } else if (raw && typeof raw === "object" && raw instanceof Uint8Array) {
      secret = Buffer.from(raw);
    }
  }
  return {
    user_id: data.user_id,
    role: data.role as AdminRole,
    mfa_enrolled: !!data.mfa_enrolled,
    mfa_secret_encrypted: secret,
  };
}

// ---------------------------------------------------------------------------
// Upsert a role row. Used by login bootstrap (seed-list) and the invite
// acceptance flow. Returns the new row.
// ---------------------------------------------------------------------------
export async function upsertAdminRole(args: {
  userId: string;
  role: AdminRole;
  grantedBy?: string | null;
}): Promise<AdminRoleRow | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  const { error } = await supa.from("admin_roles").upsert(
    {
      user_id: args.userId,
      role: args.role,
      granted_by: args.grantedBy ?? null,
      granted_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) {
    console.error("[admin/store] upsertAdminRole failed", error);
    return null;
  }
  return getAdminRole(args.userId);
}

// ---------------------------------------------------------------------------
// MFA — store / clear the encrypted secret.
// ---------------------------------------------------------------------------
export async function setMfaSecret(
  userId: string,
  encrypted: Buffer,
  enrolled: boolean
): Promise<boolean> {
  const supa = getSupabaseAdmin();
  if (!supa) return false;
  const { error } = await supa
    .from("admin_roles")
    .update({
      mfa_enrolled: enrolled,
      // Cast Buffer to bytea-compatible value. Supabase JS lets us pass a
      // Uint8Array which is encoded as base64 and parsed back as bytea.
      mfa_secret_encrypted: encrypted,
    })
    .eq("user_id", userId);
  if (error) {
    console.error("[admin/store] setMfaSecret failed", error);
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Invites — minimal CRUD.
// ---------------------------------------------------------------------------
export async function findActiveInvite(email: string): Promise<{
  token: string;
  email: string;
  role: AdminRole;
  expires_at: string;
} | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  const { data, error } = await supa
    .from("admin_invites")
    .select("token, email, role, expires_at, accepted_at")
    .ilike("email", email.trim().toLowerCase())
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    token: data.token,
    email: data.email,
    role: data.role as AdminRole,
    expires_at: data.expires_at,
  };
}

export async function consumeInvite(token: string): Promise<boolean> {
  const supa = getSupabaseAdmin();
  if (!supa) return false;
  const { error } = await supa
    .from("admin_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("token", token)
    .is("accepted_at", null);
  if (error) {
    console.error("[admin/store] consumeInvite failed", error);
    return false;
  }
  return true;
}
