"use client";

import { getSession } from "./auth";
import { supabase, supabaseEnabled } from "./supabase";
import { type Confirmation, loadConfirmations } from "./wallet";

// A "share token" is a random URL-safe id that points to a snapshot of a
// trip's wallet. Snapshots live both in localStorage (so demo accounts work
// offline) and in Supabase (so the link is sharable across devices).

export type SharePayload = {
  token: string;
  tripId?: string;
  tripLabel: string;
  ownerName: string;
  createdAt: string;
  items: Confirmation[];
};

const LOCAL_PREFIX = "voyage:wallet-share:";

function randomToken(): string {
  const arr = new Uint8Array(12);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function createShare(args: {
  tripId?: string;
  tripLabel: string;
}): Promise<SharePayload> {
  const all = loadConfirmations();
  const items = args.tripId
    ? all.filter((c) => c.tripId === args.tripId)
    : all.filter((c) => !c.tripId);
  const session = getSession();
  const payload: SharePayload = {
    token: randomToken(),
    tripId: args.tripId,
    tripLabel: args.tripLabel,
    ownerName: session?.name ?? "A traveler",
    createdAt: new Date().toISOString(),
    items,
  };

  // localStorage so the share view works in demo / offline mode
  if (typeof window !== "undefined") {
    window.localStorage.setItem(LOCAL_PREFIX + payload.token, JSON.stringify(payload));
  }

  // Supabase mirror for cross-device shares
  if (supabaseEnabled && supabase) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("wallet_shares").insert({
        token: payload.token,
        user_id: user.id,
        trip_id: args.tripId ?? null,
        trip_label: args.tripLabel,
        owner_name: payload.ownerName,
        snapshot: payload,
      });
    }
  }
  return payload;
}

export async function loadShare(token: string): Promise<SharePayload | null> {
  if (typeof window !== "undefined") {
    const raw = window.localStorage.getItem(LOCAL_PREFIX + token);
    if (raw) {
      try {
        return JSON.parse(raw) as SharePayload;
      } catch {
        // fall through
      }
    }
  }
  if (supabaseEnabled && supabase) {
    const { data, error } = await supabase
      .from("wallet_shares")
      .select("snapshot")
      .eq("token", token)
      .maybeSingle();
    if (!error && data?.snapshot) return data.snapshot as SharePayload;
  }
  return null;
}
