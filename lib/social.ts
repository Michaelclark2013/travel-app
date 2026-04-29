"use client";

// Voyage social layer — mock users, follow graph, notifications, and DM
// threads. Local-first: every helper writes to localStorage for instant UI
// and (when supabaseEnabled) fire-and-forgets a mirror write to the remote
// tables defined in supabase/migrations/0003_social.sql. The remote read
// hydration runs once at app boot via lib/realtime.ts and overwrites the
// local mirror, so subsequent sync calls return server-truth.

import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";
import { fireAndForget } from "./realtime";

// ---------------------------------------------------------------------------
// Mock users — seed the explore feed + suggestions + DMs so the UX is alive
// from the first render.

export type MockUser = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  /** Background gradient for the avatar — generated from id. */
  hue: number;
  travelStyles: string[];
  followers: number;
  /**
   * Sample moments — used in explore + DM previews.
   *
   * `videoHue` (optional) — when present, the FeedPost renders this moment
   * with an animated CSS gradient stand-in for a video reel (since we don't
   * ship real video files). Used for layout demos until users record their
   * own with the capture page's "Video" mode.
   */
  moments: {
    id: string;
    caption: string;
    location: string;
    daysAgo: number;
    hue: number;
    videoHue?: number;
  }[];
};

export const MOCK_USERS: MockUser[] = [
  {
    id: "u-anna",
    username: "wanderlust_anna",
    displayName: "Anna Becker",
    bio: "Slow travel + small plates. Currently: somewhere with good light.",
    hue: 320,
    travelStyles: ["Foodie", "Slow Traveler", "Culture Hunter"],
    followers: 14_200,
    moments: [
      { id: "u-anna-m1", caption: "Espresso & a window seat in Trastevere", location: "Rome, Italy", daysAgo: 2, hue: 24 },
      { id: "u-anna-m2", caption: "Sun finally broke over the Pantheon", location: "Rome, Italy", daysAgo: 4, hue: 38 },
      { id: "u-anna-m3", caption: "Trattoria of the night", location: "Trastevere", daysAgo: 6, hue: 12 },
    ],
  },
  {
    id: "u-diego",
    username: "nomad_diego",
    displayName: "Diego Reyes",
    bio: "21 countries this year. Mostly mountains.",
    hue: 200,
    travelStyles: ["Adventure Seeker", "Nature Lover", "Solo Wanderer"],
    followers: 31_400,
    moments: [
      { id: "u-diego-m1", caption: "Sunrise at 4,300m. Worth it.", location: "Cusco, Peru", daysAgo: 1, hue: 180, videoHue: 200 },
      { id: "u-diego-m2", caption: "Bus broke down. Made friends.", location: "Sacred Valley", daysAgo: 3, hue: 100 },
    ],
  },
  {
    id: "u-mira",
    username: "cinema_mira",
    displayName: "Mira Chen",
    bio: "Film stills from real life · 35mm only · DM for prints.",
    hue: 280,
    travelStyles: ["Culture Hunter", "City Hopper"],
    followers: 88_300,
    moments: [
      { id: "u-mira-m1", caption: "The way light moves in Tokyo at 17:00", location: "Shibuya, Tokyo", daysAgo: 0, hue: 280, videoHue: 320 },
      { id: "u-mira-m2", caption: "An empty Yanaka street", location: "Yanaka, Tokyo", daysAgo: 1, hue: 340 },
      { id: "u-mira-m3", caption: "Tea house with a stray cat", location: "Kyoto", daysAgo: 5, hue: 50 },
      { id: "u-mira-m4", caption: "Fuji from a train window", location: "Shinkansen", daysAgo: 7, hue: 220 },
    ],
  },
  {
    id: "u-lia",
    username: "lia.maps",
    displayName: "Lia Okafor",
    bio: "Cartographer + breakfast enthusiast. Lagos → world.",
    hue: 30,
    travelStyles: ["Foodie", "Family-First"],
    followers: 6_700,
    moments: [
      { id: "u-lia-m1", caption: "Beignets at Café du Monde", location: "New Orleans, LA", daysAgo: 2, hue: 50 },
      { id: "u-lia-m2", caption: "Frenchmen Street vibes", location: "New Orleans", daysAgo: 2, hue: 320 },
    ],
  },
  {
    id: "u-keoni",
    username: "keoni_blue",
    displayName: "Keoni Tane",
    bio: "Boards in the trunk · waves over deadlines.",
    hue: 180,
    travelStyles: ["Beach Bum", "Adventure Seeker"],
    followers: 22_900,
    moments: [
      { id: "u-keoni-m1", caption: "Glass walls at sunset", location: "North Shore, Oahu", daysAgo: 0, hue: 200 },
      { id: "u-keoni-m2", caption: "First light, no one out", location: "Pipeline", daysAgo: 1, hue: 260 },
    ],
  },
  {
    id: "u-noor",
    username: "noor.nights",
    displayName: "Noor Said",
    bio: "Night photography · cities after midnight.",
    hue: 260,
    travelStyles: ["Night Owl Traveler", "City Hopper"],
    followers: 49_100,
    moments: [
      { id: "u-noor-m1", caption: "3am at Times Square = empty", location: "Manhattan", daysAgo: 1, hue: 300 },
      { id: "u-noor-m2", caption: "Brooklyn Bridge from the deck", location: "Brooklyn", daysAgo: 4, hue: 250 },
    ],
  },
  {
    id: "u-tomo",
    username: "tomo_eats",
    displayName: "Tomo Watanabe",
    bio: "Ramen mapping the world · current rank: 412 bowls deep.",
    hue: 0,
    travelStyles: ["Foodie"],
    followers: 11_800,
    moments: [
      { id: "u-tomo-m1", caption: "Tsukemen rules everything around me", location: "Roppongi", daysAgo: 0, hue: 0 },
      { id: "u-tomo-m2", caption: "Stand-up sushi · 9 minutes flat", location: "Toyosu Market", daysAgo: 3, hue: 40 },
    ],
  },
  {
    id: "u-clara",
    username: "clara.curates",
    displayName: "Clara Vieira",
    bio: "Hotel hunter · Lisboa-based · the lobby is the point.",
    hue: 340,
    travelStyles: ["Luxury Explorer", "Slow Traveler"],
    followers: 18_500,
    moments: [
      { id: "u-clara-m1", caption: "Tile patterns to remember", location: "Alfama, Lisbon", daysAgo: 1, hue: 200 },
      { id: "u-clara-m2", caption: "Pastel sky after a custard tart", location: "Belém", daysAgo: 2, hue: 30 },
    ],
  },
];

export function userByUsername(username: string): MockUser | null {
  const u = username.toLowerCase().replace(/^@/, "");
  return MOCK_USERS.find((x) => x.username.toLowerCase() === u) ?? null;
}

// ---------------------------------------------------------------------------
// Follow graph — the IDs of mock users the current user follows.

const FOLLOW_KEY = "voyage:following";

function userKey(prefix: string): string | null {
  const u = getSession();
  return u ? `${prefix}:${u.id}` : null;
}

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null") ?? fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function followingIds(): string[] {
  const k = userKey(FOLLOW_KEY);
  if (!k) return [];
  // Seed: on first read, follow the top 3 mock users so the explore feed
  // doesn't feel empty.
  const stored = read<string[] | null>(k, null);
  if (stored) return stored;
  const seed = MOCK_USERS.slice(0, 3).map((u) => u.id);
  write(k, seed);
  return seed;
}

export function isFollowing(id: string): boolean {
  return followingIds().includes(id);
}

export function setFollow(id: string, following: boolean) {
  const k = userKey(FOLLOW_KEY);
  if (!k) return;
  const next = following
    ? [...new Set([...followingIds(), id])]
    : followingIds().filter((x) => x !== id);
  write(k, next);
  // Mirror to Supabase. The mock user ids ("u-anna") are NOT real auth UUIDs,
  // so the insert may fail with FK violation — that's fine, this only takes
  // effect once the followee is a real user. Real-user follows (created via
  // /u/[username] when remote profiles exist) succeed.
  if (supabaseEnabled && supabase) {
    fireAndForget(pushFollowRemote(id, following));
  }
}

async function pushFollowRemote(
  followeeId: string,
  follow: boolean
): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  if (follow) {
    await supabase
      .from("follows")
      .upsert(
        { follower_id: user.id, followee_id: followeeId },
        { onConflict: "follower_id,followee_id" }
      );
  } else {
    await supabase
      .from("follows")
      .delete()
      .eq("follower_id", user.id)
      .eq("followee_id", followeeId);
  }
}

export function followingUsers(): MockUser[] {
  const ids = followingIds();
  return MOCK_USERS.filter((u) => ids.includes(u.id));
}

export function suggestedUsers(limit = 6): MockUser[] {
  const ids = new Set(followingIds());
  return MOCK_USERS.filter((u) => !ids.has(u.id))
    .sort((a, b) => b.followers - a.followers)
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Notifications.

export type NotificationKind =
  | "like"
  | "save"
  | "follow"
  | "comment"
  | "mention"
  | "trip-invite"
  | "system";

export type Notification = {
  id: string;
  kind: NotificationKind;
  /** Mock user id when applicable. */
  fromUserId?: string;
  /** Free-form copy if no template applies (system). */
  text?: string;
  /** Where tapping the row should land. */
  href?: string;
  createdAt: string;
  read?: boolean;
};

const NOTIF_KEY = "voyage:notifs";

export function loadNotifications(): Notification[] {
  const k = userKey(NOTIF_KEY);
  if (!k) return [];
  const stored = read<Notification[] | null>(k, null);
  if (stored) return stored;
  // Seed plausible activity on first run.
  const now = Date.now();
  const seeded: Notification[] = [
    {
      id: "n-system",
      kind: "system",
      text: "Welcome to Voyage. Catch your first moment to start your roll.",
      href: "/profile/capture",
      createdAt: new Date(now - 60_000).toISOString(),
    },
    {
      id: "n-follow-anna",
      kind: "follow",
      fromUserId: "u-anna",
      href: "/u/wanderlust_anna",
      createdAt: new Date(now - 1000 * 60 * 28).toISOString(),
    },
    {
      id: "n-like-mira",
      kind: "like",
      fromUserId: "u-mira",
      text: "liked your latest moment",
      href: "/profile",
      createdAt: new Date(now - 1000 * 60 * 60 * 3).toISOString(),
    },
    {
      id: "n-save-clara",
      kind: "save",
      fromUserId: "u-clara",
      text: "saved your trip to Lisbon",
      href: "/profile",
      createdAt: new Date(now - 1000 * 60 * 60 * 9).toISOString(),
    },
    {
      id: "n-mention-noor",
      kind: "mention",
      fromUserId: "u-noor",
      text: "tagged you in a moment",
      href: "/u/noor.nights",
      createdAt: new Date(now - 1000 * 60 * 60 * 22).toISOString(),
    },
  ];
  write(k, seeded);
  return seeded;
}

export function unreadNotificationCount(): number {
  return loadNotifications().filter((n) => !n.read).length;
}

export function markAllNotificationsRead() {
  const k = userKey(NOTIF_KEY);
  if (!k) return;
  const next = loadNotifications().map((n) => ({ ...n, read: true }));
  write(k, next);
  if (supabaseEnabled && supabase) {
    fireAndForget(markAllNotifsReadRemote());
  }
}

async function markAllNotifsReadRemote(): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);
}

export function pushNotification(n: Omit<Notification, "id" | "createdAt">) {
  const k = userKey(NOTIF_KEY);
  if (!k) return;
  const list = loadNotifications();
  const next: Notification = {
    ...n,
    id: `n-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: new Date().toISOString(),
  };
  write(k, [next, ...list]);
}

// ---------------------------------------------------------------------------
// DMs — thread + messages.

/** Optimization #9 — universal "what is this content" key. */
export type ShareTarget =
  | { kind: "moment"; id: string; imageUri?: string; caption?: string; location?: string }
  | { kind: "trip"; id: string; destination: string; startDate?: string; endDate?: string }
  | { kind: "mock-moment"; userId: string; momentId: string; caption: string; location: string; hue: number }
  | { kind: "place"; name: string };

/** Delivery state on outbound messages. */
export type DmStatus = "sending" | "sent" | "read";

export type DmMessage = {
  id: string;
  fromUserId: string; // mock user id, or "me"
  text: string;
  createdAt: string;
  status?: DmStatus;
  attachment?: ShareTarget;
};

// Optimization #2 — pre-built map so peer lookup is O(1) everywhere.
export const MOCK_BY_ID: Record<string, MockUser> = Object.fromEntries(
  MOCK_USERS.map((u) => [u.id, u])
);

export type DmThread = {
  id: string;
  /** The mock user the current user is chatting with. */
  withUserId: string;
  messages: DmMessage[];
  /** Last time the *current user* read it. Use to surface unread bubbles. */
  readAt?: string;
};

const DM_KEY = "voyage:dms";

export function loadThreads(): DmThread[] {
  const k = userKey(DM_KEY);
  if (!k) return [];
  const stored = read<DmThread[] | null>(k, null);
  if (stored) return stored;
  // Seed: 1 welcome + 1 demo thread with a mock user.
  const now = Date.now();
  const seeded: DmThread[] = [
    {
      id: "t-welcome",
      withUserId: "u-clara",
      messages: [
        {
          id: "m-w-1",
          fromUserId: "u-clara",
          text: "Hey! Saw your Lisbon plan — try Café Janis on a Sunday morning. You'll thank me.",
          createdAt: new Date(now - 1000 * 60 * 60 * 4).toISOString(),
        },
      ],
    },
    {
      id: "t-mira",
      withUserId: "u-mira",
      messages: [
        {
          id: "m-mira-1",
          fromUserId: "u-mira",
          text: "Where in Tokyo are you staying?",
          createdAt: new Date(now - 1000 * 60 * 60 * 24).toISOString(),
        },
        {
          id: "m-mira-2",
          fromUserId: "me",
          text: "Yanaka — your old recommendation 🙏",
          createdAt: new Date(now - 1000 * 60 * 60 * 23).toISOString(),
        },
        {
          id: "m-mira-3",
          fromUserId: "u-mira",
          text: "Best call. 17:00 light around there is unreal.",
          createdAt: new Date(now - 1000 * 60 * 60 * 22).toISOString(),
        },
      ],
    },
  ];
  write(k, seeded);
  return seeded;
}

export function unreadThreadCount(): number {
  return loadThreads().filter((t) => isThreadUnread(t)).length;
}

export function isThreadUnread(t: DmThread): boolean {
  const last = t.messages[t.messages.length - 1];
  if (!last) return false;
  if (last.fromUserId === "me") return false;
  if (!t.readAt) return true;
  return new Date(last.createdAt) > new Date(t.readAt);
}

export function getThread(id: string): DmThread | null {
  return loadThreads().find((t) => t.id === id) ?? null;
}

export function markThreadRead(id: string): void {
  const k = userKey(DM_KEY);
  if (!k) return;
  const next = loadThreads().map((t) =>
    t.id === id ? { ...t, readAt: new Date().toISOString() } : t
  );
  write(k, next);
}

export function sendMessage(
  threadId: string,
  text: string,
  attachment?: ShareTarget
): DmMessage | null {
  const k = userKey(DM_KEY);
  if (!k) return null;
  const list = loadThreads();
  const target = list.find((t) => t.id === threadId);
  if (!target) return null;

  // Optimization #1 — optimistic. We start as "sending"; promote to "sent"
  // after a sub-second tick. Real backend will swap this for an awaited insert.
  const msg: DmMessage = {
    id: `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    fromUserId: "me",
    text,
    createdAt: new Date().toISOString(),
    status: "sending",
    attachment,
  };
  target.messages.push(msg);
  write(k, list);
  window.dispatchEvent(new Event("voyage:dm-updated"));

  // Mirror to Supabase. Same caveat as follows: thread.withUserId may be a
  // mock id. The real-user code path lights up once we expose remote thread
  // creation from the inbox.
  if (supabaseEnabled && supabase) {
    fireAndForget(pushMessageRemote(threadId, msg, target.withUserId));
  }

  // Promote to "sent" almost immediately.
  window.setTimeout(() => {
    const l = loadThreads();
    const t = l.find((x) => x.id === threadId);
    const m = t?.messages.find((x) => x.id === msg.id);
    if (m) m.status = "sent";
    if (l) write(k, l);
    window.dispatchEvent(new Event("voyage:dm-updated"));
  }, 250 + Math.random() * 400);

  // Optimization #4 — schedule auto-reply on idle.
  const ric = (window as Window & {
    requestIdleCallback?: (cb: IdleRequestCallback) => number;
  }).requestIdleCallback;
  const replies = [
    "Love that.",
    "👀",
    "Wait, when?",
    "Pin me your itinerary?",
    "Best decision tbh.",
    "Going there!! Save me the spot.",
    "ok deal — when can you go?",
  ];
  const replyText = replies[Math.floor(Math.random() * replies.length)];
  const fire = () => {
    // Mark our message as "read" by the peer at this moment.
    const l = loadThreads();
    const t = l.find((x) => x.id === threadId);
    if (!t) return;
    const m = t.messages.find((x) => x.id === msg.id);
    if (m) m.status = "read";
    t.messages.push({
      id: `m-${Date.now() + 1}-${Math.random().toString(36).slice(2, 6)}`,
      fromUserId: t.withUserId,
      text: replyText,
      createdAt: new Date().toISOString(),
    });
    write(k, l);
    window.dispatchEvent(new Event("voyage:dm-updated"));
  };
  window.setTimeout(
    () => (ric ? ric(fire) : fire()),
    1500 + Math.random() * 2500
  );

  return msg;
}

// Optimization #8 — share-sheet recents. After you DM someone a moment, they
// surface at the top of the share sheet next time. Capped to 6.
const SHARE_RECENTS_KEY = "voyage:share-recents";

export function loadShareRecents(): string[] {
  const k = userKey(SHARE_RECENTS_KEY);
  if (!k) return [];
  return read<string[]>(k, []);
}
export function pushShareRecent(userId: string) {
  const k = userKey(SHARE_RECENTS_KEY);
  if (!k) return;
  const next = [userId, ...loadShareRecents().filter((u) => u !== userId)].slice(0, 6);
  write(k, next);
}

export function startThreadWith(userId: string): string {
  const k = userKey(DM_KEY);
  if (!k) return "";
  const existing = loadThreads().find((t) => t.withUserId === userId);
  if (existing) return existing.id;
  const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const next: DmThread = { id, withUserId: userId, messages: [] };
  write(k, [next, ...loadThreads()]);
  if (supabaseEnabled && supabase) {
    fireAndForget(pushThreadRemote(id, userId));
  }
  return id;
}

async function pushThreadRemote(threadId: string, peerUserId: string): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  // Mock-user ids ("u-anna") are not UUIDs and will fail the FK — that's
  // intentional. Real-user threading writes through cleanly.
  await supabase.from("dm_threads").upsert(
    { id: threadId, user_a: user.id, user_b: peerUserId },
    { onConflict: "id" }
  );
}

async function pushMessageRemote(
  threadId: string,
  msg: DmMessage,
  _peerUserId: string
): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("dm_messages").insert({
    id: msg.id,
    thread_id: threadId,
    from_user_id: user.id,
    body: msg.text,
    created_at: msg.createdAt,
  });
}

// ---------------------------------------------------------------------------
// Avatar helpers — pure CSS gradient by hue.

export function avatarStyle(hue: number, sat = 70, light = 35): React.CSSProperties {
  return {
    background: `radial-gradient(circle at 30% 30%, hsl(${hue} ${sat}% ${light + 10}%) 0%, hsl(${(hue + 30) % 360} ${sat}% ${light}%) 60%, hsl(${(hue + 60) % 360} ${sat - 15}% ${light - 8}%) 100%)`,
  };
}

export function momentTileStyle(hue: number): React.CSSProperties {
  return {
    background: `linear-gradient(160deg, hsl(${hue} 65% 22%), hsl(${(hue + 40) % 360} 70% 14%) 60%, hsl(${(hue + 80) % 360} 60% 8%))`,
  };
}

/**
 * Animated multi-stop gradient, used for "fake video" mock moments where the
 * FeedPost has no real `videoUri` but `videoHue` is set. The animation is
 * declared globally in app/globals.css (see `@keyframes voyage-reel-pan`).
 */
export function momentVideoTileStyle(hue: number): React.CSSProperties {
  return {
    background: `
      radial-gradient(circle at 20% 30%, hsl(${hue} 80% 35%) 0%, transparent 45%),
      radial-gradient(circle at 80% 70%, hsl(${(hue + 60) % 360} 75% 28%) 0%, transparent 50%),
      linear-gradient(160deg, hsl(${hue} 65% 18%), hsl(${(hue + 40) % 360} 70% 10%) 55%, hsl(${(hue + 90) % 360} 60% 6%))
    `,
    backgroundSize: "200% 200%, 200% 200%, 100% 100%",
    animation: "voyage-reel-pan 7s ease-in-out infinite alternate",
  };
}
