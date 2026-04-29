// Track F (SEO): per-tag Open Graph card. Renders 1200x630 share preview for
// /tag/[name]. Hue is derived deterministically from the tag string so two
// people sharing the same tag always see the exact same image.

import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt = "A travel hashtag on Voyage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function hueFromTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i += 1) h = (h * 31 + tag.charCodeAt(i)) | 0;
  return Math.abs(h) % 360;
}

export default async function OG({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const tag = name.toLowerCase();
  const hue = hueFromTag(tag);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `radial-gradient(circle at 80% 0%, hsl(${hue}, 70%, 28%), transparent 60%), radial-gradient(circle at 0% 100%, hsl(${
            (hue + 80) % 360
          }, 65%, 24%), transparent 60%), #07080d`,
          color: "#e8eaf0",
          display: "flex",
          flexDirection: "column",
          padding: "80px",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 22,
            letterSpacing: "0.18em",
            fontWeight: 600,
            color: "#22d3ee",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              border: "1px solid rgba(255,255,255,0.2)",
              borderRadius: 8,
              background: "rgba(255,255,255,0.05)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#22d3ee",
              fontWeight: 800,
            }}
          >
            V
          </div>
          <div style={{ color: "#e8eaf0" }}>VOYAGE · TAG</div>
        </div>

        <div
          style={{
            marginTop: "auto",
            fontSize: 160,
            fontWeight: 800,
            lineHeight: 1.0,
            letterSpacing: "-0.04em",
            display: "flex",
          }}
        >
          <span style={{ color: "#22d3ee" }}>#</span>
          <span>{tag}</span>
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 30,
            color: "#8a90a3",
            display: "flex",
          }}
        >
          See moments tagged #{tag} on Voyage.
        </div>
      </div>
    ),
    size
  );
}
