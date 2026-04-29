"use client";

import { useEffect, useMemo, useState } from "react";
import {
  isLiked,
  likeCount,
  onLikeChange,
  setLiked,
  simulateAudience,
} from "./likes";

/**
 * Single-target subscription. Multiple components mounted with the same
 * `target` will all stay in sync via the global event bus — no prop drilling,
 * no shared state hook, just one window event.
 *
 * @param isMine — when true, liking the target schedules a few simulated
 * audience likes so the user feels the engagement loop close.
 */
export function useLike(target: string, opts: { isMine?: boolean } = {}) {
  const [liked, setLikedState] = useState<boolean>(() => isLiked(target));
  const [count, setCount] = useState<number>(() => likeCount(target));

  useEffect(() => {
    // Sync on mount in case someone else changed it before we subscribed.
    setLikedState(isLiked(target));
    setCount(likeCount(target));

    const unsub = onLikeChange((t) => {
      if (t !== target) return;
      setLikedState(isLiked(target));
      setCount(likeCount(target));
    });
    return unsub;
  }, [target]);

  function toggle() {
    const next = !liked;
    // Optimistic flip — UI updates without waiting on persistence.
    setLikedState(next);
    setCount((c) => c + (next ? 1 : -1));
    setLiked(target, next);
    if (next && opts.isMine) simulateAudience(target, { isMine: true });
  }

  return useMemo(() => ({ liked, count, toggle }), [liked, count]);
}
