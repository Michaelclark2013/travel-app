"use client";

// app/admin/_components/JsonDiff.tsx — Track 1 dependency-free JSON diff.
//
// WHAT
//   Side-by-side, line-by-line diff of two JSON values. Pretty-prints both
//   sides with JSON.stringify(_, null, 2), splits by line, and renders
//   matching lines plain + differing lines highlighted in red/green.
//
// WHY no library
//   Brief: no new npm deps. The data here is small (one audit row's
//   before/after blob); a naive line-by-line align is fine. We pad the
//   shorter side so both columns line up vertically.
//
// LIMITATIONS
//   This is a positional diff, not a true LCS. If a field is inserted in
//   the middle of an object, every line below it will appear changed.
//   That's a known tradeoff for the audit-log usecase where most diffs are
//   1-2 keys flipped.

import { useMemo } from "react";

export function JsonDiff({
  before,
  after,
}: {
  before: unknown;
  after: unknown;
}) {
  const beforeLines = useMemo(() => stringifyLines(before), [before]);
  const afterLines = useMemo(() => stringifyLines(after), [after]);
  const max = Math.max(beforeLines.length, afterLines.length);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
        fontFamily: "inherit",
        fontSize: 12,
      }}
    >
      <Pane title="before" lines={beforeLines} other={afterLines} max={max} side="before" />
      <Pane title="after" lines={afterLines} other={beforeLines} max={max} side="after" />
    </div>
  );
}

function Pane({
  title,
  lines,
  other,
  max,
  side,
}: {
  title: string;
  lines: string[];
  other: string[];
  max: number;
  side: "before" | "after";
}) {
  const padded = padTo(lines, max);
  const otherPadded = padTo(other, max);
  return (
    <div
      style={{
        background: "#0b0d10",
        border: "1px solid #1f2630",
        borderRadius: 6,
        padding: 8,
        overflow: "auto",
      }}
    >
      <div
        style={{
          fontSize: 10,
          opacity: 0.5,
          letterSpacing: 1,
          marginBottom: 6,
        }}
      >
        {title.toUpperCase()}
      </div>
      <pre
        style={{
          margin: 0,
          fontFamily: "inherit",
          whiteSpace: "pre",
          lineHeight: 1.45,
        }}
      >
        {padded.map((line, i) => {
          const same = line === otherPadded[i];
          const isPad = line === PAD_LINE;
          let bg = "transparent";
          if (!same && !isPad) {
            bg = side === "before" ? "rgba(220,38,38,0.18)" : "rgba(34,197,94,0.18)";
          }
          return (
            <div
              key={i}
              style={{
                background: bg,
                padding: "0 4px",
                opacity: isPad ? 0.25 : 1,
              }}
            >
              {isPad ? " " : line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function stringifyLines(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  let s: string;
  try {
    s = JSON.stringify(value, null, 2);
  } catch {
    s = String(value);
  }
  return s.split("\n");
}

const PAD_LINE = "\x00pad\x00";

function padTo(lines: string[], n: number): string[] {
  if (lines.length >= n) return lines;
  return lines.concat(Array(n - lines.length).fill(PAD_LINE));
}
