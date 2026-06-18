import type { NextConfig } from "next";

// Cache-Control headers applied at the Next.js/CDN layer.
// These prevent CloudFront / Amplify from serving one user's
// session data (API responses, SSR HTML) to a different user.
const NO_STORE_HEADERS = [
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, proxy-revalidate" },
  { key: "Pragma", value: "no-cache" },
  { key: "Surrogate-Control", value: "no-store" },
  { key: "Vary", value: "Cookie, Authorization" },
];

const nextConfig: NextConfig = {
  output: "standalone",

  async headers() {
    return [
      // All API routes – never cache, always re-validate per-request
      {
        source: "/api/:path*",
        headers: NO_STORE_HEADERS,
      },
      // NextAuth internal routes
      {
        source: "/api/auth/:path*",
        headers: NO_STORE_HEADERS,
      },
      // Dashboard page – user-specific SSR content
      {
        source: "/dashboard",
        headers: NO_STORE_HEADERS,
      },
      // Admin page – user-specific SSR content
      {
        source: "/admin",
        headers: NO_STORE_HEADERS,
      },
      // Login / signup pages – prevent caching redirect responses
      {
        source: "/login",
        headers: NO_STORE_HEADERS,
      },
      {
        source: "/signup",
        headers: NO_STORE_HEADERS,
      },
    ];
  },
};

export default nextConfig;