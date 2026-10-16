import type { Metadata, Viewport } from "next";

import { appConfig } from "@/core/config/app";

import "./globals.css";

export const metadata: Metadata = {
  title: `${appConfig.businessName} POS`,
  description: "Punto de venta y pantalla de cocina",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Pantallas táctiles: sin zoom accidental.
  maximumScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
