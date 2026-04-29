"use client";

import { Heart } from "lucide-react";
import { useEffect, useState } from "react";
import { useLike } from "@/lib/use-like";
import { formatCount } from "@/lib/social-stats";

/**
 * Reusable Heart toggle. Plug into:
 *  - Lightbox header / footer
 *  - Tile overlays (size="xs")
 *  - Featured Moment hero
 *
 * Optimization touchpoints:
 *  - Subscribes to a single window event via useLike()
 *  - Keeps a tiny local "burst" state for the tap animation; nothing else
 *  - All count formatting is memoized in formatCount
 */
export default function LikeButton({
  target,
  isMine = false,
  showCount = true,
  size = "md",
  variant = "filled",
}: {
  target: string;
  isMine?: boolean;
  showCount?: boolean;
  size?: "xs" | "sm" | "md";
  variant?: "filled" | "ghost" | "tile";
}) {
  const { liked, count, toggle } = useLike(target, { isMine });
  const [burst, setBurst] = useState(false);

  useEffect(() => {
    if (!burst) return;
    const t = setTimeout(() => setBurst(false), 320);
    return () => clearTimeout(t);
  }, [burst]);

  function onClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!liked) setBurst(true);
    try {
      navigator.vibrate?.(8);
    } catch {}
    toggle();
  }

  const iconSize = size === "xs" ? 11 : size === "sm" ? 13 : 16;
  const padding =
    size === "xs"
      ? "px-1.5 py-0.5 text-[10px]"
      : size === "sm"
      ? "px-2.5 py-1 text-xs"
      : "px-3 py-1.5 text-sm";

  if (variant === "tile") {
    // Compact heart for grid overlays — count-on-the-side style.
    return (
      <button
        onClick={onClick}
        aria-pressed={liked}
        aria-label={liked ? "Unlike" : "Like"}
        className={`inline-flex items-center gap-1 rounded-full backdrop-blur-sm transition active:scale-90 ${
          liked
            ? "bg-rose-500/30 text-rose-100"
            : "bg-black/40 text-white/90"
        } ${padding}`}
      >
        <Heart
          size={iconSize}
          strokeWidth={2.4}
          fill={liked ? "currentColor" : "none"}
          className={burst ? "scale-125 transition-transform" : ""}
        />
        {showCount && <span>{formatCount(count)}</span>}
      </button>
    );
  }

  if (variant === "ghost") {
    return (
      <button
        onClick={onClick}
        aria-pressed={liked}
        aria-label={liked ? "Unlike" : "Like"}
        className={`inline-flex items-center gap-1 text-[var(--muted)] hover:text-rose-300 transition active:scale-95 ${
          liked ? "text-rose-300" : ""
        }`}
      >
        <Heart
          size={iconSize}
          strokeWidth={2}
          fill={liked ? "currentColor" : "none"}
          className={burst ? "scale-125 transition-transform" : ""}
        />
        {showCount && (
          <span className="text-white text-xs tabular-nums">
            <strong>{formatCount(count)}</strong>
          </span>
        )}
      </button>
    );
  }

  // filled (default) — pill style for prominent placements.
  return (
    <button
      onClick={onClick}
      aria-pressed={liked}
      aria-label={liked ? "Unlike" : "Like"}
      className={`inline-flex items-center gap-1.5 rounded-full border transition active:scale-95 ${
        liked
          ? "bg-rose-500/15 border-rose-500/50 text-rose-200"
          : "border-[var(--border)] hover:border-[var(--border-strong)] text-[var(--foreground)]/85"
      } ${padding}`}
    >
      <Heart
        size={iconSize}
        strokeWidth={2}
        fill={liked ? "currentColor" : "none"}
        className={burst ? "scale-125 transition-transform" : ""}
      />
      {showCount && <span>{formatCount(count)}</span>}
    </button>
  );
}
