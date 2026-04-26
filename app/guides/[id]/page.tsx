"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useRequireAuth } from "@/components/AuthProvider";
import { findGuide } from "@/lib/guides";
import { generateItinerary } from "@/lib/mock-data";
import { upsertTrip } from "@/lib/storage";
import type { Trip } from "@/lib/types";

function todayISO(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export default function GuideDetailPage() {
  const { user, ready } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const guide = findGuide(params?.id ?? "");

  if (!ready || !user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center text-[var(--muted)]">
        Authenticating…
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h1 className="text-2xl font-bold">Guide not found</h1>
        <Link href="/guides" className="btn-primary inline-block mt-6 px-5 py-2.5">
          Back to guides
        </Link>
      </div>
    );
  }

  function handleImport() {
    if (!guide) return;
    const start = todayISO(21);
    const end = todayISO(21 + guide.durationDays - 1);
    const itinerary = generateItinerary(guide.city, start, end, "walk");
    const trip: Trip = {
      id: `trip-${Date.now()}`,
      destination: guide.city,
      origin: "Home",
      startDate: start,
      endDate: end,
      travelers: 2,
      vibes: guide.tags,
      intent: "vacation",
      itinerary,
      transportMode: "walk",
      createdAt: new Date().toISOString(),
    };
    upsertTrip(trip);
    router.push(`/trips/${trip.id}`);
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link
        href="/guides"
        className="text-sm text-[var(--muted)] hover:text-white"
      >
        ← All guides
      </Link>

      <div className="steel angle-tr-lg mt-4 p-8">
        <div className="text-xs text-[var(--muted)]">
          {guide.city} · {guide.durationDays} days
        </div>
        <h1 className="text-4xl font-bold tracking-tight mt-2">
          {guide.title}
        </h1>
        <p className="text-[var(--muted)] mt-3 text-lg">{guide.blurb}</p>
        <div className="mt-5 flex items-center gap-3">
          <div
            className="h-10 w-10 flex items-center justify-center font-bold"
            style={{
              background: `linear-gradient(135deg, hsl(${guide.authorAvatarSeed} 35% 35%), hsl(${(guide.authorAvatarSeed + 60) % 360} 35% 18%))`,
            }}
          >
            {guide.author.charAt(0)}
          </div>
          <div>
            <div className="font-medium">{guide.author}</div>
            <div className="text-xs text-[var(--muted)]">
              {guide.authorHandle} · ⭐ {guide.rating} ({guide.reviews}{" "}
              reviews)
            </div>
          </div>
        </div>
      </div>

      <div className="steel mt-6 p-6">
        <h2 className="text-xl font-bold tracking-tight">What&apos;s inside</h2>
        <ul className="mt-4 space-y-2">
          {guide.highlights.map((h, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="text-white mt-0.5">●</span>
              <span>{h}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="steel mt-6 p-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <div className="text-sm text-[var(--muted)]">One-time purchase</div>
          <div className="text-3xl font-bold tracking-tight">
            ${guide.priceUsd}
          </div>
        </div>
        <button onClick={handleImport} className="btn-primary px-7 py-3.5 text-base">
          Buy & import to my trips
        </button>
      </div>
      <p className="text-xs text-[var(--muted)] text-center mt-3">
        Demo: import is free in this preview.
      </p>
    </div>
  );
}
