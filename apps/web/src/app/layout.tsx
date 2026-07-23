import type { Metadata, Viewport } from "next";

import { ServiceWorker } from "@/components/service-worker";
import { ToastViewport } from "@/components/toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Junaidi Quotations",
  description: "Hajj quotation system for Junaidi Air Travels",
  applicationName: "Junaidi Quotations",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Junaidi", statusBarStyle: "default" },
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/apple-touch.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#dc2626",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ToastViewport />
        <ServiceWorker />
      </body>
    </html>
  );
}
