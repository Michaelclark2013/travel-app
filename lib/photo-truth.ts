// Photo-truth scoring. Real impl would aggregate verified-recent guest photos
// and run a vision-similarity check against the listing's marketing shots.
// Scoring is deterministic from a key so the badge is stable per-listing.

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export type PhotoTruth = {
  /** 0–100 — how well recent guest photos match the listing imagery. */
  matchScore: number;
  /** Number of recent guest photos used. */
  recentPhotos: number;
  /** Days since the freshest verified photo. */
  freshnessDays: number;
  badge: "verified" | "likely-fresh" | "stale" | "unverified";
};

export function photoTruth(key: string): PhotoTruth {
  const seed = hash(key);
  const matchScore = 60 + (seed % 40); // 60–99
  const recentPhotos = 8 + (seed % 30);
  const freshnessDays = 1 + (seed % 60);

  let badge: PhotoTruth["badge"] = "unverified";
  if (matchScore >= 88 && freshnessDays <= 30) badge = "verified";
  else if (matchScore >= 75 && freshnessDays <= 60) badge = "likely-fresh";
  else badge = "stale";

  return { matchScore, recentPhotos, freshnessDays, badge };
}

export function badgeMeta(b: PhotoTruth["badge"]) {
  switch (b) {
    case "verified":
      return {
        label: "✓ Verified fresh",
        title: "Recent guest photos closely match the listing.",
        cls: "bg-emerald-500/15 text-emerald-200 border-emerald-500/40",
      };
    case "likely-fresh":
      return {
        label: "Likely fresh",
        title: "Some recent guest photos match the listing.",
        cls: "bg-sky-500/15 text-sky-200 border-sky-500/40",
      };
    case "stale":
      return {
        label: "Outdated photos",
        title: "Listing photos are old — confirm before booking.",
        cls: "bg-amber-500/15 text-amber-200 border-amber-500/40",
      };
    default:
      return {
        label: "Unverified",
        title: "We couldn't verify the listing photos.",
        cls: "bg-white/5 text-[var(--muted)] border-[var(--border)]",
      };
  }
}
