import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Un POS es 100 % dinámico (órdenes en vivo), así que usamos el modelo de
  // caché clásico: nada se cachea salvo que lo pidamos explícitamente.
  cacheComponents: false,
  // Genera un servidor autocontenido (.next/standalone) para la imagen Docker.
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
