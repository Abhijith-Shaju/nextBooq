import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const nextConfig: NextConfig = {
  // Proxies browser API calls through this app's own origin so the backend's
  // httpOnly session cookie (set on login) is visible to both the app and its
  // route-protection middleware — a cookie set directly by a separate backend
  // origin wouldn't be sent to this origin's requests. See src/lib/session.ts.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
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
