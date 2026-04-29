// Server-side Supabase client. Uses SUPABASE_SERVICE_ROLE_KEY when present so
// route handlers / server actions can bypass RLS for trusted admin work
// (notification fan-out triggers, server-side moderation, etc.). This is the
// ONLY place the service-role key should be referenced — never import it
// from a "use client" module.
//
// What:
//   - Returns a singleton SupabaseClient configured with the service role key.
//   - Returns null when the env vars aren't set so callers can fall through to
//     local-only behavior without throwing.
//
// Why:
//   - Most of the social layer is fine running through the client SDK + RLS
//     (the policies in 0003_social.sql do the work). But a few things — e.g.
//     emitting notifications when user A likes user B's moment, or seeding
//     profile rows for a brand-new auth user — need write access across rows
//     that the calling user doesn't own. Hence service role.
//
// Safety:
//   - Lazy-imported via a function, not a module-level singleton, to make
//     accidental client-bundle inclusion fail loudly during build (the env
//     var simply isn't there in the browser).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _serverClient: SupabaseClient | null | undefined;

/**
 * Returns the admin Supabase client, or null when env vars are missing.
 * Cached after first call.
 */
export function getSupabaseAdmin(): SupabaseClient | null {
  if (_serverClient !== undefined) return _serverClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    _serverClient = null;
    return null;
  }

  _serverClient = createClient(url, key, {
    auth: {
      // Server-side: never persist or auto-refresh — every request is short
      // lived and we explicitly authenticate via the service-role key.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return _serverClient;
}

/** Convenience flag mirrors `supabaseEnabled` in lib/supabase.ts. */
export function supabaseAdminEnabled(): boolean {
  return getSupabaseAdmin() !== null;
}
