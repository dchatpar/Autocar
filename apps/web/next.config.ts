import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  eslint: {
    // ESLint 10 flat config plugins not yet compatible; skip during build
    ignoreDuringBuilds: true,
  },
  experimental: {
    // Enable TailwindCSS v4 features
  },
};

export default nextConfig;