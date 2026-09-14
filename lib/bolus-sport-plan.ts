/**
 * Plan sport au moment du bolus (sept. 2026) — dose réduite ET glucides
 * cohérents entre eux.
 *
 * Avant, le toggle « Pré-entraînement » du calculateur réduisait la dose de
 * 50 % ET disait « mange 15 g », sans jamais confronter l'un à l'autre : un
 * double airbag, la mécanique du 210 mg/dL du 10 septembre.
 *
 * Consensus Riddell et al. 2017 : quand un bolus repas précède l'effort de
 * moins de 90 min, la réduction de dose est le levier principal, les
 * glucides le levier d'appoint. Donc, dans cet ordre :
 *
 *  1. réduire la dose (`preWorkoutReductionPct`, appliqué par
 *     `calculateBolus`) ;
 *  2. lire la glycémie prédite au départ sur la courbe que le plafond
 *     prédictif a DÉJÀ calculée pour la dose retenue — repas + dose
 *     réduite + IOB + l'effort lui-même (`upcomingExercise`) ;
 *  3. ne conseiller des glucides que si cette courbe passe sous la cible
 *     de départ, ou sous le plancher pendant l'effort.
 *
 * Un seul modèle décide des deux chiffres. Ce module ne recalcule aucune
 * absorption : il LIT une courbe.
 *
 * ⚠️ Pure module. Aucun import serveur.
 */

import type { ExerciseSource } from "./exercise-insulin-adjustment";
import { exerciseCarbsForDuration, MAX_PRE_SPORT_CARBS_G } from "./insulin-calculator";
import type { PredictionPoint } from "./glucose-prediction";

/** Cible de glycémie au départ (mg/dL) — mêmes valeurs que le briefing. */
export const START_TARGET_AEROBIC = 150;
export const START_TARGET_OTHER = 130;
/**
 * Plancher PENDANT l'effort (mg/dL) — même seuil que `duringRisk` dans le
 * briefing. La courbe intègre le prélèvement de glucose par le muscle sur
 * toute la durée : si elle passe sous ce plancher, il manque des glucides.
 */
export const DURING_FLOOR = 80;
/** Sous ce total, on ne propose rien : une bouchée ne vaut pas un conseil. */
export const MIN_ADVISED_CARBS_G = 15;
/** Montée glycémique par gramme de glucides rapides (mg/dL/g), comme le briefing. */
const MG_PER_GRAM_FAST_CARB = 4;

export type CarbsReason = "none" | "start" | "during" | "start+during" | "no-curve";

export interface BolusSportPlan {
  family: ExerciseSource;
  /** Glycémie prédite au départ, lue sur la courbe. `null` sans courbe. */
  predictedAtStart: number | null;
  /** Minimum prédit PENDANT la séance, lu sur la courbe. `null` sans courbe. */
  predictedDuringMin: number | null;
  /** Cible de départ appliquée. */
  startTarget: number;
  /** Glucides conseillés avant de partir (g). 0 = rien à manger. */
  carbsG: number;
  carbsReason: CarbsReason;
  /** Part « écart au départ » et part « creux pendant », pour la transparence UI. */
  startGapCarbsG: number;
  duringGapCarbsG: number;
}

/**
 * Point de la courbe le plus proche de `minute` (la courbe est
 * échantillonnée, typiquement au pas de 5 ou 15 min).
 */
export function curveValueAt(curve: PredictionPoint[], minute: number): number | null {
  if (!curve.length || !Number.isFinite(minute)) return null;
  let best = curve[0];
  for (const p of curve) {
    if (Math.abs(p.minute - minute) < Math.abs(best.minute - minute)) best = p;
  }
  return best.value;
}

/** Minimum de la courbe sur [from, to] (minutes). `null` si aucun point. */
export function curveMinBetween(curve: PredictionPoint[], from: number, to: number): number | null {
  let min: number | null = null;
  for (const p of curve) {
    if (p.minute < from || p.minute > to) continue;
    if (min === null || p.value < min) min = p.value;
  }
  return min;
}

export function computeBolusSportPlan(input: {
  family: ExerciseSource;
  minutesUntilWorkout: number;
  durationMin: number;
  /** Courbe du plafond pour la dose RETENUE (déjà réduite), ou `null`. */
  curveWithReducedDose: PredictionPoint[] | null;
  /** Insuline active une fois la dose réduite injectée (U). */
  iobAfterDoseU: number;
}): BolusSportPlan {
  const { family } = input;
  const isAerobic = family === "running" || family === "cardio-other";
  const startTarget = isAerobic ? START_TARGET_AEROBIC : START_TARGET_OTHER;
  const minutesUntil = Number.isFinite(input.minutesUntilWorkout)
    ? Math.max(0, input.minutesUntilWorkout)
    : 0;
  const durationMin = Number.isFinite(input.durationMin) ? Math.max(0, input.durationMin) : 0;
  const iob = Number.isFinite(input.iobAfterDoseU) ? Math.max(0, input.iobAfterDoseU) : 0;

  // La muscu fait MONTER la glycémie (Yardley 2013) : jamais de glucides
  // préventifs, quelle que soit la courbe.
  if (family === "muscu") {
    const curve = input.curveWithReducedDose;
    return {
      family,
      predictedAtStart: curve ? curveValueAt(curve, minutesUntil) : null,
      predictedDuringMin: curve ? curveMinBetween(curve, minutesUntil, minutesUntil + durationMin) : null,
      startTarget,
      carbsG: 0,
      carbsReason: "none",
      startGapCarbsG: 0,
      duringGapCarbsG: 0,
    };
  }

  const curve = input.curveWithReducedDose;
  if (!curve || curve.length === 0) {
    // Sans courbe (pas de capteur, lecture périmée), on ne peut pas juger.
    // Repli sur la règle de durée du briefing (30-75 g/h selon l'insuline
    // active) — moins précise, mais on le dit via `carbsReason`.
    const fallback = exerciseCarbsForDuration(family, durationMin, iob);
    return {
      family,
      predictedAtStart: null,
      predictedDuringMin: null,
      startTarget,
      carbsG: fallback >= MIN_ADVISED_CARBS_G ? Math.min(MAX_PRE_SPORT_CARBS_G, fallback) : 0,
      carbsReason: fallback >= MIN_ADVISED_CARBS_G ? "no-curve" : "none",
      startGapCarbsG: 0,
      duringGapCarbsG: 0,
    };
  }

  const predictedAtStart = curveValueAt(curve, minutesUntil);
  const predictedDuringMin = curveMinBetween(curve, minutesUntil, minutesUntil + durationMin);

  // ⚠️ Pas de règle « durée » ici : la courbe intègre déjà le prélèvement
  // de glucose par le muscle sur toute la séance (`upcomingExercise`), et
  // la dose a déjà été réduite pour cet effort. Ajouter les 30-75 g/h du
  // briefing par-dessus serait le double airbag qu'on supprime.

  // Écart au départ : la courbe intègre repas, dose réduite, IOB et effort.
  // Si elle dit ≥ cible, rien à ajouter — c'est tout l'objet de ce module.
  const startGapCarbsG =
    predictedAtStart !== null && predictedAtStart < startTarget
      ? Math.ceil((startTarget - predictedAtStart) / MG_PER_GRAM_FAST_CARB)
      : 0;

  // Creux pendant : le prélèvement musculaire fait passer la courbe sous
  // le plancher → il manque de quoi tenir jusqu'au bout.
  const duringGapCarbsG =
    predictedDuringMin !== null && predictedDuringMin < DURING_FLOOR
      ? Math.ceil((DURING_FLOOR - predictedDuringMin) / MG_PER_GRAM_FAST_CARB)
      : 0;

  // Les deux écarts ne s'additionnent pas : les glucides pris avant le
  // départ relèvent TOUTE la courbe, donc le creux aussi. On retient le
  // plus exigeant des deux.
  const raw = Math.max(startGapCarbsG, duringGapCarbsG);
  const carbsG = raw > 0 ? Math.min(MAX_PRE_SPORT_CARBS_G, Math.max(MIN_ADVISED_CARBS_G, raw)) : 0;
  const carbsReason: CarbsReason =
    carbsG === 0
      ? "none"
      : startGapCarbsG > 0 && duringGapCarbsG > 0
      ? "start+during"
      : startGapCarbsG > 0
      ? "start"
      : "during";

  return {
    family,
    predictedAtStart,
    predictedDuringMin,
    startTarget,
    carbsG,
    carbsReason,
    startGapCarbsG,
    duringGapCarbsG,
  };
}
