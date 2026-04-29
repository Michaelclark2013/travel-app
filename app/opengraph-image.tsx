import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Voyage — Plan trips with AI";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background:
            "radial-gradient(circle at 80% 0%, rgba(34,211,238,0.18), transparent 60%), radial-gradient(circle at 0% 100%, rgba(167,139,250,0.18), transparent 60%), #07080d",
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
          <div style={{ color: "#e8eaf0" }}>VOYAGE</div>
        </div>

        <div
          style={{
            marginTop: "auto",
            fontSize: 96,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <span>Plan your next trip.</span>
          <span style={{ color: "#22d3ee" }}>Atom by atom.</span>
        </div>

        <div
          style={{
            marginTop: 32,
            fontSize: 28,
            color: "#8a90a3",
            maxWidth: 900,
          }}
        >
          From cheapest flights to neighborhood-clustered itineraries —
          Voyage routes your entire trip in one place.
        </div>
      </div>
    ),
    size
  );
}
