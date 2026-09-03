/**
 * Plafonnement prédictif de la dose (septembre 2026).
 *
 * ─── Pourquoi ce module existe ───────────────────────────────────────
 * Le calculateur de bolus et le prédicteur glycémique vivaient dans la
 * même app sans se parler. Cas mesuré : 56 mg/dL, 100 g à midi, 2,5 U
 * encore actives → `calculateBolus` propose 10 U, et `predictGlucoseCurve`
 * annonce que ces 10 U mènent à 40 mg/dL.
 *
 * On garde le calculateur tel quel — il produit une dose CANDIDATE — et on
 * la fait valider par le prédicteur : tant que la trajectoire plonge sous
 * la limite de sécurité, on rabote d'une unité.
 *
 * C'est le principe de Loop : « calculer le bolus de telle sorte que la
 * glycémie prédite ne descende jamais sous la limite de sécurité ; cela
 * peut aboutir à une glycémie future au-dessus de la cible, mais évitera
 * une hypoglycémie peu après le repas. » On accepte de finir haut plutôt
 * que de risquer de finir bas.
 *
 * ─── Deux invariants ─────────────────────────────────────────────────
 *  • Le plafond ne peut que RÉDUIRE. Si la prédiction annonce une hyper,
 *    la dose n'est pas relevée : c'est un garde-fou, pas un optimiseur.
 *  • Sans mesure capteur réelle, on ne plafonne pas. Simuler depuis une
 *    valeur par défaut serait pire que ne rien faire — ce dépôt a corrigé
 *    deux fois ce motif exact.
 */

import {
  carbSensitivity,
  predictGlucoseCurve,
  type PredictionEvent,
} from "./glucose-prediction";
import {
  buildPredictionEvents,
  ratioForMeal,
  type MealRatios,
} from "./prediction-inputs";
import type { RecentExercise } from "./exercise-insulin-adjustment";
import type { CarbEntry, InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Constantes — figées par la spec
// ───────────────────────────────────────────────────────────────────────

/** La trajectoire prédite ne doit pas descendre sous ce seuil (mg/dL). */
export const PREDICTION_SAFETY_LIMIT = 80;

/**
 * Fenêtre de grâce (min) : la limite s'applique au minimum AU-DELÀ de ce
 * délai, pas sur toute la courbe.
 *
 * Nécessaire, pas confortable : en partant de 56 mg/dL, les premières
 * minutes de la trajectoire restent proches du point de départ QUELLE QUE
 * SOIT la dose — aucune dose, même nulle, ne remonte instantanément. Une
 * règle sur le minimum absolu serait insatisfiable et ramènerait la dose
 * à zéro.
 *
 * 60 min = pic d'absorption des glucides du modèle (`CARB_PEAK_MIN`,
 * glucose-prediction.ts) : avant, le point de départ domine ; après, la
 * dose commande.
 */
export const CAPPING_GRACE_MIN = 60;

/** Horizon de simulation (min) : DIA 195 + absorption glucides 195. */
export const CAPPING_HORIZON_MIN = 300;

/** Pas de simulation (min) — même granularité que le reste du moteur. */
const CAPPING_STEP_MIN = 15;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

/** Repas en cours de saisie, pas encore enregistré dans le store. */
export interface PendingMeal {
  carbsGrams: number;
  fatGrams: number;
  proteinGrams: number;
  mealType: string;
}

export interface DoseCappingContext {
  /** Lecture capteur RÉELLE. `null`/`undefined` = pas de mesure → pas de plafonnement. */
  currentGlucose: number | null | undefined;
  insulinLogs: InsulinLog[];
  carbEntries: CarbEntry[];
  pendingMeal: PendingMeal;
  isf: number;
  ratios: MealRatios;
  /**
   * Séance récente : la sensibilité post-exercice amplifie l'effet de
   * l'insuline. Ce n'est PAS un double comptage avec la réduction
   * pré-sport du calculateur — celle-ci réduit la dose, celle-là modélise
   * le fait qu'elle agit plus fort.
   */
  sport?: RecentExercise;
  nowMs?: number;
}

export interface CappedDose {
  /** Dose retenue (unités entières). */
  units: number;
  /** Dose candidate avant plafonnement. */
  originalUnits: number;
  capped: boolean;
  /** Minimum au-delà de la fenêtre de grâce, avec la dose candidate. */
  predictedMinBefore: number | null;
  /** Idem, avec la dose retenue. */
  predictedMinAfter: number | null;
  /** Décalage (min) du minimum d'avant plafonnement. Le composant formate l'heure. */
  predictedMinMinute: number | null;
  /** `null` si aucun plafonnement n'a eu lieu et qu'il n'y a rien à signaler. */
  reason: string | null;
}

// ───────────────────────────────────────────────────────────────────────
// Simulation
// ───────────────────────────────────────────────────────────────────────

interface SimResult {
  min: number;
  minute: number;
}

/**
 * Minimum de la trajectoire au-delà de la fenêtre de grâce, pour une dose
 * donnée. `null` si la courbe ne couvre pas la fenêtre.
 */
function simulateMinAfterGrace(
  units: number,
  ctx: DoseCappingContext,
  baseEvents: PredictionEvent[],
): SimResult | null {
  const meal = ctx.pendingMeal;
  const events: PredictionEvent[] = [
    ...baseEvents,
    {
      minutesAgo: 0,
      units: units > 0 ? units : undefined,
      carbsGrams: meal.carbsGrams,
      fatGrams: meal.fatGrams,
      proteinGrams: meal.proteinGrams,
      carbSensitivity: carbSensitivity(ctx.isf, ratioForMeal(ctx.ratios, meal.mealType)),
    },
  ];

  const prediction = predictGlucoseCurve({
    currentGlucose: ctx.currentGlucose as number,
    events,
    isf: ctx.isf,
    sport: ctx.sport,
    horizonMinutes: CAPPING_HORIZON_MIN,
    stepMinutes: CAPPING_STEP_MIN,
    nowMs: ctx.nowMs,
  });

  const afterGrace = prediction.curve.filter((p) => p.minute >= CAPPING_GRACE_MIN);
  if (afterGrace.length === 0) return null;

  let best = afterGrace[0];
  for (const p of afterGrace) {
    if (p.value < best.value) best = p;
  }
  return { min: best.value, minute: best.minute };
}

// ───────────────────────────────────────────────────────────────────────
// Plafonnement
// ───────────────────────────────────────────────────────────────────────

function unchanged(
  units: number,
  reason: string | null,
  min: SimResult | null = null,
): CappedDose {
  return {
    units,
    originalUnits: units,
    capped: false,
    predictedMinBefore: min?.min ?? null,
    predictedMinAfter: min?.min ?? null,
    predictedMinMinute: min?.minute ?? null,
    reason,
  };
}

export function capDoseByPrediction(
  candidateUnits: number,
  ctx: DoseCappingContext,
): CappedDose {
  // Le contrat de CappedDose promet une dose ENTIÈRE (le stylo du patient
  // n'a pas de demi-unités) — sans condition, sans compter sur la discipline
  // de l'appelant. On arrondit donc dès l'entrée, au PLUS PROCHE : jamais
  // systématiquement au-dessus (ce dépôt a déjà corrigé un Math.ceil qui
  // ajoutait jusqu'à 0,9 U par repas chez un patient sujet aux hypoglycémies).
  const candidate = Math.round(candidateUnits);

  // Rien à plafonner.
  if (!(candidate > 0)) {
    return unchanged(Math.max(0, candidate), null);
  }

  // Pas de mesure capteur → pas de point de départ crédible pour simuler.
  const glucose = ctx.currentGlucose;
  if (typeof glucose !== "number" || !Number.isFinite(glucose)) {
    return unchanged(
      candidate,
      "Pas de mesure capteur — dose non vérifiée par la prédiction.",
    );
  }

  const baseEvents = buildPredictionEvents({
    insulinLogs: ctx.insulinLogs,
    carbEntries: ctx.carbEntries,
    isf: ctx.isf,
    ratios: ctx.ratios,
    nowMs: ctx.nowMs,
  });

  const before = simulateMinAfterGrace(candidate, ctx, baseEvents);
  if (before === null || before.min >= PREDICTION_SAFETY_LIMIT) {
    return unchanged(candidate, null, before);
  }

  // La trajectoire plonge : on rabote d'une unité entière à la fois.
  for (let units = candidate - 1; units >= 0; units--) {
    const after = simulateMinAfterGrace(units, ctx, baseEvents);
    if (after !== null && after.min >= PREDICTION_SAFETY_LIMIT) {
      return {
        units,
        originalUnits: candidate,
        capped: true,
        predictedMinBefore: before.min,
        predictedMinAfter: after.min,
        predictedMinMinute: before.minute,
        reason: `À ${candidate} U, ta glycémie descendrait à ${before.min} mg/dL.`,
      };
    }
  }

  // Aucune dose ne tient : on ne propose rien.
  return {
    units: 0,
    originalUnits: candidate,
    capped: true,
    predictedMinBefore: before.min,
    predictedMinAfter: null,
    predictedMinMinute: before.minute,
    reason: `Aucune dose ne garde ta glycémie au-dessus de ${PREDICTION_SAFETY_LIMIT} mg/dL. Traite d'abord, mange ensuite.`,
  };
}
