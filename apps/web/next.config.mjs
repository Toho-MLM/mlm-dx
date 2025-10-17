import { setupDevPlatform } from '@cloudflare/next-on-pages/next-dev';

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

// Cloudflare Pages用の開発環境設定
if (process.env.NODE_ENV === 'development') {
  setupDevPlatform();
}

export default nextConfig;
