"use client";

// Stories — 24h ephemeral content. Mock users always have 1–3 stories
// available; the current user's "stories" are kept moments captured in the
// last 24h. Same data layer feeds the strip + viewer.

import { keptMemories, type Memory } from "./memory-roll";
import { MOCK_USERS, momentTileStyle, avatarStyle } from "./social";

export type Story = {
  id: string;
  /** Short text caption for the story header. */
  caption?: string;
  location?: string;
  /** Either an image data URI (current user) or a programmatic gradient. */
  imageUri?: string;
  /** When imageUri is missing, render a gradient with this hue. */
  hue?: number;
  /** When this story was posted (ISO). */
  at: string;
};

export type StoryGroup = {
  /** Mock user id, or "me" for the current user. */
  ownerId: string;
  ownerHue: number;
  ownerName: string;
  ownerHandle: string;
  /** Whether the viewer (us) has watched all stories in this group. */
  seen: boolean;
  stories: Story[];
};

const SEEN_KEY = "voyage:stories-seen";
const STORY_TTL_MS = 24 * 60 * 60 * 1000;

function loadSeen(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}
function saveSeen(s: Record<string, string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(s));
}

export function markGroupSeen(ownerId: string) {
  const s = loadSeen();
  s[ownerId] = new Date().toISOString();
  saveSeen(s);
}

export function isGroupSeen(ownerId: string, latestStoryAt: string): boolean {
  const s = loadSeen();
  const seenAt = s[ownerId];
  if (!seenAt) return false;
  return new Date(seenAt) >= new Date(latestStoryAt);
}

/** Build the full strip — mock users first (alphabetical-ish), self at the end. */
export function loadStoryGroups(): StoryGroup[] {
  const groups: StoryGroup[] = [];

  // Mock users — derive 1–3 stories each from their seeded moments. We pick
  // the recent ones so timestamps look fresh.
  for (const u of MOCK_USERS) {
    const stories: Story[] = u.moments
      .slice(0, 3)
      .map((m) => {
        const at = new Date(
          Date.now() - Math.min(20, m.daysAgo) * 60 * 60 * 1000
        ).toISOString();
        return {
          id: `${u.id}-${m.id}`,
          caption: m.caption,
          location: m.location,
          hue: m.hue,
          at,
        };
      });
    if (stories.length === 0) continue;
    const latest = stories.reduce((a, b) =>
      a.at > b.at ? a : b
    ).at;
    groups.push({
      ownerId: u.id,
      ownerHue: u.hue,
      ownerName: u.displayName,
      ownerHandle: u.username,
      seen: isGroupSeen(u.id, latest),
      stories,
    });
  }

  // Self — kept moments from the last 24h are stories too.
  if (typeof window !== "undefined") {
    const now = Date.now();
    const recent = keptMemories().filter((m) => {
      const t = new Date(m.decidedAt ?? m.capturedAt).getTime();
      return now - t < STORY_TTL_MS;
    });
    if (recent.length > 0) {
      const stories = recent.map((m: Memory) => ({
        id: m.id,
        caption: m.caption,
        location: m.location,
        imageUri: m.filteredDataUri ?? m.imageDataUri,
        at: m.decidedAt ?? m.capturedAt,
      }));
      const latest = stories.reduce((a, b) => (a.at > b.at ? a : b)).at;
      groups.unshift({
        ownerId: "me",
        ownerHue: 200,
        ownerName: "Your story",
        ownerHandle: "you",
        seen: isGroupSeen("me", latest),
        stories,
      });
    }
  }

  return groups;
}

/** Style helpers — re-exports so callers don't reach into lib/social directly. */
export { avatarStyle, momentTileStyle };
