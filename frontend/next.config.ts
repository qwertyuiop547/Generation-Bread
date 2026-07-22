import type { NextConfig } from "next";

const apiOrigin = process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "127.0.0.1",
        port: "8000",
      },
      {
        protocol: "http",
        hostname: "localhost",
        port: "8000",
      },
      {
        protocol: "https",
        hostname: "**.onrender.com",
      },
    ],
  },
  async headers() {
    // Keep security headers, but avoid a strict CSP that breaks NextAuth / login / WS / Google.
    return [
      {
        source: "/videos/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "private, no-cache, no-store, must-revalidate",
          },
        ],
      },
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            // Intentionally permissive connect/script so auth + realtime keep working.
            // Tighten later once Google/NextAuth origins are fully enumerated.
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://accounts.google.com https://apis.google.com",
              // Google Fonts stylesheet (Antonio) + NextAuth Google UI
              "style-src 'self' 'unsafe-inline' https://accounts.google.com https://fonts.googleapis.com",
              "img-src 'self' data: blob: https: http://127.0.0.1:8000 http://localhost:8000",
              // Google Fonts files — without this, Antonio falls back to Arial and the hero wraps/looks cramped
              "font-src 'self' data: https://fonts.gstatic.com",
              `connect-src 'self' ${apiOrigin} http://127.0.0.1:8000 http://localhost:8000 http://127.0.0.1:3000 http://localhost:3000 http://127.0.0.1:3001 http://localhost:3001 ws://127.0.0.1:8000 ws://localhost:8000 wss: https: https://*.onrender.com https://accounts.google.com`,
              "worker-src 'self' blob:",
              "media-src 'self' blob:",
              "frame-src 'self' https://accounts.google.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://accounts.google.com",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
