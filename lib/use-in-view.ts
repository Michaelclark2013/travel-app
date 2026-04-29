"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Optimization #10 — visibility-aware compute. Wrap any tile that subscribes
 * to per-target state (likes, stats, etc.) in this hook so we only do the
 * subscribe/unsubscribe + count math when the tile actually enters the
 * viewport. In a 200-tile feed this turns 200 subscriptions into ~12.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>(opts?: {
  rootMargin?: string;
  /** Once true, stays true (good for "fade-in once" patterns). */
  once?: boolean;
}) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // SSR or ancient browser: assume visible so content still renders.
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        const v = entry?.isIntersecting ?? false;
        setInView((prev) => (prev !== v ? v : prev));
        if (v && opts?.once) obs.disconnect();
      },
      { rootMargin: opts?.rootMargin ?? "200px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [opts?.rootMargin, opts?.once]);

  return [ref, inView] as const;
}
