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
  // The CSP below is deliberately partial. CSP has no implicit default-src,
  // so only the directives actually listed are enforced — script-src,
  // img-src, connect-src and frame-src stay unrestricted, which is what
  // keeps Razorpay's checkout working.
  //
  // Still NOT set: script-src. This app injects
  // https://checkout.razorpay.com/v1/checkout.js at runtime (see
  // src/lib/razorpay.ts), which then loads its own iframe and calls further
  // Razorpay origins. Restricting scripts also means choosing between a
  // per-request nonce (correct, but forces every page to render dynamically)
  // and 'unsafe-inline' (keeps pages cacheable, but gives up most of the
  // protection) — because Next.js emits inline hydration scripts. That is its
  // own project, and it should ship as Content-Security-Policy-Report-Only
  // first so violations surface from real checkout sessions before anything
  // is blocked.
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
          {
            key: "Content-Security-Policy",
            value: [
              // Blocks <base href> injection, which would otherwise silently
              // repoint every relative URL on the page. Nothing here emits a
              // <base> tag.
              "base-uri 'self'",
              // No <object>/<embed> anywhere in this app; this closes a
              // legacy plugin vector for free.
              "object-src 'none'",
              // Every form in this app submits through a React onSubmit
              // handler over XHR — there is not one native action= attribute
              // — so this cannot break a submission, and it stops an injected
              // form posting credentials to someone else's endpoint.
              "form-action 'self'",
              // The modern replacement for X-Frame-Options, which is kept
              // above for older browsers. Both say the same thing.
              "frame-ancestors 'self'",
            ].join("; "),
          },
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
