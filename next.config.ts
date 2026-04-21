import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg + sharp have native binaries / dynamic requires that can't be bundled
  // by Next's compiler. Keep them as external server deps.
  serverExternalPackages: [
    "@ffmpeg-installer/ffmpeg",
    "fluent-ffmpeg",
    "sharp",
  ],
};

export default nextConfig;
