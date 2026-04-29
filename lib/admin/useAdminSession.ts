"use client";

// lib/admin/useAdminSession.ts — Track 1 client-side admin session hook.
//
// WHAT
//   useAdminSession() — fetches /api/admin/session, caches the result in a
//   module-level mutable ref, and re-validates on window focus. Returns:
//     { session: AdminSession | null, loading: boolean, refresh: () => void }
//
// WHY a separate file from session.ts
//   session.ts uses node:crypto and is server-only. Client code must not pull
//   it in or the bundle breaks. This file is "use client" and only does fetch
//   + state, so RequirePerm and any admin UI can import it freely.
//
// ENV VARS
//   None. The endpoint at /api/admin/session reads the httpOnly cookie.

import { useCallback, useEffect, useRef, useState } from "react";
import type { AdminRole } from "./rbac";

export type ClientAdminSession = {
  adminId: string;
  role: AdminRole;
  mfa: boolean;
  email?: string;
};

// Module-level cache so multiple components mounting this hook don't all
// fetch on first paint. The Promise is shared until it resolves.
let cached: ClientAdminSession | null | undefined;
let inflight: Promise<ClientAdminSession | null> | null = null;

async function fetchSession(): Promise<ClientAdminSession | null> {
  try {
    const res = await fetch("/api/admin/session", {
      credentials: "include",
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as { session: ClientAdminSession | null };
    return data.session ?? null;
  } catch {
    return null;
  }
}

export function useAdminSession(): {
  session: ClientAdminSession | null;
  loading: boolean;
  refresh: () => void;
} {
  const [session, setSession] = useState<ClientAdminSession | null>(
    cached ?? null
  );
  const [loading, setLoading] = useState<boolean>(cached === undefined);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    if (!inflight) {
      inflight = fetchSession();
    }
    const result = await inflight;
    inflight = null;
    cached = result;
    if (mounted.current) {
      setSession(result);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (cached === undefined) {
      void load();
    } else {
      setLoading(false);
    }
    function onFocus() {
      // Force a re-fetch on focus so a session that expired in the background
      // doesn't leave a stale "you're logged in" UI.
      cached = undefined;
      void load();
    }
    window.addEventListener("focus", onFocus);
    return () => {
      mounted.current = false;
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  const refresh = useCallback(() => {
    cached = undefined;
    setLoading(true);
    void load();
  }, [load]);

  return { session, loading, refresh };
}
