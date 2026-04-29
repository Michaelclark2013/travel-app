// app/admin/layout.tsx — Track 1 admin shell.
//
// WHAT
//   Sticky top bar (email + role + sign-out), left nav, dark monospace
//   theme. Wraps every page under /admin (except /admin/login* and
//   /admin/mfa-setup which render their own full-screen layout via
//   plain <main> — they don't import this layout because Next renders the
//   nearest layout.tsx, and we put the shell in this file at the /admin
//   level. The login + MFA pages live UNDER /admin/login and /admin/mfa-setup
//   so they DO get this layout — but middleware lets them bypass auth, and
//   inside the layout we conditionally hide the chrome when there's no
//   session.
//
// WHY
//   Server component so the initial paint is fast. Interactive bits
//   (perm-aware nav highlighting, sign-out button, session display) live in
//   client components imported below.
//
// ENV VARS
//   ADMIN_JWT_SECRET (server-side cookie verify).

import type { ReactNode } from "react";
import { AdminShell } from "./_components/AdminShell";
// Track 9: AdminCopilot is a Cmd+. side-panel chat that listens for
// the keyboard shortcut globally. Mounting it here means every admin
// route gets the copilot for free; per-page context is set by the
// pages themselves if they want to pass `context` to the rendered
// instance, otherwise it defaults to the current pathname.
import AdminCopilot from "@/components/AdminCopilot";

export const metadata = {
  title: "Voyage Admin",
  robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b0d10",
        color: "#e6e8eb",
        fontFamily:
          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
        colorScheme: "dark",
      }}
    >
      <AdminShell>{children}</AdminShell>
      <AdminCopilot />
    </div>
  );
}
