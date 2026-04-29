// Track F (SEO): per-profile Open Graph card. Renders 1200x630 share preview
// for /u/[username] using the seeded mock-user catalog. Once Supabase has
// real profile rows we replace the userByUsername() call with a query.

import { ImageResponse } from "next/og";
import { userByUsername } from "@/lib/social";

export const runtime = "nodejs";
export const alt = "A traveler on Voyage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = userByUsername(username);

  // Generic gradient when the username doesn't match a known mock user.
  const hue = user?.hue ?? 220;
  const displayName = user?.displayName ?? `@${username}`;
  const handle = user?.username ?? username;
  const bio = user?.bio ?? "Traveler on Voyage";
  const followers = user ? user.followers.toLocaleString() : null;
  const moments = user?.moments.length ?? 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: `radial-gradient(circle at 80% 0%, hsl(${hue}, 70%, 25%), transparent 60%), radial-gradient(circle at 0% 100%, hsl(${
            (hue + 80) % 360
          }, 65%, 22%), transparent 60%), #07080d`,
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
          <div style={{ color: "#e8eaf0" }}>VOYAGE · PROFILE</div>
        </div>

        <div
          style={{
            marginTop: "auto",
            display: "flex",
            alignItems: "center",
            gap: 36,
          }}
        >
          {/* Avatar — gradient ring derived from the user's hue. */}
          <div
            style={{
              width: 180,
              height: 180,
              borderRadius: "50%",
              background: `radial-gradient(circle at 30% 30%, hsl(${hue}, 70%, 55%), hsl(${
                (hue + 30) % 360
              }, 70%, 35%) 60%, hsl(${(hue + 60) % 360}, 55%, 25%))`,
              border: "4px solid rgba(255,255,255,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 80,
              fontWeight: 800,
              color: "rgba(255,255,255,0.9)",
            }}
          >
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontSize: 84,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.02,
              }}
            >
              {displayName}
            </div>
            <div
              style={{ fontSize: 30, color: "#8a90a3", marginTop: 8 }}
            >
              @{handle}
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 28,
            fontSize: 26,
            color: "#c2c7d3",
            maxWidth: 1000,
            display: "flex",
          }}
        >
          {bio}
        </div>
        {followers ? (
          <div
            style={{
              marginTop: 18,
              display: "flex",
              gap: 28,
              fontSize: 22,
              color: "#8a90a3",
            }}
          >
            <span>{followers} followers</span>
            <span>
              {moments} moment{moments === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}
      </div>
    ),
    size
  );
}
