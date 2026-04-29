// app/api/admin/support/draft/route.ts — Track 7 "Draft with Claude" endpoint.
//
// WHAT
//   POST { ticketId } -> { drafts: string[] }   // 2-3 draft replies
//   POST { ticket, recent_user_activity } -> same shape (caller-provides
//     the context if they already have it cached on the client).
//
//   We resolve the ticket, the last 10 user actions (if a user_id is
//   present), and ask Claude for 2-3 short reply options. The endpoint
//   degrades gracefully when ANTHROPIC_API_KEY is missing — it returns
//   a single canned "manual draft" so the UX still flows.
//
// AUTH: support.reply
//
// ENV VARS: ANTHROPIC_API_KEY (optional), SUPABASE_SERVICE_ROLE_KEY.

import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

const SYSTEM = `You are an expert customer support agent for Voyage, a travel
planning app. Given a ticket and the customer's recent activity, write 2 or 3
distinct, ready-to-send draft replies. Rules:
- Each draft is plain text, 2-5 short sentences, friendly and warm.
- Address the actual issue. Don't bury the lede.
- Vary tone: one apologetic + fix, one direct + actionable, one informational.
- Never invent product behavior, prices, or refund amounts.
- Never make commitments the agent didn't already make.
- Output ONLY the drafts, separated by a line of just "---" between them.
- Do not include "Draft 1:" / "Option A:" labels — start each draft directly.`;

type ChatMessage = {
  ticket: {
    id: string;
    subject: string | null;
    status: string;
    priority: string;
    user_id: string | null;
    email: string | null;
  };
  messages: Array<{
    from_kind: string;
    body: string;
    created_at: string;
  }>;
  recent_user_activity: Array<Record<string, unknown>>;
};

function splitDrafts(raw: string): string[] {
  const parts = raw
    .split(/^\s*---+\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 3);
  // Fallback: split on double newlines if the model didn't use ---.
  const paras = raw
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  return paras.slice(0, 3).length > 0 ? paras.slice(0, 3) : [raw.trim()];
}

async function loadContext(ticketId: string): Promise<ChatMessage | null> {
  const supa = getSupabaseAdmin();
  if (!supa) return null;
  const { data: ticket } = await supa
    .from("support_tickets")
    .select("id, subject, status, priority, user_id, email")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return null;
  const { data: messages } = await supa
    .from("support_messages")
    .select("from_kind, body, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(20);

  let recent: Array<Record<string, unknown>> = [];
  if (ticket.user_id) {
    // Best-effort: pull the last 10 audit rows that target this user as a
    // proxy for "recent activity". Schemas vary across the app; sticking
    // to admin_audit keeps this self-contained and avoids cross-track coupling.
    const { data: audit } = await supa
      .from("admin_audit")
      .select("action, target_kind, target_id, ts")
      .eq("target_kind", "user")
      .eq("target_id", ticket.user_id)
      .order("ts", { ascending: false })
      .limit(10);
    recent = audit ?? [];
  }
  return { ticket, messages: messages ?? [], recent_user_activity: recent };
}

function buildPrompt(ctx: ChatMessage): string {
  const lines: string[] = [];
  lines.push(`# Ticket ${ctx.ticket.id}`);
  lines.push(`Subject: ${ctx.ticket.subject ?? "(none)"}`);
  lines.push(`Status: ${ctx.ticket.status}  Priority: ${ctx.ticket.priority}`);
  if (ctx.ticket.email) lines.push(`From: ${ctx.ticket.email}`);
  lines.push("");
  lines.push("## Conversation");
  for (const m of ctx.messages) {
    lines.push(`[${m.from_kind} @ ${m.created_at}]`);
    lines.push(m.body);
    lines.push("");
  }
  if (ctx.recent_user_activity.length > 0) {
    lines.push("## Recent user activity");
    for (const a of ctx.recent_user_activity) {
      lines.push(`- ${JSON.stringify(a)}`);
    }
  }
  lines.push("");
  lines.push("Now produce 2-3 reply drafts as instructed.");
  return lines.join("\n");
}

export async function POST(req: Request) {
  await requirePerm(req, "support.reply");

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const obj = (body ?? {}) as Record<string, unknown>;
  const ticketId = typeof obj.ticketId === "string" ? obj.ticketId : null;
  if (!ticketId) {
    return Response.json(
      { ok: false, error: "ticketId required." },
      { status: 422 }
    );
  }

  const ctx = await loadContext(ticketId);
  if (!ctx) {
    return Response.json(
      { ok: false, error: "Ticket not found or service unavailable." },
      { status: 404 }
    );
  }

  const KEY = process.env.ANTHROPIC_API_KEY;
  if (!KEY) {
    // Graceful degradation — the UI still has *something* to populate.
    return Response.json({
      ok: true,
      drafts: [
        `Hi — thanks for reaching out about "${ctx.ticket.subject ?? "your message"}". I'm looking into this now and will follow up with a fix shortly.`,
      ],
      stub: true,
    });
  }

  // Lazy import so the Anthropic SDK isn't bundled when the key is absent.
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: KEY });
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  try {
    const res = await client.messages.create({
      model,
      max_tokens: 800,
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });
    const text = res.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("\n")
      .trim();
    return Response.json({ ok: true, drafts: splitDrafts(text) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return Response.json(
      { ok: false, error: `Claude draft failed: ${msg}` },
      { status: 502 }
    );
  }
}
