import type { NextConfig } from "next";

const SECURITY_HEADERS = [
  // Don't let attackers iframe Voyage to phish credentials.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none';" },
  // No MIME sniffing.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Don't leak Voyage URLs to outbound clicks (we can still tag affiliate links).
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Permissions-Policy locks browser APIs we don't use.
  {
    key: "Permissions-Policy",
    value: [
      "accelerometer=()",
      "camera=()",
      "geolocation=(self)", // we use it on /nearby
      "gyroscope=()",
      "magnetometer=()",
      "microphone=()",
      "payment=()",
      "usb=()",
      "interest-cohort=()", // opt out of FLoC
    ].join(", "),
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
