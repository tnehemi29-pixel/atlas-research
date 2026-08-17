/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@erp/types'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'images.financialmodelingprep.com',
      },
    ],
  },
};

export default nextConfig;
