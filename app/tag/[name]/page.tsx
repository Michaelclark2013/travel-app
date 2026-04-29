"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { useRequireAuth } from "@/components/AuthProvider";
import {
  MOCK_USERS,
  momentTileStyle,
  type MockUser,
} from "@/lib/social";
import { keptMemories, reconcileMemories, type Memory } from "@/lib/memory-roll";
import { extractTags } from "@/lib/markup";
import LikeButton from "@/components/LikeButton";
import PlanFromHere from "@/components/PlanFromHere";
import Markup from "@/components/Markup";
import { Hash } from "lucide-react";

// Hashtag aggregation feed — surfaces every moment whose caption / location
// references this tag, across mock users + your own kept memories.
export default function TagPage() {
  const { user, ready } = useRequireAuth();
  const params = useParams<{ name: string }>();
  const tag = (params?.name ?? "").toLowerCase();

  useEffect(() => {
    if (ready && user) reconcileMemories();
  }, [ready, user]);

  const matchedMock = useMemo(() => {
    const out: { user: MockUser; moment: MockUser["moments"][number] }[] = [];
    for (const u of MOCK_USERS) {
      for (const m of u.moments) {
        const tags = extractTags(`${m.caption} ${m.location}`);
        if (
          tags.includes(tag) ||
          m.location.toLowerCase().includes(tag) ||
          m.caption.toLowerCase().includes(tag)
        ) {
          out.push({ user: u, moment: m });
        }
      }
    }
    return out;
  }, [tag]);

  const matchedMine = useMemo(() => {
    if (!ready || !user) return [] as Memory[];
    const all = keptMemories();
    return all.filter((m) => {
      const tags = extractTags(`${m.caption ?? ""} ${m.location ?? ""}`);
      return (
        tags.includes(tag) ||
        (m.caption ?? "").toLowerCase().includes(tag) ||
        (m.location ?? "").toLowerCase().includes(tag)
      );
    });
  }, [ready, user, tag]);

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-20 text-center text-[var(--muted)] font-mono text-sm">
        Authenticating…
      </div>
    );
  }

  const total = matchedMock.length + matchedMine.length;

  return (
    <div className="mx-auto max-w-4xl">
      {/* Header */}
      <div className="px-6 py-6">
        <Link
          href="/explore"
          className="text-xs text-[var(--muted)] hover:text-white"
        >
          ← Explore
        </Link>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-14 w-14 rounded-full bg-[var(--accent-soft)] border border-[var(--accent)]/40 flex items-center justify-center text-[var(--accent)]">
            <Hash size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">#{tag}</h1>
            <div className="text-sm text-[var(--muted)]">
              {total} moment{total === 1 ? "" : "s"} ·{" "}
              <Link
                href={`/plan?destination=${encodeURIComponent(tag)}`}
                className="text-[var(--accent)] hover:underline"
              >
                Plan a trip here →
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div
        className="grid grid-cols-3 gap-0.5"
        style={{ contentVisibility: "auto" }}
      >
        {matchedMine.map((m) => (
          <MineTile key={m.id} memory={m} />
        ))}
        {matchedMock.map((p, i) => (
          <MockTile key={`${p.user.id}-${p.moment.id}-${i}`} item={p} />
        ))}
        {total === 0 && (
          <div className="col-span-3 text-center py-16 text-sm text-[var(--muted)]">
            Nothing tagged with{" "}
            <span className="text-white">#{tag}</span> yet. Be the first.
          </div>
        )}
      </div>
    </div>
  );
}

function MineTile({ memory }: { memory: Memory }) {
  return (
    <div className="group aspect-square relative overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={memory.filteredDataUri ?? memory.imageDataUri}
        alt={memory.caption ?? "moment"}
        className="aspect-square w-full object-cover"
      />
      <div className="absolute top-1.5 right-1.5">
        <LikeButton target={`mom:${memory.id}`} isMine size="xs" variant="tile" />
      </div>
      {memory.caption && (
        <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] text-white/95 line-clamp-2 drop-shadow pointer-events-none">
          <Markup text={memory.caption} />
        </div>
      )}
    </div>
  );
}

function MockTile({
  item,
}: {
  item: { user: MockUser; moment: MockUser["moments"][number] };
}) {
  return (
    <div className="group aspect-square relative overflow-hidden">
      <Link href={`/u/${item.user.username}`} className="absolute inset-0">
        <div className="absolute inset-0" style={momentTileStyle(item.moment.hue)} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      </Link>
      <div className="absolute top-1.5 right-1.5 z-10">
        <LikeButton
          target={`mock:${item.moment.id}`}
          size="xs"
          variant="tile"
        />
      </div>
      <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[10px] text-white/95 line-clamp-2 drop-shadow pointer-events-none z-10">
        <Markup text={`${item.moment.caption} · @${item.user.username}`} />
      </div>
      <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition z-20">
        <PlanFromHere
          destination={item.moment.location.split(",").pop()?.trim() || item.moment.location}
          size="sm"
        />
      </div>
    </div>
  );
}
