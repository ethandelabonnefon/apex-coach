import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import CoachProvider from "@/components/coach/CoachProvider";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { InstallBanner } from "@/components/InstallBanner";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "APEX Coach — Fitness, Nutrition & T1D",
  description: "Coach personnel intelligent : musculation, running, nutrition et gestion du diabète T1",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "APEX Coach",
  },
};

export const viewport: Viewport = {
  themeColor: "#00ff94",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="APEX Coach" />
      </head>
      <body className="min-h-full bg-[#0a0a0f] text-white">
        <OfflineIndicator />
        <div className="flex min-h-screen">
          <Navigation />
          <main className="flex-1 ml-0 md:ml-64 pb-20 md:pb-0">{children}</main>
          <CoachProvider />
        </div>
        <InstallBanner />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
