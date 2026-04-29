import { NextResponse } from "next/server";
import { chat, type AgentMessage } from "@/lib/services/anthropic";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { messages?: AgentMessage[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messages = body.messages ?? [];
  if (messages.length === 0) {
    return NextResponse.json({ error: "Empty messages" }, { status: 400 });
  }
  // Cap conversation length so we don't blow tokens.
  const trimmed = messages.slice(-20);
  try {
    const turn = await chat({ messages: trimmed });
    return NextResponse.json({ ok: true, ...turn });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Agent error";
    console.error("[agent/chat]", err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
