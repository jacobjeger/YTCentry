import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Consume the shared @ytc/core TypeScript source directly (no build step).
  transpilePackages: ["@ytc/core"],
  // Native / heavy server-only packages must not be bundled by the compiler.
  serverExternalPackages: ["@prisma/client", "argon2", "sharp", "heic-convert", "libheif-js"],
  experimental: {
    // Add Person posts the photo through a Server Action; the default cap is
    // 1 MB, which a full-resolution phone photo blows past (→ "Body exceeded
    // 1 MB limit"). Allow up to 16 MB so the enroll handler's own 15 MB check
    // is the effective, friendly gate. (The native app uses /api/mobile/enroll,
    // which isn't a Server Action and was never affected.)
    serverActions: {
      bodySizeLimit: "16mb",
    },
  },
};

export default nextConfig;
