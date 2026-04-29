"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bookmark, Eye, Heart, Search, Sparkles } from "lucide-react";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  followingUsers,
  isFollowing,
  MOCK_USERS,
  momentTileStyle,
  setFollow,
  suggestedUsers,
  avatarStyle,
  type MockUser,
} from "@/lib/social";
import { keptMemories, reconcileMemories, type Memory } from "@/lib/memory-roll";
import { momentStats, formatCount } from "@/lib/social-stats";
import { toast } from "@/lib/toast";
import PlanFromHere, { PlanningFromPill } from "@/components/PlanFromHere";
import LikeButton from "@/components/LikeButton";
import { useInView } from "@/lib/use-in-view";
import StoriesStrip from "@/components/StoriesStrip";
import Markup from "@/components/Markup";
import FeedPost from "@/components/explore/FeedPost";
import { useAuth } from "@/components/AuthProvider";

// What renders in the feed — either a mock user's "moment" tile or the real
// user's own kept memory. We mix them so personal content flows alongside
// inspiration.
type FeedItem =
  | {
      kind: "mock";
      user: MockUser;
      moment: MockUser["moments"][number];
      at: number;
    }
  | { kind: "mine"; memory: Memory; at: number };

export default function ExplorePage() {
  const { user, ready } = useRequireAuth();
  const { user: authUser } = useAuth();
  const [following, setFollowing] = useState<MockUser[]>([]);
  const [, setTick] = useState(0);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!ready || !user) return;
    setFollowing(followingUsers());
    reconcileMemories();
  }, [ready, user]);

  const myKept = useMemo(() => keptMemories(reconcileMemories()), []);

  const feed: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];
    for (const f of following) {
      for (const m of f.moments) {
        items.push({
          kind: "mock",
          user: f,
          moment: m,
          at: Date.now() - m.daysAgo * 86_400_000,
        });
      }
    }
    for (const m of myKept) {
      items.push({
        kind: "mine",
        memory: m,
        at: new Date(m.decidedAt ?? m.capturedAt).getTime(),
      });
    }
    return items.sort((a, b) => b.at - a.at);
  }, [following, myKept]);

  // Suggestion strip — refreshes when user follows/unfollows.
  const suggested = useMemo(() => suggestedUsers(8), [following]);

  const filteredFeed = useMemo(() => {
    if (!query.trim()) return feed;
    const q = query.toLowerCase();
    return feed.filter((it) => {
      if (it.kind === "mock") {
        return (
          it.user.username.toLowerCase().includes(q) ||
          it.user.displayName.toLowerCase().includes(q) ||
          it.moment.location.toLowerCase().includes(q) ||
          it.moment.caption.toLowerCase().includes(q)
        );
      }
      return (
        (it.memory.location ?? "").toLowerCase().includes(q) ||
        (it.memory.caption ?? "").toLowerCase().includes(q)
      );
    });
  }, [feed, query]);

  const filteredUsers = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    return MOCK_USERS.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        u.displayName.toLowerCase().includes(q) ||
        u.bio.toLowerCase().includes(q)
    );
  }, [query]);

  function follow(u: MockUser) {
    setFollow(u.id, true);
    setFollowing(followingUsers());
    setTick((t) => t + 1);
    toast.success(`Following ${u.displayName}`);
  }
  function unfollow(u: MockUser) {
    setFollow(u.id, false);
    setFollowing(followingUsers());
    setTick((t) => t + 1);
  }

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-6 space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold tracking-tight">Explore</h1>
        <Sparkles
          size={16}
          strokeWidth={1.75}
          className="text-[var(--accent)]"
          aria-hidden
        />
        <div className="ml-auto">
          <PlanningFromPill />
        </div>
      </div>

      {/* Stories strip — runs above search so it's the first thing in view. */}
      <StoriesStrip />

      {/* Search bar */}
      <div className="relative">
        <Search
          size={14}
          strokeWidth={1.75}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none"
        />
        <input
          className="input pl-9"
          placeholder="Search travelers, places, vibes…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Search hits — users */}
      {filteredUsers.length > 0 && (
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
            // PEOPLE
          </div>
          <ul className="space-y-2">
            {filteredUsers.map((u) => (
              <li
                key={u.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3"
              >
                <Link
                  href={`/u/${u.username}`}
                  className="h-12 w-12 rounded-full shrink-0"
                  style={avatarStyle(u.hue)}
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/u/${u.username}`}
                    className="font-medium text-sm hover:underline"
                  >
                    {u.displayName}
                  </Link>
                  <div className="text-xs text-[var(--muted)]">
                    @{u.username} · {formatCount(u.followers)} followers
                  </div>
                </div>
                <FollowButton
                  user={u}
                  isFollowing={isFollowing(u.id)}
                  onFollow={() => follow(u)}
                  onUnfollow={() => unfollow(u)}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggested-to-follow strip */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase">
            // SUGGESTED
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 snap-x snap-mandatory">
          {suggested.map((u) => (
            <div
              key={u.id}
              className="shrink-0 snap-start w-[180px] rounded-2xl border border-[var(--border)] bg-[var(--card-strong)] p-3 text-center"
            >
              <Link
                href={`/u/${u.username}`}
                className="block h-16 w-16 mx-auto rounded-full"
                style={avatarStyle(u.hue)}
                aria-hidden
              />
              <Link
                href={`/u/${u.username}`}
                className="block mt-2 text-sm font-medium truncate hover:underline"
              >
                {u.displayName}
              </Link>
              <div className="text-[10px] text-[var(--muted)] truncate">
                @{u.username}
              </div>
              <div className="text-[10px] text-[var(--muted)] mt-1">
                {formatCount(u.followers)} followers
              </div>
              <FollowButton
                user={u}
                isFollowing={isFollowing(u.id)}
                onFollow={() => follow(u)}
                onUnfollow={() => unfollow(u)}
                compact
              />
            </div>
          ))}
        </div>
      </div>

      {/* Vertical "one post at a time" feed.
         Each FeedPost takes ~min-h-screen so users see one post focused at a
         time and scroll for the next. Designed to host video reels later —
         when an item has a `videoUri`, the same layout will autoplay. */}
      <div>
        <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
          // FEED · {filteredFeed.length}
        </div>
        {filteredFeed.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--card-strong)] p-10 text-center">
            <div className="font-semibold">Nothing here yet</div>
            <p className="text-sm text-[var(--muted)] mt-1.5">
              Follow a few travelers above to fill this feed.
            </p>
          </div>
        ) : (
          <div
            className="-mx-6 sm:mx-0"
            style={{
              scrollSnapType: "y proximity",
              contentVisibility: "auto",
            }}
          >
            {filteredFeed.map((it, i) => (
              <FeedPost
                key={
                  it.kind === "mock"
                    ? `mock-${it.user.id}-${it.moment.id}-${i}`
                    : `mine-${it.memory.id}-${i}`
                }
                item={it}
                meName={authUser?.name ?? "you"}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function FollowButton({
  user,
  isFollowing,
  onFollow,
  onUnfollow,
  compact,
}: {
  user: MockUser;
  isFollowing: boolean;
  onFollow: () => void;
  onUnfollow: () => void;
  compact?: boolean;
}) {
  return isFollowing ? (
    <button
      onClick={onUnfollow}
      className={`btn-ghost text-xs ${compact ? "mt-2 w-full px-2 py-1.5" : "px-3 py-1.5"}`}
    >
      Following
    </button>
  ) : (
    <button
      onClick={onFollow}
      aria-label={`Follow ${user.displayName}`}
      className={`btn-primary text-xs ${compact ? "mt-2 w-full px-2 py-1.5" : "px-3 py-1.5"}`}
    >
      Follow
    </button>
  );
}

// (Old grid-tile components removed — vertical FeedPost replaces them.)
