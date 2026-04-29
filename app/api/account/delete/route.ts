import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Deletes all data we have on the calling user, then deletes the auth user
// itself. Requires Supabase service-role key for the final auth.admin call.
// Without service-role key, we still drop user-owned table rows.
//
// Track 8 enhancement: this is the user-initiated path. The admin-initiated
// erasure (which can also anonymize audit_log entries and produce a receipt)
// lives at /api/admin/compliance/erase/[requestId]/run.

export async function POST(req: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anon) {
    return NextResponse.json(
      { ok: false, message: "Supabase not configured." },
      { status: 501 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  const jwt = auth.replace(/^Bearer\s+/i, "");
  if (!jwt) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const userClient = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const deleted: string[] = [];

  // RLS lets the user delete their own rows. Best-effort across the whole
  // surface — every table might not exist on every deployment, so we run
  // these with allSettled and report what landed.
  const tables: { name: string; col: string }[] = [
    { name: "trips", col: "user_id" },
    { name: "wallet_items", col: "user_id" },
    { name: "moments", col: "user_id" },
    { name: "likes", col: "user_id" },
    { name: "saves", col: "user_id" },
    { name: "comments", col: "author_id" },
    { name: "reposts", col: "user_id" },
    { name: "dm_messages", col: "from_user_id" },
    { name: "cookie_consents", col: "user_id" },
    { name: "profiles", col: "user_id" },
    { name: "profiles_public", col: "user_id" },
  ];
  await Promise.allSettled(
    tables.map(async (t) => {
      const { error } = await userClient.from(t.name).delete().eq(t.col, user.id);
      if (!error) deleted.push(t.name);
    })
  );

  // Removing the auth user requires the service-role key (admin API).
  if (serviceRole) {
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.auth.admin.deleteUser(user.id);
    deleted.push("auth.users");

    // Track 8 — anonymize the user's audit-log references so an erasure
    // doesn't leak the user's id back through the trail.
    try {
      await admin
        .from("admin_audit")
        .update({ target_id: "anonymized" })
        .eq("target_kind", "user")
        .eq("target_id", user.id);
    } catch {
      /* admin_audit may be append-only; ignore */
    }

    try {
      await admin.from("dsar_requests").insert({
        id: `dsar-${Date.now().toString(36)}`,
        user_id: user.id,
        kind: "erasure",
        status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
        notes: "Self-service erasure.",
      });
    } catch {
      /* table may be missing */
    }
  } else {
    deleted.push("auth.users (skipped — set SUPABASE_SERVICE_ROLE_KEY)");
  }

  return NextResponse.json({ ok: true, deleted });
}
