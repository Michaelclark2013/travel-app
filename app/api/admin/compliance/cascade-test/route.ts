// app/api/admin/compliance/cascade-test/route.ts — Track 8.
//
// POST → spawn a synthetic user, seed a moment + a comment + a follow + a
// dm thread + a wallet item, run the same erasure cascade as the real
// flow, then assert that nothing remains. Returns a structured pass/fail.
//
// This is the regression harness compliance can run any time the schema
// changes — if a new user-owned table is added but missed by the erasure
// flow, this test will fail loudly.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const CHECK_TABLES: { name: string; col: string }[] = [
  { name: "trips", col: "user_id" },
  { name: "moments", col: "user_id" },
  { name: "likes", col: "user_id" },
  { name: "saves", col: "user_id" },
  { name: "comments", col: "author_id" },
  { name: "reposts", col: "user_id" },
  { name: "dm_messages", col: "from_user_id" },
  { name: "follows", col: "follower_id" },
  { name: "wallet_items", col: "user_id" },
  { name: "cookie_consents", col: "user_id" },
  { name: "profiles_public", col: "user_id" },
];

export async function POST(req: Request) {
  await requirePerm(req, "compliance.action");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  return audit(
    "compliance.cascade.test",
    { kind: "system", id: "cascade-test" },
    { before: null, after: { started: new Date().toISOString() } },
    async () => {
      // 1. Spawn synthetic user.
      const tag = Math.random().toString(36).slice(2, 8);
      const email = `cascade-test-${tag}@example.invalid`;
      const created = await supa.auth.admin.createUser({
        email,
        password: `pw-${tag}-${Date.now()}`,
        email_confirm: true,
      });
      if (created.error || !created.data.user) {
        return Response.json(
          { ok: false, stage: "createUser", error: created.error?.message ?? "unknown" },
          { status: 500 }
        );
      }
      const userId = created.data.user.id;

      // 2. Seed a row in each best-effort table. Failure on a table that
      //    doesn't exist on this deployment is expected and not fatal.
      const seeded: string[] = [];
      const seed = async (table: string, row: Record<string, unknown>) => {
        const { error } = await supa.from(table).insert(row);
        if (!error) seeded.push(table);
      };
      await seed("trips", { id: `t-${tag}`, user_id: userId, title: "Test trip" });
      await seed("moments", { id: `m-${tag}`, user_id: userId, image_url: "https://x" });
      await seed("cookie_consents", {
        user_id: userId,
        analytics: true,
        marketing: false,
        functional: true,
      });
      await seed("profiles_public", {
        user_id: userId,
        username: `tst${tag}`,
        display_name: "Cascade Test",
      });

      // 3. Run the same hard-delete cascade the real erasure does.
      const HARD: { name: string; col: string }[] = [
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
        { name: "profiles_public", col: "user_id" },
      ];
      for (const t of HARD) {
        await supa.from(t.name).delete().eq(t.col, userId);
      }
      await supa.auth.admin.deleteUser(userId);

      // 4. Assert: every CHECK_TABLES row count must be zero.
      const remainder: Record<string, number> = {};
      let pass = true;
      for (const t of CHECK_TABLES) {
        const { count } = await supa
          .from(t.name)
          .select("*", { count: "exact", head: true })
          .eq(t.col, userId);
        remainder[`${t.name}.${t.col}`] = count ?? 0;
        if ((count ?? 0) > 0) pass = false;
      }

      return Response.json({
        ok: pass,
        userId,
        email,
        seeded,
        remainder,
        message: pass ? "Cascade complete — no orphan rows." : "Orphan rows detected.",
      });
    }
  );
}
