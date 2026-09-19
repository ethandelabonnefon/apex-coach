import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/navigation";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { InstallBanner } from "@/components/InstallBanner";
import { ServiceWorkerRegistrar } from "@/components/ServiceWorkerRegistrar";

// Brand v5 "Instrument" : titres Bricolage, texte Instrument Sans,
// données IBM Plex Mono. Exposées en variables CSS, consommées par
// globals.css (--font-sans / --font-display / --font-mono).
const instrumentSans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-instrument-sans",
  display: "swap",
});
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-bricolage",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "APEX — Endurance, nutrition & T1D",
  description: "Tableau de bord d'endurance et de santé métabolique : séances, running, nutrition et gestion du diabète T1",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "APEX",
  },
};

export const viewport: Viewport = {
  // Couleur de base (light) ; corrigée pré-paint par le script inline
  // et maintenue à jour par useTheme selon le thème résolu.
  themeColor: "#eef1f4",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

// Pose data-theme + theme-color AVANT le premier paint pour éviter tout flash.
const THEME_INIT_SCRIPT = `
(function(){try{var c=localStorage.getItem('apex-theme');var d=document.documentElement;var dark;
if(c==='dark'){d.setAttribute('data-theme','dark');dark=true;}
else if(c==='light'){d.setAttribute('data-theme','light');dark=false;}
else{dark=window.matchMedia('(prefers-color-scheme: dark)').matches;}
var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',dark?'#14191f':'#eef1f4');
}catch(e){}})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="fr"
      className={`h-full antialiased ${instrumentSans.variable} ${bricolage.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* Pose data-theme + theme-color avant le premier paint (anti-FOUC).
            <html suppressHydrationWarning> car ce script mute l'attribut
            data-theme avant l'hydratation React (pattern standard). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <link rel="icon" href="/favicon.ico" sizes="48x48" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="APEX" />
      </head>
      <body className="min-h-full bg-bg-primary text-text-primary">
        <OfflineIndicator />
        <Navigation />
        <div className="lg:ml-60 min-h-screen pb-24 lg:pb-0">
          <main>{children}</main>
        </div>
        <InstallBanner />
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
