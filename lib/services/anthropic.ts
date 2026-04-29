// Server-side Anthropic / Claude wrapper with tool definitions for the
// Voyage AI travel agent. Set ANTHROPIC_API_KEY on Vercel to activate.

import Anthropic from "@anthropic-ai/sdk";

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

const client = KEY ? new Anthropic({ apiKey: KEY }) : null;
export const anthropicEnabled = !!client;

export type AgentMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type AgentTurn = {
  text: string;
  toolCalls: ToolCall[];
};

// The tools Claude can call. Tool execution happens in
// app/api/agent/chat/route.ts so we can map them to existing services.
export const AGENT_TOOLS = [
  {
    name: "search_flights",
    description:
      "Search for flights between two airports/cities on a specific date.",
    input_schema: {
      type: "object",
      properties: {
        from: { type: "string", description: "Origin airport or city" },
        to: { type: "string", description: "Destination airport or city" },
        date: { type: "string", description: "YYYY-MM-DD" },
        travelers: { type: "number", description: "Number of travelers" },
      },
      required: ["from", "to", "date"],
    },
  },
  {
    name: "search_hotels",
    description: "Search for hotels in a city for a date range.",
    input_schema: {
      type: "object",
      properties: {
        city: { type: "string" },
        checkIn: { type: "string", description: "YYYY-MM-DD" },
        checkOut: { type: "string", description: "YYYY-MM-DD" },
        travelers: { type: "number" },
      },
      required: ["city", "checkIn", "checkOut"],
    },
  },
  {
    name: "compare_drive_vs_fly",
    description:
      "Compare the all-in cost (gas, tolls, parking, baggage, transfers, FX, carbon) of driving vs flying.",
    input_schema: {
      type: "object",
      properties: {
        origin: { type: "string" },
        destination: { type: "string" },
        date: { type: "string" },
        travelers: { type: "number" },
      },
      required: ["origin", "destination", "date"],
    },
  },
  {
    name: "get_visa_requirements",
    description:
      "Look up visa, vaccination, and entry requirements for a passport→destination pair.",
    input_schema: {
      type: "object",
      properties: {
        passport: { type: "string", description: "ISO country code" },
        destination: { type: "string" },
      },
      required: ["passport", "destination"],
    },
  },
  {
    name: "get_weather",
    description: "Get a 7-day weather forecast for a city.",
    input_schema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    },
  },
  {
    name: "list_user_trips",
    description: "List the user's saved trips.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_trip_draft",
    description:
      "Generate a day-by-day itinerary draft for a destination + dates.",
    input_schema: {
      type: "object",
      properties: {
        destination: { type: "string" },
        startDate: { type: "string" },
        endDate: { type: "string" },
        vibes: { type: "array", items: { type: "string" } },
      },
      required: ["destination", "startDate", "endDate"],
    },
  },
] as const;

const SYSTEM = `You are Voyage, a friendly AI travel agent. You help users plan trips
end-to-end: find cheap flights, choose a hotel, build a day-by-day itinerary,
and stay with them on the trip.

Style:
- Concise and warm. Skip preamble.
- Show options as short bullet lists, not paragraphs.
- When a user asks for something concrete (a flight, a plan, a comparison),
  call the right tool. Don't make up prices, departure times, or visa rules.
- After tool results come back, summarize them in plain English. Don't dump
  raw JSON.
- If the user is signed in, you can list and edit their saved trips.

Today is ${new Date().toISOString().slice(0, 10)}.`;

export async function chat(args: {
  messages: AgentMessage[];
  toolResults?: Array<{ toolUseId: string; result: unknown }>;
}): Promise<AgentTurn> {
  if (!client) {
    return mockChat(args.messages);
  }
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    tools: AGENT_TOOLS as unknown as Anthropic.Tool[],
    messages: args.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  let text = "";
  const toolCalls: ToolCall[] = [];
  for (const block of res.content) {
    if (block.type === "text") text += block.text;
    if (block.type === "tool_use") {
      toolCalls.push({
        name: block.name,
        input: (block.input ?? {}) as Record<string, unknown>,
      });
    }
  }
  return { text, toolCalls };
}

// Heuristic fallback so the chat works without an API key — recognizes a
// handful of intents (plan a trip, compare drive vs fly, find a flight).
function mockChat(messages: AgentMessage[]): AgentTurn {
  const last = messages[messages.length - 1]?.content?.toLowerCase() ?? "";
  if (/(flight|fly).*to|cheapest.*flight/.test(last)) {
    return {
      text: "I'd search Amadeus here — connect your key and I'll pull live fares. For now you can use the Flights page directly.",
      toolCalls: [],
    };
  }
  if (/(plan|trip|itinerary).*(to|for)\s+([a-z\s]+)/i.test(last)) {
    return {
      text: "Tell me where you're going from, when, and your vibe. I'll draft a full day-by-day plan in seconds.",
      toolCalls: [],
    };
  }
  if (/drive.*fly|fly.*drive/.test(last)) {
    return {
      text: "I'll compare gas, tolls, parking, fares, baggage, and transfers — see the cost-compare card on the planner page.",
      toolCalls: [],
    };
  }
  return {
    text: "I'm Voyage's travel agent. Connect an Anthropic API key and I become full-featured — search flights, build itineraries, watch prices, the works. What can I help with?",
    toolCalls: [],
  };
}
