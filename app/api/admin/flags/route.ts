// app/api/admin/flags/route.ts — Track 6 flag management API.
//
// WHAT
//   GET  -> list all feature_flags (requires flags.read).
//   POST { key, description?, kind, value, target?, enabled } ->
//          upsert a flag (requires flags.write; flags.kill if kind ===
//          "kill_switch").
//
// AUDIT
//   Wrapped via lib/admin/audit so every change leaves a row.
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import {
  listFlags,
  setFlag,
  getFlagRow,
  type FlagKind,
  type FlagPatch,
} from "@/lib/admin/flags";

export async function GET(req: Request) {
  await requirePerm(req, "flags.read");
  const rows = await listFlags();
  return Response.json({ ok: true, flags: rows });
}

export async function POST(req: Request) {
  // We re-check below for kill_switch. Start with the broader perm.
  await requirePerm(req, "flags.write");

  const body = (await req.json().catch(() => null)) as {
    key?: string;
    description?: string | null;
    kind?: FlagKind;
    value?: Record<string, unknown>;
    target?: Record<string, unknown> | null;
    enabled?: boolean;
  } | null;

  if (!body || typeof body.key !== "string" || !body.kind) {
    return Response.json(
      { ok: false, error: "Body must include key + kind." },
      { status: 400 }
    );
  }
  const validKinds: FlagKind[] = ["boolean", "percentage", "cohort", "kill_switch"];
  if (!validKinds.includes(body.kind)) {
    return Response.json(
      { ok: false, error: `kind must be one of ${validKinds.join(", ")}` },
      { status: 400 }
    );
  }
  if (body.kind === "kill_switch") {
    // Killing a feature is a higher-blast-radius action; require flags.kill.
    await requirePerm(req, "flags.kill");
  }

  const before = await getFlagRow(body.key);
  const patch: FlagPatch = {
    description: body.description ?? null,
    kind: body.kind,
    value: body.value ?? {},
    target: body.target ?? null,
    enabled: typeof body.enabled === "boolean" ? body.enabled : false,
  };

  return audit(
    `flag.${before ? "update" : "create"}`,
    { kind: "feature_flag", id: body.key },
    { before, after: { ...before, ...patch, key: body.key } },
    async () => {
      const row = await setFlag(body.key!, patch);
      if (!row) {
        return Response.json(
          { ok: false, error: "setFlag failed (Supabase config?)" },
          { status: 503 }
        );
      }
      return Response.json({ ok: true, flag: row });
    }
  );
}
