// app/api/admin/support/preview/route.ts — Track 7 server-side markdown
// preview. The composer pings this on every keystroke (debounced) so the
// rendered HTML is the SAME HTML that lib/email.sendEmail will dispatch.
//
// AUTH: support.broadcast (composing campaigns is a privileged action; we
// keep the perm check on the preview endpoint too).

import { requirePerm } from "@/lib/admin/rbac";
import { renderMarkdown } from "@/lib/admin/support";

export async function POST(req: Request) {
  await requirePerm(req, "support.broadcast");
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON." }, { status: 400 });
  }
  const md = typeof (body as { markdown?: unknown })?.markdown === "string"
    ? (body as { markdown: string }).markdown
    : "";
  if (md.length > 50_000) {
    return Response.json({ ok: false, error: "Body too large." }, { status: 413 });
  }
  return Response.json({ ok: true, html: renderMarkdown(md) });
}
