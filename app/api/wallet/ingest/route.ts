import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Forwarded-email ingest. Accepts JSON `{ from, subject, body, userId? }`
// or `multipart/form-data` (e.g. from a Mailgun / SendGrid inbound webhook
// where `body-plain` carries the email body).
//
// Parsing happens server-side using the same heuristic engine the client uses,
// then the result is returned as JSON. The client wallet page polls
// /api/wallet/ingest?since=... to pick up parsed items. We deliberately keep
// this stateless when Supabase isn't configured so it works in local dev.

type IngestBody = {
  from?: string;
  subject?: string;
  body?: string;
  userId?: string;
};

async function readBody(req: Request): Promise<IngestBody> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return (await req.json()) as IngestBody;
  }
  if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    return {
      from: stringField(form.get("from") ?? form.get("sender")),
      subject: stringField(form.get("subject")),
      body:
        stringField(form.get("body-plain")) ??
        stringField(form.get("text")) ??
        stringField(form.get("body")) ??
        "",
      userId: stringField(form.get("userId")),
    };
  }
  // Plain text fallback
  return { body: await req.text() };
}

function stringField(v: FormDataEntryValue | string | null | undefined): string | undefined {
  if (typeof v === "string") return v;
  return undefined;
}

export async function POST(req: Request) {
  const payload = await readBody(req);
  const body = (payload.body ?? "").trim();
  if (!body) {
    return NextResponse.json({ ok: false, error: "Empty body" }, { status: 400 });
  }

  const composed = [
    payload.subject ? `Subject: ${payload.subject}` : "",
    payload.from ? `From: ${payload.from}` : "",
    body,
  ]
    .filter(Boolean)
    .join("\n");

  const parsed = parseEmailServer(composed);
  if (!parsed) {
    return NextResponse.json(
      { ok: false, error: "Couldn't recognize that confirmation." },
      { status: 422 }
    );
  }

  return NextResponse.json({ ok: true, confirmation: parsed });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST a forwarded email body here as JSON `{ body }` or multipart form-data with `body-plain`.",
  });
}

// ----- Server-side mirror of the client parser -----
// We re-implement (rather than importing) because lib/wallet.ts is "use client"
// and references browser-only APIs (localStorage). The detection heuristic is
// kept in lib/wallet-rules.ts so both stay in sync.

import { parseEmailRaw } from "@/lib/wallet-rules";

function parseEmailServer(text: string) {
  return parseEmailRaw(text);
}
