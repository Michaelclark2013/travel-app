import { NextResponse } from "next/server";
import { analyzeScreenshot } from "@/lib/services/anthropic-vision";

export const runtime = "nodejs";

// Cap to keep both Anthropic costs and our memory usage in check. 5 MB matches
// the SDK's image-input limit; on the client we resize before sending too.
const MAX_BYTES = 5 * 1024 * 1024;

const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data required" }, { status: 400 });
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing 'image' field" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type: ${file.type}` },
      { status: 415 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Image too large. Max ${Math.round(MAX_BYTES / 1024 / 1024)} MB.` },
      { status: 413 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString("base64");

  // Map jpg → jpeg so the SDK is happy.
  const mediaType = (
    file.type === "image/jpg" ? "image/jpeg" : file.type
  ) as "image/png" | "image/jpeg" | "image/webp" | "image/gif";

  const context = (form.get("context") as string | null) ?? undefined;

  try {
    const result = await analyzeScreenshot({
      imageBase64: base64,
      imageMediaType: mediaType,
      context,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[vision]", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Vision call failed",
      },
      { status: 502 }
    );
  }
}
