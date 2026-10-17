import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Un POS es 100 % dinámico (órdenes en vivo), así que usamos el modelo de
  // caché clásico: nada se cachea salvo que lo pidamos explícitamente.
  cacheComponents: false,
  // Genera un servidor autocontenido (.next/standalone) para la imagen Docker.
  output: "standalone",
  poweredByHeader: false,
  // Cabeceras básicas de seguridad (la app se expone a internet por la IP de la EC2).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
        ],
      },
    ];
  },
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
