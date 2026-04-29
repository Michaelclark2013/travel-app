"use client";

// lib/admin/RequirePerm.tsx — Track 1 client-side permission gate.
//
// WHAT
//   <RequirePerm perm="users.suspend">{children}</RequirePerm>
//   Renders children only when the current admin session has the named
//   permission. Renders a `fallback` prop (or null) otherwise. Useful for
//   hiding nav links and action buttons.
//
// WHY a client component (and not a server one)
//   The admin nav is rendered in a server layout, but it has interactive
//   children (sign-out, route highlight, etc.). Doing the perm check from
//   the client lets us re-render on focus when the session refreshes
//   without a full page reload.
//
//   IMPORTANT — this is *defense in depth*. Any sensitive mutation MUST also
//   be guarded server-side via lib/admin/rbac:requirePerm(). Hiding a button
//   in CSS is not a security boundary.
//
// ENV VARS
//   None.

import type { ReactNode } from "react";
import type { Permission } from "./rbac";
import { hasPerm } from "./rbac";
import { useAdminSession } from "./useAdminSession";

export function RequirePerm({
  perm,
  children,
  fallback = null,
}: {
  perm: Permission;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { session, loading } = useAdminSession();
  if (loading) return null;
  if (!session) return <>{fallback}</>;
  if (!hasPerm(session.role, perm)) return <>{fallback}</>;
  return <>{children}</>;
}
