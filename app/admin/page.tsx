// app/admin/page.tsx — Track 1 admin dashboard / landing.
//
// WHAT
//   Greets the admin by email, shows their role and the permissions that
//   role grants, and lays out placeholder cards for the upcoming sections
//   that Tracks 2-9 will fill in.
//
// WHY a server component
//   We can read the cookie server-side via getAdminFromRequest() pulled
//   from next/headers, which avoids an extra client fetch + flash. The
//   middleware already gates this route, so we know the session exists.
//
// ENV VARS
//   ADMIN_JWT_SECRET — to verify the cookie.

import Link from "next/link";
import { headers } from "next/headers";
import {
  ADMIN_COOKIE,
  parseCookie,
  verifyAdminJwt,
} from "@/lib/admin/session";
import { ROLE_PERMS, type AdminRole } from "@/lib/admin/rbac";

async function readSession() {
  const h = await headers();
  const cookie = h.get("cookie") ?? "";
  const token = parseCookie(cookie, ADMIN_COOKIE);
  if (!token) return null;
  const payload = await verifyAdminJwt(token);
  if (!payload) return null;
  return {
    adminId: payload.sub,
    role: payload.role as AdminRole,
    email: payload.email ?? null,
    mfa: payload.mfa,
  };
}

const PLACEHOLDER_CARDS = [
  { title: "Users", desc: "Track 2 — search, suspend, impersonate, delete.", href: "/admin/users" },
  { title: "Moderation", desc: "Track 3 — content review queue + actions.", href: "/admin/moderation" },
  { title: "Metrics", desc: "Track 4 — dashboards, KPIs, drilldowns.", href: "/admin/metrics" },
  { title: "Billing", desc: "Track 5 — subs, refunds, comp grants.", href: "/admin/billing" },
  { title: "Flags", desc: "Track 6 — feature flags, kill switches.", href: "/admin/flags" },
  { title: "Inbox", desc: "Track 7 — support replies, broadcasts.", href: "/admin/inbox" },
  { title: "Compliance", desc: "Track 8 — DSARs, exports, retention.", href: "/admin/compliance" },
  { title: "AI Search", desc: "Track 9 — natural-language admin queries.", href: "/admin/search" },
];

export default async function AdminDashboard() {
  const session = await readSession();
  if (!session) {
    // Middleware should have redirected — render a fallback in case it didn't.
    return (
      <div>
        <p>Not signed in.</p>
        <Link href="/admin/login" style={{ color: "#93c5fd" }}>
          Sign in →
        </Link>
      </div>
    );
  }

  const perms = ROLE_PERMS[session.role] ?? [];

  return (
    <div>
      <header style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          DASHBOARD
        </div>
        <h1 style={{ fontSize: 24, margin: "6px 0 4px", fontWeight: 600 }}>
          {session.email ? `Hi, ${session.email}` : "Admin"}
        </h1>
        <div style={{ opacity: 0.7, fontSize: 13 }}>
          Role: <strong>{session.role}</strong>
        </div>
      </header>

      <section
        style={{
          background: "#11151a",
          border: "1px solid #1f2630",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
        }}
      >
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          PERMISSIONS ({perms.length})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {perms.map((p) => (
            <span
              key={p}
              style={{
                fontSize: 11,
                padding: "2px 8px",
                background: "#0b0d10",
                border: "1px solid #1f2630",
                borderRadius: 4,
              }}
            >
              {p}
            </span>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Link href="/admin/audit" style={{ color: "#93c5fd", fontSize: 13 }}>
            View audit log →
          </Link>
        </div>
      </section>

      <section>
        <div
          style={{
            fontSize: 11,
            opacity: 0.6,
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          SECTIONS
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
            gap: 12,
          }}
        >
          {PLACEHOLDER_CARDS.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              style={{
                display: "block",
                padding: 14,
                background: "#11151a",
                border: "1px solid #1f2630",
                borderRadius: 8,
                textDecoration: "none",
                color: "#e6e8eb",
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7, lineHeight: 1.5 }}>
                {c.desc}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
