import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  // scripts/deploy-live.sh builds into a separate dir (NEXT_DIST_DIR=.next-new) and swaps it in,
  // so the running server never serves a half-written .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "credentialless" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "origin-when-cross-origin" },
          { key: "X-XSS-Protection", value: "1; mode=block" }
        ]
      },
      // OpenReel (trình dựng video Pro, built by scripts/build-openreel.sh): same isolation as upstream —
      // require-corp also works in Safari, which ignores "credentialless".
      {
        source: "/dung-video-pro/:path*",
        headers: [{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }]
      },
      {
        source: "/dung-video-pro/assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
      }
    ];
  },
  async rewrites() {
    return [
      { source: "/dung-video-pro", destination: "/dung-video-pro/index.html" },
      { source: "/dung-video-pro/", destination: "/dung-video-pro/index.html" }
    ];
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;


