"use client";

import { usePWA } from "@/hooks/usePWA";
import { useState, useEffect } from "react";

export function InstallBanner() {
  const { isInstalled, isStandalone, canInstall, promptInstall } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    setIsIOS(ios);

    const wasDismissed = localStorage.getItem("install-banner-dismissed");
    if (wasDismissed) setDismissed(true);
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem("install-banner-dismissed", "true");
  };

  if (!mounted || isInstalled || isStandalone || dismissed) return null;
  // Only show on iOS (manual install prompt) or if browser supports install prompt
  if (!isIOS && !canInstall) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 bg-gradient-to-r from-white to-white rounded-2xl p-4 shadow-lg border border-black/[0.06] z-50 lg:hidden">
      <button
        onClick={handleDismiss}
        className="absolute top-2 right-3 text-text-tertiary hover:text-text-primary text-lg"
      >
        &times;
      </button>

      <div className="flex items-center gap-4">
        <div className="text-3xl shrink-0">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <rect width="32" height="32" rx="8" fill="#007AFF" />
            <text x="16" y="22" textAnchor="middle" fill="#ffffff" fontSize="14" fontWeight="bold">A</text>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-sm">Installe APEX Coach</h3>
          <p className="text-xs text-text-secondary mt-0.5">
            {isIOS
              ? "Appuie sur Partager puis \"Sur l'écran d'accueil\""
              : "Ajoute l'app sur ton écran d'accueil"}
          </p>
        </div>

        {canInstall && !isIOS && (
          <button
            onClick={promptInstall}
            className="px-3 py-1.5 bg-[#007AFF] text-white rounded-xl text-sm font-semibold shrink-0"
          >
            Installer
          </button>
        )}
      </div>
    </div>
  );
}
