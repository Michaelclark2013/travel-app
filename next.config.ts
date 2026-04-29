import type { NextConfig } from "next";
import path from "node:path";

// Pin Turbopack's workspace root to this directory so the build doesn't
// walk up the filesystem looking for a parent lockfile. Important for the
// nested-worktree development workflow used by the multi-track team. Has no
// effect at runtime — purely a build-time hint.
const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(),
  },
};

export default nextConfig;
