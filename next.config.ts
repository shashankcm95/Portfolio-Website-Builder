import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
  },
  webpack: (config) => {
    // pdf-parse uses test files that reference fs
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
