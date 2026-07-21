import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hides the dev-only "Rendering…" / route indicator pill. It's a
  // development aid (never ships in production) but it floats bottom-left
  // and was overlapping the sidebar's member chip.
  devIndicators: false,
  experimental: {
    serverActions: {
      // Chat attachments and voice notes travel as data URLs (client caps
      // files at 5 MB ≈ 7 MB encoded). The 1 MB default silently rejected
      // them — the "voice note won't send" bug.
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
