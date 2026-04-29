"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, BookmarkCheck, Heart, MessageSquare, UserPlus } from "lucide-react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  loadNotifications,
  markAllNotificationsRead,
  userByUsername,
  avatarStyle,
  type Notification,
  MOCK_USERS,
} from "@/lib/social";

const ICON: Record<Notification["kind"], React.ReactNode> = {
  like: <Heart size={14} strokeWidth={2} className="text-rose-300" />,
  save: <BookmarkCheck size={14} strokeWidth={2} className="text-emerald-300" />,
  follow: <UserPlus size={14} strokeWidth={2} className="text-[var(--accent)]" />,
  comment: <MessageSquare size={14} strokeWidth={2} className="text-sky-300" />,
  mention: <MessageSquare size={14} strokeWidth={2} className="text-purple-300" />,
  "trip-invite": <UserPlus size={14} strokeWidth={2} className="text-amber-300" />,
  system: <Bell size={14} strokeWidth={2} className="text-[var(--accent)]" />,
};

const TEMPLATE: Record<Notification["kind"], string> = {
  like: "liked your moment",
  save: "saved your moment",
  follow: "started following you",
  comment: "commented on your moment",
  mention: "mentioned you",
  "trip-invite": "invited you to a trip",
  system: "",
};

export default function NotificationsPage() {
  const { user, ready } = useRequireAuth();
  const [items, setItems] = useState<Notification[]>([]);

  useEffect(() => {
    if (!ready || !user) return;
    setItems(loadNotifications());
  }, [ready, user]);

  function markAll() {
    markAllNotificationsRead();
    setItems(loadNotifications());
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <button
          onClick={markAll}
          className="text-[10px] font-mono text-[var(--muted)] hover:text-white uppercase tracking-[0.16em]"
        >
          Mark all read
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--card-strong)] p-10 text-center">
          <div className="font-semibold">All quiet here</div>
          <p className="text-sm text-[var(--muted)] mt-1.5">
            Catch a moment or follow a traveler — activity will land here.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {items.map((n) => {
            const u = n.fromUserId
              ? MOCK_USERS.find((x) => x.id === n.fromUserId) ?? null
              : null;
            const text = n.text ?? TEMPLATE[n.kind] ?? "";
            return (
              <li key={n.id}>
                <Link
                  href={n.href ?? "#"}
                  className={`flex items-center gap-3 rounded-xl border p-3 transition ${
                    n.read
                      ? "border-[var(--border)] bg-transparent"
                      : "border-[var(--accent)]/30 bg-[var(--accent-soft)]/15"
                  }`}
                >
                  {u ? (
                    <div
                      className="h-10 w-10 rounded-full shrink-0"
                      style={avatarStyle(u.hue)}
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-[var(--card-strong)] flex items-center justify-center shrink-0">
                      {ICON[n.kind]}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      {u && (
                        <span className="font-medium">{u.displayName} </span>
                      )}
                      <span className="text-[var(--foreground)]/85">{text}</span>
                    </div>
                    <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--muted)] mt-0.5">
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                  <span className="shrink-0">{ICON[n.kind]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
