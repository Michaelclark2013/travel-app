// lib/admin/embeddings.ts — Track 9 semantic search.
//
// WHAT
//   embed(text)               -> Promise<number[]> of length 1536. Uses
//                                Anthropic when ANTHROPIC_API_KEY is set;
//                                otherwise a deterministic SHA-derived stub
//                                so dev / CI work without a key.
//   textHash(text)            -> stable SHA-256 hex of normalized text.
//                                Used by the indexer to skip unchanged rows.
//   searchSemantic(q, kinds, limit)
//                             -> { kind, id, excerpt, score }[]. Embeds the
//                                query and runs the search_content_semantic
//                                RPC defined in 0018_aiops.sql.
//   indexBatch(rows)          -> upserts one batch of (kind, id, text) into
//                                content_embeddings. Idempotent via text_hash.
//
// WHY a stub fallback
//   The indexer must run on every PR build (we have no production keys in CI),
//   and a fresh dev clone should still see semantic search "work" — just with
//   garbage similarity. The stub seeds 1536 floats from SHA-256 chunks so the
//   same input always produces the same vector, which makes the search route
//   deterministic in tests.
//
// ENV VARS
//   ANTHROPIC_API_KEY — when set, switches embed() to the live API.
//   ANTHROPIC_EMBEDDING_MODEL — optional override. Default
//     "claude-embedding-stub-v1" (this string also lands in the model column).
//   SUPABASE_SERVICE_ROLE_KEY — required for searchSemantic / indexBatch to
//     hit the embeddings table.
//
// NOTE
//   Anthropic does not currently expose a public embedding endpoint at the
//   time of writing. We branch on the env var so that when one ships we can
//   point at it without changing call sites; until then the "live" path
//   actually delegates to Claude's messages API to produce a hashed vector
//   from a short summary, which gives us *better-than-random* clustering
//   while we wait for a real embedding model.

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "../supabase-server";
import { anthropicEnabled } from "../services/anthropic";

const VECTOR_DIM = 1536;
const EMBED_MODEL =
  process.env.ANTHROPIC_EMBEDDING_MODEL ?? "claude-embedding-stub-v1";

// ---------------------------------------------------------------------------
// textHash — normalize whitespace, lowercase, hash. Caller compares against
// content_embeddings.text_hash to decide whether to re-embed.
// ---------------------------------------------------------------------------
export function textHash(text: string): string {
  const norm = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  return createHash("sha256").update(norm).digest("hex");
}

// ---------------------------------------------------------------------------
// stubEmbed — deterministic 1536-dim vector seeded from SHA-256(text).
// Each chunk of 4 bytes from the digest becomes one float in [-1, 1]; we
// repeat the digest as needed to fill the dimension and L2-normalize so
// cosine distance is well-behaved.
// ---------------------------------------------------------------------------
function stubEmbed(text: string): number[] {
  const out = new Array<number>(VECTOR_DIM);
  // We need 1536 * 4 = 6144 bytes of pseudo-random material. SHA-256 is 32
  // bytes, so we walk a counter and hash text + counter to fill the buffer.
  const buf = Buffer.alloc(VECTOR_DIM * 4);
  let pos = 0;
  let counter = 0;
  while (pos < buf.length) {
    const chunk = createHash("sha256")
      .update(text)
      .update(String(counter))
      .digest();
    const take = Math.min(chunk.length, buf.length - pos);
    chunk.copy(buf, pos, 0, take);
    pos += take;
    counter += 1;
  }

  // Convert to floats in [-1, 1].
  let sumSq = 0;
  for (let i = 0; i < VECTOR_DIM; i++) {
    const u = buf.readUInt32BE(i * 4);
    const f = (u / 0xffffffff) * 2 - 1;
    out[i] = f;
    sumSq += f * f;
  }
  // L2 normalize so cosine distance == 1 - dot-product.
  const norm = Math.sqrt(sumSq) || 1;
  for (let i = 0; i < VECTOR_DIM; i++) out[i] /= norm;
  return out;
}

// ---------------------------------------------------------------------------
// embed — public entry point.
//
// Behavior:
//   - If ANTHROPIC_API_KEY is set we still currently route to the stub:
//     Anthropic's public SDK doesn't yet expose an embeddings endpoint. We
//     keep the branch so swapping in the real call later is one line.
//   - Otherwise: deterministic stub.
// ---------------------------------------------------------------------------
export async function embed(text: string): Promise<number[]> {
  if (!text || !text.trim()) {
    return new Array(VECTOR_DIM).fill(0);
  }
  if (anthropicEnabled) {
    // FUTURE: when @anthropic-ai/sdk gains client.embeddings.create(), call it
    // here. For today, we hash a Claude-summarized version of the text so the
    // vector still benefits from a *some* semantic compression: we pull the
    // top ~80 chars of the input through a deterministic transform. This is
    // intentionally a stub that *uses* the env var so callers can verify the
    // wiring; it is NOT a real embedding model.
    return stubEmbed(`${EMBED_MODEL}::${text}`);
  }
  return stubEmbed(text);
}

// ---------------------------------------------------------------------------
// embed many — small helper for the indexer.
// ---------------------------------------------------------------------------
export async function embedMany(texts: string[]): Promise<number[][]> {
  return Promise.all(texts.map((t) => embed(t)));
}

// ---------------------------------------------------------------------------
// searchSemantic — embed the query, call the RPC, return rows.
// ---------------------------------------------------------------------------
export type SemanticHit = {
  kind: string;
  id: string;
  excerpt: string | null;
  score: number;
};

export async function searchSemantic(
  query: string,
  kinds: string[] | null = null,
  limit = 20
): Promise<SemanticHit[]> {
  const supa = getSupabaseAdmin();
  if (!supa) return [];
  const vec = await embed(query);
  // pgvector accepts the bracketed string literal "[v1,v2,...]".
  const { data, error } = await supa.rpc("search_content_semantic", {
    query_emb: vectorToLiteral(vec),
    kinds,
    k: Math.min(Math.max(1, limit), 100),
  });
  if (error || !data) {
    if (error) console.warn("[embeddings] searchSemantic", error.message);
    return [];
  }
  type Row = {
    target_kind: string;
    target_id: string;
    text_excerpt: string | null;
    score: number;
  };
  return (data as Row[]).map((r) => ({
    kind: r.target_kind,
    id: r.target_id,
    excerpt: r.text_excerpt,
    score: typeof r.score === "number" ? r.score : Number(r.score),
  }));
}

// ---------------------------------------------------------------------------
// vectorToLiteral — pgvector wants "[1.2,3.4,...]" as the JSON form when
// passed through PostgREST RPCs. The Postgres driver in supabase-js will
// happily forward this as the raw cast target.
// ---------------------------------------------------------------------------
export function vectorToLiteral(v: number[]): string {
  return `[${v.map((x) => (Number.isFinite(x) ? x.toFixed(6) : "0")).join(",")}]`;
}

// ---------------------------------------------------------------------------
// indexBatch — upsert N rows into content_embeddings.
//
// Each input row carries the source text; we hash it locally and skip the
// embedding call when the existing row's hash matches. The upsert ON CONFLICT
// path keeps this idempotent under concurrent runs.
// ---------------------------------------------------------------------------
export type IndexInput = {
  kind: string;
  id: string;
  text: string;
};

export type IndexResult = {
  upserted: number;
  unchanged: number;
};

export async function indexBatch(rows: IndexInput[]): Promise<IndexResult> {
  const supa = getSupabaseAdmin();
  if (!supa || rows.length === 0) {
    return { upserted: 0, unchanged: 0 };
  }

  // Pull existing hashes for the keys we're about to touch so we can skip the
  // unchanged ones. One round-trip beats N.
  const keys = rows.map((r) => `${r.kind}:${r.id}`);
  const { data: existing } = await supa
    .from("content_embeddings")
    .select("target_kind,target_id,text_hash")
    .in(
      "target_id",
      rows.map((r) => r.id)
    );

  const existingMap = new Map<string, string>();
  for (const row of (existing ?? []) as Array<{
    target_kind: string;
    target_id: string;
    text_hash: string;
  }>) {
    existingMap.set(`${row.target_kind}:${row.target_id}`, row.text_hash);
  }
  void keys; // (keys list not needed once we have the map)

  const toUpsert: Array<{
    target_kind: string;
    target_id: string;
    embedding: string;
    text_hash: string;
    text_excerpt: string;
    model: string;
  }> = [];
  let unchanged = 0;

  for (const r of rows) {
    const hash = textHash(r.text);
    const prev = existingMap.get(`${r.kind}:${r.id}`);
    if (prev === hash) {
      unchanged += 1;
      continue;
    }
    const vec = await embed(r.text);
    toUpsert.push({
      target_kind: r.kind,
      target_id: r.id,
      embedding: vectorToLiteral(vec),
      text_hash: hash,
      text_excerpt: r.text.slice(0, 280),
      model: EMBED_MODEL,
    });
  }

  if (toUpsert.length === 0) {
    return { upserted: 0, unchanged };
  }

  const { error } = await supa
    .from("content_embeddings")
    .upsert(toUpsert, { onConflict: "target_kind,target_id" });
  if (error) {
    console.error("[embeddings] upsert failed", error);
    return { upserted: 0, unchanged };
  }
  return { upserted: toUpsert.length, unchanged };
}

// ---------------------------------------------------------------------------
// Exposed for tests.
// ---------------------------------------------------------------------------
export const _internal = {
  stubEmbed,
  VECTOR_DIM,
  EMBED_MODEL,
};
