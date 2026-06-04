"use client";

/**
 * HypoLogger — Phase H (juin 2026).
 *
 * Apparaît sur /diabete UNIQUEMENT quand la glycémie est < 80 mg/dL
 * (détection auto via live FreeStyle Libre). Affiche :
 *  - Glycémie actuelle en rouge
 *  - Suggestion de glucides (basée sur GRG perso ou défaut)
 *  - Quick-chips 8 / 10 / 15 / 20 / 30 g + saisie libre
 *  - Bouton "J'ai mangé Xg" qui crée un HypoEvent dans le store
 *
 * Le composant ne FAIT PAS l'analyse — c'est le hook useHypoTracker
 * qui poll la glycémie après log pour enrichir les checkpoints.
 *
 * Workflow utilisateur :
 *  1. Glycémie chute à 65 → HypoLogger apparaît
 *  2. Suggestion : "Mange 12g (basé sur ton GRG perso 4.5)"
 *  3. Quick-tap "10g" → HypoEvent créé avec carbsConsumed: 10
 *  4. 15-30-45-60 min plus tard, checkpoints auto-fetchés
 *  5. Feedback final : "too-much / just-right / too-little"
 */

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import {
  estimatePersonalGRG,
  suggestCarbsForHypo,
} from "@/lib/hypo-resucrage";
import {
  AlertTriangle,
  Apple,
  Plus,
  Minus,
  TrendingUp,
  Sparkle,
} from "lucide-react";

interface HypoLoggerProps {
  /** Glycémie actuelle (live ou manuelle). */
  currentGlucose: number;
  /** Trend numérique pour info contextuelle. */
  trendArrow?: number;
}

const QUICK_CARBS = [8, 10, 15, 20, 30];

export default function HypoLogger({ currentGlucose, trendArrow }: HypoLoggerProps) {
  const hypoEvents = useStore((s) => s.hypoEvents);
  const addHypoEvent = useStore((s) => s.addHypoEvent);

  // GRG perso basé sur les hypos passées
  const grg = useMemo(() => estimatePersonalGRG(hypoEvents), [hypoEvents]);
  const suggestion = useMemo(
    () => suggestCarbsForHypo(currentGlucose, grg),
    [currentGlucose, grg],
  );

  const [selectedCarbs, setSelectedCarbs] = useState<number>(suggestion.grams);
  const [logged, setLogged] = useState(false);

  // Vérifier s'il y a déjà une hypo récente (< 30min) pour éviter le double-log
  const recentHypo = useMemo(() => {
    const cutoff = Date.now() - 30 * 60_000;
    return hypoEvents.find((e) => new Date(e.detectedAt).getTime() > cutoff);
  }, [hypoEvents]);

  function handleLogCarbs() {
    if (selectedCarbs <= 0) return;
    const now = new Date();
    addHypoEvent({
      id: crypto.randomUUID(),
      detectedAt: now.toISOString(),
      initialGlucose: currentGlucose,
      carbsConsumed: selectedCarbs,
      consumedAt: now.toISOString(),
      glucoseAt15min: null,
      glucoseAt30min: null,
      glucoseAt45min: null,
      glucoseAt60min: null,
      peakGlucose: null,
      assessment: "pending",
    });
    setLogged(true);
  }

  // Si récemment loggé → message de confirmation au lieu du formulaire
  if (recentHypo || logged) {
    return (
      <section className="surface-1 rounded-3xl p-5 mb-4 border border-warning/40 bg-warning/5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-warning/15 flex items-center justify-center">
            <Apple className="w-5 h-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-text-primary">
              Re-sucrage enregistré
            </p>
            <p className="text-xs text-text-secondary mt-1 leading-snug">
              {recentHypo?.carbsConsumed || selectedCarbs}g de glucides à{" "}
              <span className="num">
                {new Date(recentHypo?.consumedAt ?? Date.now()).toLocaleTimeString(
                  "fr-FR",
                  { hour: "2-digit", minute: "2-digit" },
                )}
              </span>
              . Re-checke ta glycémie dans 15 min — le feedback arrivera
              automatiquement.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="surface-1 rounded-3xl p-5 mb-4 border border-error/40 bg-error/5">
      {/* Header alerte */}
      <div className="flex items-start gap-3 mb-4">
        <div className="shrink-0 w-12 h-12 rounded-xl bg-error/15 flex items-center justify-center animate-pulse">
          <AlertTriangle className="w-6 h-6 text-error" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="label text-error">Hypoglycémie détectée</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="num-hero text-3xl font-semibold text-error tabular-nums">
              {currentGlucose}
            </span>
            <span className="text-xs text-error/70">mg/dL</span>
            {trendArrow !== undefined && trendArrow <= 2 && (
              <span className="text-[10px] text-error font-semibold uppercase tracking-wide">
                en descente
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Suggestion GRG */}
      <div className="rounded-xl bg-bg-tertiary border border-border-subtle p-3 mb-4 flex items-start gap-2">
        <Sparkle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-text-primary leading-snug">
            Suggestion :{" "}
            <span className="num text-warning">{suggestion.grams}g</span> de
            glucides rapides
          </p>
          <p className="text-[10px] text-text-tertiary mt-1 leading-snug">
            {suggestion.detail} Cible : ~110 mg/dL après 20-30 min.
          </p>
          {grg.sampleSize === 0 && (
            <p className="text-[10px] text-text-tertiary mt-1 italic">
              Exemples : 1 jus de fruit ≈ 15g · 1 sucre ≈ 5g · 1 gel ≈ 15-20g
            </p>
          )}
        </div>
      </div>

      {/* Quick-chips */}
      <p className="label mb-2">Combien comptes-tu manger ?</p>
      <div className="grid grid-cols-5 gap-1.5 mb-3">
        {QUICK_CARBS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setSelectedCarbs(g)}
            className={`py-2 text-sm font-semibold rounded-lg border transition-all tap-scale tabular-nums ${
              selectedCarbs === g
                ? "bg-warning/15 border-warning/40 text-warning"
                : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default"
            }`}
          >
            {g}g
          </button>
        ))}
      </div>

      {/* Stepper +/- pour ajustement fin */}
      <div className="flex items-center justify-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => setSelectedCarbs((v) => Math.max(0, v - 1))}
          className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center text-text-primary hover:bg-bg-hover transition-colors tap-scale"
          aria-label="Moins 1g"
        >
          <Minus className="w-4 h-4" />
        </button>
        <div className="min-w-[80px] text-center">
          <span className="num-hero text-3xl font-semibold text-warning tabular-nums">
            {selectedCarbs}
          </span>
          <span className="text-xs text-text-tertiary ml-1">g</span>
        </div>
        <button
          type="button"
          onClick={() => setSelectedCarbs((v) => v + 1)}
          className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center text-text-primary hover:bg-bg-hover transition-colors tap-scale"
          aria-label="Plus 1g"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Bouton valider */}
      <button
        type="button"
        onClick={handleLogCarbs}
        disabled={selectedCarbs <= 0}
        className="w-full bg-warning text-ink font-semibold py-3 rounded-xl hover:bg-warning/90 transition-colors tap-scale disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Apple className="w-4 h-4" />
        J&apos;ai mangé {selectedCarbs}g
      </button>

      {/* Note finale */}
      <p className="text-[10px] text-text-tertiary text-center mt-3 leading-relaxed">
        On va auto-tracker ta glycémie aux checkpoints +15/+30/+45/+60 min et te
        dire si c&apos;était optimal ou pas. L&apos;app apprend ton GRG perso à
        chaque hypo.
      </p>
    </section>
  );
}
