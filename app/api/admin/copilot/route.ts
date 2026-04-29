// app/api/admin/copilot/route.ts — Track 9 embedded admin copilot.
//
// WHAT
//   POST /api/admin/copilot
//     body: { messages: [{ role, content }], context?: { kind, id, ...} }
//     -> { reply: string, toolUses: [{ name, input, result }] }
//
//   The copilot is read-only by construction:
//     - The system prompt explicitly forbids destructive actions.
//     - The only tool is query_supabase(rpc_name, params), where rpc_name
//       MUST appear in COPILOT_RPC_WHITELIST.
//     - Every RPC in the whitelist is a SECURITY-DEFINER, language-sql,
//       STABLE function (see 0018_aiops.sql) — Postgres prevents writes.
//
// AUTH
//   users.read — same baseline as /admin/users. The copilot is for ops/ICs
//   reviewing accounts, not external customers.
//
// STREAMING
//   To keep the wire small we run a single non-streaming call. Tool-use loop
//   runs until Claude returns end_turn or 4 iterations, whichever first.
//
// ENV VARS
//   ANTHROPIC_API_KEY — required for live calls; absent => stub.
//   SUPABASE_SERVICE_ROLE_KEY — required for the query_supabase tool.

import Anthropic from "@anthropic-ai/sdk";
import { requirePerm } from "@/lib/admin/rbac";
import { getSupabaseAdmin } from "@/lib/supabase-server";

// ---------------------------------------------------------------------------
// COPILOT_RPC_WHITELIST — every RPC the copilot can call. Each MUST be
// read-only / stable. Keep this list small and audited; expansions are a
// review-required change. The names match functions in 0018_aiops.sql.
// ---------------------------------------------------------------------------
export const COPILOT_RPC_WHITELIST = [
  // Track 9 owned (defined in 0018_aiops.sql)
  "search_content_semantic",
  "admin_user_summary",
  "admin_recent_trips",
  "admin_recent_moments",
  "admin_event_history",
  // ---------------------------------------------------------------------
  // The remaining slots are RESERVED for sister tracks. They MUST be
  // SQL/STABLE functions defined in their own migrations. The route
  // accepts the names so the UI can autocomplete; if the function does
  // not exist the RPC will error, which is fine.
  // ---------------------------------------------------------------------
  "admin_active_trip_count",
  "admin_revenue_today",
  "admin_revenue_window",
  "admin_signups_window",
  "admin_top_destinations",
  "admin_dau_window",
  "admin_wau_window",
  "admin_mau_window",
  "admin_funnel_today",
  "admin_funnel_window",
  "admin_referral_top",
  "admin_churn_window",
  "admin_open_tickets_count",
  "admin_top_complaints",
  "admin_billing_summary",
  "admin_billing_history",
  "admin_recent_logins",
  "admin_recent_audit",
  "admin_role_distribution",
  "admin_pending_invites",
  "admin_flag_state",
  "admin_kill_switch_state",
  "admin_storage_usage",
  "admin_anomaly_summary",
  "admin_moderation_queue_size",
] as const;

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const client = KEY ? new Anthropic({ apiKey: KEY }) : null;

const SYSTEM = `You are Voyage Copilot, an embedded AI assistant for Voyage's admin dashboard.

You are READ-ONLY. You CANNOT modify, delete, suspend, refund, or otherwise mutate
any data. Your only data tool is \`query_supabase\` which is restricted to a fixed
whitelist of stable, side-effect-free RPCs.

Style:
- Concise, factual, no preamble.
- When you need data, call \`query_supabase\`. Do NOT invent numbers.
- After a tool returns, summarize the answer in 1-3 sentences plus a small
  bullet list when there are multiple data points.
- If the user asks you to take a destructive action (suspend, delete, refund,
  ban, edit), refuse politely and explain that you are read-only. Suggest the
  exact admin route (e.g. /admin/users/[id]) where they can do it themselves.

When given a \`context\` object describing the page the admin is looking at,
default your queries to that subject (e.g. user_id) unless the prompt clearly
asks about something else.`;

const COPILOT_TOOLS = [
  {
    name: "query_supabase",
    description:
      "Run a read-only Postgres function. The rpc_name MUST be one of the whitelisted RPCs. params is a JSON object passed as the function arguments.",
    input_schema: {
      type: "object",
      properties: {
        rpc_name: {
          type: "string",
          enum: COPILOT_RPC_WHITELIST as unknown as string[],
        },
        params: {
          type: "object",
          additionalProperties: true,
        },
      },
      required: ["rpc_name"],
    },
  },
] as const;

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  await requirePerm(req, "users.read");

  let body: {
    messages: ChatMessage[];
    context?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const context = body.context ?? {};

  if (!client) {
    return Response.json({
      ok: true,
      reply:
        "Copilot offline (no ANTHROPIC_API_KEY set). I'd answer your question by calling read-only RPCs from the whitelist; configure the key on Vercel to switch on.",
      toolUses: [],
    });
  }

  // ---- Tool-use loop ------------------------------------------------------
  // We let Claude call query_supabase up to 4 times before returning.
  const sdkMessages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: `Page context: ${JSON.stringify(context)}\n\n(End of context.)`,
    },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const toolUses: Array<{ name: string; input: unknown; result: unknown }> = [];
  let reply = "";

  for (let iter = 0; iter < 4; iter++) {
    const res: Anthropic.Message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM,
      tools: COPILOT_TOOLS as unknown as Anthropic.Tool[],
      messages: sdkMessages,
    });

    let pendingToolUse:
      | { id: string; name: string; input: Record<string, unknown> }
      | null = null;

    for (const block of res.content) {
      if (block.type === "text") {
        reply += block.text;
      } else if (block.type === "tool_use") {
        pendingToolUse = {
          id: block.id,
          name: block.name,
          input: (block.input ?? {}) as Record<string, unknown>,
        };
      }
    }

    if (res.stop_reason === "end_turn" || !pendingToolUse) {
      break;
    }

    // Execute the tool call.
    const toolResult = await runCopilotTool(pendingToolUse.name, pendingToolUse.input);
    toolUses.push({
      name: pendingToolUse.name,
      input: pendingToolUse.input,
      result: toolResult,
    });

    sdkMessages.push({
      role: "assistant",
      content: res.content as Anthropic.ContentBlock[],
    });
    sdkMessages.push({
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: pendingToolUse.id,
          content: JSON.stringify(toolResult).slice(0, 8000),
        },
      ],
    });
  }

  return Response.json({ ok: true, reply: reply.trim(), toolUses });
}

// ---------------------------------------------------------------------------
// runCopilotTool — execute a whitelisted Supabase RPC. Returns either the
// rows or an { error } object so Claude can recover (e.g. by trying a
// different RPC).
// ---------------------------------------------------------------------------
async function runCopilotTool(
  name: string,
  input: Record<string, unknown>
): Promise<unknown> {
  if (name !== "query_supabase") {
    return { error: `Unknown tool ${name}` };
  }
  const rpc = String(input.rpc_name ?? "");
  if (!(COPILOT_RPC_WHITELIST as readonly string[]).includes(rpc)) {
    return { error: `RPC '${rpc}' is not whitelisted.` };
  }
  const supa = getSupabaseAdmin();
  if (!supa) {
    return { error: "Supabase service role not configured." };
  }
  const params = (input.params as Record<string, unknown>) ?? {};
  const { data, error } = await supa.rpc(rpc, params);
  if (error) {
    return { error: error.message };
  }
  return { rows: data };
}
