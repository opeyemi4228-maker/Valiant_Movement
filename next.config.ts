import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
