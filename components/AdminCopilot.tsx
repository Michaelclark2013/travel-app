"use client";

// components/AdminCopilot.tsx — Track 9 embedded admin copilot.
//
// WHAT
//   Side-panel chat. ⌘. (cmd-period) toggles open/close from anywhere on an
//   admin page. Pass a `context` prop describing the page; the server route
//   forwards it to Claude so the assistant can default to the right subject.
//
// USAGE
//   import AdminCopilot from "@/components/AdminCopilot";
//   <AdminCopilot context={{ page: "users", userId: "..." }} />
//
// WHY a separate component, not in AdminShell
//   Per-page contexts vary (user id, ticket id, customer id), so each page
//   that wants the copilot mounts it with its own context. Mounting it in
//   the shell would force every page to expose the same context shape.
//
// ENV VARS
//   None directly. The /api/admin/copilot route uses ANTHROPIC_API_KEY.

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type ToolUse = { name: string; input: unknown; result: unknown };

export type AdminCopilotProps = {
  context?: Record<string, unknown>;
  /** Override the default open/close shortcut. Default: cmd/ctrl + . */
  shortcutKey?: string;
};

export default function AdminCopilot({
  context = {},
  shortcutKey = ".",
}: AdminCopilotProps) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
  const [toolUses, setToolUses] = useState<ToolUse[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- Global keybinding: cmd/ctrl + . to toggle. -------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.platform);
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key === shortcutKey) {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shortcutKey, open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 9_999_999, behavior: "smooth" });
  }, [msgs.length, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ messages: next, context }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Copilot failed (${res.status})`);
      }
      const data = await res.json();
      setMsgs((m) => [...m, { role: "assistant", content: data.reply ?? "(empty)" }]);
      setToolUses(data.toolUses ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <>
      {/* Floating launcher when closed. */}
      {!open ? (
        <button
          aria-label="Open admin copilot"
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            right: 18,
            bottom: 18,
            zIndex: 50,
            background: "#2563eb",
            color: "white",
            border: "none",
            borderRadius: 999,
            padding: "10px 14px",
            fontFamily: "inherit",
            fontSize: 13,
            boxShadow: "0 6px 20px rgba(0,0,0,0.4)",
            cursor: "pointer",
          }}
        >
          ✨ Copilot · ⌘.
        </button>
      ) : null}

      {open ? (
        <aside
          role="dialog"
          aria-label="Admin copilot"
          style={{
            position: "fixed",
            top: 0,
            right: 0,
            bottom: 0,
            width: 380,
            background: "#0b0d10",
            borderLeft: "1px solid #1f2630",
            zIndex: 60,
            display: "flex",
            flexDirection: "column",
            boxShadow: "-12px 0 32px rgba(0,0,0,0.45)",
          }}
        >
          <header
            style={{
              padding: "12px 16px",
              borderBottom: "1px solid #1f2630",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 11, opacity: 0.6, letterSpacing: 1 }}>
                COPILOT
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Read-only assistant</div>
            </div>
            <button
              onClick={() => setOpen(false)}
              style={{
                background: "transparent",
                border: "1px solid #2a3340",
                color: "#9ba3ad",
                padding: "4px 8px",
                borderRadius: 6,
                fontFamily: "inherit",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              ⌘. close
            </button>
          </header>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 14,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {msgs.length === 0 ? (
              <div
                style={{
                  padding: 12,
                  background: "#11151a",
                  border: "1px solid #1f2630",
                  borderRadius: 8,
                  fontSize: 12,
                  opacity: 0.8,
                }}
              >
                Ask anything about the page you&apos;re looking at — the assistant
                can call read-only RPCs to fetch real numbers. It cannot make
                changes.
                <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>
                  Page context: <code>{JSON.stringify(context)}</code>
                </div>
              </div>
            ) : null}
            {msgs.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "92%",
                  padding: "8px 12px",
                  background: m.role === "user" ? "#2563eb" : "#11151a",
                  border:
                    m.role === "user" ? "1px solid #1d4fb8" : "1px solid #1f2630",
                  color: "#e6e8eb",
                  borderRadius: 10,
                  fontSize: 13,
                  lineHeight: 1.45,
                  whiteSpace: "pre-wrap",
                }}
              >
                {renderMarkdownLite(m.content)}
              </div>
            ))}
            {busy ? (
              <div style={{ alignSelf: "flex-start", opacity: 0.55, fontSize: 12 }}>
                thinking…
              </div>
            ) : null}
            {toolUses.length > 0 ? (
              <details style={{ marginTop: 4, fontSize: 11, opacity: 0.65 }}>
                <summary style={{ cursor: "pointer" }}>
                  Tool calls ({toolUses.length})
                </summary>
                <pre
                  style={{
                    marginTop: 6,
                    padding: 8,
                    background: "#11151a",
                    border: "1px solid #1f2630",
                    borderRadius: 6,
                    overflowX: "auto",
                    fontSize: 10,
                  }}
                >
                  {JSON.stringify(toolUses, null, 2)}
                </pre>
              </details>
            ) : null}
            {error ? (
              <div
                style={{
                  padding: 10,
                  background: "#3b1d1d",
                  color: "#ffb4b4",
                  border: "1px solid #6b2a2a",
                  borderRadius: 6,
                  fontSize: 12,
                }}
              >
                {error}
              </div>
            ) : null}
          </div>

          <div
            style={{
              borderTop: "1px solid #1f2630",
              padding: 10,
              display: "flex",
              gap: 8,
            }}
          >
            <textarea
              ref={inputRef}
              value={input}
              rows={2}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Ask about this page…"
              style={{
                flex: 1,
                background: "#11151a",
                border: "1px solid #2a3340",
                color: "#e6e8eb",
                borderRadius: 8,
                padding: "8px 10px",
                fontSize: 13,
                fontFamily: "inherit",
                resize: "none",
              }}
            />
            <button
              onClick={() => void send()}
              disabled={busy || !input.trim()}
              style={{
                background: busy || !input.trim() ? "#1f2630" : "#2563eb",
                border: "none",
                color: "white",
                padding: "0 14px",
                borderRadius: 8,
                fontSize: 13,
                cursor: busy || !input.trim() ? "default" : "pointer",
                fontFamily: "inherit",
              }}
            >
              Send
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}

// Tiny markdown-lite renderer: bullets and bold. We keep this in-house to
// avoid adding the markdown-it dependency the brief explicitly bans.
function renderMarkdownLite(text: string): React.ReactNode {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, i) => {
        if (/^\s*[-*]\s+/.test(line)) {
          const item = line.replace(/^\s*[-*]\s+/, "");
          return (
            <div key={i} style={{ paddingLeft: 12 }}>
              • {applyInline(item)}
            </div>
          );
        }
        return (
          <div key={i} style={{ minHeight: line ? undefined : 6 }}>
            {applyInline(line)}
          </div>
        );
      })}
    </>
  );
}

function applyInline(s: string): React.ReactNode {
  // **bold** -> <strong>; `code` -> <code>
  const parts: React.ReactNode[] = [];
  let buf = s;
  let key = 0;
  while (buf.length > 0) {
    const bold = buf.match(/\*\*([^*]+)\*\*/);
    const code = buf.match(/`([^`]+)`/);
    const earliest =
      bold && code
        ? bold.index! < code.index!
          ? bold
          : code
        : (bold ?? code);
    if (!earliest) {
      parts.push(buf);
      break;
    }
    const idx = earliest.index ?? 0;
    if (idx > 0) parts.push(buf.slice(0, idx));
    if (earliest === bold) {
      parts.push(<strong key={key++}>{bold![1]}</strong>);
    } else {
      parts.push(
        <code
          key={key++}
          style={{
            background: "rgba(255,255,255,0.08)",
            padding: "1px 4px",
            borderRadius: 3,
          }}
        >
          {code![1]}
        </code>
      );
    }
    buf = buf.slice(idx + earliest[0].length);
  }
  return parts;
}
