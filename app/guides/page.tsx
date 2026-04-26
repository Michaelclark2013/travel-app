"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRequireAuth } from "@/components/AuthProvider";
import { GUIDES, type Guide } from "@/lib/guides";

const ALL_TAGS = Array.from(new Set(GUIDES.flatMap((g) => g.tags)));

export default function GuidesPage() {
  const { user, ready } = useRequireAuth();
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const filtered = useMemo(
    () => (activeTag ? GUIDES.filter((g) => g.tags.includes(activeTag)) : GUIDES),
    [activeTag]
  );

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-4xl font-bold tracking-tight">Local guides</h1>
      <p className="text-[var(--muted)] mt-3 max-w-2xl">
        Curated trips from people who actually live there. Buy a guide once
        and import every stop into your own itinerary.
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setActiveTag(null)}
          className={`border px-3 py-1.5 text-sm ${
            activeTag === null ? "bg-white text-black border-white" : "btn-steel"
          }`}
        >
          All
        </button>
        {ALL_TAGS.map((t) => (
          <button
            key={t}
            onClick={() => setActiveTag(t)}
            className={`border px-3 py-1.5 text-sm ${
              activeTag === t ? "bg-white text-black border-white" : "btn-steel"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((g) => (
          <GuideCard key={g.id} guide={g} />
        ))}
      </div>
    </div>
  );
}

function GuideCard({ guide }: { guide: Guide }) {
  return (
    <Link
      href={`/guides/${guide.id}`}
      className="steel angle-tr p-6 hover:brightness-125 transition flex flex-col"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-[var(--muted)]">
          {guide.city}
        </div>
        <div className="text-lg font-bold">${guide.priceUsd}</div>
      </div>
      <h3 className="font-bold text-xl mt-3">{guide.title}</h3>
      <p className="text-sm text-[var(--muted)] mt-2 flex-1">{guide.blurb}</p>
      <div className="mt-4 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <div
            className="h-7 w-7 bg-white/10 border border-[var(--edge)] flex items-center justify-center text-[10px]"
            style={{
              background: `linear-gradient(135deg, hsl(${guide.authorAvatarSeed} 30% 35%), hsl(${(guide.authorAvatarSeed + 60) % 360} 30% 18%))`,
            }}
          >
            {guide.author.charAt(0)}
          </div>
          <span className="text-[var(--muted)]">{guide.authorHandle}</span>
        </div>
        <span>
          ⭐ {guide.rating} · {guide.reviews}
        </span>
      </div>
    </Link>
  );
}
