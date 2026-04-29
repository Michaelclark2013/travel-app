// app/admin/users/[id]/page.tsx — Track 2 user detail.
//
// WHAT
//   Identity panel, devices list, content counts, ban state, Pro
//   entitlement, and the action buttons:
//     - suspend / restore  (users.suspend)
//     - force sign-out     (users.suspend)
//     - reset password     (users.suspend, returns a recovery link)
//     - comp Pro N days    (billing.comp; falls back to audit when Track 5
//                           hasn't shipped pro_entitlements)
//     - soft-delete        (users.delete; super-only per ROLE_PERMS)
//     - Login as user      (users.impersonate; super-only enforced server)
//
// PERMISSION GATE
//   Page itself: users.read (server route /api/admin/users/[id]).
//   Each action button is gated client-side by <RequirePerm> AND server-
//   side by the action's own route handler.
//
// ENV VARS
//   None on the client.

"use client";

import { useCallback, useEffect, useState, use } from "react";
import { RequirePerm } from "@/lib/admin/RequirePerm";

type DetailResponse = {
  ok: boolean;
  identity: {
    user_id: string;
    email: string | null;
    username: string | null;
    display_name: string | null;
    bio: string | null;
    signup: string | null;
    last_active: string | null;
    deleted_at: string | null;
    hidden_at: string | null;
  };
  devices: { ua: string; ip: string | null; last_seen: string }[];
  counts: {
    trips: number;
    moments: number;
    comments: number;
    follows_in: number;
    follows_out: number;
  };
  ban: { banned_until: string | null };
  pro: { active: boolean; expires_at: string | null };
};

export default function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<DetailResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [resetLink, setResetLink] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { credentials: "include" });
      const d = await res.json();
      if (!d.ok) {
        setError(d.error ?? "request failed");
        return;
      }
      setData(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function callAction(path: string, body: unknown, label: string) {
    setBusy(label);
    setResetLink(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const d = await res.json();
      if (!d.ok) {
        alert(`${label} failed: ${d.error ?? res.statusText}`);
      } else if (d.link) {
        setResetLink(d.link);
      } else {
        await load();
      }
    } finally {
      setBusy(null);
    }
  }

  if (error) {
    return <div style={{ color: "#ff8b9b" }}>{error}</div>;
  }
  if (!data) {
    return <div style={{ opacity: 0.6 }}>Loading…</div>;
  }

  const banned =
    data.ban.banned_until && new Date(data.ban.banned_until) > new Date();

  return (
    <div>
      <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>USER</div>
      <h1 style={{ fontSize: 22, margin: "6px 0 16px", fontWeight: 600 }}>
        {data.identity.display_name ?? data.identity.username ?? data.identity.user_id}
      </h1>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Panel title="IDENTITY">
          <Field label="User id" value={data.identity.user_id} mono />
          <Field label="Email" value={data.identity.email ?? "—"} />
          <Field label="Username" value={data.identity.username ?? "—"} />
          <Field label="Display name" value={data.identity.display_name ?? "—"} />
          <Field label="Signup" value={fmtDate(data.identity.signup)} />
          <Field label="Last active" value={fmtDate(data.identity.last_active)} />
          {data.identity.deleted_at ? (
            <Field label="Soft-deleted at" value={fmtDate(data.identity.deleted_at)} />
          ) : null}
        </Panel>

        <Panel title="STATE">
          <Field
            label="Ban"
            value={banned ? `banned until ${fmtDate(data.ban.banned_until)}` : "active"}
          />
          <Field
            label="Pro"
            value={
              data.pro.active
                ? `active · expires ${fmtDate(data.pro.expires_at)}`
                : "free"
            }
          />
          <Field label="Trips" value={String(data.counts.trips)} />
          <Field label="Moments" value={String(data.counts.moments)} />
          <Field label="Comments" value={String(data.counts.comments)} />
          <Field
            label="Follows"
            value={`${data.counts.follows_in} in · ${data.counts.follows_out} out`}
          />
        </Panel>
      </div>

      <Panel title="DEVICES">
        {data.devices.length === 0 ? (
          <div style={{ opacity: 0.6, fontSize: 12 }}>No device history.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", opacity: 0.6 }}>
                <th style={{ padding: "4px 8px" }}>USER AGENT</th>
                <th style={{ padding: "4px 8px" }}>IP</th>
                <th style={{ padding: "4px 8px" }}>LAST SEEN</th>
              </tr>
            </thead>
            <tbody>
              {data.devices.map((d, i) => (
                <tr key={i} style={{ borderTop: "1px solid #1a1f28" }}>
                  <td style={{ padding: "6px 8px", maxWidth: 480, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {d.ua}
                  </td>
                  <td style={{ padding: "6px 8px", opacity: 0.7 }}>{d.ip ?? "—"}</td>
                  <td style={{ padding: "6px 8px", opacity: 0.7 }}>{fmtDate(d.last_seen)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="ACTIONS">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <RequirePerm perm="users.suspend">
            {banned ? (
              <button
                onClick={() => callAction(`/api/admin/users/${id}/suspend`, { restore: true }, "Restore")}
                disabled={!!busy}
                style={btn()}
              >
                {busy === "Restore" ? "…" : "Restore"}
              </button>
            ) : (
              <button
                onClick={() => {
                  const h = prompt("Suspend for how many hours?", "24");
                  if (!h) return;
                  void callAction(`/api/admin/users/${id}/suspend`, { hours: Number(h) }, "Suspend");
                }}
                disabled={!!busy}
                style={btn("warn")}
              >
                {busy === "Suspend" ? "…" : "Suspend"}
              </button>
            )}
            <button
              onClick={() => callAction(`/api/admin/users/${id}/sign-out`, null, "Sign-out")}
              disabled={!!busy}
              style={btn()}
            >
              {busy === "Sign-out" ? "…" : "Force sign-out"}
            </button>
            <button
              onClick={() => callAction(`/api/admin/users/${id}/reset-password`, null, "Reset")}
              disabled={!!busy}
              style={btn()}
            >
              {busy === "Reset" ? "…" : "Reset password"}
            </button>
          </RequirePerm>
          <RequirePerm perm="billing.comp">
            <button
              onClick={() => {
                const d = prompt("Comp Pro for how many days?", "30");
                if (!d) return;
                void callAction(`/api/admin/users/${id}/comp-pro`, { days: Number(d) }, "Comp");
              }}
              disabled={!!busy}
              style={btn()}
            >
              {busy === "Comp" ? "…" : "Comp Pro"}
            </button>
          </RequirePerm>
          <RequirePerm perm="users.delete">
            <button
              onClick={() => {
                if (!confirm("Soft-delete this user? This sets deleted_at; content remains for audit.")) return;
                void callAction(`/api/admin/users/${id}/delete`, null, "Delete");
              }}
              disabled={!!busy}
              style={btn("danger")}
            >
              {busy === "Delete" ? "…" : "Soft-delete"}
            </button>
          </RequirePerm>
          <RequirePerm perm="users.impersonate">
            <form
              method="POST"
              action={`/api/admin/users/${id}/impersonate`}
              style={{ display: "inline" }}
            >
              <button type="submit" style={btn("warn")}>
                Login as user
              </button>
            </form>
          </RequirePerm>
        </div>
        {resetLink ? (
          <div
            style={{
              marginTop: 12,
              padding: 8,
              background: "#0b0d10",
              border: "1px solid #2a3340",
              borderRadius: 4,
              fontSize: 11,
              wordBreak: "break-all",
            }}
          >
            <div style={{ opacity: 0.6, marginBottom: 4 }}>RECOVERY LINK</div>
            <code>{resetLink}</code>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section
      style={{
        marginTop: 16,
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 6,
        padding: 12,
      }}
    >
      <div style={{ fontSize: 10, letterSpacing: 1, opacity: 0.6, marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", padding: "4px 0", fontSize: 12 }}>
      <div style={{ width: 130, opacity: 0.6 }}>{label}</div>
      <div style={{ fontFamily: mono ? "inherit" : undefined }}>{value}</div>
    </div>
  );
}

function btn(variant: "default" | "warn" | "danger" = "default") {
  const colors = {
    default: { bg: "transparent", fg: "#e6e8eb", bd: "#2a3340" },
    warn: { bg: "#2a1d0d", fg: "#ffd28a", bd: "#5b3a18" },
    danger: { bg: "#3a0d0d", fg: "#ff8b9b", bd: "#5b1818" },
  }[variant];
  return {
    background: colors.bg,
    color: colors.fg,
    border: `1px solid ${colors.bd}`,
    padding: "6px 12px",
    borderRadius: 4,
    fontFamily: "inherit",
    fontSize: 12,
    cursor: "pointer",
  } as const;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toISOString().replace("T", " ").slice(0, 16);
  } catch {
    return "—";
  }
}
