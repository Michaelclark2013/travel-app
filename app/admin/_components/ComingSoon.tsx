// app/admin/_components/ComingSoon.tsx — Track 1 placeholder for the
// per-track admin pages until Tracks 2-9 fill them in. Server component.

export function ComingSoon({ track, title }: { track: number; title: string }) {
  return (
    <div>
      <header style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, opacity: 0.6, letterSpacing: 1 }}>
          {title.toUpperCase()}
        </div>
        <h1 style={{ fontSize: 22, margin: "6px 0 4px", fontWeight: 600 }}>
          {title}
        </h1>
      </header>
      <div
        style={{
          padding: 24,
          background: "#11151a",
          border: "1px dashed #2a3340",
          borderRadius: 8,
          fontSize: 14,
          opacity: 0.85,
        }}
      >
        Coming soon — Track {track}.
      </div>
    </div>
  );
}
