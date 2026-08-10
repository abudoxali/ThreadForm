import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@threadform/ui',
    '@threadform/project-engine',
    '@threadform/local-storage',
    '@threadform/garment-runtime',
    '@threadform/3d-engine',
  ],
  reactStrictMode: true,
};

export default nextConfig;
