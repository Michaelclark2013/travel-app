"use client";

// app/admin/campaigns/_components/SegmentPicker.tsx — Track 7 shared
// audience selector for push / email / banner composers.

import type { Segment } from "@/lib/admin/support";
import { describeSegment } from "@/lib/admin/support";

const KINDS = [
  "all",
  "has_pro",
  "signed_up_within_days",
  "country",
  "inactive_within_days",
] as const;

export function SegmentPicker({
  value,
  onChange,
}: {
  value: Segment;
  onChange: (s: Segment) => void;
}) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <select
        value={value.kind}
        onChange={(e) => {
          const k = e.target.value as (typeof KINDS)[number];
          if (k === "all") onChange({ kind: "all" });
          else if (k === "has_pro") onChange({ kind: "has_pro", value: true });
          else if (k === "signed_up_within_days")
            onChange({ kind: "signed_up_within_days", value: 7 });
          else if (k === "country") onChange({ kind: "country", value: "US" });
          else if (k === "inactive_within_days")
            onChange({ kind: "inactive_within_days", value: 14 });
        }}
        style={input}
      >
        {KINDS.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>

      {value.kind === "has_pro" && (
        <select
          value={value.value ? "true" : "false"}
          onChange={(e) =>
            onChange({ kind: "has_pro", value: e.target.value === "true" })
          }
          style={input}
        >
          <option value="true">Pro subscribers</option>
          <option value="false">Free users</option>
        </select>
      )}
      {(value.kind === "signed_up_within_days" ||
        value.kind === "inactive_within_days") && (
        <input
          type="number"
          min={1}
          max={365}
          value={value.value as number}
          onChange={(e) =>
            onChange({ ...(value as { kind: typeof value.kind; value: number }), value: Number(e.target.value) })
          }
          style={{ ...input, width: 80 }}
        />
      )}
      {value.kind === "country" && (
        <input
          type="text"
          maxLength={2}
          value={value.value as string}
          onChange={(e) =>
            onChange({ kind: "country", value: e.target.value.toUpperCase() })
          }
          style={{ ...input, width: 80 }}
          placeholder="US"
        />
      )}
      <span style={{ opacity: 0.7, fontSize: 11 }}>
        — {describeSegment(value)}
      </span>
    </div>
  );
}

const input: React.CSSProperties = {
  background: "#0b0d10",
  border: "1px solid #2a3340",
  color: "#e6e8eb",
  padding: "6px 8px",
  borderRadius: 6,
  fontFamily: "inherit",
  fontSize: 12,
};
