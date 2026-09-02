"use client";

/**
 * Tuile « Glucides actifs » — pendant de la tuile Insuline active.
 *
 * Affiche ce qu'il reste à digérer et le verdict de couverture. Ne porte
 * JAMAIS de bouton d'action : les doses se valident dans la carte de
 * confirmation, pour qu'il n'y ait qu'un seul endroit où une dose part.
 */

import { Wheat } from "lucide-react";
import type { CarbsOnBoard } from "@/lib/carbs-on-board";

function fr(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function CarbsOnBoardTile({ cob }: { cob: CarbsOnBoard }) {
  const tone =
    cob.status === "deficit"
      ? "warning"
      : cob.status === "excess"
        ? "info"
        : cob.status === "idle"
          ? "idle"
          : "nutrition";

  const colorClass =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
        ? "text-info"
        : tone === "idle"
          ? "text-text-tertiary"
          : "text-nutrition";

  const iconBg =
    tone === "warning"
      ? "bg-warning/10"
      : tone === "info"
        ? "bg-info/10"
        : "bg-nutrition/10";

  let verdict: string;
  if (cob.status === "idle") {
    verdict = "Rien en cours";
  } else if (cob.uncertain) {
    verdict = "Quantité incertaine — pas de conseil de dose";
  } else if (cob.status === "deficit") {
    verdict = `Il manque ~${fr(Math.abs(cob.balanceU))} U`;
  } else if (cob.status === "excess") {
    verdict = `Insuline en excès ~${fr(cob.balanceU)} U`;
  } else {
    verdict = "Couvert";
  }

  return (
    <div className="surface-2 rounded-2xl p-5 flex items-center gap-5">
      <div
        className={`shrink-0 w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}
      >
        <Wheat className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="label mb-1">Glucides actifs</p>
        <div className="flex items-baseline gap-1.5">
          <span
            className={`num-hero text-4xl sm:text-5xl font-semibold leading-none ${colorClass}`}
          >
            {cob.uncertain ? "≈" : ""}
            {Math.round(cob.totalRemainingG)}
          </span>
          <span className="text-xs text-text-tertiary">g</span>
        </div>
        {cob.fpuRemainingG >= 1 && (
          <p className="mt-1 text-[11px] text-text-tertiary">
            dont {Math.round(cob.fpuRemainingG)} g de lipides/protéines
          </p>
        )}
        <p className="mt-1 text-xs text-text-secondary">{verdict}</p>
      </div>
    </div>
  );
}
