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
  type NightPlan,
  type NightStep,
} from "@/lib/night-brain";
import { Button } from "@/components/ui/Button";
import type { BedtimePrediction } from "@/lib/bedtime-advisor";
import { LATE_CARB_MIN_NIGHTS } from "@/lib/night-calibration";
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
  Hourglass,
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
    /** ISO du dernier changement de basale si la calibration a été reset. */
    recalibratingSince?: string;
    /** Facteur glucides tardifs appris (mg/dL par g restant). */
    lateCarbMgPerGram?: number;
    lateCarbNights?: number;
    lateCarbIsDefault?: boolean;
    /** Nuits exclues par l'avis du matin (« YYYY-MM-DD », récentes d'abord). */
    excludedNights?: string[];
  };
  /** Réintègre une nuit exclue dans les calibrations. */
  onIncludeNight?: (night: string) => void;
  /** Logge une prise de glucides en cas d'hypo (crée un HypoEvent). */
  onLogHypoCarbs?: (grams: number) => void;
  /** Logge une injection de correction. */
  onLogCorrection?: (units: number, notes: string) => void;
  /** Confirme (logge) le split en attente le plus proche. */
  onConfirmSplit?: () => void;
  /** Ajuste les units du split en attente (0 = annuler). */
  onAdjustSplit?: (newUnits: number) => void;
  /**
   * Réinitialise la calibration nuit à partir de `sinceMs` (changement de
   * basale non tamponné, ex. fait avant que l'app le tracke). Les données
   * antérieures sont ignorées par la calibration.
   */
  onResetCalibration?: (sinceMs: number) => void;
  /** Bouton « Je vais me coucher » (câblé côté page). */
  bedtime?: BedtimeProps;
}

export interface BedtimeProps {
  /** Clic : lecture fraîche de la glycémie puis calcul du plan. */
  onConfirm: () => void;
  /** Lecture en cours : bouton désactivé (anti double-clic). */
  reading: boolean;
  /** Plan calculé au clic, dans cette session. */
  result?: { calculatedAtMs: number; plan: NightPlan } | null;
  /** Échec du calcul (pas de lecture capteur). */
  error?: string | null;
  /** Coucher déjà enregistré pour la nuit en cours (après rechargement). */
  confirmed?: { atMs: number; wakeGlucose: number } | null;
}

function hhmm(ms: number): string {
  return new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
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
  digesting: Hourglass,
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
  onResetCalibration,
  onIncludeNight,
  bedtime,
}: NightBrainProps) {
  const [open, setOpen] = useState(true);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const livePlan = useMemo(() => computeNightPlan(input), [input]);
  // Après le clic « Je vais me coucher », le plan figé à l'instant du clic
  // REMPLACE le plan en direct : jamais deux listes d'étapes avec deux
  // boutons Valider pour la même dose.
  const bedtimeResult = bedtime?.result ?? null;
  const plan = bedtimeResult?.plan ?? livePlan;

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
  }

  return (
    <section className="panel mb-4 border border-accent-2/30">
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

      {bedtime && (
        <BedtimeBlock
          bedtime={bedtime}
          wakeGlucose={plan.predictions[plan.predictions.length - 1]?.glucose}
        />
      )}

      {!open ? (
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          {plan.steps.length} étape{plan.steps.length > 1 ? "s" : ""} pour la
          nuit. Clique pour voir ton plan.
        </p>
      ) : (
        <>
          {/* Étapes ordonnées — on ne numérote que les actions concrètes.
              Clé = instant du calcul : un nouveau clic repart de zéro. */}
          <StepList
            key={bedtimeResult?.calculatedAtMs ?? "live"}
            steps={plan.steps}
            onAction={handleAction}
          />

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
          {calibration && (
            <CalibrationLine
              c={calibration}
              onReset={onResetCalibration}
              onIncludeNight={onIncludeNight}
            />
          )}
        </>
      )}
    </section>
  );
}

/** Liste numérotée des étapes du plan, chaque bouton passe par `onAction`. */
function StepList({
  steps,
  onAction,
}: {
  steps: NightStep[];
  onAction: (step: NightStep) => void;
}) {
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());

  // Numérotation : seules les actions concrètes portent un numéro.
  const badges = useMemo(() => {
    let n = 0;
    return steps.map((s) =>
      s.kind === "all-good" ||
      s.kind === "recheck" ||
      s.kind === "coverage" ||
      s.kind === "digesting"
        ? ""
        : String(++n),
    );
  }, [steps]);

  function markDone(id: string) {
    setDoneIds((prev) => new Set(prev).add(id));
  }

  return (
    <ol className="space-y-2 mb-4">
      {steps.map((step, i) => {
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
                  className={`w-6 h-6 rounded-md ${tone.ring} ${tone.text} text-xs font-bold flex items-center justify-center num`}
                >
                  {badge}
                </span>
                <Icon className={`w-3.5 h-3.5 ${tone.text}`} />
              </div>
              <div className="min-w-0 flex-1">
                {step.warning && (
                  <div className="alert mb-2" role="alert">
                    <AlertTriangle />
                    <p>{step.warning}</p>
                  </div>
                )}
                <p className={`text-sm font-semibold ${tone.text} leading-snug`}>
                  {step.headline}
                </p>
                <p className="text-[11px] text-text-secondary mt-1 leading-snug">
                  {step.detail}
                </p>
                {step.action && (
                  <button
                    type="button"
                    onClick={() => {
                      onAction(step);
                      markDone(step.id);
                    }}
                    disabled={done}
                    className={`mt-2 text-[11px] font-semibold ${tone.text} bg-bg-secondary border border-border-default hover:bg-bg-hover transition-colors px-3 py-1.5 rounded-md tap-scale inline-flex items-center gap-1 disabled:opacity-50`}
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
  );
}

/**
 * Bouton « Je vais me coucher » + état : plan calculé au clic, ou coucher
 * déjà enregistré pour la nuit (après rechargement), ou erreur de lecture.
 */
function BedtimeBlock({
  bedtime,
  wakeGlucose,
}: {
  bedtime: BedtimeProps;
  wakeGlucose?: number;
}) {
  const { result, confirmed, error, reading, onConfirm } = bedtime;
  return (
    <div className="mb-3">
      <Button
        type="button"
        variant="primary"
        size="md"
        fullWidth
        isLoading={reading}
        disabled={reading}
        onClick={onConfirm}
        leftIcon={<Moon className="w-4 h-4" />}
      >
        {reading ? "Lecture de ta glycémie…" : "Je vais me coucher"}
      </Button>
      {error && (
        <div className="alert mt-2" role="alert">
          <AlertTriangle />
          <p>{error}</p>
        </div>
      )}
      {result ? (
        <p className="label mt-3">
          Ton plan pour la nuit · calculé à <span className="num">{hhmm(result.calculatedAtMs)}</span>
        </p>
      ) : confirmed ? (
        <p className="text-[11px] text-text-secondary mt-2">
          Coucher enregistré à <span className="num">{hhmm(confirmed.atMs)}</span> · réveil prévu ~
          <span className="num">{confirmed.wakeGlucose}</span>
        </p>
      ) : null}
      {result && wakeGlucose !== undefined && (
        <p className="text-[11px] text-text-tertiary mt-1">
          Prédiction de réveil enregistrée : ~<span className="num">{wakeGlucose}</span> mg/dL.
        </p>
      )}
    </div>
  );
}

/** Options de rétro-datage du reset (jours en arrière). */
const RESET_CHOICES: { label: string; daysAgo: number }[] = [
  { label: "Aujourd'hui", daysAgo: 0 },
  { label: "Il y a 2 j", daysAgo: 2 },
  { label: "Il y a 4 j", daysAgo: 4 },
  { label: "Il y a 7 j", daysAgo: 7 },
];

/** Nuits exclues affichées (les plus récentes). */
const EXCLUDED_SHOWN = 7;

function formatNightShort(night: string): string {
  const [y, m, d] = night.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function CalibrationLine({
  c,
  onReset,
  onIncludeNight,
}: {
  c: NonNullable<NightBrainProps["calibration"]>;
  onReset?: (sinceMs: number) => void;
  onIncludeNight?: (night: string) => void;
}) {
  const [choosing, setChoosing] = useState(false);

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

  function handleChoice(daysAgo: number, label: string) {
    if (!onReset) return;
    const ok = confirm(
      `Recalibrer le plan de la nuit à partir de « ${label.toLowerCase()} » ?\n\nLes nuits antérieures (ancienne dose de lente) seront ignorées. La calibration se refait sur les nuits suivantes (~2-4 jours pour retrouver la confiance).`,
    );
    if (!ok) return;
    onReset(Date.now() - daysAgo * 86_400_000);
    setChoosing(false);
  }

  const statusText = c.recalibratingSince
    ? (() => {
        const since = new Date(c.recalibratingSince).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
        });
        return parts.length > 0
          ? `Recalibrage depuis ton changement de basale du ${since} : ${parts.join(" · ")}.`
          : `Recalibrage en cours depuis ton changement de basale du ${since} (encore quelques nuits propres avant que la dérive/dawn se réajustent) — prédictions en mode par défaut d'ici là.`;
      })()
    : parts.length > 0
      ? `Calibré sur tes données : ${parts.join(" · ")}.`
      : "Calibration en cours — il faut quelques nuits d'archive pour personnaliser.";

  const lateCarbText =
    c.lateCarbMgPerGram === undefined
      ? null
      : c.lateCarbIsDefault
        ? `Glucides tardifs : ${c.lateCarbMgPerGram.toFixed(1).replace(".", ",")} mg/dL par gramme (valeur par défaut, ${c.lateCarbNights ?? 0}/${LATE_CARB_MIN_NIGHTS} nuits utilisables).`
        : `Glucides tardifs : ${c.lateCarbMgPerGram.toFixed(1).replace(".", ",")} mg/dL par gramme (${c.lateCarbNights} nuits).`;
  const excluded = (c.excludedNights ?? []).slice(0, EXCLUDED_SHOWN);

  return (
    <div className="mt-3 pt-3 border-t border-border-subtle">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] text-text-tertiary leading-snug">{statusText}</p>
          {lateCarbText && (
            <p className="text-[10px] text-text-tertiary leading-snug mt-1">{lateCarbText}</p>
          )}
        </div>
        {onReset && !choosing && (
          <button
            type="button"
            onClick={() => setChoosing(true)}
            className="shrink-0 text-[10px] font-medium text-text-tertiary underline underline-offset-2 hover:text-text-secondary transition-colors tap-scale"
          >
            Recalibrer
          </button>
        )}
      </div>
      {excluded.length > 0 && (
        <div className="mt-2">
          <p className="text-[10px] text-text-secondary mb-1.5">
            Nuits exclues des calculs :
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {excluded.map((night) => (
              <span
                key={night}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-bg-secondary border border-border-default text-[10px] text-text-secondary"
              >
                <span className="num">{formatNightShort(night)}</span>
                {onIncludeNight && (
                  <button
                    type="button"
                    onClick={() => onIncludeNight(night)}
                    className="font-medium underline underline-offset-2 hover:text-text-primary transition-colors tap-scale"
                  >
                    Réintégrer
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      )}
      {choosing && (
        <div className="mt-2 animate-slide-up">
          <p className="text-[10px] text-text-secondary mb-1.5">
            Tu as changé ta dose de lente quand ? La calibration ignorera tout ce qui précède.
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {RESET_CHOICES.map((choice) => (
              <button
                key={choice.daysAgo}
                type="button"
                onClick={() => handleChoice(choice.daysAgo, choice.label)}
                className="px-2.5 py-1 rounded-lg bg-bg-secondary border border-border-default text-[10px] font-medium text-text-secondary hover:border-diabete/50 hover:text-diabete transition-colors tap-scale"
              >
                {choice.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setChoosing(false)}
              aria-label="Annuler"
              className="p-1 rounded-md text-text-tertiary hover:text-text-secondary transition-colors tap-scale"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
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
    <div className="bg-bg-secondary border border-border-default rounded-md px-2 py-1.5 flex items-center justify-between">
      <span className="text-text-tertiary uppercase tracking-wide text-[9px] font-semibold">
        {label}
      </span>
      <span className={`num font-semibold ${tone === "info" ? "text-info" : "text-warning"}`}>
        {value}
      </span>
    </div>
  );
}
