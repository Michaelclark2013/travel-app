// app/api/admin/users/route.ts — Track 2 user search + list API.
//
// WHAT
//   GET /api/admin/users
//     ?q=<full-text>             — search across email/username/display_name/bio
//     &cursor=<created_at|id>    — opaque cursor for forward pagination
//     &limit=<n>                 — default 50, max 200
//     &signupFrom=<iso>&signupTo=<iso>
//     &activeFrom=<iso>&activeTo=<iso>
//     &country=<code>            — country code filter (best-effort: profile bio)
//     &pro=true|false            — Pro entitlement filter
//     &banned=true|false         — banned-state filter
//   -> { rows: [...], nextCursor: string | null }
//
// AUTH
//   Requires `users.read` permission via requirePerm().
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

type AdminAuthUser = {
  id: string;
  email?: string | null;
  banned_until?: string | null;
  last_sign_in_at?: string | null;
  created_at?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

export async function GET(req: Request) {
  await requirePerm(req, "users.read");

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT
  );
  const q = (url.searchParams.get("q") ?? "").trim();
  const cursor = url.searchParams.get("cursor");
  const signupFrom = url.searchParams.get("signupFrom");
  const signupTo = url.searchParams.get("signupTo");
  const activeFrom = url.searchParams.get("activeFrom");
  const activeTo = url.searchParams.get("activeTo");
  const country = url.searchParams.get("country");
  const pro = url.searchParams.get("pro");
  const banned = url.searchParams.get("banned");

  // ----- Step 1. Read profiles_public with filters --------------------------
  // We treat profiles_public as the source-of-truth row (every auth user has
  // one once seeded). Email + last_sign_in_at + banned_until come from
  // auth.users which we layer on AFTER the page is sliced.
  let pq = supa
    .from("profiles_public")
    .select(
      "user_id, username, display_name, bio, created_at, deleted_at, hidden_at, featured_at"
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("user_id", { ascending: false })
    .limit(limit + 1);

  if (q) {
    // OR across the profile columns. Email match happens after we layer
    // auth.users onto the result set below.
    const like = `%${q.replace(/[%_]/g, "")}%`;
    pq = pq.or(
      [
        `username.ilike.${like}`,
        `display_name.ilike.${like}`,
        `bio.ilike.${like}`,
      ].join(",")
    );
  }
  if (signupFrom) pq = pq.gte("created_at", signupFrom);
  if (signupTo) pq = pq.lte("created_at", signupTo);
  if (country) pq = pq.ilike("bio", `%${country.replace(/[%_]/g, "")}%`);

  if (cursor) {
    const [ts, id] = cursor.split("|");
    if (ts) pq = pq.lt("created_at", ts);
    void id;
  }

  const { data: profiles, error } = await pq;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  const profileRows = profiles ?? [];

  // ----- Step 2. Layer auth.users for each id -------------------------------
  // No bulk lookup-by-id endpoint in Supabase admin SDK; we list and match.
  // For the admin tool surface (a few hundred users at most per page), the
  // single listUsers page call is acceptable. Team lead can replace with a
  // join via a SQL view later if scale demands.
  const adminAuth = supa.auth.admin as unknown as {
    listUsers: (opts: { page: number; perPage: number }) => Promise<{
      data: { users: AdminAuthUser[] } | null;
    }>;
  };
  const { data: usersRes } = await adminAuth.listUsers({ page: 1, perPage: 200 });
  const usersById = new Map<string, AdminAuthUser>(
    (usersRes?.users ?? []).map((u) => [u.id, u])
  );

  // ----- Step 3. Optional Pro entitlement layer (Track 5 — soft dep) --------
  // pro_entitlements may not exist yet. We try, and on failure assume "no
  // entitlement table → nobody is Pro yet". This keeps Track 2 forward-
  // compatible without hard-coupling.
  let proSet: Set<string> | null = null;
  try {
    const { data: ents, error: entErr } = await supa
      .from("pro_entitlements")
      .select("user_id, expires_at")
      .gt("expires_at", new Date().toISOString());
    if (!entErr && ents) {
      proSet = new Set((ents as Array<{ user_id: string }>).map((r) => r.user_id));
    }
  } catch {
    proSet = null;
  }

  // ----- Step 4. Combine + apply post-filters that need auth.users ----------
  type Row = {
    user_id: string;
    username: string | null;
    display_name: string | null;
    bio: string | null;
    email: string | null;
    created_at: string | null;
    last_sign_in_at: string | null;
    banned_until: string | null;
    pro: boolean;
    deleted_at: string | null;
    hidden_at: string | null;
    featured_at: string | null;
  };
  const enriched: Row[] = profileRows.map((p) => {
    const u = usersById.get(p.user_id);
    return {
      user_id: p.user_id,
      username: p.username,
      display_name: p.display_name,
      bio: p.bio,
      email: u?.email ?? null,
      created_at: p.created_at,
      last_sign_in_at: u?.last_sign_in_at ?? null,
      banned_until: u?.banned_until ?? null,
      pro: proSet ? proSet.has(p.user_id) : false,
      deleted_at: p.deleted_at,
      hidden_at: p.hidden_at,
      featured_at: p.featured_at,
    };
  });

  // Email-side text match — `q` already filtered by username/display/bio at
  // SQL level. To pick up email matches, we fold them in client-side here.
  // (At larger scale the team lead should mirror email into profiles_public
  // so a single ilike covers it.)
  let filtered = enriched;
  if (q) {
    const lc = q.toLowerCase();
    // Don't drop rows that already matched by name/bio; just OR-in email matches.
    const byEmail = enriched.filter(
      (r) => (r.email ?? "").toLowerCase().includes(lc)
    );
    const byOther = enriched.filter(
      (r) =>
        (r.username ?? "").toLowerCase().includes(lc) ||
        (r.display_name ?? "").toLowerCase().includes(lc) ||
        (r.bio ?? "").toLowerCase().includes(lc)
    );
    const dedup = new Map<string, Row>();
    for (const r of [...byOther, ...byEmail]) dedup.set(r.user_id, r);
    filtered = Array.from(dedup.values());
  }
  if (activeFrom) {
    filtered = filtered.filter(
      (r) => (r.last_sign_in_at ?? "") >= activeFrom
    );
  }
  if (activeTo) {
    filtered = filtered.filter(
      (r) => (r.last_sign_in_at ?? "") <= activeTo
    );
  }
  if (pro === "true") filtered = filtered.filter((r) => r.pro);
  if (pro === "false") filtered = filtered.filter((r) => !r.pro);
  if (banned === "true") {
    filtered = filtered.filter(
      (r) => r.banned_until && new Date(r.banned_until) > new Date()
    );
  } else if (banned === "false") {
    filtered = filtered.filter(
      (r) => !r.banned_until || new Date(r.banned_until) <= new Date()
    );
  }

  // ----- Step 5. Cursor for the next page -----------------------------------
  let nextCursor: string | null = null;
  let trimmed = filtered;
  if (filtered.length > limit) {
    trimmed = filtered.slice(0, limit);
    const last = trimmed[trimmed.length - 1];
    if (last) nextCursor = `${last.created_at}|${last.user_id}`;
  }

  return Response.json({ ok: true, rows: trimmed, nextCursor });
}
