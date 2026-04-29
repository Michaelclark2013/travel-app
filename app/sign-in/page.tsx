"use client";

// Auth is currently bypassed for v1 — landing on /sign-in creates an instant
// guest session and forwards into the app. The full sign-in form is in git
// history; restore it when we're ready to gate the app behind real accounts.

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";

function Launching() {
  const router = useRouter();
  const search = useSearchParams();
  const { user, signUp, ready } = useAuth();

  useEffect(() => {
    if (!ready) return;
    const next = search.get("next") || "/plan";

    async function go() {
      // Already signed in? Just forward.
      if (user) {
        router.replace(next);
        return;
      }
      // Mint a stable guest identity so the app behaves like the user is
      // signed in (per-user storage keys, trips, the assistant, etc.). The
      // password is unused — the local auth provider just hashes it.
      const guestId = Math.random().toString(36).slice(2, 8);
      await signUp(`guest-${guestId}@voyage.local`, "guest-pass-x9", "Traveler");
      router.replace(next);
    }
    go();
  }, [ready, user, signUp, router, search]);

  return (
    <div className="mx-auto max-w-md px-6 py-32 text-center font-mono text-xs tracking-[0.18em] text-[var(--muted)] uppercase">
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)] pulse-dot" />
        Launching Voyage…
      </span>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Launching />
    </Suspense>
  );
}
