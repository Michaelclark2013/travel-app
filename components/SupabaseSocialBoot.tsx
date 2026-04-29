"use client";

// SupabaseSocialBoot — invisible client component that wires up the social
// layer's Realtime + boot-hydration behavior at the app shell level.
//
// What:
//   - Reads the current auth user from useAuth()
//   - When the user is present + supabaseEnabled, it (a) hydrates the local
//     mirror tables from Supabase, then (b) opens a single Realtime channel
//     for the duration of the session.
//   - Cleans up subscriptions on sign-out / unmount.
//
// Why a separate component:
//   - Keeps the existing per-feature helpers fully synchronous and stateless.
//   - Allows graceful degradation: if Supabase env keys aren't set,
//     useSocialRealtime() short-circuits and we render nothing.

import { useAuth } from "./AuthProvider";
import { useSocialRealtime } from "@/lib/realtime";

export default function SupabaseSocialBoot() {
  const { user, ready } = useAuth();
  // useSocialRealtime is a no-op when supabaseEnabled is false or userId is
  // missing — safe to call unconditionally.
  useSocialRealtime(ready && user ? user.id : null);
  return null;
}
