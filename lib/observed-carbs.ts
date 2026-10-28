/**
 * Bilan de masse des glucides observés : combien de grammes du repas sont
 * encore non digérés, lu sur la courbe CGM plutôt que supposé (195 min).
 *
 * Variation de glycémie = glucides absorbés × CSF − insuline utilisée × ISF.
 * On en déduit les grammes absorbés, puis le reste. Pur, sans I/O.
 */
import { iobRemainingFraction } from "./night-calibration";

/** Fenêtre de lecture : minutes après le repas. */
export const OBS_WINDOW_MIN = 90;
export const OBS_WINDOW_MAX = 240;
/** Tolérance du point « glycémie au repas » (min). */
export const OBS_MEAL_POINT_TOLERANCE_MIN = 20;
/** Âge max de la lecture actuelle (min). */
export const OBS_MAX_GLUCOSE_AGE_MIN = 15;

export interface ObservedCarbsInput {
  carbsGrams: number; // saisie (resolveCarbs)
  mealMinutesAgo: number;
  carbSensitivity: number; // ISF / ratio du repas (mg/dL/g)
  boluses: { units: number; minutesAgo: number }[]; // injections de [repas−240, maintenant]
  glucoseAtMeal: number | null;
  glucoseNow: number | null;
  glucoseNowAgeMin: number | null;
  isf: number;
  dia?: number;
  peak?: number;
  otherMealsInWindow: number; // autres repas ≥ 20 g dans la fenêtre
  rescueInWindow: boolean;
}

export interface ObservedCarbs {
  remainingG: number;
  absorbedG: number;
}

export function observedCarbsRemaining(
  input: ObservedCarbsInput,
): ObservedCarbs | null {
  const {
    carbsGrams,
    mealMinutesAgo,
    carbSensitivity,
    boluses,
    glucoseAtMeal,
    glucoseNow,
    glucoseNowAgeMin,
    isf,
    dia = 195,
    peak = 75,
  } = input;

  // Garde-fous : sans lecture fiable ou avec des perturbateurs, pas de bilan.
  if (!(carbsGrams > 0) || !(carbSensitivity > 0)) return null;
  if (mealMinutesAgo < OBS_WINDOW_MIN || mealMinutesAgo > OBS_WINDOW_MAX) return null;
  if (glucoseAtMeal == null || glucoseNow == null || glucoseNowAgeMin == null) return null;
  if (glucoseNowAgeMin > OBS_MAX_GLUCOSE_AGE_MIN) return null;
  if (input.otherMealsInWindow > 0 || input.rescueInWindow) return null;

  // Insuline réellement consommée entre le repas et maintenant.
  let usedUnits = 0;
  for (const b of boluses) {
    const remAtMeal = iobRemainingFraction(b.minutesAgo - mealMinutesAgo, dia, peak);
    const remNow = iobRemainingFraction(b.minutesAgo, dia, peak);
    usedUnits += b.units * (remAtMeal - remNow);
  }

  const absorbedG =
    (glucoseNow - glucoseAtMeal + usedUnits * isf) / carbSensitivity;
  const remainingG = Math.min(carbsGrams, Math.max(0, carbsGrams - absorbedG));
  return { remainingG, absorbedG };
}
