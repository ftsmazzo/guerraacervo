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
    // Evita lista de Livros “congelada” após reserva via webhook/WhatsApp
    staleTimes: {
      dynamic: 0,
      static: 30,
    },
  },
};

export default nextConfig;
