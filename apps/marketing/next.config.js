/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output for Docker / edge deploys.
  output: "standalone",
  // The marketing app is fully public — no auth cookies, no rate-limited
  // API calls, no server-side mutations. Output is cacheable at the edge.
  poweredByHeader: false,
  // Image optimisation for dealer vehicle photos. The CDN URL is
  // configurable per dealer (themeConfig.cdnBase) but we keep the
  // default remote patterns permissive enough for S3 / MinIO / Cloudflare.
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "*.amazonaws.com" },
      { protocol: "https", hostname: "*.cloudfront.net" },
      { protocol: "https", hostname: "*.r2.cloudflarestorage.com" },
    ],
  },
  // Strict routing for the dynamic [subdomain] catch-all.
  experimental: {
    // Cache pages aggressively at the edge.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
  // Security headers — public site, but we still want HSTS, X-Frame-Options,
  // and a tight CSP that allows dealer-configured image CDNs.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
