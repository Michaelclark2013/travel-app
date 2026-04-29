"use client";

// Public profile shell — what someone sees when you share your Voyage URL.
// For now the data is read from the local browser (so the user can preview
// what their public profile *will* look like). Once Supabase profile tables
// are wired up this becomes a real read-only view of any user.

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  isFollowing as gIsFollowing,
  setFollow,
  startThreadWith,
  userByUsername,
  avatarStyle,
  type MockUser,
} from "@/lib/social";
import { useAuth } from "@/components/AuthProvider";
import { Bookmark, Eye, Flame, Heart } from "lucide-react";
import PlanFromHere from "@/components/PlanFromHere";
import LikeButton from "@/components/LikeButton";

function InstagramIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  );
}
function TikTokIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M16.5 3a5.5 5.5 0 0 0 4.5 5v3a8.5 8.5 0 0 1-4.5-1.3V15a6 6 0 1 1-6-6c.34 0 .67.03 1 .08v3.13a3 3 0 1 0 2 2.83V3h3z" />
    </svg>
  );
}
import { loadProfile } from "@/lib/profile";
import { keptMemories, reconcileMemories } from "@/lib/memory-roll";
import { loadTrips } from "@/lib/storage";
import {
  dailyStreak,
  formatCount,
  igUrl,
  momentStats,
  siteUrl,
  tiktokUrl,
  totalEngagement,
} from "@/lib/social-stats";
import { LocationImageEl } from "@/components/LocationImage";
import { routeSummary } from "@/lib/trip-stops";
import type { TravelerProfile } from "@/lib/types";
import type { Memory } from "@/lib/memory-roll";
import type { Trip } from "@/lib/types";

export default function PublicProfilePage() {
  const params = useParams<{ username: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const username = params?.username ?? "";
  const [profile, setProfile] = useState<TravelerProfile | null>(null);
  const [kept, setKept] = useState<Memory[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [mock, setMock] = useState<MockUser | null>(null);
  const [following, setFollowing] = useState(false);

  useEffect(() => {
    setHydrated(false);
    // 1. Mock-user route — most public profiles will be mock for now.
    const m = userByUsername(username);
    if (m) {
      setMock(m);
      setFollowing(gIsFollowing(m.id));
      setProfile(null);
      setKept([]);
      setTrips([]);
      setHydrated(true);
      return;
    }
    // 2. Self preview — show this browser's own profile if username matches.
    const local = loadProfile();
    const localHandle = (local.username ?? "").toLowerCase();
    if (localHandle === username.toLowerCase() || !localHandle) {
      setProfile(local);
      setKept(keptMemories(reconcileMemories()));
      setTrips(loadTrips());
    }
    setHydrated(true);
  }, [username]);

  function toggleFollow() {
    if (!mock) return;
    const next = !following;
    setFollow(mock.id, next);
    setFollowing(next);
  }
  function dm() {
    if (!mock) return;
    const tid = startThreadWith(mock.id);
    router.push(`/messages/${tid}`);
  }

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Loading…
      </div>
    );
  }

  // Mock user public profile view.
  if (mock) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="px-6 py-6">
          <div className="flex items-center gap-4">
            <div
              className="h-24 w-24 rounded-full ring-4 ring-[var(--background)] shrink-0"
              style={avatarStyle(mock.hue)}
            />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight truncate">
                {mock.displayName}
              </h1>
              <div className="text-sm text-[var(--muted)]">@{mock.username}</div>
              <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted)] flex-wrap">
                <span>
                  <strong className="text-white">{mock.moments.length}</strong> moments
                </span>
                <span>
                  <strong className="text-white">{(mock.followers).toLocaleString()}</strong> followers
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 shrink-0">
              {!user || (user && username !== (loadProfile().username ?? "")) ? (
                <>
                  {following ? (
                    <button onClick={toggleFollow} className="btn-ghost text-xs px-4 py-1.5">
                      Following
                    </button>
                  ) : (
                    <button onClick={toggleFollow} className="btn-primary text-xs px-4 py-1.5">
                      Follow
                    </button>
                  )}
                  <button onClick={dm} className="btn-ghost text-xs px-4 py-1.5">
                    Message
                  </button>
                </>
              ) : null}
            </div>
          </div>

          <p className="mt-4 text-sm text-[var(--foreground)]/90 max-w-prose">
            {mock.bio}
          </p>

          {mock.travelStyles.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {mock.travelStyles.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 text-[var(--accent)] px-2.5 py-1 text-xs"
                >
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Mock moments grid — gradient tiles styled by hue */}
        <div
          className="grid grid-cols-3 gap-0.5"
          style={{ contentVisibility: "auto" }}
        >
          {mock.moments.map((m) => {
            const dest = pickCity(m.location);
            return (
              <div
                key={m.id}
                className="group aspect-square relative overflow-hidden"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    background: `linear-gradient(160deg, hsl(${m.hue} 65% 22%), hsl(${(m.hue + 40) % 360} 70% 14%) 60%, hsl(${(m.hue + 80) % 360} 60% 8%))`,
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <div className="absolute bottom-1.5 left-1.5 right-1.5 text-white pointer-events-none">
                  <div className="text-[10px] font-mono tracking-[0.16em] uppercase opacity-90 line-clamp-1 drop-shadow">
                    {m.location}
                  </div>
                  <div className="text-[11px] font-medium line-clamp-2 drop-shadow">
                    {m.caption}
                  </div>
                </div>
                <div className="absolute top-1.5 right-1.5 z-10">
                  <LikeButton
                    target={`mock:${m.id}`}
                    size="xs"
                    variant="tile"
                  />
                </div>
                {dest && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition">
                    <PlanFromHere destination={dest} size="sm" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <h1 className="text-2xl font-semibold">@{username}</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">
          This profile is private or not on Voyage yet.
        </p>
        <Link
          href="/sign-in"
          className="btn-primary mt-6 inline-block px-6 py-2.5 text-sm"
        >
          Get Voyage
        </Link>
      </div>
    );
  }

  const displayName = profile.displayName ?? `@${username}`;
  const bio = profile.bio ?? "";
  const eng = totalEngagement(kept);
  const streak = dailyStreak(kept);

  return (
    <div className="mx-auto max-w-4xl">
      <div className="px-6 py-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <div className="h-24 w-24 rounded-full border-2 border-[var(--accent)]/40 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--card-strong)] flex items-center justify-center font-bold text-3xl text-[var(--accent)] shrink-0 ring-4 ring-[var(--background)]">
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight truncate">
              {displayName}
            </h1>
            <div className="text-sm text-[var(--muted)]">@{username}</div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--muted)] flex-wrap">
              <span>
                <strong className="text-white">{kept.length}</strong> moments
              </span>
              <span>
                <strong className="text-white">{trips.length}</strong> trips
              </span>
              <span className="inline-flex items-center gap-1">
                <Eye size={11} strokeWidth={2} className="text-[var(--accent)]" />
                <strong className="text-white">{formatCount(eng.views)}</strong>
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart size={11} strokeWidth={2} className="text-rose-300" />
                <strong className="text-white">{formatCount(eng.likes)}</strong>
              </span>
              {streak > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                  <Flame size={10} strokeWidth={2.4} />
                  <strong>{streak}</strong>-day streak
                </span>
              )}
            </div>
          </div>
        </div>

        {bio && (
          <p className="mt-4 text-sm text-[var(--foreground)]/90 max-w-prose">
            {bio}
          </p>
        )}

        {(profile.instagram || profile.tiktok || profile.website) && (
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
            {profile.instagram && (
              <a
                href={igUrl(profile.instagram)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-[var(--accent)]"
              >
                <InstagramIcon size={13} />
                {prettyHandle(profile.instagram)}
              </a>
            )}
            {profile.tiktok && (
              <a
                href={tiktokUrl(profile.tiktok)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-[var(--accent)]"
              >
                <TikTokIcon size={13} />
                {prettyHandle(profile.tiktok)}
              </a>
            )}
            {profile.website && (
              <a
                href={siteUrl(profile.website)}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--accent)] truncate max-w-[180px]"
              >
                🔗 {profile.website.replace(/^https?:\/\/(www\.)?/, "")}
              </a>
            )}
          </div>
        )}

        {profile.travelStyles && profile.travelStyles.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {profile.travelStyles.map((s) => (
              <span
                key={s}
                className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 text-[var(--accent)] px-2.5 py-1 text-xs"
              >
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Get-Voyage CTA — viral / discovery hook for non-users landing here. */}
        <div className="mt-5 rounded-xl border border-[var(--border-strong)] bg-[var(--card-strong)] p-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-[var(--muted)]">
            Plan trips, catch moments, and grow a feed like {displayName.split(" ")[0]}&apos;s.
          </div>
          <Link
            href="/sign-in"
            className="btn-primary text-xs px-3 py-1.5 shrink-0"
          >
            Get Voyage
          </Link>
        </div>
      </div>

      {/* Photo grid — IG-tight */}
      <div className="grid grid-cols-3 gap-0.5">
        {kept.length === 0 && trips.length === 0 ? (
          <div className="col-span-3 text-center py-12 text-sm text-[var(--muted)]">
            Nothing posted yet.
          </div>
        ) : (
          [
            ...trips.map((t) => ({
              kind: "trip" as const,
              key: `t-${t.id}`,
              t,
              at: new Date(t.startDate).getTime(),
            })),
            ...kept.map((m) => ({
              kind: "moment" as const,
              key: `m-${m.id}`,
              m,
              at: new Date(m.capturedAt).getTime(),
            })),
          ]
            .sort((a, b) => b.at - a.at)
            .map((p) =>
              p.kind === "trip" ? (
                <div key={p.key} className="aspect-square relative overflow-hidden">
                  <LocationImageEl
                    name={p.t.destination}
                    kind="city"
                    aspect="1/1"
                    rounded="none"
                    className="h-full w-full"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
                  <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] font-mono tracking-[0.16em] uppercase text-white drop-shadow line-clamp-1">
                    ✈ {routeSummary(p.t)}
                  </div>
                </div>
              ) : (
                <PublicMomentTile key={p.key} m={p.m} />
              )
            )
        )}
      </div>
    </div>
  );
}

function PublicMomentTile({ m }: { m: Memory }) {
  const s = momentStats(m);
  return (
    <div className="group aspect-square relative overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={m.filteredDataUri ?? m.imageDataUri}
        alt={m.caption ?? "Moment"}
        className="aspect-square w-full object-cover"
      />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/40 flex items-center justify-center gap-3 text-white text-xs font-medium">
        <span className="inline-flex items-center gap-1">
          <Heart size={12} strokeWidth={2.4} />
          {formatCount(s.likes)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Eye size={12} strokeWidth={2.4} />
          {formatCount(s.views)}
        </span>
        <span className="inline-flex items-center gap-1">
          <Bookmark size={12} strokeWidth={2.4} />
          {formatCount(s.saves)}
        </span>
      </div>
    </div>
  );
}

function prettyHandle(s: string): string {
  const trimmed = s
    .replace(/^https?:\/\/(www\.)?(instagram\.com|tiktok\.com)\//i, "")
    .replace(/^@/, "")
    .replace(/[/?].*$/, "")
    .trim();
  return `@${trimmed}`;
}

function pickCity(loc: string): string {
  if (!loc) return "";
  const parts = loc.split(",").map((s) => s.trim()).filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  if (
    parts.length > 1 &&
    /^(USA|UK|US|Japan|Italy|France|Spain|Mexico|Portugal|Brazil|India|Germany)$/i.test(
      last
    )
  ) {
    return parts[parts.length - 2];
  }
  return parts[parts.length - 1] ?? loc;
}
