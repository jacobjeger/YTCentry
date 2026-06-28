import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Consume the shared @ytc/core TypeScript source directly (no build step).
  transpilePackages: ["@ytc/core"],
  // Native / heavy server-only packages must not be bundled by the compiler.
  serverExternalPackages: ["@prisma/client", "argon2", "sharp", "heic-convert", "libheif-js"],
};

export default nextConfig;
