import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin Turbopack's workspace root to this directory. Without it, Next 16
  // walks up looking for a lockfile and (in worktree setups) lands on the
  // parent repo's package-lock.json, which makes it try to resolve files
  // from the wrong tree. Safe in the canonical repo too — the value just
  // points at the project root.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
