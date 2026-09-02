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
    // Mobile (< sm, ex: 375px) : icône empilée AU-DESSUS du texte plutôt
    // qu'à côté. À 140px de large avec l'icône côte à côte (48px + gap-5 20px
    // + p-5 40px = 108px d'overhead), il ne restait que 32px pour un contenu
    // qui en demande ~69 (chiffre + suffixe « g ») → le suffixe débordait et
    // le verdict textuel — l'élément porteur de sens de cette tuile — se
    // repliait sur 3 lignes. Empiler rend au texte toute la largeur de la
    // tuile (moins le padding) : le verdict reste lisible avant le confort
    // visuel de l'icône, qui redevient normale à partir de `sm`.
    <div className="surface-2 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
      <div
        className={`shrink-0 w-8 h-8 sm:w-12 sm:h-12 rounded-xl ${iconBg} flex items-center justify-center`}
      >
        <Wheat className={`w-4 h-4 sm:w-5 sm:h-5 ${colorClass}`} />
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
