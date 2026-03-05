import type { NextConfig } from "next";

const nextConfig: NextConfig & {
  eslint: {
    ignoreDuringBuilds: boolean;
  };
} = {
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;