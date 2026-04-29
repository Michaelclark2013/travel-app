// Programmatic apple-touch-icon for Voyage. Generates a 180x180 PNG at
// request time so iOS Safari has a proper home-screen icon when a user
// adds Voyage via Share -> Add to Home Screen.

import { ImageResponse } from "next/og";

// 180x180 is the canonical apple-touch-icon size; iOS scales it down for
// older devices.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          backgroundImage:
            "radial-gradient(circle at 30% 20%, rgba(34,211,238,0.25), transparent 55%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 130,
            height: 130,
            borderRadius: 28,
            background: "#0b0b10",
            border: "2px solid rgba(34,211,238,0.55)",
            boxShadow: "0 12px 60px rgba(34,211,238,0.45)",
            color: "#22d3ee",
            fontSize: 96,
            fontWeight: 800,
            fontFamily:
              "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            letterSpacing: "-0.04em",
          }}
        >
          V
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
