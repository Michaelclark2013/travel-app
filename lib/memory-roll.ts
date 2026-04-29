"use client";

// Memory Roll — the user captures a photo, it stays "Processing" for a
// randomized 30 min – 3 h, then surfaces in Ready Moments. After a Keep, the
// vintage filter is applied + it lands in the Travel Journal.
//
// State lives in localStorage per user. When supabaseEnabled, the kept image
// is uploaded to the public `moments` Storage bucket and the resulting public
// URL is written back into Memory.filteredDataUri (which the entire app
// already reads as "the image to render"). Plus a row is inserted into
// `public.moments` so a profile feed can hydrate from the server on other
// devices.
//
// TODO(track-c-handoff): once recorded videos are first-class, mirror
// Memory.videoUri to a `videos` Storage bucket here on keepMemory.

import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";
import { uploadMomentImage } from "./image-upload";
import { fireAndForget } from "./realtime";

export type MemoryStatus = "processing" | "ready" | "kept" | "discarded";

export type Memory = {
  id: string;
  /** Original capture image as a data URI. */
  imageDataUri: string;
  /** Optional location string at capture time (city / coordinates). */
  capturedAt: string; // ISO
  /** When the moment "becomes ready" — a randomized 30 min to 3 h after capture. */
  readyAt: string; // ISO
  status: MemoryStatus;
  /** Trip this moment belongs to, if captured while a trip was active. */
  tripId?: string;
  /** Set when the user keeps the moment — the filtered version's data URI. */
  filteredDataUri?: string;
  /** When the user kept (or discarded) the moment. */
  decidedAt?: string;
  /** Optional caption written from the Travel Journal lightbox. */
  caption?: string;
  /** Optional location label captured at shoot time. */
  location?: string;
  /**
   * Optional recorded video (Reels-style). Stored as an object URL or data URI
   * depending on the storage adapter. When set, the FeedPost renders a <video>
   * element instead of the still image.
   */
  videoUri?: string;
  /**
   * Optional poster frame for the video — a single still grabbed from the
   * recording start. Used for the placeholder before autoplay kicks in (and
   * as a fallback when the user is on a metered connection).
   */
  posterUri?: string;
};

/** Patch a memory in place — used by the Journal lightbox for caption edits. */
export function updateMemory(id: string, patch: Partial<Memory>): void {
  if (typeof window === "undefined") return;
  const all = loadMemories();
  const idx = all.findIndex((m) => m.id === id);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...patch };
  const k = ((): string | null => {
    const session = JSON.parse(window.localStorage.getItem("voyage:session") || "{}");
    return session.id ? `voyage:memory-roll:${session.id}` : null;
  })();
  if (k) window.localStorage.setItem(k, JSON.stringify(all));
  // Mirror caption / location edits to public.moments. Only fire when the
  // moment is already kept (otherwise there's no row yet).
  if (supabaseEnabled && supabase && all[idx].status === "kept") {
    const mp: Record<string, unknown> = {};
    if (Object.prototype.hasOwnProperty.call(patch, "caption")) mp.caption = patch.caption ?? null;
    if (Object.prototype.hasOwnProperty.call(patch, "location")) mp.location = patch.location ?? null;
    if (Object.keys(mp).length > 0) {
      fireAndForget(supabase.from("moments").update(mp).eq("id", id));
    }
  }
};

const KEY = "voyage:memory-roll";

/** Min / max processing window in milliseconds. */
const MIN_DELAY_MS = 30 * 60 * 1000;
const MAX_DELAY_MS = 3 * 60 * 60 * 1000;

function localKey(): string | null {
  const u = getSession();
  return u ? `${KEY}:${u.id}` : null;
}

export function loadMemories(): Memory[] {
  if (typeof window === "undefined") return [];
  const k = localKey();
  if (!k) return [];
  try {
    return JSON.parse(window.localStorage.getItem(k) ?? "[]") as Memory[];
  } catch {
    return [];
  }
}

function saveAll(list: Memory[]) {
  const k = localKey();
  if (!k || typeof window === "undefined") return;
  window.localStorage.setItem(k, JSON.stringify(list));
}

/** Picks a randomized ready timestamp within the 30 min – 3 h window. */
export function makeReadyAt(now = Date.now()): string {
  const delta =
    MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
  return new Date(now + delta).toISOString();
}

export function captureMoment(args: {
  imageDataUri: string;
  tripId?: string;
  /** Optional recorded video (object URL or data URI). */
  videoUri?: string;
  /** Optional still frame for the video; falls back to imageDataUri. */
  posterUri?: string;
}): Memory {
  const now = new Date().toISOString();
  const memory: Memory = {
    id: `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    imageDataUri: args.imageDataUri,
    capturedAt: now,
    readyAt: makeReadyAt(),
    status: "processing",
    tripId: args.tripId,
    videoUri: args.videoUri,
    posterUri: args.posterUri,
  };
  saveAll([memory, ...loadMemories()]);
  return memory;
}

/**
 * Walks the list and promotes any memory whose `readyAt` has passed and is
 * still "processing" → "ready". Returns the (possibly mutated) list. Caller
 * components should call this on mount + on a periodic tick so the UI updates
 * without a page refresh when something becomes ready.
 */
export function reconcileMemories(): Memory[] {
  const now = Date.now();
  const all = loadMemories();
  let changed = false;
  for (const m of all) {
    if (m.status === "processing" && new Date(m.readyAt).getTime() <= now) {
      m.status = "ready";
      changed = true;
    }
  }
  if (changed) saveAll(all);
  return all;
}

/** Convenience filter helpers — read-only. */
export function processingMemories(list?: Memory[]): Memory[] {
  return (list ?? loadMemories()).filter((m) => m.status === "processing");
}
export function readyMemories(list?: Memory[]): Memory[] {
  return (list ?? loadMemories()).filter((m) => m.status === "ready");
}
export function keptMemories(list?: Memory[]): Memory[] {
  return (list ?? loadMemories()).filter((m) => m.status === "kept");
}

export function keepMemory(id: string, filteredDataUri: string): void {
  const all = loadMemories();
  const m = all.find((x) => x.id === id);
  if (!m) return;
  m.status = "kept";
  m.filteredDataUri = filteredDataUri;
  m.decidedAt = new Date().toISOString();
  saveAll(all);

  // Background-upload the kept image to Supabase Storage when configured. We
  // keep the local data URI unchanged for instant UI; the public URL replaces
  // it on success so future reloads pull from CDN instead of localStorage.
  if (supabaseEnabled && supabase) {
    fireAndForget(syncKeptMemoryRemote(id, filteredDataUri, m.tripId));
  }
}

async function syncKeptMemoryRemote(
  memoryId: string,
  filteredDataUri: string,
  tripId?: string
): Promise<void> {
  if (!supabase) return;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Upload to the `moments` bucket — folder = userId for RLS.
  const upload = await uploadMomentImage(filteredDataUri, user.id, memoryId);
  if (!upload.ok) return;

  // Replace the local filteredDataUri with the public URL so we don't keep
  // the heavy data URI in localStorage forever.
  const list = loadMemories();
  const m = list.find((x) => x.id === memoryId);
  if (m && upload.storage === "supabase") {
    m.filteredDataUri = upload.url;
    saveAll(list);
  }

  // Insert into `public.moments` so profile feeds can hydrate from the DB.
  await supabase
    .from("moments")
    .upsert(
      {
        id: memoryId,
        user_id: user.id,
        image_url: upload.url,
        caption: m?.caption ?? null,
        location: m?.location ?? null,
        trip_id: tripId ?? null,
      },
      { onConflict: "id" }
    );
}

export function discardMemory(id: string): void {
  const all = loadMemories();
  const m = all.find((x) => x.id === id);
  if (!m) return;
  m.status = "discarded";
  m.decidedAt = new Date().toISOString();
  saveAll(all);
}

/** Permanently remove a moment regardless of state. */
export function deleteMemory(id: string): void {
  saveAll(loadMemories().filter((m) => m.id !== id));
  if (supabaseEnabled && supabase) {
    // Cascade RLS will clean up likes/saves/comments for this moment id.
    fireAndForget(supabase.from("moments").delete().eq("id", id));
  }
}

/**
 * Apply the vintage film filter to an image data URI. Runs on a 2D canvas so
 * we don't need a worker. Returns a JPEG data URI of the filtered image.
 *
 * Filter recipe (loosely "warm late-afternoon film"):
 *  - +5% red, +0% green, –6% blue
 *  - +6% saturation
 *  - +8% contrast
 *  - subtle vignette
 *  - light film-grain noise
 */
export function applyFilm(imageDataUri: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("applyFilm only runs in the browser"));
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // Cap longest edge so saved data URIs stay reasonable.
      const MAX = 1600;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D unavailable"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h);
      const px = data.data;

      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.hypot(cx, cy);

      for (let i = 0; i < px.length; i += 4) {
        // RGB warm shift.
        let r = px[i];
        let g = px[i + 1];
        let b = px[i + 2];

        // Saturation + contrast.
        const avg = (r + g + b) / 3;
        const sat = 1.06;
        r = avg + (r - avg) * sat;
        g = avg + (g - avg) * sat;
        b = avg + (b - avg) * sat;

        const con = 1.08;
        r = (r - 128) * con + 128;
        g = (g - 128) * con + 128;
        b = (b - 128) * con + 128;

        r = r * 1.05;
        b = b * 0.94;

        // Vignette by distance.
        const idx = i / 4;
        const px_ = idx % w;
        const py_ = Math.floor(idx / w);
        const r0 = Math.hypot(px_ - cx, py_ - cy) / maxR;
        const v = 1 - 0.42 * Math.pow(r0, 2.4);
        r *= v;
        g *= v;
        b *= v;

        // Film grain noise (subtle, per-pixel).
        const noise = (Math.random() - 0.5) * 8;
        r += noise;
        g += noise;
        b += noise;

        px[i] = clamp(r);
        px[i + 1] = clamp(g);
        px[i + 2] = clamp(b);
      }
      ctx.putImageData(data, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => reject(new Error("Image failed to load"));
    img.src = imageDataUri;
  });
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Format the time-until-ready string used on the processing card. Example
 * outputs: "Ready in 2 h 14 m", "Ready in 47 m", "Almost ready".
 */
export function readyInLabel(memory: Memory, now = Date.now()): string {
  const diffMs = new Date(memory.readyAt).getTime() - now;
  if (diffMs <= 0) return "Almost ready";
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 60) return `Ready in ${minutes} m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `Ready in ${h} h ${m} m`;
}
