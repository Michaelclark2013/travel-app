// Trip Doctor — server-side Claude pass that scans a trip for issues the
// user might miss. Returns a list of findings keyed by severity.

import Anthropic from "@anthropic-ai/sdk";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
const client = KEY ? new Anthropic({ apiKey: KEY }) : null;

export const tripDoctorEnabled = !!client;

export type Finding = {
  severity: "critical" | "warning" | "fyi";
  category:
    | "timing"
    | "logistics"
    | "weather"
    | "openness"
    | "transit"
    | "budget"
    | "energy"
    | "documentation"
    | "health";
  title: string;
  body: string;
  /** Optional suggested fix the user could apply. */
  suggestion?: string;
  /** When known, day index in the itinerary this concerns. */
  dayIndex?: number;
};

export type DoctorResult = {
  scannedAt: string;
  findings: Finding[];
  source: "claude" | "mock";
};

const SYSTEM = `You are Voyage's Trip Doctor. The user will give you a trip
JSON (origin, destination(s), dates, itinerary day-by-day, traveler count,
preferences). Your job is to find issues they might have missed —
conflicts, timing crunches, fatigue traps, hours/closures that could matter,
visa/passport gotchas if obvious, energy/jetlag mismatches, transit-time
realities, and budget red flags.

Respond ONLY with a single JSON object, exactly this shape:

{
  "findings": [
    {
      "severity": "critical" | "warning" | "fyi",
      "category": "timing" | "logistics" | "weather" | "openness" | "transit" | "budget" | "energy" | "documentation" | "health",
      "title": "<short imperative title>",
      "body": "<one or two sentences explaining the issue + why it matters>",
      "suggestion": "<optional one-sentence fix>",
      "dayIndex": <number or omitted>
    }
  ]
}

Rules:
- Be concrete. Reference specific days, places, times.
- Skip generic advice. Only call out things that actually apply to THIS trip.
- 0–6 findings. Quality over quantity.
- If the trip looks great, return "findings": [] — don't invent problems.
- Use "critical" sparingly (real blockers only — wrong-day flight, missing
  visa, etc).
- "warning" = will likely affect the trip ("Day 4 has 6h of driving + a
  3pm reservation — won't make it").
- "fyi" = good to know.
- No prose outside the JSON. No markdown fences.`;

export async function scanTrip(args: {
  tripJson: string;
}): Promise<DoctorResult> {
  if (!client) return mockResult();

  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Trip:\n${args.tripJson}\n\nFind anything they might have missed.`,
      },
    ],
  });

  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .trim();
  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const parsed = JSON.parse(cleaned) as { findings: Finding[] };
    return {
      scannedAt: new Date().toISOString(),
      findings: parsed.findings ?? [],
      source: "claude",
    };
  } catch {
    return {
      scannedAt: new Date().toISOString(),
      findings: [
        {
          severity: "fyi",
          category: "logistics",
          title: "Couldn't parse the doctor's response.",
          body: text.slice(0, 200) || "Try scanning again.",
        },
      ],
      source: "claude",
    };
  }
}

// Deterministic preview so the UI is exercisable without an API key. We try
// to make findings plausible enough that the demo is useful.
function mockResult(): DoctorResult {
  return {
    scannedAt: new Date().toISOString(),
    findings: [
      {
        severity: "warning",
        category: "transit",
        title: "Tight transfer between stops",
        body: "Inter-city transit on day 4 is scheduled for 10:00 but the train you'll likely want runs at 09:18 or 11:42 — the 10:00 slot doesn't exist.",
        suggestion: "Shift the transit block to 09:18 to avoid losing 90 minutes.",
        dayIndex: 3,
      },
      {
        severity: "fyi",
        category: "openness",
        title: "Day 2 is a Monday",
        body: "Many museums in this region close on Mondays. Worth confirming the ones on your list before that day starts.",
        dayIndex: 1,
      },
      {
        severity: "warning",
        category: "energy",
        title: "Heavy day right after travel",
        body: "Day 1 ends at 22:30 and day 2 starts at 08:00 with a 90-minute walking tour. Jetlag plus a 5-hour flight will hurt.",
        suggestion: "Push day 2's start to 10:00 and drop one stop.",
        dayIndex: 1,
      },
      {
        severity: "fyi",
        category: "documentation",
        title: "Demo mode",
        body: "These are example findings. Add ANTHROPIC_API_KEY to flip Trip Doctor to real Claude analysis.",
      },
    ],
    source: "mock",
  };
}
