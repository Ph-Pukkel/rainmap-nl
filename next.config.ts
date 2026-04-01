import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['maplibre-gl'],
  turbopack: {},
};

export default nextConfig;
