// Server-side vision mode. Takes an image + structured trip context, returns
// a parsed JSON describing what was detected and a list of suggested actions
// the UI can offer to apply.

import Anthropic from "@anthropic-ai/sdk";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const client = KEY ? new Anthropic({ apiKey: KEY }) : null;
export const visionEnabled = !!client;

export type DetectedKind =
  | "flight-confirmation"
  | "hotel-confirmation"
  | "rental-car"
  | "restaurant-reservation"
  | "ticket-or-event"
  | "boarding-pass"
  | "receipt"
  | "menu"
  | "schedule-or-hours"
  | "weather-or-advisory"
  | "map-or-place"
  | "message-or-recommendation"
  | "other";

export type ExtractedFact = { label: string; value: string };

export type Suggestion = {
  kind:
    | "add-itinerary-item"
    | "add-wallet-item"
    | "flag-conflict"
    | "update-budget"
    | "add-stop"
    | "update-preferences"
    | "info"
    | "warn";
  title: string;
  body: string;
  /** Optional structured payload the UI can apply. */
  payload?: Record<string, unknown>;
};

export type VisionResult = {
  detected: {
    kind: DetectedKind;
    confidence: number; // 0–1
    summary: string;
    facts: ExtractedFact[];
  };
  suggestions: Suggestion[];
  source: "claude" | "mock";
};

const SYSTEM = `You are Voyage's vision agent. The user uploaded a screenshot
related to their trip. Look at it carefully and respond ONLY with a single JSON
object matching this exact schema:

{
  "detected": {
    "kind": "flight-confirmation" | "hotel-confirmation" | "rental-car" | "restaurant-reservation" | "ticket-or-event" | "boarding-pass" | "receipt" | "menu" | "schedule-or-hours" | "weather-or-advisory" | "map-or-place" | "message-or-recommendation" | "other",
    "confidence": <0..1>,
    "summary": "<one sentence plain-English description>",
    "facts": [{"label":"...", "value":"..."}, ...]
  },
  "suggestions": [
    {
      "kind": "add-itinerary-item" | "add-wallet-item" | "flag-conflict" | "update-budget" | "add-stop" | "update-preferences" | "info" | "warn",
      "title": "<short imperative title>",
      "body": "<one-sentence rationale>",
      "payload": { ... optional structured data the app can apply ... }
    }
  ]
}

Rules:
- For confirmations / tickets / boarding passes: extract booking ref,
  date/time, cost, vendor, addresses. Suggest "add-itinerary-item" + an
  "add-wallet-item" suggestion with payload {kind, vendor, date, code}.
- For schedule / hours / closures: emit a "flag-conflict" suggestion if it
  could affect the trip dates we were given.
- For weather/advisories: emit a "warn" suggestion with body explaining the
  impact, and an "update-preferences" suggestion if relevant (rain → indoor
  alternatives).
- For maps / places: emit "add-itinerary-item" with location name + lat/lng
  if visible.
- For messages / friend recs: emit "info" suggestions per place mentioned.
- ALWAYS return at least one suggestion.
- Do NOT speak outside the JSON. No markdown fences, no prose.`;

export async function analyzeScreenshot(args: {
  imageBase64: string;
  imageMediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  /** Optional brief trip context — destination, dates, etc. */
  context?: string;
}): Promise<VisionResult> {
  if (!client) return mockResult();

  const userBlocks: Anthropic.ContentBlockParam[] = [
    {
      type: "image",
      source: {
        type: "base64",
        media_type: args.imageMediaType,
        data: args.imageBase64,
      },
    },
    {
      type: "text",
      text: args.context
        ? `Trip context: ${args.context}\n\nAnalyze this screenshot.`
        : "Analyze this screenshot.",
    },
  ];

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: "user", content: userBlocks }],
  });

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();

  // Strip optional code fences if the model sneaks them in.
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as Omit<VisionResult, "source">;
    return { ...parsed, source: "claude" };
  } catch {
    return {
      detected: {
        kind: "other",
        confidence: 0.4,
        summary: text.slice(0, 240) || "Couldn't parse the image.",
        facts: [],
      },
      suggestions: [
        {
          kind: "info",
          title: "I saw your screenshot but couldn't structure it.",
          body: "Try uploading a clearer image, or describe what's in it.",
        },
      ],
      source: "claude",
    };
  }
}

// Deterministic stub so the UX is exercisable without an API key. Pretends the
// user dropped a flight confirmation.
function mockResult(): VisionResult {
  return {
    detected: {
      kind: "flight-confirmation",
      confidence: 0.82,
      summary:
        "Looks like a flight confirmation. (Add ANTHROPIC_API_KEY for real vision parsing.)",
      facts: [
        { label: "Carrier", value: "Demo Airlines" },
        { label: "Flight", value: "DA 482" },
        { label: "Date", value: "May 12, 2026" },
        { label: "Depart", value: "JFK 18:40" },
        { label: "Arrive", value: "NRT 21:55+1" },
        { label: "Fare", value: "$642" },
      ],
    },
    suggestions: [
      {
        kind: "add-itinerary-item",
        title: "Add to your itinerary",
        body: "Insert a transit block on May 12 from JFK → NRT.",
        payload: {
          date: "2026-05-12",
          time: "18:40",
          title: "JFK → NRT (Demo Airlines DA 482)",
          category: "transit",
        },
      },
      {
        kind: "add-wallet-item",
        title: "Save to wallet",
        body: "Stash the booking ref + times so you have it offline.",
        payload: { kind: "flight", vendor: "Demo Airlines", code: "DA 482" },
      },
      {
        kind: "warn",
        title: "Heads up: you're arriving late",
        body: "21:55 local arrival — the airport train stops at 23:30. Pre-book a transfer.",
      },
    ],
    source: "mock",
  };
}
