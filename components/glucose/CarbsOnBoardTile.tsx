"use client";

/**
 * Tuile « Glucides actifs » — pendant de la tuile Insuline active.
 *
 * Affiche ce qu'il reste à digérer et le verdict de couverture. Ne porte
 * JAMAIS de bouton d'action : les doses se valident dans la carte de
 * confirmation, pour qu'il n'y ait qu'un seul endroit où une dose part.
 *
 * Le verdict lui-même vit dans `lib/carbs-on-board.ts` (`cobVerdict`) :
 * c'est une règle de sécurité (l'alerte d'excès d'insuline doit survivre à
 * un repas incertain), elle est testée, pas réimplémentée ici.
 */

import { Wheat } from "lucide-react";
import { cobVerdict, type CarbsOnBoard } from "@/lib/carbs-on-board";

export function CarbsOnBoardTile({ cob }: { cob: CarbsOnBoard }) {
  const verdict = cobVerdict(cob);

  const colorClass =
    verdict.tone === "warning"
      ? "text-warning"
      : verdict.tone === "info"
        ? "text-info"
        : verdict.tone === "idle"
          ? "text-text-tertiary"
          : "text-nutrition";

  const iconBg =
    verdict.tone === "warning"
      ? "bg-warning/10"
      : verdict.tone === "info"
        ? "bg-info/10"
        : "bg-nutrition/10";

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
            {verdict.approximate ? "≈" : ""}
            {Math.round(cob.totalRemainingG)}
          </span>
          <span className="text-xs text-text-tertiary">g</span>
        </div>
        {cob.fpuRemainingG >= 1 && (
          <p className="mt-1 text-[11px] text-text-tertiary">
            dont {Math.round(cob.fpuRemainingG)} g de lipides/protéines
          </p>
        )}
        <p className="mt-1 text-xs text-text-secondary">{verdict.text}</p>
      </div>
    </div>
  );
}
