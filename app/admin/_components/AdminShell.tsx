"use client";

// app/admin/_components/AdminShell.tsx — Track 1 admin chrome.
//
// WHAT
//   Top bar (email, role, sign-out) and left nav. Hides itself on the
//   /admin/login* and /admin/mfa-setup routes which want the full canvas.
//   Uses <RequirePerm> to dim nav links the user can't access.
//
// WHY a client component
//   - Pulls the session from /api/admin/session (which reads the httpOnly
//     cookie). That fetch must run client-side.
//   - Highlights the active nav item via usePathname().
//
// ENV VARS
//   None.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { RequirePerm } from "@/lib/admin/RequirePerm";
import { useAdminSession } from "@/lib/admin/useAdminSession";
import type { Permission } from "@/lib/admin/rbac";

type NavItem = {
  href: string;
  label: string;
  perm: Permission;
};

const NAV: NavItem[] = [
  { href: "/admin", label: "Dashboard", perm: "metrics.read" },
  { href: "/admin/users", label: "Users", perm: "users.read" },
  { href: "/admin/content", label: "Content", perm: "content.read" },
  { href: "/admin/moderation", label: "Moderation", perm: "moderation.review" },
  { href: "/admin/metrics", label: "Metrics", perm: "metrics.read" },
  { href: "/admin/billing", label: "Billing", perm: "billing.read" },
  { href: "/admin/flags", label: "Flags", perm: "flags.read" },
  { href: "/admin/inbox", label: "Inbox", perm: "support.read" },
  { href: "/admin/compliance", label: "Compliance", perm: "compliance.read" },
  { href: "/admin/search", label: "AI Search", perm: "users.read" },
  { href: "/admin/audit", label: "Audit", perm: "audit.read" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, loading } = useAdminSession();

  // Routes that should render without the chrome (full-bleed pages).
  const isBareRoute =
    pathname?.startsWith("/admin/login") ||
    pathname === "/admin/mfa-setup";

  if (isBareRoute) {
    return <>{children}</>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* ---------------- Top bar ---------------- */}
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "#0b0d10",
          borderBottom: "1px solid #1f2630",
          padding: "10px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
        }}
      >
        <Link
          href="/admin"
          style={{
            color: "#e6e8eb",
            textDecoration: "none",
            fontWeight: 600,
            fontSize: 14,
            letterSpacing: 1,
          }}
        >
          VOYAGE / ADMIN
        </Link>
        <div style={{ flex: 1 }} />
        {loading ? (
          <span style={{ opacity: 0.4, fontSize: 12 }}>…</span>
        ) : session ? (
          <>
            <span style={{ fontSize: 12, opacity: 0.7 }}>
              {session.email ?? session.adminId}
            </span>
            <span
              style={{
                fontSize: 11,
                padding: "2px 8px",
                background: "#1f2630",
                borderRadius: 4,
                opacity: 0.85,
              }}
            >
              {session.role}
            </span>
            <SignOutButton />
          </>
        ) : (
          <Link href="/admin/login" style={{ color: "#93c5fd", fontSize: 13 }}>
            Sign in
          </Link>
        )}
      </header>

      <div style={{ display: "flex", flex: 1 }}>
        {/* ---------------- Left nav ---------------- */}
        <nav
          style={{
            width: 200,
            borderRight: "1px solid #1f2630",
            padding: 16,
            background: "#0b0d10",
            position: "sticky",
            top: 49,
            alignSelf: "flex-start",
            height: "calc(100vh - 49px)",
            overflowY: "auto",
          }}
        >
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {NAV.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/admin" && pathname?.startsWith(item.href));
              return (
                <RequirePerm key={item.href} perm={item.perm}>
                  <li style={{ marginBottom: 2 }}>
                    <Link
                      href={item.href}
                      style={{
                        display: "block",
                        padding: "6px 10px",
                        borderRadius: 4,
                        color: active ? "#e6e8eb" : "#9ba3ad",
                        background: active ? "#1f2630" : "transparent",
                        textDecoration: "none",
                        fontSize: 13,
                      }}
                    >
                      {item.label}
                    </Link>
                  </li>
                </RequirePerm>
              );
            })}
          </ul>
        </nav>
        <main style={{ flex: 1, padding: 24, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}

function SignOutButton() {
  async function onClick() {
    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    window.location.replace("/admin/login");
  }
  return (
    <button
      onClick={onClick}
      style={{
        background: "transparent",
        border: "1px solid #2a3340",
        color: "#e6e8eb",
        padding: "4px 10px",
        borderRadius: 6,
        fontFamily: "inherit",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      Sign out
    </button>
  );
}
