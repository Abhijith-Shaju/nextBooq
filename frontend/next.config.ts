import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deliberately no /api rewrite here: the browser calls the backend's own
  // origin directly (NEXT_PUBLIC_API_URL), which is what lets the backend see
  // real client IPs for rate limiting instead of Vercel's. This works because
  // the session cookie is scoped to .nextbooq.in via the backend's
  // COOKIE_DOMAIN, so it still rides along cross-origin. See
  // src/hooks/api/axios-instance.ts.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
      {
        protocol: "http",
        hostname: "localhost",
      },
    ],
  },
  reactStrictMode: true,
};

export default nextConfig;
