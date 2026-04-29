// app/api/admin/compliance/dpa/route.ts — Track 8 DPA/SCC document store.
//
// GET   → list all dpa_documents rows (newest first).
// POST  multipart/form-data with: file, kind, title, version, signed_at,
//       signed_by                    → upload + insert metadata.

import { audit } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const ALLOWED_KIND = new Set(["dpa", "scc", "privacy", "tos", "other"]);

export async function GET(req: Request) {
  await requirePerm(req, "compliance.read");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }
  const { data, error } = await supa
    .from("dpa_documents")
    .select("id, kind, title, version, signed_at, signed_by, storage_path, created_at")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  // Sign every storage_path so the UI can render Download links.
  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await supa.storage
        .from("dpa-documents")
        .createSignedUrl(row.storage_path, 60 * 60); // 1h
      return { ...row, signed_url: signed?.signedUrl ?? null };
    })
  );

  return Response.json({ ok: true, rows });
}

export async function POST(req: Request) {
  await requirePerm(req, "compliance.action");
  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json({ ok: false, error: "Supabase not configured." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ ok: false, error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("file");
  const kind = String(form.get("kind") ?? "");
  const title = String(form.get("title") ?? "");
  const version = String(form.get("version") ?? "");
  const signedAt = form.get("signed_at") ? String(form.get("signed_at")) : null;
  const signedBy = form.get("signed_by") ? String(form.get("signed_by")) : null;

  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: "file is required" }, { status: 400 });
  }
  if (!ALLOWED_KIND.has(kind) || !title || !version) {
    return Response.json(
      { ok: false, error: "kind/title/version required (kind in dpa|scc|privacy|tos|other)" },
      { status: 400 }
    );
  }

  const id = `dpa-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const safeTitle = title.replace(/[^a-z0-9._-]/gi, "_");
  const storagePath = `${kind}/${id}-${safeTitle}.pdf`;

  return audit(
    "compliance.dpa.upload",
    { kind: "dpa", id },
    {
      before: null,
      after: { kind, title, version, signed_at: signedAt, signed_by: signedBy },
    },
    async () => {
      const buf = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supa.storage
        .from("dpa-documents")
        .upload(storagePath, buf, {
          contentType: file.type || "application/pdf",
          upsert: false,
        });
      if (upErr) {
        return Response.json({ ok: false, error: "Upload: " + upErr.message }, { status: 500 });
      }

      const { error: insErr } = await supa.from("dpa_documents").insert({
        id,
        kind,
        title,
        version,
        signed_at: signedAt,
        signed_by: signedBy,
        storage_path: storagePath,
      });
      if (insErr) {
        // Best-effort cleanup of the uploaded blob.
        await supa.storage.from("dpa-documents").remove([storagePath]);
        return Response.json({ ok: false, error: insErr.message }, { status: 500 });
      }
      return Response.json({ ok: true, id });
    }
  );
}
