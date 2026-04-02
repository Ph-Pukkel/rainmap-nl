import type { NextConfig } from "next";
import { execSync } from 'child_process';

const gitHash = (() => {
  try { return execSync('git rev-parse --short HEAD').toString().trim(); }
  catch { return 'unknown'; }
})();

const nextConfig: NextConfig = {
  reactStrictMode: false, // MapLibre GL v5 crashes with strict mode double-mounting
  transpilePackages: ['maplibre-gl'],
  turbopack: {},
  env: {
    NEXT_PUBLIC_GIT_HASH: gitHash,
  },
};

export default nextConfig;
