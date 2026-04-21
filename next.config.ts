import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `standalone` produces a minimal `.next/standalone/` output that the
  // Dockerfile copies into the runtime image; it also makes the container
  // ~10x smaller than copying the full repo.
  output: "standalone",
  // ffmpeg + sharp + better-sqlite3 have native binaries / dynamic requires
  // that can't be bundled by Next's compiler. Keep them as external server deps.
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "fluent-ffmpeg",
    "sharp",
    "better-sqlite3",
  ],
};

export default nextConfig;
