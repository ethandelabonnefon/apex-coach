"use client";

/**
 * BedtimeAdvisor — section sur /diabete qui apparaît en soirée
 * (20h-2h du matin) pour conseiller l'utilisateur avant de se coucher.
 *
 * Combine : glycémie live + IOB + dernier repas (FPU restant) + sport
 * + split en attente + dawn phenomenon → prédiction T+2h/T+4h/Réveil
 * + recommandation actionnable (manger / corriger / attendre / dormir).
 *
 * UI :
 *  - Toggle on/off (par défaut on, mais collapsable)
 *  - 3 mini-jauges prédictions colorées par zone
 *  - Recommandation hero avec icône + bouton d'action si applicable
 *  - Breakdown discret du calcul (transparence)
 */

import { useEffect, useMemo, useState } from "react";
import {
  computeBedtimeAdvice,
  type BedtimeAdvisorInput,
  type BedtimePrediction,
} from "@/lib/bedtime-advisor";
import {
  Moon,
  Sunrise,
  Apple,
  Syringe,
  Eye,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Activity,
  Clock,
  X,
  Minus,
} from "lucide-react";

interface BedtimeAdvisorProps {
  input: BedtimeAdvisorInput;
  /** Callback pour logger une injection de correction depuis l'advisor. */
  onLogCorrection?: (units: number, notes: string) => void;
  /** Callback pour logger une collation. */
  onLogSnack?: (carbs: number) => void;
  /** Callback pour modifier les units d'un split en attente (0 = skip). */
  onAdjustSplit?: (newUnits: number) => void;
}

function predictionColor(glucose: number): string {
  if (glucose < 70) return "var(--error)";
  if (glucose < 90) return "var(--warning)";
  if (glucose <= 160) return "var(--success)";
  if (glucose <= 200) return "var(--warning)";
  return "var(--error)";
}

function predictionBg(glucose: number): string {
  if (glucose < 70 || glucose > 200) return "rgba(255,107,107,0.15)";
  if (glucose < 90 || glucose > 160) return "rgba(255,174,92,0.15)";
  return "rgba(122,229,130,0.15)";
}

export default function BedtimeAdvisor({
  input,
  onLogCorrection,
  onLogSnack,
  onAdjustSplit,
}: BedtimeAdvisorProps) {
  const [open, setOpen] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const advice = useMemo(() => computeBedtimeAdvice(input), [input]);

  function handleAction() {
    const a = advice.recommendation.action;
    if (!a) return;
    if (a.unit === "U" && onLogCorrection) {
      onLogCorrection(
        a.quantity,
        `Correction bedtime advisor (prédiction ${advice.predictions
          .map((p) => `${p.label} ${p.glucose}`)
          .join(", ")})`,
      );
    } else if (a.unit === "g" && onLogSnack) {
      onLogSnack(a.quantity);
    }
  }

  // ─── Icône + tone selon le type de reco ──────────────
  const recoStyle = (() => {
    switch (advice.recommendation.type) {
      case "all-good":
        return {
          Icon: CheckCircle2,
          bg: "bg-success/10",
          border: "border-success/30",
          text: "text-success",
        };
      case "eat-carbs":
        return {
          Icon: Apple,
          bg: "bg-warning/10",
          border: "border-warning/30",
          text: "text-warning",
        };
      case "correction-bolus":
        return {
          Icon: Syringe,
          bg: "bg-error/10",
          border: "border-error/30",
          text: "text-error",
        };
      case "wait-iob":
      case "monitor":
        return {
          Icon: Eye,
          bg: "bg-info/10",
          border: "border-info/30",
          text: "text-info",
        };
      default:
        return {
          Icon: AlertTriangle,
          bg: "bg-warning/10",
          border: "border-warning/30",
          text: "text-warning",
        };
    }
  })();

  return (
    <section className="surface-1 rounded-3xl p-5 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Moon className="w-4 h-4 text-accent-2" />
          <h2 className="text-base font-semibold text-text-primary">
            Briefing nuit
          </h2>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`text-text-tertiary hover:text-accent-2 transition-colors tap-scale ${
            open ? "" : "rotate-180"
          }`}
          aria-label={open ? "Masquer" : "Afficher"}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {!open ? (
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          Cliquez pour voir tes prédictions glycémie + recommandation pour la
          nuit.
        </p>
      ) : (
        <>
          {/* Recommandation hero */}
          <div
            className={`rounded-xl ${recoStyle.bg} border ${recoStyle.border} p-3 mb-3 flex items-start gap-2`}
          >
            <recoStyle.Icon
              className={`w-4 h-4 ${recoStyle.text} shrink-0 mt-0.5`}
            />
            <div className="min-w-0 flex-1">
              <p
                className={`text-xs font-semibold ${recoStyle.text} leading-snug`}
              >
                {advice.recommendation.headline}
              </p>
              <p className="text-[10px] text-text-secondary mt-1 leading-snug">
                {advice.recommendation.detail}
              </p>
              {advice.recommendation.action && (
                <button
                  type="button"
                  onClick={handleAction}
                  disabled={
                    advice.recommendation.action.unit === "U"
                      ? !onLogCorrection
                      : !onLogSnack
                  }
                  className={`mt-2 text-[10px] font-semibold ${recoStyle.text} bg-bg-tertiary border border-border-default hover:bg-bg-hover transition-colors px-3 py-1.5 rounded-md tap-scale disabled:opacity-50 inline-flex items-center gap-1`}
                >
                  {advice.recommendation.action.unit === "U" ? (
                    <Syringe className="w-3 h-3" />
                  ) : (
                    <Apple className="w-3 h-3" />
                  )}
                  Logger {advice.recommendation.action.label}
                </button>
              )}
            </div>
          </div>

          {/* Suggestion explicite sur le split dose en attente */}
          {advice.recommendation.splitAdjustment && (() => {
            const sa = advice.recommendation.splitAdjustment;
            const tone =
              sa.type === "skip" ? "bg-error/10 border-error/30 text-error"
              : sa.type === "reduce" ? "bg-warning/10 border-warning/30 text-warning"
              : "bg-info/10 border-info/30 text-info";
            const Icon = sa.type === "skip" ? X : sa.type === "reduce" ? Minus : Clock;
            const label =
              sa.type === "skip" ? `Skip le split (au lieu de ${sa.originalUnits}U)`
              : sa.type === "reduce" ? `Réduire à ${sa.suggestedUnits}U (au lieu de ${sa.originalUnits}U)`
              : `Garder ${sa.originalUnits}U comme prévu`;
            return (
              <div className={`rounded-xl border p-3 mb-3 flex items-start gap-2 ${tone}`}>
                <Icon className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold leading-snug">
                    Split dose en attente : {label}
                  </p>
                  <p className="text-[10px] text-text-secondary mt-1 leading-snug">
                    {sa.detail}
                  </p>
                  {(sa.type === "skip" || sa.type === "reduce") && onAdjustSplit && (
                    <button
                      type="button"
                      onClick={() => onAdjustSplit(sa.suggestedUnits)}
                      className="mt-2 text-[10px] font-semibold bg-bg-tertiary border border-border-default hover:bg-bg-hover transition-colors px-3 py-1.5 rounded-md tap-scale inline-flex items-center gap-1"
                    >
                      <Icon className="w-3 h-3" />
                      {sa.type === "skip" ? "Annuler le split" : `Réduire à ${sa.suggestedUnits}U`}
                    </button>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Prédictions */}
          <p className="label mb-2">Prédictions de la nuit</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {advice.predictions.map((p) => (
              <PredictionTile key={p.label} prediction={p} />
            ))}
          </div>

          {/* Breakdown (collapsable) */}
          <button
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
            className="text-[10px] text-text-tertiary hover:text-accent-2 transition-colors flex items-center gap-1"
          >
            <Activity className="w-3 h-3" />
            {showBreakdown ? "Masquer" : "Voir"} le détail du calcul
          </button>
          {showBreakdown && (
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <BreakdownRow
                label="IOB"
                value={`-${advice.breakdown.iobDrop} mg/dL`}
                tone="info"
              />
              {advice.breakdown.carbsRise > 0 && (
                <BreakdownRow
                  label="Glucides repas"
                  value={`+${advice.breakdown.carbsRise} mg/dL`}
                  tone="warning"
                />
              )}
              {advice.breakdown.fpuRise > 0 && (
                <BreakdownRow
                  label="FPU restant"
                  value={`+${advice.breakdown.fpuRise} mg/dL`}
                  tone="warning"
                />
              )}
              {advice.breakdown.splitDrop > 0 && (
                <BreakdownRow
                  label="Split en attente"
                  value={`-${advice.breakdown.splitDrop} mg/dL`}
                  tone="info"
                />
              )}
              {advice.breakdown.sportBoostDrop > 0 && (
                <BreakdownRow
                  label="Sport (sensi ↑)"
                  value={`-${advice.breakdown.sportBoostDrop} mg/dL`}
                  tone="info"
                />
              )}
              {advice.breakdown.trendShift !== 0 && (
                <BreakdownRow
                  label="Trend Libre"
                  value={`${advice.breakdown.trendShift > 0 ? "+" : ""}${advice.breakdown.trendShift} mg/dL`}
                  tone={advice.breakdown.trendShift < 0 ? "info" : "warning"}
                />
              )}
              {advice.breakdown.dawnBump > 0 && (
                <BreakdownRow
                  label="Dawn (4h-8h)"
                  value={`+${advice.breakdown.dawnBump} mg/dL`}
                  tone="warning"
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function PredictionTile({ prediction }: { prediction: BedtimePrediction }) {
  const isWakeup = prediction.label === "Réveil";
  const color = predictionColor(prediction.glucose);
  const bg = predictionBg(prediction.glucose);
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: bg }}>
      <div className="flex items-center justify-center gap-1 mb-1" style={{ color }}>
        {isWakeup ? (
          <Sunrise className="w-3 h-3" />
        ) : (
          <Moon className="w-3 h-3" />
        )}
        <p className="text-[9px] uppercase tracking-wide font-semibold">
          {prediction.label}
        </p>
      </div>
      <p className="num text-xl font-semibold tabular-nums" style={{ color }}>
        {prediction.glucose}
      </p>
      <p className="text-[9px] opacity-70" style={{ color }}>
        {prediction.hourLabel}
      </p>
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "info" | "warning";
}) {
  return (
    <div className="bg-bg-tertiary rounded-md px-2 py-1.5 flex items-center justify-between">
      <span className="text-text-tertiary uppercase tracking-wide text-[9px] font-semibold">
        {label}
      </span>
      <span
        className={`num font-semibold ${
          tone === "info" ? "text-info" : "text-warning"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
