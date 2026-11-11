import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Native / non-bundlable packages must stay external to the server bundle.
  serverExternalPackages: ["better-sqlite3", "sharp"],
  images: {
    // Thumbnails are produced by /api/thumb (sharp) — no remote image hosts needed.
    unoptimized: true,
  },
};

export default nextConfig;
