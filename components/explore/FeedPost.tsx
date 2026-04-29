"use client";

// One-post-at-a-time vertical feed item. Each post fills most of the viewport
// so users see it on its own, then scroll for the next one. Header on top
// (author + time), media in the middle, caption + IG-style action row below.
//
// Media is media-agnostic:
//   1. If `videoUri` is set on the user's memory, render a <video> with
//      autoplay-on-intersection, muted-by-default, tap-to-unmute, looped.
//   2. If a mock moment has `videoHue` set, render an animated CSS gradient
//      stand-in (pre-recording demo content). Same UI affordances overlay.
//   3. Otherwise — image / gradient tile (existing behavior).

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Bookmark, MessageCircle, MoreHorizontal, Sparkles, Volume2, VolumeX } from "lucide-react";
import LikeButton from "@/components/LikeButton";
import Markup from "@/components/Markup";
import ShareSheet from "@/components/ShareSheet";
import {
  avatarStyle,
  isFollowing,
  momentTileStyle,
  momentVideoTileStyle,
  setFollow,
  type MockUser,
  type ShareTarget,
} from "@/lib/social";
import { momentStats, formatCount } from "@/lib/social-stats";
import { type Memory } from "@/lib/memory-roll";
import { toast } from "@/lib/toast";
import { useInView } from "@/lib/use-in-view";

type FeedPostInput =
  | {
      kind: "mock";
      user: MockUser;
      moment: MockUser["moments"][number];
      at: number;
    }
  | { kind: "mine"; memory: Memory; at: number };

export default function FeedPost({
  item,
  meName,
}: {
  item: FeedPostInput;
  meName: string;
}) {
  const [shareOpen, setShareOpen] = useState(false);

  if (item.kind === "mock") {
    const u = item.user;
    const m = item.moment;
    const target: ShareTarget = {
      kind: "mock-moment",
      userId: u.id,
      momentId: m.id,
      caption: m.caption,
      location: m.location,
      hue: m.hue,
    };
    return (
      <article
        className="min-h-screen w-full flex flex-col items-center justify-center py-6"
        style={{ scrollSnapAlign: "start" }}
      >
        <div className="w-full max-w-md mx-auto">
          <Header
            avatarHue={u.hue}
            name={u.displayName}
            handle={u.username}
            location={m.location}
            ago={`${m.daysAgo}d`}
            href={`/u/${u.username}`}
            mockUserId={u.id}
          />

          {/* Media — animated "reel" gradient if videoHue set, else still tile. */}
          {typeof m.videoHue === "number" ? (
            <MockReelTile hue={m.videoHue} />
          ) : (
            <div
              className="aspect-[4/5] w-full overflow-hidden"
              style={momentTileStyle(m.hue)}
            />
          )}

          <ActionRow
            target={`mock:${m.id}`}
            destination={m.location.split(",").pop()?.trim() || m.location}
            isMine={false}
            onShare={() => setShareOpen(true)}
          />

          <Caption
            text={m.caption}
            counts={{ likes: 0 /* sourced from likeCount inside LikeButton */ }}
          />
        </div>

        <ShareSheet
          open={shareOpen}
          onClose={() => setShareOpen(false)}
          target={target}
          shareText={`${m.caption} · @${u.username}`}
        />
      </article>
    );
  }

  // "mine" — current user's kept moment
  const memory = item.memory;
  const stats = momentStats(memory);
  const target: ShareTarget = {
    kind: "moment",
    id: memory.id,
    imageUri: memory.filteredDataUri ?? memory.imageDataUri,
    caption: memory.caption,
    location: memory.location,
  };
  const dest = memory.location?.split(",").pop()?.trim() ?? "";

  return (
    <article
      className="min-h-screen w-full flex flex-col items-center justify-center py-6"
      style={{ scrollSnapAlign: "start" }}
    >
      <div className="w-full max-w-md mx-auto">
        <Header
          avatarHue={200}
          name={meName}
          handle="you"
          location={memory.location}
          ago={timeAgo(memory.decidedAt ?? memory.capturedAt)}
          href="/profile"
        />
        {/* Media — real video when present, else image. */}
        {memory.videoUri ? (
          <ReelVideo
            src={memory.videoUri}
            poster={memory.posterUri ?? memory.filteredDataUri ?? memory.imageDataUri}
            alt={memory.caption ?? "moment"}
          />
        ) : (
          <div className="aspect-[4/5] w-full overflow-hidden bg-black">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={memory.filteredDataUri ?? memory.imageDataUri}
              alt={memory.caption ?? "moment"}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </div>
        )}
        <ActionRow
          target={`mom:${memory.id}`}
          destination={dest}
          isMine
          onShare={() => setShareOpen(true)}
        />
        <Caption text={memory.caption ?? ""} viewsLabel={`${formatCount(stats.views)} views`} />
      </div>

      <ShareSheet
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        target={target}
        shareText={memory.caption ?? "A moment from my trip"}
      />
    </article>
  );
}

// -----------------------------------------------------------------------------
// Reels-style real video. Autoplays when ~50% on-screen, pauses otherwise so
// we don't burn battery + bandwidth on 20-post feeds. Tap toggles mute.
function ReelVideo({
  src,
  poster,
  alt,
}: {
  src: string;
  poster?: string;
  alt: string;
}) {
  const [wrapRef, inView] = useInView<HTMLDivElement>({ rootMargin: "0px" });
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  // Drive play/pause from the visibility hook.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (inView) {
      // play() can reject (autoplay-with-sound blocked, user-gesture missing).
      // We start muted, so autoplay should be permitted. Catch + ignore.
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [inView]);

  return (
    <div
      ref={wrapRef}
      className="relative aspect-[4/5] w-full overflow-hidden bg-black"
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        muted={muted}
        loop
        playsInline
        preload="metadata"
        aria-label={alt}
        className="h-full w-full object-cover"
        onClick={() => setMuted((v) => !v)}
      />
      {/* Mute / unmute glyph — tap-target overlaid bottom-right. */}
      <button
        type="button"
        aria-label={muted ? "Unmute" : "Mute"}
        aria-pressed={!muted}
        onClick={() => setMuted((v) => !v)}
        className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white active:scale-95"
      >
        {muted ? (
          <VolumeX size={16} strokeWidth={2} />
        ) : (
          <Volume2 size={16} strokeWidth={2} />
        )}
      </button>
      {/* Tiny "REEL" badge — gives the affordance a name. */}
      <div className="absolute top-3 left-3 font-mono text-[9px] tracking-[0.2em] uppercase bg-black/55 backdrop-blur-sm text-white/90 px-1.5 py-0.5 rounded">
        REEL
      </div>
    </div>
  );
}

// Animated-gradient stand-in for mock-moment "videos". Cheap, file-free, and
// reuses the same overlays so the layout matches the real <ReelVideo>.
function MockReelTile({ hue }: { hue: number }) {
  return (
    <div
      className="relative aspect-[4/5] w-full overflow-hidden"
      style={momentVideoTileStyle(hue)}
    >
      <div className="absolute top-3 left-3 font-mono text-[9px] tracking-[0.2em] uppercase bg-black/55 backdrop-blur-sm text-white/90 px-1.5 py-0.5 rounded">
        REEL
      </div>
      <div
        aria-hidden
        className="absolute bottom-3 right-3 h-9 w-9 rounded-full bg-black/55 backdrop-blur-sm flex items-center justify-center text-white"
      >
        <VolumeX size={16} strokeWidth={2} />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------

function Header({
  avatarHue,
  name,
  handle,
  location,
  ago,
  href,
  mockUserId,
}: {
  avatarHue: number;
  name: string;
  handle: string;
  location?: string;
  ago: string;
  href: string;
  mockUserId?: string;
}) {
  const [following, setFollowing] = useState(() =>
    mockUserId ? isFollowing(mockUserId) : true
  );
  function toggle() {
    if (!mockUserId) return;
    const next = !following;
    setFollow(mockUserId, next);
    setFollowing(next);
    if (next) toast.success(`Following ${name}`);
  }
  return (
    <div className="flex items-center gap-3 px-4 sm:px-0 py-2.5">
      <Link href={href} className="flex items-center gap-3 flex-1 min-w-0">
        <div
          className="h-10 w-10 rounded-full ring-2 ring-[var(--background)] shrink-0"
          style={avatarStyle(avatarHue)}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-[11px] text-[var(--muted)] truncate">
            {location ? `${location} · ${ago}` : `@${handle} · ${ago}`}
          </div>
        </div>
      </Link>
      {mockUserId && !following && (
        <button onClick={toggle} className="btn-primary text-xs px-3 py-1">
          Follow
        </button>
      )}
      <button aria-label="More" className="text-[var(--muted)] p-1">
        <MoreHorizontal size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
}

function ActionRow({
  target,
  destination,
  isMine,
  onShare,
}: {
  target: string;
  destination: string;
  isMine: boolean;
  onShare: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-4 sm:px-0 py-2.5">
      <LikeButton target={target} isMine={isMine} variant="ghost" size="md" />
      <Link
        href="#comments"
        className="inline-flex items-center gap-1 text-[var(--muted)] hover:text-white transition"
        aria-label="Comments"
      >
        <MessageCircle size={18} strokeWidth={2} />
      </Link>
      <button
        onClick={onShare}
        aria-label="Share"
        className="text-[var(--muted)] hover:text-white transition"
      >
        <Sparkles size={18} strokeWidth={2} />
      </button>
      <div className="ml-auto flex items-center gap-3">
        {destination && (
          <Link
            href={`/plan?destination=${encodeURIComponent(destination)}`}
            className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--accent)] hover:text-white"
          >
            ✦ Plan a trip here
          </Link>
        )}
        <button
          aria-label="Save"
          className="text-[var(--muted)] hover:text-white transition"
        >
          <Bookmark size={18} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}

function Caption({
  text,
  viewsLabel,
}: {
  text: string;
  counts?: { likes: number };
  viewsLabel?: string;
}) {
  if (!text && !viewsLabel) return null;
  return (
    <div className="px-4 sm:px-0 pb-4 text-sm leading-relaxed">
      {viewsLabel && (
        <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted)] mb-1">
          {viewsLabel}
        </div>
      )}
      {text && <Markup text={text} />}
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
  return `${Math.round(h / 24)}d`;
}
