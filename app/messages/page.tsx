"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  avatarStyle,
  isThreadUnread,
  loadThreads,
  MOCK_USERS,
  startThreadWith,
  suggestedUsers,
  type DmThread,
  type MockUser,
  type ShareTarget,
} from "@/lib/social";
import { useRouter } from "next/navigation";

export default function MessagesPage() {
  const { user, ready } = useRequireAuth();
  const router = useRouter();
  const [threads, setThreads] = useState<DmThread[]>([]);

  useEffect(() => {
    if (!ready || !user) return;
    refresh();
    const h = () => refresh();
    window.addEventListener("voyage:dm-updated", h);
    return () => window.removeEventListener("voyage:dm-updated", h);
  }, [ready, user]);

  function refresh() {
    setThreads(loadThreads());
  }

  function startWith(u: MockUser) {
    const tid = startThreadWith(u.id);
    refresh();
    router.push(`/messages/${tid}`);
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  const sorted = threads
    .slice()
    .sort((a, b) => {
      const al = a.messages[a.messages.length - 1]?.createdAt ?? "";
      const bl = b.messages[b.messages.length - 1]?.createdAt ?? "";
      return bl.localeCompare(al);
    });

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Messages</h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          Plan trips together. Trade tips. No noise.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--card-strong)] p-10 text-center">
          <div className="font-semibold">No conversations yet</div>
          <p className="text-sm text-[var(--muted)] mt-1.5">
            Start chatting with a traveler from the suggestions below.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {sorted.map((t) => {
            const u = MOCK_USERS.find((x) => x.id === t.withUserId);
            const last = t.messages[t.messages.length - 1];
            const unread = isThreadUnread(t);
            return (
              <li key={t.id}>
                <Link
                  href={`/messages/${t.id}`}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                    unread
                      ? "border-[var(--accent)]/30 bg-[var(--accent-soft)]/15"
                      : "border-[var(--border)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div
                    className="h-12 w-12 rounded-full shrink-0"
                    style={avatarStyle(u?.hue ?? 200)}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm truncate">
                        {u?.displayName ?? "Traveler"}
                      </div>
                      {last && (
                        <div className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.14em] shrink-0">
                          {timeAgo(last.createdAt)}
                        </div>
                      )}
                    </div>
                    <div
                      className={`text-xs truncate mt-0.5 ${
                        unread ? "text-white" : "text-[var(--muted)]"
                      }`}
                    >
                      {last
                        ? `${last.fromUserId === "me" ? "You: " : ""}${
                            last.attachment
                              ? attachmentPreview(last.attachment) +
                                (last.text ? " · " + last.text : "")
                              : last.text
                          }`
                        : "Say hi 👋"}
                    </div>
                  </div>
                  {unread && (
                    <span className="h-2 w-2 rounded-full bg-[var(--accent)] shrink-0" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div>
        <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
          // SAY HI TO
        </div>
        <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {suggestedUsers(6).map((u) => (
            <li
              key={u.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 text-center"
            >
              <button
                onClick={() => startWith(u)}
                className="h-12 w-12 rounded-full mx-auto block"
                style={avatarStyle(u.hue)}
                aria-label={`Message ${u.displayName}`}
              />
              <div className="text-xs font-medium mt-2 truncate">
                {u.displayName}
              </div>
              <div className="text-[10px] text-[var(--muted)] truncate">
                @{u.username}
              </div>
              <button
                onClick={() => startWith(u)}
                className="btn-ghost mt-2 w-full text-[10px] px-2 py-1.5"
              >
                Message
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

function attachmentPreview(a: ShareTarget): string {
  switch (a.kind) {
    case "moment":
      return `📸 ${a.caption ?? "moment"}`;
    case "mock-moment":
      return `📸 ${a.caption}`;
    case "trip":
      return `✈️ ${a.destination}`;
    case "place":
      return `📍 ${a.name}`;
  }
}
