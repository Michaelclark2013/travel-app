"use client";

// components/AbuseReportButton.tsx — Track 3 user-facing abuse-report widget.
//
// WHAT
//   <AbuseReportButton targetKind="moment" targetId={id} /> — renders a
//   small "Report" link/button. On click, opens an inline form with a
//   reason dropdown and an optional note. Submits to /api/moderation/report
//   with the user's Supabase access token.
//
// WHY a self-contained component
//   The brief says "don't wire into existing UI in this track". Each consuming
//   surface (moment card, comment row, DM bubble) can drop this in without
//   needing to know the API shape.
//
// AUTH
//   Requires a Supabase session. We pull the access token from the local
//   client and forward it as a Bearer header.

import { useState } from "react";
import { supabase } from "@/lib/supabase";

const REASONS = [
  { value: "spam", label: "Spam or scam" },
  { value: "harassment", label: "Harassment or hate speech" },
  { value: "sexual", label: "Sexual or NSFW content" },
  { value: "violence", label: "Violence or threats" },
  { value: "self_harm", label: "Self-harm" },
  { value: "off_platform", label: "Trying to take me off-platform" },
  { value: "geo_pii", label: "Reveals someone's real-time location" },
  { value: "other", label: "Other" },
];

export function AbuseReportButton({
  targetKind,
  targetId,
  className,
  style,
}: {
  targetKind: "moment" | "comment" | "dm" | "profile";
  targetId: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | "ok" | string>(null);

  async function submit() {
    setSubmitting(true);
    try {
      const token = supabase
        ? (await supabase.auth.getSession()).data.session?.access_token
        : null;
      if (!token) {
        setDone("Sign in required.");
        return;
      }
      const res = await fetch("/api/moderation/report", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          targetKind,
          targetId,
          reason,
          context: note ? { note } : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setDone(data.error ?? `Failed (${res.status})`);
        return;
      }
      setDone("ok");
    } catch {
      setDone("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className={className}
        style={{
          background: "transparent",
          border: "none",
          color: "#9ba3ad",
          fontSize: 12,
          cursor: "pointer",
          padding: "2px 4px",
          ...style,
        }}
        onClick={() => setOpen(true)}
      >
        Report
      </button>
    );
  }

  if (done === "ok") {
    return (
      <div
        className={className}
        style={{
          padding: 8,
          fontSize: 12,
          color: "#bbf5c5",
          ...style,
        }}
      >
        Thanks — our team will review.
      </div>
    );
  }

  return (
    <div
      className={className}
      style={{
        padding: 10,
        background: "#11151a",
        border: "1px solid #1f2630",
        borderRadius: 6,
        display: "grid",
        gap: 6,
        maxWidth: 320,
        ...style,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7 }}>What's wrong with this?</div>
      <select
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        style={{
          fontSize: 12,
          padding: "4px 6px",
          background: "#0b0d10",
          color: "#e6e8eb",
          border: "1px solid #2a3340",
          borderRadius: 4,
        }}
      >
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 500))}
        placeholder="Optional note (max 500 chars)"
        rows={2}
        style={{
          fontSize: 12,
          padding: "4px 6px",
          background: "#0b0d10",
          color: "#e6e8eb",
          border: "1px solid #2a3340",
          borderRadius: 4,
          fontFamily: "inherit",
          resize: "vertical",
        }}
      />
      {done && done !== "ok" ? (
        <div style={{ fontSize: 11, color: "#fbb" }}>{done}</div>
      ) : null}
      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={submitting}
          style={{
            background: "transparent",
            border: "1px solid #2a3340",
            color: "#9ba3ad",
            borderRadius: 4,
            padding: "4px 10px",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 4,
            padding: "4px 10px",
            fontSize: 12,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Sending…" : "Send report"}
        </button>
      </div>
    </div>
  );
}
