import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static resolves a binary path at runtime; keep it out of the bundle.
  serverExternalPackages: ["ffmpeg-static"],
};

export default nextConfig;
