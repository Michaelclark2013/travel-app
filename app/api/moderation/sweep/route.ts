// app/api/moderation/sweep/route.ts — Track 3 user-sweep endpoint.
//
// WHAT
//   POST { userId, kinds?: ('moment'|'comment')[] }
//     -> { ok, total, results: { kind, id, status, autoAction, scores }[] }
//
//   Loads the user's last 200 moments + comments, runs them through
//   /api/moderation/classify with bounded concurrency (cap 5 in flight at
//   once), and returns the aggregated outcomes. The sweep page UI streams
//   results back as they arrive; this endpoint just batches.
//
// AUTH
//   moderation.action — sweep is a forceful action even though it's
//   classify-only, because each pass costs Claude tokens.

import { classify, decide } from "@/lib/admin/moderation";
import { evaluate } from "@/lib/admin/patterns";
import { auditFireAndForget } from "@/lib/admin/audit";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const MAX_CONCURRENCY = 5;
const HARD_CAP_PER_KIND = 200;

type SweepRow = {
  kind: "moment" | "comment";
  id: string;
  status: "pending" | "approved" | "rejected" | "escalated";
  autoAction: "auto-approved" | "auto-rejected" | null;
  scores: Record<string, number> | null;
  pattern?: string;
  error?: string;
};

function newId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rnd = Array.from({ length: 8 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return `${prefix}-${ts}-${rnd}`;
}

export async function POST(req: Request) {
  await requirePerm(req, "moderation.action");

  let body: { userId?: string; kinds?: string[] };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const userId = body.userId ?? "";
  if (!userId) {
    return Response.json({ ok: false, error: "userId required." }, { status: 400 });
  }
  const kinds = (body.kinds ?? ["moment", "comment"]).filter(
    (k): k is "moment" | "comment" => k === "moment" || k === "comment"
  );

  const supa = getSupabaseAdmin();
  if (!supa) {
    return Response.json(
      { ok: false, error: "Supabase service role not configured." },
      { status: 503 }
    );
  }

  const tasks: Array<{
    kind: "moment" | "comment";
    id: string;
    text: string | null;
    image_url: string | null;
  }> = [];

  if (kinds.includes("moment")) {
    const { data: moms } = await supa
      .from("moments")
      .select("id, caption, image_url")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(HARD_CAP_PER_KIND);
    for (const m of moms ?? []) {
      tasks.push({
        kind: "moment",
        id: m.id,
        text: m.caption ?? null,
        image_url: m.image_url ?? null,
      });
    }
  }
  if (kinds.includes("comment")) {
    const { data: cs } = await supa
      .from("comments")
      .select("id, body")
      .eq("author_id", userId)
      .order("created_at", { ascending: false })
      .limit(HARD_CAP_PER_KIND);
    for (const c of cs ?? []) {
      tasks.push({
        kind: "comment",
        id: c.id,
        text: c.body ?? null,
        image_url: null,
      });
    }
  }

  auditFireAndForget(
    "moderation.sweep_started",
    { kind: "user", id: userId },
    { after: { count: tasks.length, kinds } }
  );

  // Bounded concurrency with a simple worker pool.
  const results: SweepRow[] = [];
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= tasks.length) return;
      const t = tasks[i];
      try {
        // Fast-path the deterministic deny-list to avoid token cost.
        const ban = await evaluate({
          content: t.text ?? undefined,
          image: t.image_url ?? undefined,
        });
        if (ban) {
          await writeQueueRow(supa, t.kind, t.id, {
            scores: { pattern_match: { kind: ban.kind, banId: ban.banId } },
            status: "rejected",
            autoAction: "auto-rejected",
          });
          await flipHidden(supa, t.kind, t.id);
          results.push({
            kind: t.kind,
            id: t.id,
            status: "rejected",
            autoAction: "auto-rejected",
            scores: null,
            pattern: ban.kind,
          });
          continue;
        }

        const r = await classify({
          kind: t.kind,
          text: t.text ?? undefined,
          image_url: t.image_url ?? undefined,
        });
        const dec = decide(r.scores);
        await writeQueueRow(supa, t.kind, t.id, {
          scores: r.scores as unknown as Record<string, unknown>,
          status: dec.status,
          autoAction: dec.autoAction,
        });
        if (dec.autoAction === "auto-rejected") {
          await flipHidden(supa, t.kind, t.id);
        }
        results.push({
          kind: t.kind,
          id: t.id,
          status: dec.status,
          autoAction: dec.autoAction,
          scores: r.scores as unknown as Record<string, number>,
        });
      } catch (e) {
        results.push({
          kind: t.kind,
          id: t.id,
          status: "pending",
          autoAction: null,
          scores: null,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const workers: Promise<void>[] = [];
  const concurrency = Math.min(MAX_CONCURRENCY, tasks.length);
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);

  auditFireAndForget(
    "moderation.sweep_completed",
    { kind: "user", id: userId },
    {
      after: {
        total: results.length,
        rejected: results.filter((r) => r.status === "rejected").length,
        pending: results.filter((r) => r.status === "pending").length,
      },
    }
  );

  return Response.json({ ok: true, total: results.length, results });
}

// ---------------------------------------------------------------------------
// Helpers — kept inline so the sweep route stays self-contained.
// ---------------------------------------------------------------------------
type Supa = ReturnType<typeof getSupabaseAdmin>;

async function writeQueueRow(
  supa: Supa,
  kind: string,
  id: string,
  row: {
    scores: Record<string, unknown>;
    status: "pending" | "approved" | "rejected" | "escalated";
    autoAction: "auto-approved" | "auto-rejected" | null;
  }
): Promise<void> {
  if (!supa) return;
  const now = new Date().toISOString();
  await supa.from("moderation_queue").insert({
    id: newId("mq"),
    target_kind: kind,
    target_id: id,
    scores: row.scores,
    status: row.status,
    auto_action: row.autoAction,
    decided_at: row.autoAction ? now : null,
    created_at: now,
  });
}

async function flipHidden(supa: Supa, kind: string, id: string): Promise<void> {
  if (!supa) return;
  const table = kind === "moment" ? "moments" : kind === "comment" ? "comments" : "dm_messages";
  await supa.from(table).update({ hidden_at: new Date().toISOString() }).eq("id", id);
}
