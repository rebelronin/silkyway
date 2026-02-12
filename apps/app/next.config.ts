import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@silkysquad/silk'],
  turbopack: {},
};

export default nextConfig;
