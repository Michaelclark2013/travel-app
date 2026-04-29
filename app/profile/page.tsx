"use client";

// Instagram-style profile redesign.
//   <StickyHeader>          avatar + name + @username + bio + edit
//   <AchievementsRow>       horizontal scrollable badges
//   <StatsRow>              4 KPI tiles
//   <TravelPatternsRow>     small pattern cards
//   <PreferencesChips>      travel-style chips (editable)
//   <TabNav>                Posts | Journal | Memory Roll | Saved
//   <TabContent>            grid / masonry / FAB / list
//   <EditProfileExpander>   collapsed-by-default — hosts the existing
//                           Identity / Companions / Cards / Medical / Default-Prefs editors

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Award,
  CreditCard as CreditCardIcon,
  HeartPulse,
  Lock,
  Pencil,
  Plus,
  Trash2,
  User,
  Users,
  X,
} from "lucide-react";
import { useAuth, useRequireAuth } from "@/components/AuthProvider";
import { LocationAutocomplete } from "@/components/LocationAutocomplete";
import { TripPreferencesPanel } from "@/components/TripPreferencesPanel";
import {
  computeTravelPatterns,
  loadProfile,
  loadProfileAsync,
  saveProfile,
  type TravelPatterns,
} from "@/lib/profile";
import { loadTrips } from "@/lib/storage";
import { loadConfirmations } from "@/lib/wallet";
import { POPULAR_CARDS } from "@/lib/credit-cards";
import { computeAchievements, computeStats } from "@/lib/achievements";
import type { Achievement } from "@/lib/types";
import {
  applyFilm,
  discardMemory,
  keepMemory,
  keptMemories,
  loadMemories,
  processingMemories,
  readyInLabel,
  readyMemories,
  reconcileMemories,
  updateMemory,
  type Memory,
} from "@/lib/memory-roll";
import { LocationImageEl } from "@/components/LocationImage";
import { isMultiStop, routeSummary } from "@/lib/trip-stops";
import { toast } from "@/lib/toast";
import {
  dailyStreak,
  formatCount,
  igUrl,
  momentStats,
  siteUrl,
  tiktokUrl,
  totalEngagement,
} from "@/lib/social-stats";
import { Bookmark, Eye, Flame, Heart, Share2, Sparkles } from "lucide-react";
import PlanFromHere from "@/components/PlanFromHere";
import LikeButton from "@/components/LikeButton";
import ShareSheet from "@/components/ShareSheet";
import StoriesStrip from "@/components/StoriesStrip";
import Markup from "@/components/Markup";
import type { ShareTarget } from "@/lib/social";
import {
  addComment,
  commentCount,
  isReposted,
  loadComments,
  repost,
  repostCount,
  unrepost,
  type Comment as Cmt,
} from "@/lib/comments-reposts";
import { MOCK_USERS } from "@/lib/social";
import { Repeat2, MessageCircle as CommentIcon } from "lucide-react";

// lucide-react in this project doesn't expose Instagram/TikTok glyphs; use
// inline SVGs so we can keep the social row icon-led without forcing a dep bump.
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
import type {
  CreditCard,
  TravelCompanion,
  TravelerProfile,
  Trip,
  TripPreferences,
} from "@/lib/types";

type Tab = "posts" | "journal" | "memory" | "saved";

const TRAVEL_STYLE_OPTIONS = [
  "Adventure Seeker",
  "Luxury Explorer",
  "Budget Backpacker",
  "Foodie",
  "Slow Traveler",
  "Culture Hunter",
  "Nature Lover",
  "City Hopper",
  "Beach Bum",
  "Solo Wanderer",
  "Family-First",
  "Group Energy",
];

export default function ProfilePage() {
  const { user, ready, signOut } = useAuth();
  useRequireAuth();
  const [profile, setProfile] = useState<TravelerProfile>({});
  const [savedFlash, setSavedFlash] = useState(false);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [tab, setTab] = useState<Tab>("posts");
  const [editingHeader, setEditingHeader] = useState(false);
  const [showEditDrawer, setShowEditDrawer] = useState(false);

  useEffect(() => {
    if (!ready || !user) return;
    setProfile(loadProfile());
    loadProfileAsync().then((remote) => {
      if (Object.keys(remote).length > 0) setProfile(remote);
    });
    setTrips(loadTrips());
    setMemories(reconcileMemories());
    const id = window.setInterval(() => setMemories(reconcileMemories()), 30_000);
    return () => window.clearInterval(id);
  }, [ready, user]);

  function patch(p: Partial<TravelerProfile>) {
    const next = { ...profile, ...p, updatedAt: new Date().toISOString() };
    setProfile(next);
    saveProfile(next);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1500);
  }

  function refreshMemories() {
    setMemories(reconcileMemories());
  }

  const stats = useMemo(() => (ready && user ? computeStats() : null), [
    ready,
    user,
    trips.length,
    memories.length,
  ]);
  const achievements = useMemo(
    () => (stats ? computeAchievements(stats) : []),
    [stats]
  );
  const patterns = useMemo<TravelPatterns | null>(() => {
    if (!ready || !user) return null;
    return computeTravelPatterns({
      trips,
      wallet: loadConfirmations(),
    });
  }, [ready, user, trips, profile.updatedAt]);

  const kept = useMemo(() => keptMemories(memories), [memories]);
  const ready2 = useMemo(() => readyMemories(memories), [memories]);
  const processing = useMemo(() => processingMemories(memories), [memories]);

  // Always-visible counts for the achievement strip.
  const moments = kept.length;
  const tripsCount = trips.length;
  const countriesCount = stats?.countryCount ?? 0;
  const favoriteDestination = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of trips)
      counts.set(t.destination, (counts.get(t.destination) ?? 0) + 1);
    let best: string | null = null;
    let bestN = 0;
    for (const [k, n] of counts) {
      if (n > bestN) {
        bestN = n;
        best = k;
      }
    }
    return best ?? "—";
  }, [trips]);

  const displayName = profile.displayName ?? user?.name ?? "Traveler";
  const handle =
    profile.username ?? (user?.email?.split("@")[0] ?? "traveler");
  const bio =
    profile.bio ??
    "Catching atoms of the world, one trip at a time.";

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <StickyHeader
        displayName={displayName}
        handle={handle}
        bio={bio}
        instagram={profile.instagram}
        tiktok={profile.tiktok}
        website={profile.website}
        savedFlash={savedFlash}
        editing={editingHeader}
        setEditing={setEditingHeader}
        onPatch={patch}
        onSignOut={signOut}
        currentDisplayName={profile.displayName ?? ""}
        currentHandle={profile.username ?? ""}
        currentBio={profile.bio ?? ""}
        currentInstagram={profile.instagram ?? ""}
        currentTiktok={profile.tiktok ?? ""}
        currentWebsite={profile.website ?? ""}
        engagement={totalEngagement(kept)}
        streak={dailyStreak(kept)}
        followers={kept.length * 7 + tripsCount * 13}
      />

      <div className="px-6 py-6 space-y-7">
        <StoriesStrip />

        <AchievementsRow
          achievements={achievements}
          moments={moments}
          tripsCount={tripsCount}
          countriesCount={countriesCount}
        />

        <StatsRow
          tripsTaken={tripsCount}
          countries={countriesCount}
          moments={moments}
          favorite={favoriteDestination}
        />

        {patterns && patterns.totalTrips > 0 && (
          <TravelPatternsRow patterns={patterns} trips={trips} />
        )}

        <PreferencesChips
          selected={profile.travelStyles ?? []}
          onChange={(travelStyles) =>
            patch({
              travelStyles: travelStyles.length > 0 ? travelStyles : undefined,
            })
          }
        />

        <TabNav
          tab={tab}
          setTab={setTab}
          counts={{ kept: kept.length, ready: ready2.length, trips: tripsCount }}
        />

        <div>
          {tab === "posts" && (
            <PostsTab trips={trips} kept={kept} />
          )}
          {tab === "journal" && (
            <JournalTab
              kept={kept}
              onUpdate={(id, patch2) => {
                updateMemory(id, patch2);
                refreshMemories();
              }}
            />
          )}
          {tab === "memory" && (
            <MemoryRollTab
              ready={ready2}
              processing={processing}
              onKeep={async (m) => {
                try {
                  const filtered = await applyFilm(m.imageDataUri);
                  keepMemory(m.id, filtered);
                  refreshMemories();
                  toast.success("Added to Travel Journal");
                } catch {
                  toast.error("Couldn't apply the filter — try again.");
                }
              }}
              onDiscard={(m) => {
                discardMemory(m.id);
                refreshMemories();
                toast.undo("Moment discarded", () => {
                  // Resurrect by writing back to ready state.
                  const all = loadMemories();
                  const idx = all.findIndex((x) => x.id === m.id);
                  if (idx >= 0) {
                    all[idx] = { ...all[idx], status: "ready", decidedAt: undefined };
                    const session = JSON.parse(
                      window.localStorage.getItem("voyage:session") || "{}"
                    );
                    if (session.id) {
                      window.localStorage.setItem(
                        `voyage:memory-roll:${session.id}`,
                        JSON.stringify(all)
                      );
                    }
                  }
                  refreshMemories();
                });
              }}
            />
          )}
          {tab === "saved" && <SavedTab trips={trips} />}
        </div>

        <button
          onClick={() => setShowEditDrawer((v) => !v)}
          className="btn-ghost w-full text-sm py-3 mt-4"
        >
          {showEditDrawer ? "Close profile settings" : "Profile settings"}
        </button>

        {showEditDrawer && (
          <EditProfileDrawer profile={profile} patch={patch} />
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sticky header
// ============================================================================

function StickyHeader({
  displayName,
  handle,
  bio,
  instagram,
  tiktok,
  website,
  savedFlash,
  editing,
  setEditing,
  onPatch,
  onSignOut,
  currentDisplayName,
  currentHandle,
  currentBio,
  currentInstagram,
  currentTiktok,
  currentWebsite,
  engagement,
  streak,
  followers,
}: {
  displayName: string;
  handle: string;
  bio: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
  savedFlash: boolean;
  editing: boolean;
  setEditing: (v: boolean) => void;
  onPatch: (p: Partial<TravelerProfile>) => void;
  onSignOut: () => void;
  currentDisplayName: string;
  currentHandle: string;
  currentBio: string;
  currentInstagram: string;
  currentTiktok: string;
  currentWebsite: string;
  engagement: { views: number; likes: number; saves: number; shares: number };
  streak: number;
  followers: number;
}) {
  const [draft, setDraft] = useState({
    displayName: currentDisplayName,
    username: currentHandle,
    bio: currentBio,
    instagram: currentInstagram,
    tiktok: currentTiktok,
    website: currentWebsite,
  });
  useEffect(() => {
    setDraft({
      displayName: currentDisplayName,
      username: currentHandle,
      bio: currentBio,
      instagram: currentInstagram,
      tiktok: currentTiktok,
      website: currentWebsite,
    });
  }, [currentDisplayName, currentHandle, currentBio, currentInstagram, currentTiktok, currentWebsite]);

  function save() {
    onPatch({
      displayName: draft.displayName.trim() || undefined,
      username:
        draft.username.trim().replace(/[^a-z0-9_]/gi, "").toLowerCase() ||
        undefined,
      bio: draft.bio.trim() || undefined,
      instagram: draft.instagram.trim() || undefined,
      tiktok: draft.tiktok.trim() || undefined,
      website: draft.website.trim() || undefined,
    });
    setEditing(false);
  }

  async function shareProfile() {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/u/${handle}`
        : "";
    const text = `Follow me on Voyage — @${handle}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: displayName, text, url });
        return;
      } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Profile link copied");
    } catch {
      toast.error("Couldn't copy link");
    }
  }

  return (
    <div
      className="sticky z-20 border-b border-[var(--border)] bg-[var(--background)]/70 backdrop-blur-xl"
      style={{ top: "64px" /* sits below the global Nav (h-16) */ }}
    >
      <div className="px-6 py-5">
        {!editing ? (
          <>
            <div className="flex items-center gap-4">
              <div className="h-20 w-20 rounded-full border-2 border-[var(--accent)]/40 bg-gradient-to-br from-[var(--accent-soft)] to-[var(--card-strong)] flex items-center justify-center font-bold text-3xl text-[var(--accent)] shrink-0 ring-2 ring-[var(--background)]">
                {displayName.charAt(0).toUpperCase()}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl font-semibold tracking-tight truncate">
                    {displayName}
                  </h1>
                  {savedFlash && (
                    <span className="text-[10px] font-mono text-[var(--accent)] uppercase tracking-[0.18em]">
                      ✓ saved
                    </span>
                  )}
                </div>
                <div className="text-sm text-[var(--muted)]">@{handle}</div>

                {/* Engagement strip — drives the "I'm growing" feeling. */}
                <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[var(--muted)] flex-wrap">
                  <span className="inline-flex items-center gap-1">
                    <Eye size={11} strokeWidth={2} className="text-[var(--accent)]" />
                    <strong className="text-white">{formatCount(engagement.views)}</strong> views
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart size={11} strokeWidth={2} className="text-rose-300" />
                    <strong className="text-white">{formatCount(engagement.likes)}</strong> likes
                  </span>
                  <Link
                    href="/profile/following"
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    <Bookmark size={11} strokeWidth={2} className="text-emerald-300" />
                    <strong className="text-white">{formatCount(followers)}</strong> followers
                  </Link>
                  {streak > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                      <Flame size={10} strokeWidth={2.4} />
                      <strong>{streak}</strong>-day streak
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1 shrink-0">
                <button
                  onClick={shareProfile}
                  className="btn-primary text-xs px-3 py-1.5 inline-flex items-center gap-1"
                  aria-label="Share profile"
                >
                  <Share2 size={12} strokeWidth={1.75} />
                  Share
                </button>
                <button
                  onClick={() => setEditing(true)}
                  className="btn-ghost text-xs px-3 py-1.5 inline-flex items-center gap-1"
                  aria-label="Edit profile"
                >
                  <Pencil size={12} strokeWidth={1.75} />
                  Edit
                </button>
                <button
                  onClick={onSignOut}
                  className="text-[10px] font-mono text-[var(--muted)] hover:text-white uppercase tracking-[0.18em] mt-0.5"
                >
                  Sign out
                </button>
              </div>
            </div>

            {/* Bio + social link row */}
            <p className="text-sm mt-3 text-[var(--foreground)]/90 line-clamp-3">
              <Markup text={bio} />
            </p>
            {(instagram || tiktok || website) && (
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                {instagram && (
                  <a
                    href={igUrl(instagram)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[var(--foreground)]/85 hover:text-[var(--accent)] transition"
                  >
                    <InstagramIcon size={13} />
                    {prettyHandle(instagram)}
                  </a>
                )}
                {tiktok && (
                  <a
                    href={tiktokUrl(tiktok)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[var(--foreground)]/85 hover:text-[var(--accent)] transition"
                  >
                    <TikTokIcon size={13} />
                    {prettyHandle(tiktok)}
                  </a>
                )}
                {website && (
                  <a
                    href={siteUrl(website)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--foreground)]/85 hover:text-[var(--accent)] transition truncate max-w-[180px]"
                  >
                    🔗 {website.replace(/^https?:\/\/(www\.)?/, "")}
                  </a>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-3 items-center">
              <div className="h-16 w-16 rounded-full border-2 border-[var(--border-strong)] bg-[var(--card-strong)] flex items-center justify-center font-bold text-2xl text-[var(--accent)] shrink-0">
                {(draft.displayName || displayName).charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 space-y-2">
                <input
                  className="input"
                  placeholder="Display name"
                  value={draft.displayName}
                  onChange={(e) =>
                    setDraft({ ...draft, displayName: e.target.value })
                  }
                />
                <div className="flex items-center gap-1">
                  <span className="text-[var(--muted)] text-sm">@</span>
                  <input
                    className="input flex-1"
                    placeholder="username"
                    value={draft.username}
                    onChange={(e) =>
                      setDraft({ ...draft, username: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>
            <textarea
              className="input"
              rows={2}
              placeholder="Short bio"
              value={draft.bio}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
            />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[var(--muted)]"><InstagramIcon size={14} /></span>
                <input
                  className="input flex-1"
                  placeholder="Instagram @handle"
                  value={draft.instagram}
                  onChange={(e) =>
                    setDraft({ ...draft, instagram: e.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[var(--muted)]"><TikTokIcon size={14} /></span>
                <input
                  className="input flex-1"
                  placeholder="TikTok @handle"
                  value={draft.tiktok}
                  onChange={(e) =>
                    setDraft({ ...draft, tiktok: e.target.value })
                  }
                />
              </div>
              <input
                className="input"
                placeholder="Website URL"
                value={draft.website}
                onChange={(e) =>
                  setDraft({ ...draft, website: e.target.value })
                }
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={save} className="btn-primary text-xs px-3 py-1.5">
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="btn-ghost text-xs px-3 py-1.5"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
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

// ============================================================================
// Achievements row — horizontal scroll
// ============================================================================

function AchievementsRow({
  achievements,
  tripsCount,
  countriesCount,
  moments,
}: {
  achievements: Achievement[];
  tripsCount: number;
  countriesCount: number;
  moments: number;
}) {
  // Synthesize the "X Trips / X Countries" tiles plus the unlocked badges.
  const tiles: { id: string; label: string; sub?: string; locked?: boolean; progress?: number }[] = [
    { id: "trips", label: `${tripsCount} Trip${tripsCount === 1 ? "" : "s"}` },
    {
      id: "countries",
      label: `${countriesCount} Countr${countriesCount === 1 ? "y" : "ies"}`,
    },
    { id: "moments", label: `${moments} Moment${moments === 1 ? "" : "s"}` },
    ...achievements.map((a) => ({
      id: a.id,
      label: a.title,
      sub: a.unlocked ? "Unlocked" : a.description,
      locked: !a.unlocked,
      progress: a.progress,
    })),
  ];

  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
        // ACHIEVEMENTS
      </div>
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-6 px-6 scroll-smooth snap-x snap-mandatory">
        {tiles.map((t) => (
          <button
            key={t.id}
            title={t.sub}
            className={`shrink-0 snap-start rounded-2xl border px-3.5 py-2.5 text-left min-w-[140px] transition ${
              t.locked
                ? "border-[var(--border)] bg-[var(--card-strong)] opacity-70"
                : "border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 hover:border-[var(--accent)]/60"
            }`}
          >
            <div className="flex items-center gap-1.5">
              {t.locked ? (
                <Lock size={11} strokeWidth={1.75} className="text-[var(--muted)] shrink-0" />
              ) : (
                <Award size={12} strokeWidth={1.75} className="text-[var(--accent)] shrink-0" />
              )}
              <div className="text-sm font-semibold tracking-tight truncate">
                {t.label}
              </div>
            </div>
            {t.sub && (
              <div className="text-[10px] text-[var(--muted)] mt-0.5 truncate">
                {t.sub}
              </div>
            )}
            {t.progress != null && t.progress > 0 && t.progress < 1 && (
              <div className="mt-1.5 h-0.5 rounded-full bg-[var(--border)] overflow-hidden">
                <div
                  className="h-full bg-[var(--accent)]"
                  style={{ width: `${t.progress * 100}%` }}
                />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Stats row
// ============================================================================

function StatsRow({
  tripsTaken,
  countries,
  moments,
  favorite,
}: {
  tripsTaken: number;
  countries: number;
  moments: number;
  favorite: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <StatTile label="Trips Taken" value={tripsTaken.toString()} />
      <StatTile label="Countries Visited" value={countries.toString()} />
      <StatTile label="Moments Captured" value={moments.toString()} />
      <StatTile label="Favorite Destination" value={favorite} small />
    </div>
  );
}

function StatTile({
  label,
  value,
  small,
}: {
  label: string;
  value: string;
  small?: boolean;
}) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3">
      <div
        className={`font-semibold tracking-tight truncate ${
          small ? "text-base" : "text-2xl"
        }`}
      >
        {value}
      </div>
      <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted)] mt-1">
        {label}
      </div>
    </div>
  );
}

// ============================================================================
// Travel Patterns
// ============================================================================

function TravelPatternsRow({
  patterns,
  trips,
}: {
  patterns: TravelPatterns;
  trips: Trip[];
}) {
  const cards = useMemo(() => derivePatternCards(patterns, trips), [patterns, trips]);
  if (cards.length === 0) return null;
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
        // TRAVEL PATTERNS
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {cards.map((c) => (
          <div
            key={c.title}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3"
          >
            <div className="text-base">{c.icon}</div>
            <div className="font-semibold text-sm tracking-tight mt-1">
              {c.title}
            </div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5">
              {c.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function derivePatternCards(p: TravelPatterns, trips: Trip[]) {
  const out: { icon: string; title: string; body: string }[] = [];
  const totalDays = trips.reduce((s, t) => {
    const d =
      (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) /
      86_400_000;
    return s + Math.max(1, Math.round(d));
  }, 0);
  const avgDays = trips.length ? totalDays / trips.length : 0;

  // Weekend-heavy pattern.
  const weekendTrips = trips.filter((t) => {
    const d =
      (new Date(t.endDate).getTime() - new Date(t.startDate).getTime()) /
      86_400_000;
    return Math.round(d) <= 3;
  }).length;
  if (weekendTrips / Math.max(1, trips.length) >= 0.4) {
    out.push({
      icon: "🥂",
      title: "Mostly Weekend Trips",
      body: `${weekendTrips} of your ${trips.length} trips are 3 days or fewer.`,
    });
  } else if (avgDays >= 8) {
    out.push({
      icon: "🌍",
      title: "Long-Haul Lover",
      body: `Your trips average ${Math.round(avgDays)} days — slow travel suits you.`,
    });
  }

  // Vibe inferences.
  const vibeCounts = new Map<string, number>();
  for (const t of trips) for (const v of t.vibes) vibeCounts.set(v, (vibeCounts.get(v) ?? 0) + 1);
  const top = [...vibeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= 2) {
    const [vibe, count] = top;
    const map: Record<string, { icon: string; title: string }> = {
      Nature: { icon: "🏔️", title: "Prefers Mountains & Nature" },
      Beaches: { icon: "🏖", title: "Beach Person" },
      Food: { icon: "🍽", title: "Foodie at Heart" },
      Culture: { icon: "🏛", title: "Culture Hunter" },
      Nightlife: { icon: "🌃", title: "Night Owl Traveler" },
      Adventure: { icon: "🪂", title: "Thrill Seeker" },
      Romantic: { icon: "💞", title: "Romantic Getaway-er" },
      Luxury: { icon: "🥂", title: "Luxury Explorer" },
      Budget: { icon: "🎒", title: "Budget Backpacker" },
    };
    const m = map[vibe] ?? { icon: "✨", title: `${vibe} Energy` };
    out.push({
      icon: m.icon,
      title: m.title,
      body: `${count} trips tagged with “${vibe}.”`,
    });
  }

  // Season pref.
  if (p.preferredSeason) {
    const season = p.preferredSeason;
    const icon =
      season === "summer"
        ? "☀️"
        : season === "winter"
        ? "❄️"
        : season === "fall"
        ? "🍂"
        : "🌸";
    out.push({
      icon,
      title: `${season[0].toUpperCase() + season.slice(1)} Traveler`,
      body: `You travel most in ${season} — daily spend ~$${p.avgDailySpend}.`,
    });
  }

  // Multi-stop habit.
  const multi = trips.filter((t) => isMultiStop(t)).length;
  if (multi / Math.max(1, trips.length) >= 0.3 && multi >= 1) {
    out.push({
      icon: "🧭",
      title: "Multi-Stop Strategist",
      body: `${multi} trips span more than one place.`,
    });
  }

  return out.slice(0, 6);
}

// ============================================================================
// Preferences chips
// ============================================================================

function PreferencesChips({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(s: string) {
    onChange(
      selected.includes(s) ? selected.filter((x) => x !== s) : [...selected, s]
    );
  }
  return (
    <div>
      <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
        // TRAVEL STYLE
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TRAVEL_STYLE_OPTIONS.map((s) => {
          const active = selected.includes(s);
          return (
            <button
              key={s}
              type="button"
              onClick={() => toggle(s)}
              className={`rounded-full border px-3 py-1.5 text-xs transition ${
                active
                  ? "bg-[var(--accent-soft)] border-[var(--accent)] text-[var(--accent)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:text-white hover:border-[var(--border-strong)]"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Tab nav
// ============================================================================

function TabNav({
  tab,
  setTab,
  counts,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  counts: { kept: number; ready: number; trips: number };
}) {
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "posts", label: "Posts", badge: counts.kept + counts.trips },
    { id: "journal", label: "Journal", badge: counts.kept },
    { id: "memory", label: "Memory Roll", badge: counts.ready },
    { id: "saved", label: "Saved", badge: counts.trips },
  ];
  return (
    <div className="border-y border-[var(--border)] -mx-6">
      <div className="grid grid-cols-4">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative py-3 text-xs font-mono uppercase tracking-[0.18em] transition ${
                active
                  ? "text-[var(--accent)]"
                  : "text-[var(--muted)] hover:text-white"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {t.label}
                {t.badge != null && t.badge > 0 && (
                  <span className="text-[9px] tracking-normal rounded-full bg-[var(--card-strong)] border border-[var(--border)] px-1.5">
                    {t.badge}
                  </span>
                )}
              </span>
              {active && (
                <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-[var(--accent)] rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Posts
// ============================================================================

function PostsTab({ trips, kept }: { trips: Trip[]; kept: Memory[] }) {
  // "Posts" = trip cover images + kept moments, mixed chronologically.
  type Post =
    | { kind: "trip"; trip: Trip; at: number }
    | { kind: "moment"; m: Memory; at: number };
  const posts: Post[] = [
    ...trips.map((t) => ({
      kind: "trip" as const,
      trip: t,
      at: new Date(t.startDate).getTime(),
    })),
    ...kept.map((m) => ({
      kind: "moment" as const,
      m,
      at: new Date(m.capturedAt).getTime(),
    })),
  ].sort((a, b) => b.at - a.at);

  // Featured moment hero — pick the kept moment with the most "engagement"
  // so the user has a hero to brag about.
  const featured = useMemo(() => {
    if (kept.length === 0) return null;
    let best: { m: Memory; views: number } | null = null;
    for (const m of kept) {
      const s = momentStats(m);
      if (!best || s.views > best.views) best = { m, views: s.views };
    }
    return best?.m ?? null;
  }, [kept]);

  if (posts.length === 0) {
    return (
      <EmptyTab
        title="No posts yet"
        body="Plan a trip or catch a moment to start building your feed."
      />
    );
  }

  return (
    <div className="-mx-6">
      {/* Featured hero — IG-style "spotlight" of the user's biggest moment */}
      {featured && <FeaturedMoment memory={featured} />}

      <div
        className="grid grid-cols-3 gap-0.5"
        style={{ contentVisibility: "auto" }}
      >
        {posts.map((p, i) =>
          p.kind === "trip" ? (
            <Link
              href={`/trips/${p.trip.id}`}
              key={`trip-${p.trip.id}-${i}`}
              className="group aspect-square relative overflow-hidden"
            >
              <LocationImageEl
                name={p.trip.destination}
                kind="city"
                aspect="1/1"
                rounded="none"
                className="h-full w-full"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/0 to-transparent" />
              <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] font-mono tracking-[0.16em] uppercase text-white drop-shadow line-clamp-1">
                ✈ {routeSummary(p.trip)}
              </div>
            </Link>
          ) : (
            <PostMomentTile key={`mem-${p.m.id}-${i}`} m={p.m} />
          )
        )}
      </div>
    </div>
  );
}

function PostMomentTile({ m }: { m: Memory }) {
  const stats = momentStats(m);
  return (
    <div className="group aspect-square relative overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={m.filteredDataUri ?? m.imageDataUri}
        alt="Travel moment"
        className="aspect-square w-full object-cover transition group-hover:scale-105"
      />
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition bg-black/40 flex items-center justify-center gap-3 text-white text-xs font-medium">
        <LikeButton
          target={`mom:${m.id}`}
          isMine
          size="sm"
          variant="tile"
        />
        <span className="inline-flex items-center gap-1">
          <Eye size={12} strokeWidth={2.4} />
          {formatCount(stats.views)}
        </span>
      </div>
    </div>
  );
}

function FeaturedMoment({ memory }: { memory: Memory }) {
  const stats = momentStats(memory);
  return (
    <div className="relative aspect-[16/9] sm:aspect-[21/9] mb-1 overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={memory.filteredDataUri ?? memory.imageDataUri}
        alt={memory.caption ?? "Featured moment"}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
        <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase">
          // FEATURED MOMENT
        </div>
        {memory.caption && (
          <div className="mt-1 text-base sm:text-lg font-semibold tracking-tight line-clamp-2">
            <Markup text={memory.caption} />
          </div>
        )}
        <div className="mt-2 flex items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-1">
            <Eye size={12} strokeWidth={2} className="text-[var(--accent)]" />
            <strong>{formatCount(stats.views)}</strong> views
          </span>
          <LikeButton
            target={`mom:${memory.id}`}
            isMine
            size="sm"
            variant="ghost"
          />
          <span className="inline-flex items-center gap-1">
            <Bookmark size={12} strokeWidth={2} className="text-emerald-300" />
            <strong>{formatCount(stats.saves)}</strong>
          </span>
          <span className="inline-flex items-center gap-1">
            <Share2 size={12} strokeWidth={2} className="text-sky-300" />
            <strong>{formatCount(stats.shares)}</strong>
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Journal — masonry of kept moments + lightbox
// ============================================================================

function JournalTab({
  kept,
  onUpdate,
}: {
  kept: Memory[];
  onUpdate: (id: string, patch: Partial<Memory>) => void;
}) {
  const [lightbox, setLightbox] = useState<Memory | null>(null);
  const [caption, setCaption] = useState("");
  const [location, setLocation] = useState("");

  function openLightbox(m: Memory) {
    setLightbox(m);
    setCaption(m.caption ?? "");
    setLocation(m.location ?? "");
  }
  function saveLightbox() {
    if (!lightbox) return;
    onUpdate(lightbox.id, {
      caption: caption.trim() || undefined,
      location: location.trim() || undefined,
    });
    toast.success("Caption saved");
    setLightbox(null);
  }

  if (kept.length === 0) {
    return (
      <EmptyTab
        title="Your journal is quiet."
        body="Catch a moment, keep it, and it'll land here with a film look."
      />
    );
  }

  return (
    <>
      {/* CSS-columns "masonry" — works without Grid Level 3 masonry. */}
      <div
        className="columns-2 sm:columns-3 gap-2 [column-fill:_balance]"
        style={{ contentVisibility: "auto" }}
      >
        {kept.map((m) => (
          <button
            key={m.id}
            onClick={() => openLightbox(m)}
            className="block w-full mb-2 break-inside-avoid rounded-xl overflow-hidden border border-[var(--border)] hover:border-[var(--border-strong)] transition text-left"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.filteredDataUri ?? m.imageDataUri}
              alt={m.caption ?? "Travel moment"}
              className="w-full block"
            />
            <div className="p-2 bg-[var(--card-strong)]">
              <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--muted)]">
                {new Date(m.capturedAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {m.location && ` · ${m.location}`}
              </div>
              {m.caption && (
                <div className="text-xs mt-1 line-clamp-2">
                  <Markup text={m.caption ?? ""} />
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {lightbox && (
        <Lightbox
          memory={lightbox}
          caption={caption}
          location={location}
          onCaption={setCaption}
          onLocation={setLocation}
          onClose={() => setLightbox(null)}
          onSave={saveLightbox}
        />
      )}
    </>
  );
}

/** Comments + repost row that hangs off any moment / trip / mock target. */
function MomentSocial({ target }: { target: string }) {
  const [comments, setComments] = useState<Cmt[]>([]);
  const [text, setText] = useState("");
  const [reposted, setReposted] = useState(false);
  const [repostN, setRepostN] = useState(0);

  function refresh() {
    setComments(loadComments(target));
    setReposted(isReposted(target));
    setRepostN(repostCount(target));
  }

  useEffect(() => {
    refresh();
    const h = (e: Event) => {
      if ((e as CustomEvent<string>).detail === target) refresh();
    };
    window.addEventListener("voyage:comments-updated", h);
    return () => window.removeEventListener("voyage:comments-updated", h);
  }, [target]);

  function send() {
    const t = text.trim();
    if (!t) return;
    addComment(target, t);
    setText("");
    refresh();
  }
  function toggleRepost() {
    if (reposted) unrepost(target);
    else repost(target);
    refresh();
    toast.success(reposted ? "Repost removed" : "Reposted to your feed");
  }

  return (
    <div className="pt-3 border-t border-[var(--border)]">
      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
        <button
          onClick={toggleRepost}
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 border transition ${
            reposted
              ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200"
              : "border-[var(--border)] hover:border-[var(--border-strong)]"
          }`}
        >
          <Repeat2 size={13} strokeWidth={2} />
          {reposted ? "Reposted" : "Repost"}
          {repostN > 0 && (
            <span className="text-[10px] opacity-80">· {repostN}</span>
          )}
        </button>
        <span className="inline-flex items-center gap-1">
          <CommentIcon size={12} strokeWidth={2} />
          {commentCount(target)}
        </span>
      </div>

      {comments.length > 0 && (
        <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto pr-1">
          {comments.map((c) => {
            const u = c.authorId === "me"
              ? null
              : MOCK_USERS.find((x) => x.id === c.authorId);
            return (
              <li key={c.id} className="text-sm flex gap-2">
                <span className="font-medium shrink-0">
                  {u ? `@${u.username}` : "you"}
                </span>
                <span className="flex-1 min-w-0 break-words">{c.text}</span>
                <span className="text-[10px] font-mono text-[var(--muted)] uppercase tracking-[0.14em] shrink-0">
                  {timeAgoShort(c.createdAt)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="mt-3 flex gap-2"
      >
        <input
          className="input flex-1"
          placeholder="Add a comment…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="btn-primary px-3 text-xs disabled:opacity-50"
        >
          Post
        </button>
      </form>
    </div>
  );
}

function timeAgoShort(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  return `${d}d`;
}

function LightboxShare({
  memory,
  caption,
  location,
}: {
  memory: Memory;
  caption: string;
  location: string;
}) {
  const [open, setOpen] = useState(false);
  const target: ShareTarget = {
    kind: "moment",
    id: memory.id,
    imageUri: memory.filteredDataUri ?? memory.imageDataUri,
    caption: caption || memory.caption,
    location: location || memory.location,
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="btn-ghost text-sm px-4 py-2 inline-flex items-center gap-1.5"
      >
        <Share2 size={13} strokeWidth={1.75} />
        Share
      </button>
      <ShareSheet
        open={open}
        onClose={() => setOpen(false)}
        target={target}
        shareText={caption || memory.caption || "A moment from my trip"}
      />
    </>
  );
}

function LightboxStats({ memory }: { memory: Memory }) {
  const s = momentStats(memory);
  return (
    <div className="flex items-center gap-3 text-[11px]">
      <span className="inline-flex items-center gap-1 text-[var(--muted)]">
        <Eye size={11} strokeWidth={2} className="text-[var(--accent)]" />
        <strong className="text-white">{formatCount(s.views)}</strong>
      </span>
      {/* Real, interactive heart. Counts come from lib/likes (cached + reactive). */}
      <LikeButton
        target={`mom:${memory.id}`}
        isMine
        size="xs"
        variant="ghost"
      />
      <span className="inline-flex items-center gap-1 text-[var(--muted)]">
        <Bookmark size={11} strokeWidth={2} className="text-emerald-300" />
        <strong className="text-white">{formatCount(s.saves)}</strong>
      </span>
    </div>
  );
}

function Lightbox({
  memory,
  caption,
  location,
  onCaption,
  onLocation,
  onClose,
  onSave,
}: {
  memory: Memory;
  caption: string;
  location: string;
  onCaption: (s: string) => void;
  onLocation: (s: string) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-label="Memory lightbox"
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto rounded-2xl border border-[var(--border-strong)] bg-[var(--background-soft)]">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-black/50 backdrop-blur-sm text-2xl leading-none flex items-center justify-center"
        >
          <X size={16} strokeWidth={1.75} />
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={memory.filteredDataUri ?? memory.imageDataUri}
          alt={memory.caption ?? "Travel moment"}
          className="w-full max-h-[60vh] object-contain bg-black"
        />
        <div className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-[var(--muted)]">
              Captured{" "}
              {new Date(memory.capturedAt).toLocaleString(undefined, {
                dateStyle: "long",
                timeStyle: "short",
              })}
            </div>
            <LightboxStats memory={memory} />
          </div>
          {memory.location && (
            <PlanFromHere destination={memory.location} size="sm" />
          )}

          <MomentSocial target={`mom:${memory.id}`} />
          <input
            className="input"
            placeholder="Where was this? (e.g. Shibuya Crossing)"
            value={location}
            onChange={(e) => onLocation(e.target.value)}
          />
          <textarea
            className="input"
            rows={3}
            placeholder="Write a caption…"
            value={caption}
            onChange={(e) => onCaption(e.target.value)}
          />
          <div className="flex gap-2 justify-between">
            <LightboxShare memory={memory} caption={caption} location={location} />
            <div className="flex gap-2">
              <button onClick={onClose} className="btn-ghost text-sm px-4 py-2">
                Close
              </button>
              <button onClick={onSave} className="btn-primary text-sm px-4 py-2">
                Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab: Memory Roll — Ready + Processing + floating "Catch a Moment"
// ============================================================================

function MemoryRollTab({
  ready,
  processing,
  onKeep,
  onDiscard,
}: {
  ready: Memory[];
  processing: Memory[];
  onKeep: (m: Memory) => void | Promise<void>;
  onDiscard: (m: Memory) => void;
}) {
  return (
    <div className="space-y-6 pb-24">
      {ready.length === 0 && processing.length === 0 && (
        <EmptyTab
          title="Catch your first moment."
          body="Tap the button below to open the camera. After a quiet processing window, it'll show up here ready to keep."
        />
      )}

      {ready.length > 0 && (
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--accent)] uppercase mb-2">
            // READY MOMENTS · {ready.length}
          </div>
          <ul className="space-y-2">
            {ready.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 flex gap-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={m.imageDataUri}
                  alt="A captured moment"
                  className="h-24 w-24 object-cover rounded-lg shrink-0 border border-[var(--border)]"
                />
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="text-[10px] font-mono tracking-[0.16em] text-[var(--muted)] uppercase">
                    Ready{" "}
                    {new Date(m.readyAt).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="mt-auto pt-2 flex gap-2">
                    <button
                      onClick={() => onKeep(m)}
                      className="btn-primary text-xs px-3 py-1.5 flex-1 sm:flex-none"
                    >
                      Keep
                    </button>
                    <button
                      onClick={() => onDiscard(m)}
                      className="btn-ghost text-xs px-3 py-1.5 flex-1 sm:flex-none"
                    >
                      Discard
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {processing.length > 0 && (
        <div>
          <div className="font-mono text-[10px] tracking-[0.22em] text-[var(--muted)] uppercase mb-2">
            // PROCESSING · {processing.length}
          </div>
          <ul className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {processing.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-2 text-center"
              >
                <div className="aspect-square rounded-md bg-black/40 flex items-center justify-center text-2xl">
                  <span className="pulse-dot text-[var(--accent)]">◴</span>
                </div>
                <div className="mt-1.5 text-[9px] font-mono tracking-[0.14em] text-[var(--muted)] uppercase truncate">
                  {readyInLabel(m)}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Floating Catch-a-Moment button. Sits above the mobile tab bar via z-30. */}
      <Link
        href="/profile/capture"
        aria-label="Catch a Moment"
        className="fixed left-1/2 -translate-x-1/2 z-30 btn-primary px-6 py-3 text-sm font-medium shadow-2xl rounded-full inline-flex items-center gap-2"
        style={{
          // Above the mobile tab bar (h-14 + safe-area).
          bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
        }}
      >
        📷 Catch a Moment
      </Link>
    </div>
  );
}

// ============================================================================
// Tab: Saved trips
// ============================================================================

function SavedTab({ trips }: { trips: Trip[] }) {
  if (trips.length === 0) {
    return (
      <EmptyTab
        title="Nothing saved yet."
        body="Plan a trip and it'll show up here so you can pick it back up."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {trips.map((t) => (
        <li key={t.id}>
          <Link
            href={`/trips/${t.id}`}
            className="rounded-xl border border-[var(--border)] bg-[var(--card-strong)] p-3 flex items-center gap-3 hover:border-[var(--border-strong)] transition"
          >
            <div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden">
              <LocationImageEl
                name={t.destination}
                kind="city"
                aspect="1/1"
                rounded="none"
                className="h-full w-full"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{routeSummary(t)}</div>
              <div className="text-[11px] text-[var(--muted)] mt-0.5 truncate">
                {t.startDate} — {t.endDate} · {t.itinerary.length} day
                {t.itinerary.length === 1 ? "" : "s"}
              </div>
            </div>
            <span className="text-[var(--muted)] text-lg">→</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

// ============================================================================
// Empty tab helper
// ============================================================================

function EmptyTab({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border-strong)] bg-[var(--card-strong)] p-10 text-center">
      <div className="font-semibold">{title}</div>
      <p className="text-sm text-[var(--muted)] mt-1.5">{body}</p>
    </div>
  );
}

// ============================================================================
// Edit profile drawer — hosts the existing Identity / Companions / Cards /
// Medical / Default Preferences editors so nothing is lost.
// ============================================================================

function EditProfileDrawer({
  profile,
  patch,
}: {
  profile: TravelerProfile;
  patch: (p: Partial<TravelerProfile>) => void;
}) {
  return (
    <div className="space-y-6">
      <SettingsCard icon={User} title="Identity">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Full name (as on tickets)">
            <input
              className="input"
              value={profile.fullName ?? ""}
              onChange={(e) => patch({ fullName: e.target.value || undefined })}
            />
          </Field>
          <Field label="Passport name (if different)">
            <input
              className="input"
              value={profile.passportName ?? ""}
              onChange={(e) =>
                patch({ passportName: e.target.value || undefined })
              }
            />
          </Field>
          <Field label="Date of birth">
            <input
              type="date"
              className="input"
              value={profile.dateOfBirth ?? ""}
              onChange={(e) =>
                patch({ dateOfBirth: e.target.value || undefined })
              }
            />
          </Field>
          <Field label="Home airport">
            <LocationAutocomplete
              value={profile.homeAirport ?? ""}
              onText={(s) =>
                patch({ homeAirport: s.toUpperCase() || undefined })
              }
              onPick={(loc) =>
                patch({
                  homeAirport: (loc.iata ?? loc.name).toUpperCase() || undefined,
                })
              }
              placeholder="e.g. SFO, LAX, JFK"
              showRecent={false}
            />
          </Field>
        </div>
      </SettingsCard>

      <TripPreferencesPanel
        value={profile.defaultPreferences}
        onChange={(prefs: TripPreferences) =>
          patch({ defaultPreferences: prefs })
        }
        storageKey="voyage:profile-default-prefs-open"
      />

      <CompanionsCard
        companions={profile.companions ?? []}
        onChange={(companions) =>
          patch({ companions: companions.length > 0 ? companions : undefined })
        }
      />

      <CardsCard
        cards={profile.creditCards ?? []}
        onChange={(creditCards) =>
          patch({
            creditCards: creditCards.length > 0 ? creditCards : undefined,
          })
        }
      />

      <SettingsCard icon={HeartPulse} title="Medical info (for SOS screen)">
        <p className="text-xs text-[var(--muted)] mb-3">
          Surfaces on /sos so first responders can find it quickly.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Blood type">
            <input
              className="input"
              placeholder="O+"
              value={profile.bloodType ?? ""}
              onChange={(e) =>
                patch({ bloodType: e.target.value || undefined })
              }
            />
          </Field>
          <Field label="Allergies">
            <input
              className="input"
              value={profile.medicalAllergies ?? ""}
              onChange={(e) =>
                patch({ medicalAllergies: e.target.value || undefined })
              }
            />
          </Field>
          <Field label="Current medications">
            <input
              className="input"
              value={profile.currentMedications ?? ""}
              onChange={(e) =>
                patch({ currentMedications: e.target.value || undefined })
              }
            />
          </Field>
        </div>
      </SettingsCard>
    </div>
  );
}

function CompanionsCard({
  companions,
  onChange,
}: {
  companions: TravelCompanion[];
  onChange: (next: TravelCompanion[]) => void;
}) {
  function add() {
    onChange([
      ...companions,
      {
        id: `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: "",
        relation: "",
      },
    ]);
  }
  function update(id: string, p: Partial<TravelCompanion>) {
    onChange(companions.map((c) => (c.id === id ? { ...c, ...p } : c)));
  }
  function remove(id: string) {
    onChange(companions.filter((c) => c.id !== id));
  }
  return (
    <SettingsCard icon={Users} title="Frequent travel companions">
      <div className="space-y-2">
        {companions.map((c) => (
          <div
            key={c.id}
            className="grid grid-cols-1 md:grid-cols-[1fr_140px_1fr_auto] gap-2 items-center"
          >
            <input
              className="input"
              placeholder="Name"
              value={c.name}
              onChange={(e) => update(c.id, { name: e.target.value })}
            />
            <input
              className="input"
              placeholder="Relation"
              value={c.relation ?? ""}
              onChange={(e) =>
                update(c.id, { relation: e.target.value || undefined })
              }
            />
            <input
              className="input"
              placeholder="Email (optional)"
              value={c.email ?? ""}
              onChange={(e) =>
                update(c.id, { email: e.target.value || undefined })
              }
            />
            <button
              type="button"
              onClick={() => remove(c.id)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-2 justify-self-end"
              aria-label="Remove"
            >
              <Trash2 size={14} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={add}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <Plus size={12} strokeWidth={1.75} />
        Add companion
      </button>
    </SettingsCard>
  );
}

function CardsCard({
  cards,
  onChange,
}: {
  cards: CreditCard[];
  onChange: (cards: CreditCard[]) => void;
}) {
  function add(card: CreditCard) {
    if (cards.some((c) => c.id === card.id)) return;
    onChange([...cards, card]);
  }
  function remove(id: string) {
    onChange(cards.filter((c) => c.id !== id));
  }
  return (
    <SettingsCard icon={CreditCardIcon} title="Credit cards (rewards optimizer)">
      <div className="space-y-2">
        {cards.length === 0 && (
          <div className="text-sm text-[var(--muted)]">
            No cards added. Pick from popular cards below or add your own.
          </div>
        )}
        {cards.map((c) => (
          <div
            key={c.id}
            className="border border-[var(--border)] rounded-lg p-3 flex items-start gap-3"
          >
            <CreditCardIcon
              size={16}
              strokeWidth={1.75}
              className="text-[var(--accent)] flex-none mt-0.5"
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm">{c.name}</div>
              <div className="text-xs text-[var(--muted)] mt-1">
                {c.rewards
                  .map((r) => `${r.multiplier}× ${r.category}`)
                  .join(" · ")}
              </div>
            </div>
            <button
              onClick={() => remove(c.id)}
              className="text-[var(--muted)] hover:text-[var(--danger)] p-1"
              aria-label="Remove"
            >
              <Trash2 size={13} strokeWidth={1.75} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-4">
        <div className="text-xs text-[var(--muted)] mb-2">Quick add</div>
        <div className="flex flex-wrap gap-2">
          {POPULAR_CARDS.map((c) => {
            const owned = cards.some((x) => x.id === c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => add(c)}
                disabled={owned}
                className={
                  "px-3 py-1.5 text-xs rounded-full border transition " +
                  (owned
                    ? "border-[var(--border)] text-[var(--muted)] cursor-default"
                    : "border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]")
                }
              >
                {owned ? "✓ " : "+ "}
                {c.name}
              </button>
            );
          })}
        </div>
      </div>
    </SettingsCard>
  );
}

function SettingsCard({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof User;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} strokeWidth={1.75} className="text-[var(--accent)]" />
        <div className="font-mono text-[10px] tracking-[0.2em] text-[var(--muted)] uppercase">
          {title}
        </div>
      </div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-[var(--muted)] mb-1 text-xs">{label}</div>
      {children}
    </label>
  );
}
