import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname),
  experimental: {
    serverActions: {
      // Capas podem ir como data URL comprimida no formulário
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
