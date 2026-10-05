import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite and pg are native or WASM packages that must stay outside the server
  // bundle, so they are loaded with a plain dynamic import at request time.
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  images: {
    // Museum imagery is served by two different CDNs. They are read straight from
    // the provider rather than through the optimizer: the optimiser would proxy
    // every plate image through this deployment for no benefit, and the
    // institutions already publish correctly sized derivatives.
    remotePatterns: [
      { protocol: "https", hostname: "images.metmuseum.org" },
      { protocol: "https", hostname: "openaccess-cdn.clevelandart.org" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

export default nextConfig;
