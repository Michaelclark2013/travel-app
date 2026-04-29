"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import {
  avatarStyle,
  loadStoryGroups,
  markGroupSeen,
  momentTileStyle,
  type StoryGroup,
} from "@/lib/stories";
import Markup from "@/components/Markup";

// Horizontal Avatar strip + full-screen viewer modal. Drop on /explore + the
// top of /profile.
export default function StoriesStrip() {
  const [groups, setGroups] = useState<StoryGroup[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  function refresh() {
    setGroups(loadStoryGroups());
  }

  useEffect(() => {
    refresh();
  }, []);

  function open(i: number) {
    setActiveIdx(i);
  }
  function close() {
    setActiveIdx(null);
    refresh();
  }
  function nextGroup() {
    if (activeIdx == null) return;
    if (activeIdx + 1 >= groups.length) return close();
    setActiveIdx(activeIdx + 1);
  }
  function prevGroup() {
    if (activeIdx == null) return;
    if (activeIdx - 1 < 0) return close();
    setActiveIdx(activeIdx - 1);
  }

  if (groups.length === 0) {
    return (
      <div className="flex gap-3 -mx-6 px-6 overflow-x-auto pb-2 snap-x snap-mandatory">
        <Link
          href="/profile/capture"
          className="shrink-0 snap-start text-center"
        >
          <div className="h-16 w-16 rounded-full border-2 border-dashed border-[var(--border-strong)] flex items-center justify-center text-[var(--muted)]">
            <Plus size={20} strokeWidth={1.75} />
          </div>
          <div className="text-[10px] mt-1.5 text-[var(--muted)]">Your story</div>
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="flex gap-3 -mx-6 px-6 overflow-x-auto pb-2 snap-x snap-mandatory">
        <Link
          href="/profile/capture"
          className="shrink-0 snap-start text-center"
        >
          <div className="h-16 w-16 rounded-full bg-[var(--card-strong)] border-2 border-dashed border-[var(--border-strong)] flex items-center justify-center text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition">
            <Plus size={22} strokeWidth={1.75} />
          </div>
          <div className="text-[10px] mt-1.5 text-[var(--muted)]">Add story</div>
        </Link>

        {groups.map((g, i) => (
          <button
            key={g.ownerId}
            onClick={() => open(i)}
            className="shrink-0 snap-start text-center"
            aria-label={`Open ${g.ownerName}'s story`}
          >
            <div
              className={`h-16 w-16 rounded-full p-[2px] ${
                g.seen
                  ? "bg-[var(--border)]"
                  : "bg-gradient-to-tr from-[var(--accent)] via-rose-400 to-amber-400"
              }`}
            >
              <div
                className="h-full w-full rounded-full ring-2 ring-[var(--background)]"
                style={avatarStyle(g.ownerHue)}
              />
            </div>
            <div className="text-[10px] mt-1.5 truncate max-w-[64px] text-[var(--foreground)]/85">
              {g.ownerId === "me" ? "you" : `@${g.ownerHandle}`}
            </div>
          </button>
        ))}
      </div>

      {activeIdx !== null && groups[activeIdx] && (
        <StoryViewer
          group={groups[activeIdx]}
          onClose={() => {
            markGroupSeen(groups[activeIdx].ownerId);
            close();
          }}
          onNext={() => {
            markGroupSeen(groups[activeIdx].ownerId);
            nextGroup();
          }}
          onPrev={() => {
            markGroupSeen(groups[activeIdx].ownerId);
            prevGroup();
          }}
        />
      )}
    </>
  );
}

function StoryViewer({
  group,
  onClose,
  onNext,
  onPrev,
}: {
  group: StoryGroup;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const story = group.stories[idx];

  // Auto-advance every 5s; pause if the user holds.
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const t = setTimeout(() => {
      if (idx + 1 < group.stories.length) setIdx(idx + 1);
      else onNext();
    }, 5000);
    return () => clearTimeout(t);
  }, [idx, paused, group.stories.length, onNext]);

  function tap(e: React.MouseEvent<HTMLDivElement>) {
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    const w = e.currentTarget.clientWidth;
    if (x < w * 0.3) {
      // Left third → previous within group, or previous group.
      if (idx > 0) setIdx(idx - 1);
      else onPrev();
    } else if (x > w * 0.7) {
      // Right third → next within, or next group.
      if (idx + 1 < group.stories.length) setIdx(idx + 1);
      else onNext();
    } else {
      // Center → toggle pause.
      setPaused((p) => !p);
    }
  }

  // Background — image (self) or gradient (mock).
  const bg = story.imageUri
    ? { backgroundImage: `url(${story.imageUri})`, backgroundSize: "cover", backgroundPosition: "center" }
    : momentTileStyle(story.hue ?? 200);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black flex items-center justify-center select-none"
      role="dialog"
      aria-label={`${group.ownerName} story`}
    >
      <div className="relative w-full h-full max-w-[480px] sm:max-h-[92vh] sm:rounded-2xl overflow-hidden">
        <div
          className="absolute inset-0"
          style={bg}
          onClick={tap}
        />

        {/* Progress bars */}
        <div
          className="absolute top-0 left-0 right-0 px-3 py-2 flex gap-1.5 z-10"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.6rem)" }}
        >
          {group.stories.map((_, i) => (
            <span
              key={i}
              className="flex-1 h-0.5 rounded-full bg-white/30 overflow-hidden"
            >
              <span
                className="block h-full bg-white"
                style={{
                  width: i < idx ? "100%" : i === idx ? (paused ? "100%" : "100%") : "0%",
                  transition: i === idx && !paused ? "width 5s linear" : "width 200ms",
                  animation: i === idx && !paused ? "voyage-story-fill 5s linear forwards" : undefined,
                }}
              />
            </span>
          ))}
        </div>

        {/* Header */}
        <div
          className="absolute top-0 left-0 right-0 px-4 pt-7 z-10 flex items-center justify-between"
          style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}
        >
          <Link
            href={group.ownerId === "me" ? "/profile" : `/u/${group.ownerHandle}`}
            className="flex items-center gap-2 text-white"
            onClick={onClose}
          >
            <div
              className="h-8 w-8 rounded-full ring-2 ring-white/30"
              style={avatarStyle(group.ownerHue)}
            />
            <div className="text-sm font-medium drop-shadow">
              {group.ownerId === "me" ? "Your story" : group.ownerName}
              <span className="ml-2 text-[10px] font-mono uppercase tracking-[0.16em] opacity-80">
                {timeAgo(story.at)}
              </span>
            </div>
          </Link>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Close"
            className="h-9 w-9 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white text-2xl leading-none active:scale-95"
          >
            ×
          </button>
        </div>

        {/* Caption / location footer */}
        {(story.caption || story.location) && (
          <div
            className="absolute bottom-0 left-0 right-0 p-5 z-10 text-white pointer-events-none"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 1.25rem)" }}
          >
            {story.location && (
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] opacity-90 drop-shadow">
                📍 {story.location}
              </div>
            )}
            {story.caption && (
              <div className="text-base font-medium leading-snug mt-1.5 drop-shadow line-clamp-3">
                <Markup text={story.caption} />
              </div>
            )}
          </div>
        )}
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
  return `${Math.round(h / 24)}d`;
}
