"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Check, CheckCheck } from "lucide-react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  avatarStyle,
  getThread,
  loadThreads,
  markThreadRead,
  MOCK_BY_ID,
  sendMessage,
  type DmMessage,
  type DmThread,
} from "@/lib/social";
import MessageAttachment from "@/components/MessageAttachment";
import Markup from "@/components/Markup";

export default function ThreadPage() {
  const { user, ready } = useRequireAuth();
  const params = useParams<{ threadId: string }>();
  const threadId = params?.threadId ?? "";
  const [thread, setThread] = useState<DmThread | null>(null);
  const [text, setText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  function refresh() {
    setThread(getThread(threadId));
  }

  useEffect(() => {
    if (!ready || !user) return;
    refresh();
    markThreadRead(threadId);
    const h = () => refresh();
    window.addEventListener("voyage:dm-updated", h);
    return () => window.removeEventListener("voyage:dm-updated", h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, user, threadId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [thread?.messages.length]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }
  if (!thread) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-xl font-semibold">Conversation not found</h1>
        <Link
          href="/messages"
          className="btn-primary mt-6 inline-block px-5 py-2.5 text-sm"
        >
          Back to messages
        </Link>
      </div>
    );
  }

  const peer = MOCK_BY_ID[thread.withUserId];

  function send() {
    const t = text.trim();
    if (!t) return;
    sendMessage(threadId, t);
    setText("");
    refresh();
  }

  // Optimization #6 — typing indicator with debounced 800ms idle reset.
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [peerTyping, setPeerTyping] = useState(false);
  // The peer "starts typing" right before their auto-reply arrives. Hook it
  // off the dm-updated event: when the message count grows from us, the auto
  // -reply is on the way → show typing for ~1.2s.
  const lastCountRef = useRef(thread.messages.length);
  useEffect(() => {
    if (thread.messages.length > lastCountRef.current) {
      const last = thread.messages[thread.messages.length - 1];
      // Only show "typing" right after WE sent something (peer reply incoming).
      if (last && last.fromUserId === "me") {
        setPeerTyping(true);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setPeerTyping(false), 1300);
      } else {
        setPeerTyping(false);
      }
    }
    lastCountRef.current = thread.messages.length;
  }, [thread.messages.length]);

  return (
    <div className="mx-auto max-w-2xl flex flex-col h-[calc(100vh-64px)]">
      {/* Header */}
      <div
        className="flex items-center gap-3 px-6 py-3 border-b border-[var(--border)] sticky bg-[var(--background)]/70 backdrop-blur-xl"
        style={{ top: "64px" }}
      >
        <Link
          href="/messages"
          className="text-[var(--muted)] hover:text-white text-2xl leading-none"
          aria-label="Back to inbox"
        >
          ←
        </Link>
        {peer && (
          <Link href={`/u/${peer.username}`} className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className="h-9 w-9 rounded-full shrink-0"
              style={avatarStyle(peer.hue)}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{peer.displayName}</div>
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--muted)]">
                @{peer.username}
              </div>
            </div>
          </Link>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
        {thread.messages.length === 0 ? (
          <div className="text-center text-sm text-[var(--muted)] py-12">
            Say hi — start with a place you both love 🗺
          </div>
        ) : (
          thread.messages.map((m, i) => {
            const prev = thread.messages[i - 1];
            const showHeader =
              !prev ||
              new Date(m.createdAt).getTime() -
                new Date(prev.createdAt).getTime() >
                1000 * 60 * 30;
            const isLastMine =
              m.fromUserId === "me" &&
              !thread.messages.slice(i + 1).some((x) => x.fromUserId === "me");
            return (
              <Bubble
                key={m.id}
                msg={m}
                showHeader={showHeader}
                isLastMine={isLastMine}
              />
            );
          })
        )}
        {peerTyping && peer && (
          <div className="text-left">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-[var(--card-strong)] border border-[var(--border)] text-sm text-[var(--muted)]">
              <span className="flex gap-1">
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] animate-bounce"
                  style={{ animationDelay: "120ms" }}
                />
                <span
                  className="h-1.5 w-1.5 rounded-full bg-[var(--muted)] animate-bounce"
                  style={{ animationDelay: "240ms" }}
                />
              </span>
              <span className="text-[11px]">typing…</span>
            </div>
          </div>
        )}
      </div>

      {/* Composer */}
      {/* (Memoized Bubble defined at file bottom.) */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="border-t border-[var(--border)] p-3 flex gap-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem + 4rem)" }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          className="input flex-1"
          autoFocus
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="btn-primary px-4 text-sm disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}

// Optimization #3 — memoized so a new bubble arrival doesn't re-render every
// older one. Compares by id + status (status flips on send → sent → read).
const Bubble = memo(
  function Bubble({
    msg,
    showHeader,
    isLastMine,
  }: {
    msg: DmMessage;
    showHeader: boolean;
    isLastMine: boolean;
  }) {
    const me = msg.fromUserId === "me";
    return (
      <div>
        {showHeader && (
          <div className="text-center text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted)] my-2">
            {new Date(msg.createdAt).toLocaleString(undefined, {
              hour: "numeric",
              minute: "2-digit",
              day: "numeric",
              month: "short",
            })}
          </div>
        )}
        <div className={me ? "text-right" : "text-left"}>
          <div
            className={`inline-block max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-snug ${
              me
                ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
                : "bg-[var(--card-strong)] border border-[var(--border)]"
            }`}
          >
            {msg.text && (
              <div>
                <Markup text={msg.text} />
              </div>
            )}
            {msg.attachment && <MessageAttachment attachment={msg.attachment} />}
          </div>
          {me && isLastMine && msg.status && (
            <div className="text-[10px] font-mono text-[var(--muted)] mt-0.5 inline-flex items-center gap-1 mr-1">
              {msg.status === "sending" && <span>sending…</span>}
              {msg.status === "sent" && (
                <>
                  <Check size={10} strokeWidth={2.4} />
                  Sent
                </>
              )}
              {msg.status === "read" && (
                <>
                  <CheckCheck
                    size={10}
                    strokeWidth={2.4}
                    className="text-[var(--accent)]"
                  />
                  <span className="text-[var(--accent)]">Read</span>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.msg.id === next.msg.id &&
    prev.msg.status === next.msg.status &&
    prev.showHeader === next.showHeader &&
    prev.isLastMine === next.isLastMine
);
