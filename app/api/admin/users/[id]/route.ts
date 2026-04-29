// app/api/admin/users/[id]/route.ts — Track 2 user detail read API.
//
// WHAT
//   GET /api/admin/users/[id]
//     -> {
//          identity: { user_id, email, username, display_name, signup, last_active },
//          devices: [{ ua, ip, last_seen }],   // deduped UA fingerprint
//          counts:  { trips, moments, comments, follows_in, follows_out },
//          ban:     { banned_until: string | null },
//          pro:     { active: boolean, expires_at: string | null }
//        }
//
// AUTH
//   `users.read` permission.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

type AdminAuthUser = {
  id: string;
  email?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  await requirePerm(req, "users.read");
  const { id } = await ctx.params;

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  // Profile row.
  const { data: profile } = await supa
    .from("profiles_public")
    .select(
      "user_id, username, display_name, bio, created_at, deleted_at, hidden_at, featured_at"
    )
    .eq("user_id", id)
    .maybeSingle();

  // Auth-side info (email, last_sign_in_at, banned_until). No direct getById
  // in the @supabase/supabase-js SDK; pull via the admin namespace.
  const adminAuth = supa.auth.admin as unknown as {
    getUserById?: (id: string) => Promise<{ data: { user: AdminAuthUser | null } | null }>;
    listUsers: (opts: {
      page: number;
      perPage: number;
    }) => Promise<{ data: { users: AdminAuthUser[] } | null }>;
  };
  let authUser: AdminAuthUser | null = null;
  if (adminAuth.getUserById) {
    const { data } = await adminAuth.getUserById(id);
    authUser = data?.user ?? null;
  } else {
    const { data } = await adminAuth.listUsers({ page: 1, perPage: 200 });
    authUser = (data?.users ?? []).find((u) => u.id === id) ?? null;
  }

  // Counts — single round-trip for each.
  const [trips, moments, comments, followsOut, followsIn] = await Promise.all([
    supa.from("trips").select("id", { count: "exact", head: true }).eq("user_id", id),
    supa.from("moments").select("id", { count: "exact", head: true }).eq("user_id", id),
    supa.from("comments").select("id", { count: "exact", head: true }).eq("author_id", id),
    supa.from("follows").select("follower_id", { count: "exact", head: true }).eq("follower_id", id),
    supa.from("follows").select("followee_id", { count: "exact", head: true }).eq("followee_id", id),
  ]);

  // Devices — deduped by UA fingerprint over the user's own audit rows.
  // The audit log stores admin actions, but it also captures IP + UA on
  // every admin action targeting this user, which is what the brief asks
  // for ("audit logs IPs" alongside auth.users.last_sign_in_at).
  const { data: auditDeviceRows } = await supa
    .from("admin_audit")
    .select("ip, user_agent, ts")
    .eq("target_kind", "user")
    .eq("target_id", id)
    .order("ts", { ascending: false })
    .limit(50);

  const dedup = new Map<
    string,
    { ua: string; ip: string | null; last_seen: string }
  >();
  for (const r of auditDeviceRows ?? []) {
    const ua = r.user_agent ?? "unknown";
    const key = ua;
    if (!dedup.has(key)) {
      dedup.set(key, { ua, ip: r.ip, last_seen: r.ts });
    }
  }
  // Mix in auth.users.last_sign_in_at as a synthetic device row so the panel
  // always shows at least the most recent login.
  if (authUser?.last_sign_in_at) {
    dedup.set("auth.last_sign_in", {
      ua: "auth.users.last_sign_in_at",
      ip: null,
      last_seen: authUser.last_sign_in_at,
    });
  }
  const devices = Array.from(dedup.values()).slice(0, 20);

  // Pro entitlement — soft-load Track 5's table.
  let pro: { active: boolean; expires_at: string | null } = {
    active: false,
    expires_at: null,
  };
  try {
    const { data: ent } = await supa
      .from("pro_entitlements")
      .select("expires_at")
      .eq("user_id", id)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ent?.expires_at && new Date(ent.expires_at) > new Date()) {
      pro = { active: true, expires_at: ent.expires_at };
    }
  } catch {
    // Track 5's table doesn't exist yet — fall through.
  }

  return Response.json({
    ok: true,
    identity: {
      user_id: id,
      email: authUser?.email ?? null,
      username: profile?.username ?? null,
      display_name: profile?.display_name ?? null,
      bio: profile?.bio ?? null,
      signup: profile?.created_at ?? authUser?.created_at ?? null,
      last_active: authUser?.last_sign_in_at ?? null,
      deleted_at: profile?.deleted_at ?? null,
      hidden_at: profile?.hidden_at ?? null,
    },
    devices,
    counts: {
      trips: trips.count ?? 0,
      moments: moments.count ?? 0,
      comments: comments.count ?? 0,
      follows_in: followsIn.count ?? 0,
      follows_out: followsOut.count ?? 0,
    },
    ban: { banned_until: authUser?.banned_until ?? null },
    pro,
  });
}
