/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keep Node-only resume parsers out of the webpack graph (API routes only).
  serverExternalPackages: ['word-extractor', 'mammoth', 'pdf-parse-fork', 'unpdf'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
