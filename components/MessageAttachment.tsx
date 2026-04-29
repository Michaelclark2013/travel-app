"use client";

// Renders a ShareTarget as a small rich card inside a DM thread. Shared
// between thread view + inbox preview so the look is consistent.

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { momentTileStyle, type ShareTarget } from "@/lib/social";

export default function MessageAttachment({
  attachment,
  small = false,
}: {
  attachment: ShareTarget;
  small?: boolean;
}) {
  const sizeCls = small ? "max-w-[200px]" : "max-w-[260px]";

  if (attachment.kind === "moment") {
    return (
      <div className={`mt-1 rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--card-strong)] ${sizeCls}`}>
        {attachment.imageUri && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attachment.imageUri}
            alt={attachment.caption ?? "Moment"}
            className="w-full aspect-[4/3] object-cover"
          />
        )}
        <div className="p-2">
          {attachment.location && (
            <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted)]">
              {attachment.location}
            </div>
          )}
          {attachment.caption && (
            <div className="text-xs mt-0.5 line-clamp-2">
              {attachment.caption}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (attachment.kind === "mock-moment") {
    return (
      <div className={`mt-1 rounded-xl overflow-hidden border border-[var(--border)] ${sizeCls}`}>
        <div
          className="aspect-[4/3]"
          style={momentTileStyle(attachment.hue)}
        />
        <div className="p-2 bg-[var(--card-strong)]">
          <div className="text-[10px] font-mono uppercase tracking-[0.16em] text-[var(--muted)]">
            {attachment.location}
          </div>
          <div className="text-xs mt-0.5 line-clamp-2">{attachment.caption}</div>
        </div>
      </div>
    );
  }

  if (attachment.kind === "trip") {
    return (
      <Link
        href={`/trips/${attachment.id}`}
        className={`mt-1 block rounded-xl border border-[var(--border)] bg-[var(--card-strong)] hover:border-[var(--border-strong)] p-3 transition ${sizeCls}`}
      >
        <div className="font-mono text-[10px] tracking-[0.16em] text-[var(--accent)] uppercase">
          // VOYAGE TRIP
        </div>
        <div className="font-semibold text-sm mt-0.5 line-clamp-1">
          {attachment.destination}
        </div>
        {attachment.startDate && attachment.endDate && (
          <div className="text-[11px] text-[var(--muted)] mt-0.5">
            {attachment.startDate} → {attachment.endDate}
          </div>
        )}
        <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--accent)] mt-2 inline-flex items-center gap-1">
          <Sparkles size={10} strokeWidth={2.4} />
          Open trip
        </div>
      </Link>
    );
  }

  // place
  return (
    <Link
      href={`/plan?destination=${encodeURIComponent(attachment.name)}`}
      className={`mt-1 block rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-soft)]/15 px-3 py-2.5 transition ${sizeCls}`}
    >
      <div className="text-[10px] font-mono tracking-[0.16em] text-[var(--accent)] uppercase">
        // PLACE
      </div>
      <div className="text-sm font-semibold mt-0.5">{attachment.name}</div>
      <div className="text-[10px] font-mono uppercase tracking-[0.14em] text-[var(--accent)] mt-1.5 inline-flex items-center gap-1">
        <Sparkles size={10} strokeWidth={2.4} />
        Plan a trip here
      </div>
    </Link>
  );
}
