// Stub endpoint that records a Web Push subscription. For now we just log
// the subscription JSON; later this should persist to Supabase keyed by the
// authenticated user. Keeping the route available with the contract in place
// means the client opt-in flow can ship and be wired up by another track
// without any client-side changes.

import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let payload: unknown = null;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-json" }, { status: 400 });
  }

  // Bare-minimum shape check — anything else and the worker payload signing
  // will fail later anyway.
  if (
    !payload ||
    typeof payload !== "object" ||
    !("endpoint" in payload) ||
    typeof (payload as { endpoint?: unknown }).endpoint !== "string"
  ) {
    return NextResponse.json(
      { ok: false, reason: "missing-endpoint" },
      { status: 422 }
    );
  }

  // TODO(track-?, post-launch): persist the subscription, encrypt the
  // payload server-side using node:crypto + the VAPID private key, and
  // dispatch real notifications. For now the route just acknowledges.
  console.info(
    "[push] subscription received",
    (payload as { endpoint: string }).endpoint.slice(0, 60) + "…"
  );

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    note: "POST a PushSubscription JSON to register.",
  });
}
