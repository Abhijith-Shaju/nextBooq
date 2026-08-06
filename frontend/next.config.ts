import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
  // Disable strict mode in dev if Razorpay SDK has issues with double-invoke
  reactStrictMode: true,
};

export default nextConfig;
