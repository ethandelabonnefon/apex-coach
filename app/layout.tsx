import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import CoachProvider from "@/components/coach/CoachProvider";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { InstallBanner } from "@/components/InstallBanner";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

export const metadata: Metadata = {
  title: "APEX Coach — Fitness, Nutrition & T1D",
  description: "Coach personnel intelligent : musculation, running, nutrition et gestion du diabète T1",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "APEX Coach",
  },
};

export const viewport: Viewport = {
  themeColor: "#F2F2F7",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className="h-full antialiased">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="APEX Coach" />
      </head>
      <body className="min-h-full bg-bg-primary text-text-primary">
        <OfflineIndicator />
        <Navigation />
        <div className="lg:ml-60 min-h-screen pb-24 lg:pb-0">
          <main>{children}</main>
        </div>
        <CoachProvider />
        <InstallBanner />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
