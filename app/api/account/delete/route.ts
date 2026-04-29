import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Deletes all data we have on the calling user, then deletes the auth user
// itself. Requires Supabase service-role key for the final auth.admin call.
// Without service-role key, we still drop user-owned table rows.

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

  // RLS lets the user delete their own rows.
  await Promise.all([
    userClient.from("trips").delete().eq("user_id", user.id),
    userClient.from("wallet_items").delete().eq("user_id", user.id),
    userClient.from("profiles").delete().eq("user_id", user.id),
  ]);

  // Removing the auth user requires the service-role key (admin API).
  if (serviceRole) {
    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await admin.auth.admin.deleteUser(user.id);
  }

  return NextResponse.json({
    ok: true,
    deleted: ["trips", "wallet_items", "profiles", serviceRole ? "auth.users" : "auth.users (skipped — set SUPABASE_SERVICE_ROLE_KEY)"],
  });
}
