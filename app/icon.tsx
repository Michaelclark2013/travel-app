// Programmatic favicon for Voyage. Generates a 32x32 PNG at request time
// using next/og's ImageResponse. Lets us ship without committing raster
// assets — the icon is the same neon-V glyph that appears in the header.

import { ImageResponse } from "next/og";

// Tells Next which size and content-type to emit in the link tag.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#050507",
          color: "#22d3ee",
          fontSize: 22,
          fontWeight: 700,
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          letterSpacing: "-0.02em",
          borderRadius: 6,
          border: "1px solid rgba(34,211,238,0.4)",
        }}
      >
        V
      </div>
    ),
    {
      ...size,
    }
  );
}
