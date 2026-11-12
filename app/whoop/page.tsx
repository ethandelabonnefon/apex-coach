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
      <div className="mb-4">
        <Link
          href="/diabete/parametres"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary transition-colors tap-scale"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Réglages</span>
        </Link>
      </div>

      <WhoopCard variant="full" />
    </div>
  );
}
