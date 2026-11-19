import type { Metadata, Viewport } from "next";
import "./globals.css";
import { NexoProvider } from "@/lib/store/NexoProvider";
import { Toaster } from "@/components/ui/kit";

export const metadata: Metadata = {
  title: "Nexoresto · Gastronomía en tiempo real",
  description: "Sistema gastronómico todo-en-uno con precios dinámicos tipo bolsa, KDS, POS, delivery GPS, carta QR social e IA.",
  applicationName: "Nexoresto",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#05070a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
      </head>
      <body>
        <NexoProvider>{children}</NexoProvider>
        <Toaster />
      </body>
    </html>
  );
}
