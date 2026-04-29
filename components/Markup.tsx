"use client";

import Link from "next/link";
import { parseMarkup } from "@/lib/markup";

/**
 * Renders a string with `#tags` + `@mentions` as clickable spans. Used in:
 *   - Lightbox caption display
 *   - Public-profile bio + caption
 *   - DM message body
 *   - Comments
 *   - Tile captions on Explore + tag pages
 */
export default function Markup({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text) return null;
  const tokens = parseMarkup(text);
  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.kind === "tag") {
          return (
            <Link
              key={i}
              href={`/tag/${encodeURIComponent(t.tag)}`}
              className="text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              #{t.tag}
            </Link>
          );
        }
        if (t.kind === "mention") {
          return (
            <Link
              key={i}
              href={`/u/${encodeURIComponent(t.username)}`}
              className="text-[var(--accent)] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              @{t.username}
            </Link>
          );
        }
        if (t.kind === "url") {
          return (
            <a
              key={i}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline break-all"
              onClick={(e) => e.stopPropagation()}
            >
              {t.href.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          );
        }
        return <span key={i}>{t.value}</span>;
      })}
    </span>
  );
}
