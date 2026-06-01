"use client";

/**
 * Page /whoop — vue détaillée des données Whoop (Phase F2 UI).
 *
 * Affiche le WhoopCard en variant "full" : recovery + strain gauges,
 * HRV/RHR, sommeil, dernier workout. Bouton retour vers Dashboard.
 */

import Link from "next/link";
import WhoopCard from "@/components/whoop/WhoopCard";
import { ArrowLeft } from "lucide-react";

export default function WhoopPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 stagger">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-running transition-colors tap-scale"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Dashboard</span>
        </Link>
        <Link
          href="/diabete/parametres"
          className="text-xs text-text-tertiary hover:text-running transition-colors"
        >
          Paramètres Whoop →
        </Link>
      </div>

      <WhoopCard variant="full" />
    </div>
  );
}
