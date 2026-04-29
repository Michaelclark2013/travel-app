"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  avatarStyle,
  followingUsers,
  isFollowing,
  setFollow,
  startThreadWith,
  suggestedUsers,
  type MockUser,
} from "@/lib/social";
import { formatCount } from "@/lib/social-stats";
import { useRouter } from "next/navigation";
import { toast } from "@/lib/toast";

type Tab = "following" | "suggested";

export default function FollowingPage() {
  const { user, ready } = useRequireAuth();
  const [tab, setTab] = useState<Tab>("following");
  const [following, setFollowingState] = useState<MockUser[]>([]);
  const [suggested, setSuggested] = useState<MockUser[]>([]);
  const router = useRouter();

  useEffect(() => {
    if (!ready || !user) return;
    refresh();
  }, [ready, user]);

  function refresh() {
    setFollowingState(followingUsers());
    setSuggested(suggestedUsers(8));
  }

  function follow(u: MockUser) {
    setFollow(u.id, true);
    refresh();
    toast.success(`Following ${u.displayName}`);
  }
  function unfollow(u: MockUser) {
    setFollow(u.id, false);
    refresh();
  }
  function dm(u: MockUser) {
    const tid = startThreadWith(u.id);
    router.push(`/messages/${tid}`);
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  const list = tab === "following" ? following : suggested;
  const empty =
    tab === "following"
      ? "You're not following anyone yet. Hop over to the Suggested tab."
      : "No suggestions available right now.";

  return (
    <div className="mx-auto max-w-2xl px-6 py-6 space-y-5">
      <div className="flex items-center gap-2">
        <Link
          href="/profile"
          className="text-[var(--muted)] hover:text-white text-2xl leading-none"
          aria-label="Back"
        >
          ←
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">Following</h1>
      </div>

      <div className="flex gap-2 text-xs">
        {(
          [
            { id: "following" as Tab, label: `Following (${following.length})` },
            { id: "suggested" as Tab, label: "Suggested" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-full border px-3 py-1.5 ${
              tab === t.id
                ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                : "border-[var(--border)] hover:bg-white/5"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--card-strong)] p-10 text-center">
          <div className="font-semibold">{empty}</div>
        </div>
      ) : (
        <ul className="space-y-2">
          {list.map((u) => {
            const followed = isFollowing(u.id);
            return (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3"
              >
                <Link
                  href={`/u/${u.username}`}
                  className="h-12 w-12 rounded-full shrink-0"
                  style={avatarStyle(u.hue)}
                  aria-label={u.displayName}
                />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/u/${u.username}`}
                    className="font-medium text-sm hover:underline truncate block"
                  >
                    {u.displayName}
                  </Link>
                  <div className="text-xs text-[var(--muted)] truncate">
                    @{u.username} · {formatCount(u.followers)} followers
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => dm(u)}
                    className="btn-ghost text-xs px-3 py-1.5"
                    aria-label={`Message ${u.displayName}`}
                  >
                    Message
                  </button>
                  {followed ? (
                    <button
                      onClick={() => unfollow(u)}
                      className="btn-ghost text-xs px-3 py-1.5"
                    >
                      Following
                    </button>
                  ) : (
                    <button
                      onClick={() => follow(u)}
                      className="btn-primary text-xs px-3 py-1.5"
                    >
                      Follow
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
