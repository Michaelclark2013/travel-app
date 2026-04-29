// app/api/admin/search/semantic/route.ts — Track 9 semantic search.
//
// WHAT
//   GET /api/admin/search/semantic?q=...&kinds=moments,trips&limit=20
//     Embeds the query, runs a pgvector cosine search, and joins back to the
//     source rows so the UI can render snippets + deep links.
//
// AUTH
//   users.read — same baseline read permission the existing /admin/users
//   surface uses.
//
// SHAPE
//   { ok: true, hits: [{ kind, id, score, excerpt, link, snippet }] }
//
// ENV VARS
//   SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (optional)

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { searchSemantic, type SemanticHit } from "@/lib/admin/embeddings";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const ALLOWED_KINDS = new Set(["moments", "trips", "comments"]);

export async function GET(req: Request) {
  await requirePerm(req, "users.read");

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const kindsParam = url.searchParams.get("kinds");
  const limit = Math.min(
    Math.max(1, Number(url.searchParams.get("limit") ?? DEFAULT_LIMIT) || DEFAULT_LIMIT),
    MAX_LIMIT
  );

  if (!q) {
    return Response.json({ ok: true, hits: [] });
  }

  const kinds = kindsParam
    ? kindsParam
        .split(",")
        .map((k) => k.trim())
        .filter((k) => ALLOWED_KINDS.has(k))
    : null;

  const hits: SemanticHit[] = await searchSemantic(q, kinds, limit);

  // Join back to the source for snippet + link. We do this in TS rather than
  // SQL to keep the RPC small and the per-kind link template close to the
  // route layout (Track 2 owns /admin/users; we just point at it).
  const supa = getSupabaseAdmin();
  const enriched = await Promise.all(
    hits.map(async (h) => {
      const base = {
        kind: h.kind,
        id: h.id,
        score: h.score,
        excerpt: h.excerpt ?? "",
      };
      if (!supa) return { ...base, link: linkFor(h.kind, h.id), snippet: h.excerpt ?? "" };
      try {
        if (h.kind === "moments") {
          const { data } = await supa
            .from("moments")
            .select("user_id,caption,location")
            .eq("id", h.id)
            .maybeSingle();
          return {
            ...base,
            link: data?.user_id ? `/admin/users/${data.user_id}` : "",
            snippet: data?.caption ?? data?.location ?? h.excerpt ?? "",
          };
        }
        if (h.kind === "trips") {
          const { data } = await supa
            .from("trips")
            .select("user_id,destination,origin")
            .eq("id", h.id)
            .maybeSingle();
          return {
            ...base,
            link: data?.user_id ? `/admin/users/${data.user_id}` : "",
            snippet: data ? `${data.origin} → ${data.destination}` : h.excerpt ?? "",
          };
        }
        if (h.kind === "comments") {
          const { data } = await supa
            .from("comments")
            .select("author_id,body")
            .eq("id", h.id)
            .maybeSingle();
          return {
            ...base,
            link: data?.author_id ? `/admin/users/${data.author_id}` : "",
            snippet: data?.body ?? h.excerpt ?? "",
          };
        }
      } catch {
        // fallthrough — link/snippet stay empty
      }
      return { ...base, link: linkFor(h.kind, h.id), snippet: h.excerpt ?? "" };
    })
  );

  return Response.json({ ok: true, hits: enriched });
}

function linkFor(kind: string, id: string): string {
  if (kind === "moments") return `/m/${id}`;
  if (kind === "trips") return `/trips/${id}`;
  return "";
}
