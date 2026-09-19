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
          : "text-text-primary";

  const led =
    verdict.tone === "warning" ? "amber" : verdict.tone === "info" ? "cobalt" : verdict.tone === "idle" ? "steel" : "green";

  return (
    <div className="cell">
      <div className="flex items-center gap-2">
        <span className={`led ${led}`} />
        <span className="eyebrow">Glucides actifs</span>
      </div>
      <div className={`v mt-2 ${colorClass}`}>
        {verdict.approximate ? "≈" : ""}
        {Math.round(cob.totalRemainingG)}
        <small>g</small>
      </div>
      <div className="l">
        {cob.fpuRemainingG >= 1 ? `dont ${Math.round(cob.fpuRemainingG)} g lip/prot · ` : ""}
        {verdict.text}
      </div>
    </div>
  );
}
