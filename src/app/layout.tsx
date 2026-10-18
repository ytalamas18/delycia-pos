import type { Metadata, Viewport } from "next";

import { appConfig } from "@/core/config/app";
import { themeBootScript } from "@/lib/theme";

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
    // suppressHydrationWarning: el script de tema agrega la clase "dark" antes de que React hidrate.
    <html lang="es" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
