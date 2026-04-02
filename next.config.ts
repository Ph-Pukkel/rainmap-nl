import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: false, // MapLibre GL v5 crashes with strict mode double-mounting
  transpilePackages: ['maplibre-gl'],
  turbopack: {},
};

export default nextConfig;
