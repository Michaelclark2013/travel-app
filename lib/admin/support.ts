// lib/admin/support.ts — Track 7 helpers shared by inbox + outbound routes.
//
// WHAT
//   - newId(prefix): short sortable id used for tickets, campaigns, macros.
//   - SLA defaults: how long before a ticket is "overdue" by priority.
//   - renderMarkdown(md): tiny safe Markdown -> HTML for email campaigns.
//     Hand-rolled — we don't add a dependency for a feature this small.
//
// WHY hand-rolled Markdown
//   The brief explicitly forbids new npm deps. The supported subset is:
//   headings (#, ##, ###), bold (**…**), italic (*…* / _…_), inline code
//   (`…`), code blocks (```…```), unordered lists (- …), ordered lists
//   (1. …), links ([text](url)), and paragraphs separated by blank lines.
//   Everything else is escaped. URLs are validated to start with
//   https?:// or mailto: to prevent javascript: smuggling.

import type { Permission } from "./rbac";

export type TicketStatus = "new" | "open" | "pending" | "resolved" | "spam";
export type TicketPriority = "low" | "normal" | "high" | "urgent";
export type CampaignKind = "push" | "email" | "banner";
export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "cancelled";

export const TICKET_STATUSES: TicketStatus[] = [
  "new",
  "open",
  "pending",
  "resolved",
  "spam",
];
export const TICKET_PRIORITIES: TicketPriority[] = [
  "low",
  "normal",
  "high",
  "urgent",
];

// SLA: how long an admin has to make first response per priority. The header
// timer in /admin/inbox/[ticketId] uses sla_due_at directly; this map is the
// default we set when creating a ticket.
export const SLA_HOURS: Record<TicketPriority, number> = {
  urgent: 1,
  high: 4,
  normal: 24,
  low: 72,
};

export function defaultSlaDueAt(
  priority: TicketPriority,
  from: Date = new Date()
): string {
  const hours = SLA_HOURS[priority];
  return new Date(from.getTime() + hours * 60 * 60 * 1000).toISOString();
}

// Short, sortable, URL-safe id. Same shape as audit ids but with a custom
// prefix per resource ("tic", "msg", "cmp", "can").
export function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 36).toString(36)
  ).join("");
  return `${prefix}-${ts}-${rnd}`;
}

// Permission contract — exposing as a const helps callers stay in sync.
export const TRACK_7_PERMS: { read: Permission; reply: Permission; broadcast: Permission } =
  {
    read: "support.read",
    reply: "support.reply",
    broadcast: "support.broadcast",
  };

// ---------------------------------------------------------------------------
// Markdown -> HTML (server-side, library-free).
// ---------------------------------------------------------------------------
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]!;
  });
}

function safeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return "#";
}

// Inline replacements: bold, italic, code, links. Order matters — we
// escape HTML up front, then re-introduce a constrained set of tags.
function renderInline(line: string): string {
  let out = escapeHtml(line);
  // inline code first so its contents aren't re-processed
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // italic — both *…* and _…_, but not inside the **bold** we already
  // wrapped (the regex requires non-* on either side).
  out = out.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
  out = out.replace(/(^|[^_])_([^_]+)_(?!_)/g, "$1<em>$2</em>");
  // links: [text](href)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, href) => {
    const url = safeUrl(href);
    return `<a href="${url}">${text}</a>`;
  });
  return out;
}

export function renderMarkdown(input: string): string {
  const src = (input ?? "").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const out: string[] = [];
  let i = 0;
  let para: string[] = [];
  let listKind: "ul" | "ol" | null = null;

  function flushPara() {
    if (para.length === 0) return;
    out.push(`<p>${para.map(renderInline).join(" ")}</p>`);
    para = [];
  }
  function closeList() {
    if (listKind === "ul") out.push("</ul>");
    else if (listKind === "ol") out.push("</ol>");
    listKind = null;
  }

  while (i < lines.length) {
    const line = lines[i] ?? "";
    // fenced code block
    if (/^```/.test(line)) {
      flushPara();
      closeList();
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i] ?? "")) {
        code.push(lines[i] ?? "");
        i += 1;
      }
      i += 1; // consume closing fence (or EOF)
      out.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }
    // headings
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flushPara();
      closeList();
      const level = heading[1]!.length;
      const text = renderInline(heading[2]!);
      out.push(`<h${level}>${text}</h${level}>`);
      i += 1;
      continue;
    }
    // unordered list
    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    if (ul) {
      flushPara();
      if (listKind !== "ul") {
        closeList();
        out.push("<ul>");
        listKind = "ul";
      }
      out.push(`<li>${renderInline(ul[1]!)}</li>`);
      i += 1;
      continue;
    }
    // ordered list
    const ol = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      flushPara();
      if (listKind !== "ol") {
        closeList();
        out.push("<ol>");
        listKind = "ol";
      }
      out.push(`<li>${renderInline(ol[1]!)}</li>`);
      i += 1;
      continue;
    }
    // blank line ends paragraphs / lists
    if (line.trim() === "") {
      flushPara();
      closeList();
      i += 1;
      continue;
    }
    // accumulate paragraph
    closeList();
    para.push(line.trim());
    i += 1;
  }
  flushPara();
  closeList();
  return out.join("\n");
}

// Simple tokenless segment selector — pure function used by the campaign
// API so the same logic is testable in isolation.
export type Segment =
  | { kind: "all" }
  | { kind: "has_pro"; value: boolean }
  | { kind: "signed_up_within_days"; value: number }
  | { kind: "country"; value: string }
  | { kind: "inactive_within_days"; value: number };

export function describeSegment(s: Segment): string {
  switch (s.kind) {
    case "all":
      return "All users";
    case "has_pro":
      return s.value ? "Voyage Pro subscribers" : "Free-tier users";
    case "signed_up_within_days":
      return `Signed up in last ${s.value} days`;
    case "country":
      return `Country: ${s.value.toUpperCase()}`;
    case "inactive_within_days":
      return `Inactive for ${s.value}+ days`;
  }
}
