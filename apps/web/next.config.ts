import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@threadform/ui'],
  reactStrictMode: true,
};

export default nextConfig;
