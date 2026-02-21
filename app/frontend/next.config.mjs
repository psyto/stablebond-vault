/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@stablebond/sdk", "@stablebond/types"],
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      os: false,
      path: false,
      crypto: false,
    };
    return config;
  },
};

export default nextConfig;
