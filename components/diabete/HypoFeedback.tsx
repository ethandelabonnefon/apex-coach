"use client";

/**
 * HypoFeedback — affiche les hypos récentes avec leur évaluation
 * (just-right / too-much / too-little) pour apprentissage continu.
 *
 * Apparaît sur /diabete sous le HypoLogger (ou seul si pas d'hypo en
 * cours). Affiche les 3 dernières hypos analysées des 24h passées.
 */

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { buildHypoFeedback, findPeak, estimatePersonalGRG } from "@/lib/hypo-resucrage";
import { TrendingUp, Award, Sparkle, Trash2 } from "lucide-react";

export default function HypoFeedback() {
  const hypoEvents = useStore((s) => s.hypoEvents);
  const removeHypoEvent = useStore((s) => s.removeHypoEvent);

  const recentEvents = useMemo(() => {
    const cutoff = Date.now() - 24 * 3_600_000;
    return hypoEvents
      .filter((e) => new Date(e.detectedAt).getTime() > cutoff)
      .sort(
        (a, b) =>
          new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
      )
      .slice(0, 3);
  }, [hypoEvents]);

  const grg = useMemo(() => estimatePersonalGRG(hypoEvents), [hypoEvents]);

  if (recentEvents.length === 0) return null;

  return (
    <section className="surface-1 rounded-3xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Award className="w-4 h-4 text-warning" />
          <h2 className="text-base font-semibold text-text-primary">
            Hypos récentes
          </h2>
        </div>
        {!grg.isDefault && (
          <div className="text-[10px] text-text-tertiary flex items-center gap-1">
            <Sparkle className="w-3 h-3 text-warning" />
            GRG perso :{" "}
            <span className="num font-semibold text-warning">
              +{grg.value.toFixed(1).replace(".", ",")} mg/dL/g
            </span>
            <span className="opacity-70">({grg.confidence})</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {recentEvents.map((event) => {
          const feedback = buildHypoFeedback(event);
          const tone =
            feedback.tone === "success"
              ? "bg-success/10 border-success/30 text-success"
              : feedback.tone === "warning"
              ? "bg-warning/10 border-warning/30 text-warning"
              : feedback.tone === "error"
              ? "bg-error/10 border-error/30 text-error"
              : "bg-info/10 border-info/30 text-info";
          const peak = event.peakGlucose ?? findPeak(event);
          return (
            <div
              key={event.id}
              className={`rounded-xl border p-3 ${tone}`}
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-base shrink-0" aria-hidden>
                    {feedback.emoji}
                  </span>
                  <p className="text-xs font-semibold leading-snug truncate">
                    {feedback.headline}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="num text-[10px] text-text-tertiary">
                    {new Date(event.detectedAt).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeHypoEvent(event.id)}
                    aria-label="Supprimer"
                    className="text-text-tertiary hover:text-error transition-colors tap-scale"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-text-secondary leading-snug">
                {feedback.detail}
              </p>
              {feedback.nextTime && (
                <p className="text-[10px] text-text-primary mt-1 leading-snug italic">
                  💡 {feedback.nextTime}
                </p>
              )}
              {/* Mini-courbe en chiffres */}
              <div className="num flex items-center gap-2 text-[9px] text-text-tertiary mt-2 flex-wrap">
                <span>
                  Init : <span className="font-semibold text-text-primary">{event.initialGlucose}</span>
                </span>
                {event.glucoseAt15min !== null && (
                  <span>
                    +15m : <span className="font-semibold text-text-primary">{event.glucoseAt15min}</span>
                  </span>
                )}
                {event.glucoseAt30min !== null && (
                  <span>
                    +30m : <span className="font-semibold text-text-primary">{event.glucoseAt30min}</span>
                  </span>
                )}
                {event.glucoseAt60min !== null && (
                  <span>
                    +60m : <span className="font-semibold text-text-primary">{event.glucoseAt60min}</span>
                  </span>
                )}
                {peak !== null && (
                  <span className="flex items-center gap-0.5">
                    <TrendingUp className="w-2.5 h-2.5" />
                    Pic <span className="font-semibold text-text-primary">{peak}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
