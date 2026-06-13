"use client";

/**
 * NightBrain — la « tête pensante » du soir sur /diabete.
 *
 * Remplace l'empilement de cartes (HypoLogger + rappel split + BedtimeAdvisor
 * + correction) par UNE carte : un plan ordonné et cohérent pour la nuit.
 * Chaque étape est numérotée, colorée par tone, avec un bouton d'action
 * inline qui modifie directement le store (manger / split / correction).
 *
 * Visible en soirée uniquement (câblé côté page, 20h-2h).
 */

import { useMemo, useState } from "react";
import {
  computeNightPlan,
  type NightBrainInput,
  type NightStep,
} from "@/lib/night-brain";
import type { BedtimePrediction } from "@/lib/bedtime-advisor";
import {
  Moon,
  Sunrise,
  Apple,
  Syringe,
  Eye,
  Clock,
  CheckCircle2,
  ChevronDown,
  Activity,
  AlertTriangle,
  X,
  Minus,
} from "lucide-react";
import type { ComponentType } from "react";

interface NightBrainProps {
  input: NightBrainInput;
  /** Statut de calibration perso (transparence). */
  calibration?: {
    driftPerHour: number;
    driftNights: number;
    dawnDays: number;
    verifiedNights: number;
    bias: number;
  };
  /** Logge une prise de glucides en cas d'hypo (crée un HypoEvent). */
  onLogHypoCarbs?: (grams: number) => void;
  /** Logge une injection de correction. */
  onLogCorrection?: (units: number, notes: string) => void;
  /** Confirme (logge) le split en attente le plus proche. */
  onConfirmSplit?: () => void;
  /** Ajuste les units du split en attente (0 = annuler). */
  onAdjustSplit?: (newUnits: number) => void;
}

// ── Style par tone ──────────────────────────────────────────────────
const TONE: Record<
  NightStep["tone"],
  { bg: string; border: string; text: string; ring: string }
> = {
  success: { bg: "bg-success/10", border: "border-success/30", text: "text-success", ring: "bg-success/15" },
  warning: { bg: "bg-warning/10", border: "border-warning/30", text: "text-warning", ring: "bg-warning/15" },
  error: { bg: "bg-error/10", border: "border-error/30", text: "text-error", ring: "bg-error/15" },
  info: { bg: "bg-info/10", border: "border-info/30", text: "text-info", ring: "bg-info/15" },
};

const STEP_ICON: Record<NightStep["kind"], ComponentType<{ className?: string }>> = {
  coverage: AlertTriangle,
  "eat-now": Apple,
  "split-keep": Syringe,
  "split-reduce": Minus,
  "split-skip": X,
  correction: Syringe,
  wait: Eye,
  recheck: Clock,
  "all-good": CheckCircle2,
};

function predictionColor(g: number): string {
  if (g < 70) return "var(--error)";
  if (g < 90) return "var(--warning)";
  if (g <= 160) return "var(--success)";
  if (g <= 200) return "var(--warning)";
  return "var(--error)";
}
function predictionBg(g: number): string {
  if (g < 70 || g > 200) return "rgba(255,107,107,0.15)";
  if (g < 90 || g > 160) return "rgba(255,174,92,0.15)";
  return "rgba(122,229,130,0.15)";
}

export default function NightBrain({
  input,
  calibration,
  onLogHypoCarbs,
  onLogCorrection,
  onConfirmSplit,
  onAdjustSplit,
}: NightBrainProps) {
  const [open, setOpen] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  const plan = useMemo(() => computeNightPlan(input), [input]);

  // Numérotation : seules les actions concrètes portent un numéro.
  const badges = useMemo(() => {
    let n = 0;
    return plan.steps.map((s) =>
      s.kind === "all-good" || s.kind === "recheck" || s.kind === "coverage"
        ? ""
        : String(++n),
    );
  }, [plan.steps]);

  function markDone(id: string) {
    setDoneIds((prev) => new Set(prev).add(id));
  }

  function handleAction(step: NightStep) {
    const a = step.action;
    if (!a) return;
    switch (a.kind) {
      case "log-carbs":
        onLogHypoCarbs?.(a.quantity);
        break;
      case "log-correction":
        onLogCorrection?.(
          a.quantity,
          `Correction night brain (réveil prévu ~${plan.predictions[plan.predictions.length - 1]?.glucose})`,
        );
        break;
      case "confirm-split":
        onConfirmSplit?.();
        break;
      case "adjust-split":
        onAdjustSplit?.(a.quantity);
        break;
    }
    markDone(step.id);
  }

  return (
    <section className="surface-1 rounded-3xl p-5 mb-4 border border-accent-2/30">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="shrink-0 w-9 h-9 rounded-xl bg-accent-2/15 flex items-center justify-center">
            <Moon className="w-4 h-4 text-accent-2" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary leading-tight">
              {plan.title}
            </h2>
            <p className="text-[11px] text-text-tertiary mt-0.5 truncate">
              {plan.subtitle}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`text-text-tertiary hover:text-accent-2 transition-colors tap-scale shrink-0 ${
            open ? "" : "rotate-180"
          }`}
          aria-label={open ? "Masquer" : "Afficher"}
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>

      {!open ? (
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          {plan.steps.length} étape{plan.steps.length > 1 ? "s" : ""} pour la
          nuit. Clique pour voir ton plan.
        </p>
      ) : (
        <>
          {/* Étapes ordonnées — on ne numérote que les actions concrètes */}
          <ol className="space-y-2 mb-4">
            {plan.steps.map((step, i) => {
              const tone = TONE[step.tone];
              const Icon = STEP_ICON[step.kind];
              const done = doneIds.has(step.id);
              const badge = badges[i];
              return (
                <li
                  key={step.id}
                  className={`rounded-xl border p-3 ${tone.border} ${
                    done ? "opacity-60" : tone.bg
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Numéro + icône */}
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <span
                        className={`w-6 h-6 rounded-full ${tone.ring} ${tone.text} text-xs font-bold flex items-center justify-center num`}
                      >
                        {badge}
                      </span>
                      <Icon className={`w-3.5 h-3.5 ${tone.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${tone.text} leading-snug`}>
                        {step.headline}
                      </p>
                      <p className="text-[11px] text-text-secondary mt-1 leading-snug">
                        {step.detail}
                      </p>
                      {step.action && (
                        <button
                          type="button"
                          onClick={() => handleAction(step)}
                          disabled={done}
                          className={`mt-2 text-[11px] font-semibold ${tone.text} bg-bg-tertiary border border-border-default hover:bg-bg-hover transition-colors px-3 py-1.5 rounded-md tap-scale inline-flex items-center gap-1 disabled:opacity-50`}
                        >
                          {done ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> Fait
                            </>
                          ) : (
                            <>
                              <Icon className="w-3 h-3" /> {step.action.label}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {/* Prédictions */}
          <p className="label mb-2">Prédictions de la nuit</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {plan.predictions.map((p) => (
              <PredictionTile key={p.label} prediction={p} />
            ))}
          </div>

          {/* Breakdown */}
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
              <BreakdownRow label="IOB" value={`-${plan.breakdown.iobDrop} mg/dL`} tone="info" />
              {plan.breakdown.carbsRise > 0 && (
                <BreakdownRow label="Glucides repas" value={`+${plan.breakdown.carbsRise} mg/dL`} tone="warning" />
              )}
              {plan.breakdown.fpuRise > 0 && (
                <BreakdownRow label="FPU restant" value={`+${plan.breakdown.fpuRise} mg/dL`} tone="warning" />
              )}
              {plan.breakdown.splitDrop > 0 && (
                <BreakdownRow label="Split en attente" value={`-${plan.breakdown.splitDrop} mg/dL`} tone="info" />
              )}
              {plan.breakdown.sportBoostDrop > 0 && (
                <BreakdownRow label="Sport (sensi ↑)" value={`-${plan.breakdown.sportBoostDrop} mg/dL`} tone="info" />
              )}
              {plan.breakdown.trendShift !== 0 && (
                <BreakdownRow
                  label="Trend Libre"
                  value={`${plan.breakdown.trendShift > 0 ? "+" : ""}${plan.breakdown.trendShift} mg/dL`}
                  tone={plan.breakdown.trendShift < 0 ? "info" : "warning"}
                />
              )}
              {plan.breakdown.dawnBump > 0 && (
                <BreakdownRow label="Dawn (4h-8h)" value={`+${plan.breakdown.dawnBump} mg/dL`} tone="warning" />
              )}
            </div>
          )}

          {/* Statut de calibration perso */}
          {calibration && <CalibrationLine c={calibration} />}
        </>
      )}
    </section>
  );
}

function CalibrationLine({
  c,
}: {
  c: NonNullable<NightBrainProps["calibration"]>;
}) {
  const parts: string[] = [];
  if (c.driftNights >= 4) {
    const sign = c.driftPerHour > 0 ? "+" : "";
    parts.push(
      `dérive basale ${sign}${c.driftPerHour.toFixed(1).replace(".", ",")} mg/dL/h (${c.driftNights} nuits)`,
    );
  }
  if (c.dawnDays >= 4) parts.push(`dawn mesuré sur ${c.dawnDays} j`);
  if (c.verifiedNights > 0) parts.push(`${c.verifiedNights} nuit${c.verifiedNights > 1 ? "s" : ""} vérifiée${c.verifiedNights > 1 ? "s" : ""}`);
  if (c.bias) parts.push(`biais appris ${c.bias > 0 ? "+" : ""}${c.bias}`);

  return (
    <p className="mt-3 pt-3 border-t border-border-subtle text-[10px] text-text-tertiary leading-snug">
      {parts.length > 0
        ? `Calibré sur tes données : ${parts.join(" · ")}.`
        : "Calibration en cours — il faut quelques nuits d'archive pour personnaliser."}
    </p>
  );
}

function PredictionTile({ prediction }: { prediction: BedtimePrediction }) {
  const isWakeup = prediction.label === "Réveil";
  const color = predictionColor(prediction.glucose);
  const bg = predictionBg(prediction.glucose);
  return (
    <div className="rounded-xl px-3 py-2.5 text-center" style={{ background: bg }}>
      <div className="flex items-center justify-center gap-1 mb-1" style={{ color }}>
        {isWakeup ? <Sunrise className="w-3 h-3" /> : <Moon className="w-3 h-3" />}
        <p className="text-[9px] uppercase tracking-wide font-semibold">{prediction.label}</p>
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
      <span className={`num font-semibold ${tone === "info" ? "text-info" : "text-warning"}`}>
        {value}
      </span>
    </div>
  );
}
