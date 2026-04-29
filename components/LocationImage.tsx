"use client";

// Reusable image component that resolves a real photo for a place via the
// images lib and renders it via next/image with a gradient skeleton while
// loading. Supports hero-style overlays for header banners and a compact
// mode for thumbnails.
//
// Track B (perf/a11y): migrated from a raw <img> to next/image. The fetched
// URL can be a Wikipedia upload, an Unsplash photo, or a local data: URI
// gradient — the latter cannot be optimized so we pass `unoptimized` when
// the resolved source is the gradient SVG. All remote hosts the resolver can
// produce are allowlisted in next.config.ts under images.remotePatterns.

import Image from "next/image";
import { useEffect, useState } from "react";
import {
  gradientImage,
  resolveLocationImage,
  type LocationImage,
  type LocationImageKind,
} from "@/lib/images";

export function LocationImageEl({
  name,
  kind = "generic",
  context,
  className,
  alt,
  rounded = "md",
  aspect = "16/9",
  overlay = false,
  /** Hint to next/image for picking the right source-set entry. */
  sizes,
  loading = "lazy",
}: {
  name: string;
  kind?: LocationImageKind;
  context?: string;
  className?: string;
  alt?: string;
  rounded?: "none" | "sm" | "md" | "lg" | "full";
  aspect?: "16/9" | "4/3" | "1/1" | "21/9";
  overlay?: boolean;
  sizes?: string;
  loading?: "lazy" | "eager";
}) {
  const [img, setImg] = useState<LocationImage>(() => gradientImage(name || "Voyage"));
  const [resolved, setResolved] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!name?.trim()) return;
    setResolved(false);
    setErrored(false);
    resolveLocationImage(kind, name, context).then((r) => {
      if (cancelled) return;
      setImg(r);
      setResolved(true);
    });
    return () => {
      cancelled = true;
    };
  }, [kind, name, context]);

  const radius =
    rounded === "none"
      ? "0"
      : rounded === "sm"
        ? "8px"
        : rounded === "md"
          ? "12px"
          : rounded === "lg"
            ? "16px"
            : "9999px";

  // Local-first fallback: the gradient is a data: URI SVG which cannot go
  // through the Next.js image optimizer, so we render it as a CSS background
  // (already handled below) and skip rendering an <Image> on top.
  const remote = !errored && img.source !== "gradient";
  const altText = alt ?? (name ? `Photo of ${name}` : "Location photo");

  return (
    <div
      className={"relative overflow-hidden bg-[var(--background-soft)] " + (className ?? "")}
      style={{ aspectRatio: aspect, borderRadius: radius }}
    >
      {/* Gradient skeleton — always rendered as the bottom layer. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: `url("${gradientImage(name || "Voyage").url}")`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
      {remote && (
        <Image
          key={img.url}
          src={img.url}
          alt={altText}
          fill
          sizes={sizes ?? "(max-width: 768px) 100vw, (max-width: 1280px) 80vw, 1200px"}
          loading={loading}
          // Wikipedia / Unsplash already provide reasonably-sized thumbnails;
          // ask the optimizer for a slightly lower default quality to shrink
          // bytes without visibly degrading the hero crops.
          quality={75}
          decoding="async"
          onError={() => setErrored(true)}
          className="object-cover transition-opacity duration-300"
          style={{ opacity: resolved ? 1 : 0 }}
        />
      )}
      {overlay && (
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.5) 80%, rgba(0,0,0,0.75) 100%)",
          }}
        />
      )}
    </div>
  );
}
