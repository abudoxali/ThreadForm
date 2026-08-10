import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@threadform/ui', '@threadform/project-engine', '@threadform/local-storage'],
  reactStrictMode: true,
};

export default nextConfig;
