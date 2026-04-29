// app/api/admin/incidents/route.ts — Track 6 incidents API.
//
// WHAT
//   GET                                — list incidents (admin sees public + internal)
//   POST { id?, title, severity, status?, public?, started_at? }
//                                      — create an incident
//
// AUTH
//   Requires flags.write (incidents are part of the ops surface; reusing the
//   same perm tier rather than minting a new one).
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ADMIN_JWT_SECRET.

import { requirePerm } from "@/lib/admin/rbac";
import { audit } from "@/lib/admin/audit";
import { getSupabaseAdmin } from "@/lib/supabase-server";

function newIncidentId(): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 6 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `inc-${ts}-${rnd}`;
}

export async function GET(req: Request) {
  await requirePerm(req, "flags.read");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const { data, error } = await supa
    .from("incidents")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true, incidents: data ?? [] });
}

export async function POST(req: Request) {
  await requirePerm(req, "flags.write");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }
  const body = (await req.json().catch(() => null)) as {
    id?: string;
    title?: string;
    severity?: "minor" | "major" | "critical";
    status?: "investigating" | "identified" | "monitoring" | "resolved";
    public?: boolean;
    started_at?: string;
  } | null;
  if (!body || !body.title || !body.severity) {
    return Response.json(
      { ok: false, error: "Body must include title + severity." },
      { status: 400 }
    );
  }
  const row = {
    id: body.id ?? newIncidentId(),
    title: body.title,
    severity: body.severity,
    status: body.status ?? "investigating",
    started_at: body.started_at ?? new Date().toISOString(),
    public: body.public ?? true,
  };
  return audit(
    "incident.create",
    { kind: "incident", id: row.id },
    { before: null, after: row },
    async () => {
      const { data, error } = await supa
        .from("incidents")
        .insert(row)
        .select("*")
        .single();
      if (error) {
        return Response.json({ ok: false, error: error.message }, { status: 500 });
      }
      return Response.json({ ok: true, incident: data });
    }
  );
}
