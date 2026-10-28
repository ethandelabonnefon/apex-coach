"use client";

/**
 * NightReviewCard — l'avis du matin sur /diabete.
 *
 * De 5h à 12h, demande si la nuit qui vient de finir doit nourrir les
 * calibrations (dérive basale, dawn, biais du réveil, glucides tardifs).
 * « Non » = nuit exclue (alcool, maladie, capteur douteux…), réintégrable
 * plus tard depuis la ligne de calibration du plan de nuit.
 */

import { Sunrise } from "lucide-react";
import { pendingMorningReview, type NightReview } from "@/lib/night-review";

// Aucun choix pré-sélectionné : les deux réponses ont le même poids.
const ANSWER_STYLE = { color: "var(--text-primary)" } as const;

function nightLabel(night: string): string {
  const [y, m, d] = night.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function NightReviewCard({
  nowMs,
  reviews,
  onAnswer,
}: {
  nowMs: number;
  reviews: NightReview[];
  onAnswer: (night: string, counted: boolean) => void;
}) {
  const night = pendingMorningReview(nowMs, reviews);
  if (!night) return null;

  return (
    <section className="panel mb-4">
      <div className="panel-hd">
        <div className="flex items-center gap-2">
          <Sunrise className="w-4 h-4" />
          <h2>Compter cette nuit dans les algorithmes ?</h2>
        </div>
      </div>
      <p className="text-[12px] text-text-secondary leading-snug mb-3">
        Nuit du {nightLabel(night)}. Réponds non si elle n&apos;est pas
        représentative (alcool, maladie, capteur douteux) : elle ne servira
        plus à calibrer ton plan de nuit.
      </p>
      <div className="seg" role="group" aria-label="Compter cette nuit">
        <button type="button" className="tap-scale" style={ANSWER_STYLE} onClick={() => onAnswer(night, true)}>
          Oui
        </button>
        <button type="button" className="tap-scale" style={ANSWER_STYLE} onClick={() => onAnswer(night, false)}>
          Non
        </button>
      </div>
    </section>
  );
}
