/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
    // Phase R1 — enables `src/instrumentation.ts` to run on server boot
    // so we fail fast when ENCRYPTION_KEY is missing rather than at the
    // first request that needs a secret.
    instrumentationHook: true,
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
