/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Node-only resume parsers out of the webpack graph (API routes only).
  serverExternalPackages: ['word-extractor', 'mammoth', 'pdf-parse-fork'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // Client-side Router Cache: reuse a visited dynamic page for 30s so that
    // back-navigation (e.g. job detail -> dashboard) is instant — no server
    // round-trip, no loading.tsx skeleton, scroll preserved.
    staleTimes: {
      dynamic: 30,
      static: 180,
    },
  },
};

export default nextConfig;
