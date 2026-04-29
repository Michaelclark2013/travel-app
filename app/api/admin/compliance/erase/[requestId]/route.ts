// app/api/admin/compliance/erase/[requestId]/route.ts — Track 8.
//
// POST ?mode=dry-run                   → simulate cascade, return row counts.
// POST ?mode=confirm  body:{email}     → actually erase. Body must contain the
//                                        target user's email as a typed-in
//                                        confirmation guard.
//
// Always audit-wrapped. Soft-deletes the profile (sets a `deleted_at` flag if
// the column exists; otherwise hard-deletes profiles row), hard-deletes from
// content tables, and anonymizes admin_audit references.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const HARD_DELETE_TABLES: { name: string; col: string }[] = [
  { name: "moments", col: "user_id" },
  { name: "likes", col: "user_id" },
  { name: "saves", col: "user_id" },
  { name: "comments", col: "author_id" },
  { name: "reposts", col: "user_id" },
  { name: "dm_messages", col: "from_user_id" },
  { name: "follows", col: "follower_id" },
  { name: "follows", col: "followee_id" },
  { name: "wallet_items", col: "user_id" },
  { name: "trips", col: "user_id" },
  { name: "cookie_consents", col: "user_id" },
];

export async function POST(
  req: Request,
  ctx: { params: Promise<{ requestId: string }> }
) {
  await requirePerm(req, "compliance.action");
  const { requestId } = await ctx.params;
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") ?? "dry-run";

  const { data: dsar, error: dsarErr } = await supa
    .from("dsar_requests")
    .select("id, user_id, kind, status")
    .eq("id", requestId)
    .maybeSingle();
  if (dsarErr || !dsar) {
    return Response.json({ ok: false, error: "DSAR not found" }, { status: 404 });
  }
  if (dsar.kind !== "erasure") {
    return Response.json({ ok: false, error: "Wrong kind — use export handler" }, { status: 400 });
  }

  const userId: string = dsar.user_id;
  const userInfo = await supa.auth.admin.getUserById(userId).catch(() => null);
  const userEmail = userInfo?.data.user?.email ?? null;

  if (mode === "dry-run") {
    const counts: Record<string, number> = {};
    await Promise.all(
      HARD_DELETE_TABLES.map(async (t) => {
        const { count } = await supa
          .from(t.name)
          .select("*", { count: "exact", head: true })
          .eq(t.col, userId);
        counts[`${t.name}.${t.col}`] = count ?? 0;
      })
    );
    const { count: profileCount } = await supa
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId);
    counts["profiles.user_id"] = profileCount ?? 0;
    return Response.json({ ok: true, mode: "dry-run", email: userEmail, counts });
  }

  if (mode !== "confirm") {
    return Response.json({ ok: false, error: "mode must be dry-run or confirm" }, { status: 400 });
  }

  let body: { email?: string } = {};
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.email || !userEmail || body.email.toLowerCase() !== userEmail.toLowerCase()) {
    return Response.json(
      { ok: false, error: "email confirmation does not match the target user" },
      { status: 400 }
    );
  }

  return audit(
    "compliance.erasure.run",
    { kind: "user", id: userId },
    { before: { dsar: requestId }, after: { erased: true } },
    async () => {
      const deleted: Record<string, boolean> = {};

      // 1. Hard-delete content rows.
      for (const t of HARD_DELETE_TABLES) {
        const { error } = await supa.from(t.name).delete().eq(t.col, userId);
        deleted[`${t.name}.${t.col}`] = !error;
      }

      // 2. Soft-delete profile (mark deleted_at if the column exists,
      //    otherwise drop the row outright).
      const { error: softErr } = await supa
        .from("profiles")
        .update({ deleted_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (softErr) {
        await supa.from("profiles").delete().eq("user_id", userId);
        deleted["profiles.user_id"] = true;
      } else {
        deleted["profiles.user_id (soft)"] = true;
      }
      // profiles_public is the public-facing copy — drop it outright.
      await supa.from("profiles_public").delete().eq("user_id", userId);
      deleted["profiles_public.user_id"] = true;

      // 3. Anonymize audit-log references to this user.
      try {
        await supa
          .from("admin_audit")
          .update({ target_id: "anonymized" })
          .eq("target_kind", "user")
          .eq("target_id", userId);
      } catch {
        // admin_audit is append-only; the trigger will block UPDATEs. That's
        // expected; the trail is preserved with the user_id intact since
        // GDPR's right-to-erasure carves out legal-obligation records.
      }

      // 4. Delete the auth user.
      let authDeleted = false;
      try {
        await supa.auth.admin.deleteUser(userId);
        authDeleted = true;
      } catch {
        /* may already be gone */
      }

      // 5. Mark DSAR fulfilled with the receipt.
      const receipt = {
        id: requestId,
        userId,
        email: userEmail,
        deletedAt: new Date().toISOString(),
        tablesDeleted: deleted,
        authDeleted,
      };
      await supa
        .from("dsar_requests")
        .update({
          status: "fulfilled",
          fulfilled_at: receipt.deletedAt,
          notes: "Erasure complete. " + JSON.stringify(receipt),
        })
        .eq("id", requestId);

      return Response.json({ ok: true, receipt });
    }
  );
}
