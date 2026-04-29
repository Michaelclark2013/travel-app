"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
// Track D: soft Pro gate — free accounts capped at 5 user-authored messages
// per browser session. `isPro()` returns true today (Stripe not wired) so this
// is dormant until the paywall is armed.
import { isPro } from "@/lib/pro";
import UpgradePrompt from "@/components/UpgradePrompt";

type Msg = { role: "user" | "assistant"; content: string };

const STORAGE_KEY = "voyage:agent:msgs";
const FREE_MSG_CAP = 5;

const SUGGESTIONS = [
  "Plan a 5-day Tokyo trip in May",
  "Cheapest way from NYC to Lisbon next month",
  "What do I need to fly to Japan?",
  "Compare driving vs flying to Vegas",
];

export default function AssistantWidget() {
  const { user, ready } = useAuth();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setMsgs(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-50)));
    } catch {}
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [msgs]);

  // Track D soft cap: count user-authored messages this session and surface
  // the upgrade prompt past the free limit. Dormant while isPro() === true.
  const userMsgCount = msgs.filter((m) => m.role === "user").length;
  const overFreeCap = !isPro() && userMsgCount >= FREE_MSG_CAP;

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    if (overFreeCap) {
      setUpgradeOpen(true);
      return;
    }
    const next = [...msgs, { role: "user" as const, content: trimmed }];
    setMsgs(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      const reply = json.text ?? json.error ?? "(no response)";
      setMsgs([...next, { role: "assistant", content: reply }]);
    } catch {
      setMsgs([
        ...next,
        {
          role: "assistant",
          content: "Network error reaching the agent. Try again in a sec.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  // Show only when authed — keeps the landing page clean for visitors.
  if (!ready || !user) return null;

  return (
    <>
      <UpgradePrompt
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="ai-agent"
      />
      <button
        aria-label={open ? "Close assistant" : "Open assistant"}
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-40 inline-flex items-center justify-center h-14 w-14 rounded-full btn-primary shadow-2xl"
        style={{ boxShadow: "0 0 0 1px var(--accent), 0 12px 40px rgba(34,211,238,0.45)" }}
      >
        <span aria-hidden className="text-2xl">{open ? "×" : "✦"}</span>
      </button>

      {open && (
        <div className="fixed bottom-24 right-5 left-5 sm:left-auto sm:w-[380px] z-40 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-[var(--border-strong)]"
             style={{
               height: "min(72vh, 600px)",
               background: "var(--background-soft)",
               backdropFilter: "blur(24px)",
             }}>
          <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-[0.18em] text-[var(--accent)] uppercase">
                // VOYAGE · AGENT
              </div>
              <div className="font-semibold text-sm mt-0.5">
                Hey {user.name.split(" ")[0]}, what&apos;s the plan?
              </div>
            </div>
            <button
              onClick={() => {
                setMsgs([]);
                if (typeof window !== "undefined") {
                  window.localStorage.removeItem(STORAGE_KEY);
                }
              }}
              className="text-xs text-[var(--muted)] hover:text-white"
              title="Clear conversation"
            >
              Clear
            </button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {msgs.length === 0 && (
              <div>
                <p className="text-sm text-[var(--muted)] mb-3">
                  I can plan trips, compare options, watch prices, and answer
                  travel questions. Try:
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      className="text-xs rounded-full border border-[var(--border-strong)] bg-[var(--card-strong)] px-2.5 py-1.5 hover:bg-white/5"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`text-sm leading-relaxed ${
                  m.role === "user" ? "text-right" : "text-left"
                }`}
              >
                <div
                  className={`inline-block max-w-[85%] rounded-2xl px-3 py-2 ${
                    m.role === "user"
                      ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
                      : "bg-[var(--card-strong)] border border-[var(--border)]"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="text-left">
                <div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-[var(--card-strong)] border border-[var(--border)] text-sm text-[var(--muted)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
                  thinking…
                </div>
              </div>
            )}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="p-3 border-t border-[var(--border)] flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                overFreeCap
                  ? "Free limit reached — upgrade to keep chatting"
                  : "Ask anything…"
              }
              className="input flex-1"
              autoFocus
              disabled={overFreeCap}
            />
            {overFreeCap ? (
              <button
                type="button"
                onClick={() => setUpgradeOpen(true)}
                className="btn-primary px-4 text-sm"
              >
                Upgrade
              </button>
            ) : (
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="btn-primary px-4 text-sm disabled:opacity-50"
              >
                Send
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
