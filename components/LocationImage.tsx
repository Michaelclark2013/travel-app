"use client";

import { useEffect, useState } from "react";
import {
  gradientImage,
  resolveLocationImage,
  type LocationImage,
  type LocationImageKind,
} from "@/lib/images";

// Reusable image component that resolves a real photo for a place via the
// images lib and renders it with a gradient skeleton while loading. Supports
// hero-style overlays for header banners and a compact mode for thumbnails.

export function LocationImageEl({
  name,
  kind = "generic",
  context,
  className,
  alt,
  rounded = "md",
  aspect = "16/9",
  overlay = false,
  /** Render at this width — passed through to the <img> tag for browser
   *  to pick a sensible decoded size. */
  width,
  height,
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
  width?: number;
  height?: number;
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

  return (
    <div
      className={"relative overflow-hidden bg-[var(--background-soft)] " + (className ?? "")}
      style={{ aspectRatio: aspect, borderRadius: radius }}
    >
      {/* Gradient skeleton — always rendered as the bottom layer. */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{ backgroundImage: `url("${gradientImage(name || "Voyage").url}")`, backgroundSize: "cover", backgroundPosition: "center" }}
      />
      {!errored && img.source !== "gradient" && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={img.url}
          alt={alt ?? name}
          width={width}
          height={height}
          loading={loading}
          decoding="async"
          onError={() => setErrored(true)}
          className="absolute inset-0 h-full w-full object-cover transition-opacity duration-300"
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
