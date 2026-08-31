import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deliberately no /api rewrite here: the browser calls the backend's own
  // origin directly (NEXT_PUBLIC_API_URL), which is what lets the backend see
  // real client IPs for rate limiting instead of Vercel's. This works because
  // the session cookie is scoped to .nextbooq.in via the backend's
  // COOKIE_DOMAIN, so it still rides along cross-origin. See
  // src/hooks/api/axios-instance.ts.
  // Next.js sends no security headers of its own, so without this block the
  // app — including the login form — is framable by any site. The API already
  // sends the equivalent set via helmet; this brings the frontend in line.
  //
  // Deliberately NOT set here: Content-Security-Policy. This app injects
  // https://checkout.razorpay.com/v1/checkout.js at runtime (see
  // src/lib/razorpay.ts), which then loads its own iframe and calls further
  // Razorpay origins, and it renders remote images. A CSP written without
  // inventorying all of that would silently break checkout — the one path
  // where a failure costs real money — and nothing would surface it until a
  // customer tried to pay. CSP belongs in its own change, rolled out as
  // Content-Security-Policy-Report-Only first.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // SAMEORIGIN rather than DENY: it stops the clickjacking case
          // (a third-party site framing the login form) while leaving room
          // for a cafe to embed its own booking page later, which is a
          // plausible feature for a booking platform. Matches the API.
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Keeps full URLs — which carry callbackUrl values and tenant
          // slugs — from leaking to third parties in the Referer header.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // geolocation is deliberately left unrestricted: the roadmap has a
          // "cafes near you" search that will need it. Revisit if that is
          // dropped.
          { key: "Permissions-Policy", value: "camera=(), microphone=()" },
        ],
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
