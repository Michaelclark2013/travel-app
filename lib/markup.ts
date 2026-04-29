// Tiny markup engine for captions, bios, comments, message bodies. Parses
// `#tags` and `@mentions` into structured tokens. Render with <Markup text=…>
// or via the helper renderTokens(). Same parser used wherever text is shown
// so behavior is identical across the app.

export type Token =
  | { kind: "text"; value: string }
  | { kind: "tag"; tag: string }
  | { kind: "mention"; username: string }
  | { kind: "url"; href: string };

const TOKEN_RE =
  /(#[\p{L}0-9_]{2,30})|(@[a-zA-Z0-9_.]{2,30})|((?:https?:\/\/)[^\s]+)/gu;

export function parseMarkup(text: string): Token[] {
  if (!text) return [];
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", value: text.slice(last, start) });
    if (m[1]) out.push({ kind: "tag", tag: m[1].slice(1).toLowerCase() });
    else if (m[2]) out.push({ kind: "mention", username: m[2].slice(1) });
    else if (m[3]) out.push({ kind: "url", href: m[3] });
    last = start + m[0].length;
  }
  if (last < text.length) out.push({ kind: "text", value: text.slice(last) });
  return out;
}

/** Pull all hashtags out of a piece of text. Lowercased + deduped. */
export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const t of parseMarkup(text)) {
    if (t.kind === "tag") tags.add(t.tag);
  }
  return [...tags];
}

/** Pull @mentions out — useful for notifying tagged users. */
export function extractMentions(text: string): string[] {
  const out = new Set<string>();
  for (const t of parseMarkup(text)) {
    if (t.kind === "mention") out.add(t.username.toLowerCase());
  }
  return [...out];
}

/** Plain-text helper — strip tokens for previews / og:title. */
export function plainText(text: string): string {
  return text.replace(TOKEN_RE, (_m, tag, mention, url) =>
    tag ? tag : mention ? mention : url
  );
}
