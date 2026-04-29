// lib/admin/moderation.ts — Track 3 Claude-powered classifier.
//
// WHAT
//   classify({ kind, text?, image_url? }) — calls Claude with a structured
//   `record_classification` tool and returns the parsed scores + flags.
//   Re-classifying the same content is free: results are memoized in-process
//   on a content hash key for the lifetime of the serverless function.
//
//   CATEGORIES is the canonical category list the rest of the pipeline reads.
//
// WHY tool-use over JSON output
//   Claude's tool calls are strictly typed against the schema we send. The
//   alternative — "respond with JSON between fences" — fails open when the
//   model reasons in prose first. Forcing the response through a tool means
//   we get a typed object or nothing.
//
// CACHING
//   - In-process LRU keyed by SHA-1(canonicalize(text) + "|" + image_url).
//     Capped at 200 entries; oldest evicted. Survives only the warm Lambda;
//     that's fine — repeated content within a single sweep gets the benefit
//     and a cold start re-pays once.
//
// ENV VARS
//   ANTHROPIC_API_KEY      — required for live classification
//   ANTHROPIC_MODEL        — optional override (default claude-sonnet-4-6)

import Anthropic from "@anthropic-ai/sdk";

// ---------------------------------------------------------------------------
// Constants — categories + thresholds.
// ---------------------------------------------------------------------------
export const CATEGORIES = [
  "spam",
  "harassment",
  "sexual",
  "violence",
  "self_harm",
  "off_platform",
  "geo_pii",
] as const;

export type Category = (typeof CATEGORIES)[number];

// Categories where a high score should auto-reject without admin review.
// `off_platform` and `geo_pii` are surfaced for human judgment instead.
export const HARD_CATEGORIES: Category[] = [
  "harassment",
  "sexual",
  "violence",
  "self_harm",
];

export type ClassifyInput = {
  kind: string;            // 'moment' | 'comment' | 'dm' | …
  text?: string;
  image_url?: string;
};

export type ClassifyResult = {
  scores: Record<Category, number>;  // 0..1 per category
  flags: string[];                   // free-form short tags Claude chooses
};

// ---------------------------------------------------------------------------
// Anthropic client — reuse the wrapper's env conventions but instantiate our
// own client because lib/services/anthropic.ts is wired for the travel-agent
// system prompt + tool list, and we want a separate "moderation classifier"
// invocation that doesn't share that conversation context.
// ---------------------------------------------------------------------------
const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const client = KEY ? new Anthropic({ apiKey: KEY }) : null;
export const moderationEnabled = !!client;

// ---------------------------------------------------------------------------
// In-process cache — small LRU. Map preserves insertion order so we evict
// from the front when full.
// ---------------------------------------------------------------------------
const CACHE_MAX = 200;
const cache = new Map<string, ClassifyResult>();

async function contentKey(input: ClassifyInput): Promise<string> {
  const canon = (input.text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  const buf = new TextEncoder().encode(`${canon}|${input.image_url ?? ""}`);
  const digest = await crypto.subtle.digest("SHA-1", buf);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return `${input.kind}:${hex}`;
}

function cacheGet(k: string): ClassifyResult | undefined {
  const v = cache.get(k);
  if (v) {
    // Refresh recency.
    cache.delete(k);
    cache.set(k, v);
  }
  return v;
}

function cacheSet(k: string, v: ClassifyResult): void {
  cache.set(k, v);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

// ---------------------------------------------------------------------------
// The tool we ask Claude to call. The schema mirrors ClassifyResult so we
// can pull the input straight off the tool_use block.
// ---------------------------------------------------------------------------
const RECORD_TOOL = {
  name: "record_classification",
  description:
    "Record the moderation scores for the user-generated content. ALWAYS call this exactly once with all categories scored from 0.0 (clearly safe) to 1.0 (clearly violating).",
  input_schema: {
    type: "object",
    properties: {
      scores: {
        type: "object",
        properties: Object.fromEntries(
          CATEGORIES.map((c) => [
            c,
            {
              type: "number",
              minimum: 0,
              maximum: 1,
              description: `0..1 confidence the content violates the ${c} policy`,
            },
          ])
        ),
        required: [...CATEGORIES],
      },
      flags: {
        type: "array",
        items: { type: "string" },
        description:
          "Short tags (snake_case) for any specific violations seen. Empty array if none.",
      },
    },
    required: ["scores", "flags"],
  },
} as const;

const SYSTEM = `You are Voyage's content moderation classifier. You see
user-generated content from a social travel app: photo captions ("moments"),
comments on those photos, and DMs between users.

Your job: score every category 0..1, then call record_classification with
ALL categories present (use 0 if irrelevant) plus an array of short flags.

Categories:
- spam: scams, link spam, follow-spam, repeated promotional copy.
- harassment: targeted insults, slurs, doxxing, threats.
- sexual: explicit sexual content (nudity, sex acts, sexual solicitation).
- violence: graphic violence, gore, threats of physical harm.
- self_harm: encouraging or describing self-harm or suicide.
- off_platform: tries to redirect to outside services (Telegram, WhatsApp
  contact info, "DM me on …") in a way that suggests evading moderation.
- geo_pii: real-time location of someone other than the poster (e.g. "X is
  staying at the Hilton on 5th right now").

Scoring rubric:
- 0.0–0.3: clearly safe / not in this category
- 0.3–0.5: borderline; reasonable people disagree
- 0.5–0.85: likely violating; needs human review
- 0.85+: clearly violating; safe to auto-action

Be conservative on "harassment" — sarcasm and banter between mutuals is
common in travel content. Be aggressive on "self_harm" — we'd rather
escalate a false positive than miss a true one.

You MUST respond by calling the record_classification tool. Do not respond
in plain text.`;

// ---------------------------------------------------------------------------
// Public: classify.
// ---------------------------------------------------------------------------
export async function classify(input: ClassifyInput): Promise<ClassifyResult> {
  // Heuristic fallback when the API key isn't set — keeps the pipeline
  // testable without hitting an external service. The fallback always
  // returns low scores so content is auto-approved in dev unless a pattern
  // ban catches it.
  if (!client) {
    return mockClassify(input);
  }

  const key = await contentKey(input);
  const hit = cacheGet(key);
  if (hit) return hit;

  // Build the user message. We send text + an image block when available;
  // Claude can read the image directly via URL.
  type Block =
    | { type: "text"; text: string }
    | {
        type: "image";
        source: { type: "url"; url: string };
      };
  const userBlocks: Block[] = [];
  userBlocks.push({
    type: "text",
    text: `Content kind: ${input.kind}\n\nTEXT:\n${input.text ?? "(none)"}`,
  });
  if (input.image_url) {
    userBlocks.push({
      type: "image",
      source: { type: "url", url: input.image_url },
    });
  }

  let result: ClassifyResult | null = null;
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM,
      tools: [RECORD_TOOL] as unknown as Anthropic.Tool[],
      tool_choice: { type: "tool", name: "record_classification" },
      messages: [
        {
          role: "user",
          content: userBlocks as unknown as Anthropic.MessageParam["content"],
        },
      ],
    });

    for (const block of res.content) {
      if (block.type === "tool_use" && block.name === "record_classification") {
        const parsed = parseToolInput(block.input);
        if (parsed) {
          result = parsed;
          break;
        }
      }
    }
  } catch (err) {
    console.error("[moderation.classify] anthropic call failed", err);
  }

  if (!result) {
    // Fall back to "uncertain" — pushes the row into the pending queue
    // for a human rather than auto-approving on a transient API failure.
    result = {
      scores: {
        spam: 0.5,
        harassment: 0.5,
        sexual: 0.5,
        violence: 0.5,
        self_harm: 0.5,
        off_platform: 0.5,
        geo_pii: 0.5,
      },
      flags: ["classifier_error"],
    };
  }

  cacheSet(key, result);
  return result;
}

// ---------------------------------------------------------------------------
// Internal — coerce Claude's tool input into a ClassifyResult, defensively.
// ---------------------------------------------------------------------------
function parseToolInput(input: unknown): ClassifyResult | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const rawScores = obj.scores;
  const rawFlags = obj.flags;
  if (!rawScores || typeof rawScores !== "object") return null;
  const scores = {} as Record<Category, number>;
  for (const c of CATEGORIES) {
    const v = (rawScores as Record<string, unknown>)[c];
    scores[c] = typeof v === "number" && v >= 0 && v <= 1 ? v : 0;
  }
  const flags = Array.isArray(rawFlags)
    ? (rawFlags.filter((f) => typeof f === "string") as string[])
    : [];
  return { scores, flags };
}

// ---------------------------------------------------------------------------
// Mock — deterministic-ish heuristic for dev / tests when no API key is set.
// Scans for a handful of obvious tells; mostly returns low scores.
// ---------------------------------------------------------------------------
function mockClassify(input: ClassifyInput): ClassifyResult {
  const t = (input.text ?? "").toLowerCase();
  const scores: Record<Category, number> = {
    spam: /\b(buy now|click here|free money|telegram\.me|t\.me\/)/.test(t) ? 0.9 : 0.05,
    harassment: /\b(idiot|loser|kill yourself|kys)\b/.test(t) ? 0.9 : 0.05,
    sexual: /\b(nude|nsfw|onlyfans)\b/.test(t) ? 0.9 : 0.02,
    violence: /\b(murder|behead|bloody)\b/.test(t) ? 0.9 : 0.02,
    self_harm: /\b(kill myself|cutting|suicide)\b/.test(t) ? 0.9 : 0.02,
    off_platform: /(whatsapp|telegram|dm me on)/.test(t) ? 0.7 : 0.05,
    geo_pii: /\b(staying at|right now at)\b/.test(t) ? 0.4 : 0.05,
  };
  const flags: string[] = [];
  for (const c of CATEGORIES) if (scores[c] >= 0.85) flags.push(`mock_${c}`);
  return { scores, flags };
}

// ---------------------------------------------------------------------------
// Decision helper — given a classify result, return the auto-action and the
// resulting moderation_queue.status. Centralized so the API endpoint and the
// sweep tool agree on thresholds.
// ---------------------------------------------------------------------------
export type Decision = {
  status: "pending" | "approved" | "rejected" | "escalated";
  autoAction: "auto-approved" | "auto-rejected" | null;
  trippedCategory: Category | null;
};

const HARD_THRESHOLD = 0.85;
const REVIEW_THRESHOLD = 0.5;

export function decide(scores: Record<Category, number>): Decision {
  // Find the worst hard-category score.
  let worstHard: { c: Category; v: number } | null = null;
  for (const c of HARD_CATEGORIES) {
    const v = scores[c] ?? 0;
    if (!worstHard || v > worstHard.v) worstHard = { c, v };
  }
  if (worstHard && worstHard.v >= HARD_THRESHOLD) {
    return {
      status: "rejected",
      autoAction: "auto-rejected",
      trippedCategory: worstHard.c,
    };
  }

  // Find the worst score across ALL categories (incl. soft ones) to decide
  // whether a human needs to look at it.
  let worstAny: { c: Category; v: number } | null = null;
  for (const c of CATEGORIES) {
    const v = scores[c] ?? 0;
    if (!worstAny || v > worstAny.v) worstAny = { c, v };
  }
  if (worstAny && worstAny.v >= REVIEW_THRESHOLD) {
    return {
      status: "pending",
      autoAction: null,
      trippedCategory: worstAny.c,
    };
  }

  return { status: "approved", autoAction: "auto-approved", trippedCategory: null };
}
