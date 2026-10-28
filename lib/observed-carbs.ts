/**
 * Bilan de masse des glucides observés : combien de grammes du repas sont
 * encore non digérés, lu sur la courbe CGM plutôt que supposé (195 min).
 *
 * Variation de glycémie = glucides absorbés × CSF − insuline utilisée × ISF.
 * On en déduit les grammes absorbés, puis le reste. Pur, sans I/O.
 */
import { iobRemainingFraction } from "./night-calibration";
import { carbSensitivity } from "./glucose-prediction";
import { ratioForMeal, type MealRatios } from "./prediction-inputs";
import { isLearnable, resolveCarbs } from "./insulin-log-values";
import type { CarbEntry, InsulinLog } from "@/types";

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

// ───────────────────────────────────────────────────────────────────────
// Construction de l'entrée depuis le store (repas visé + perturbateurs)
// ───────────────────────────────────────────────────────────────────────

/** Repas minimum (g) pour qu'un repas soit visé ou compte comme perturbateur. */
export const OBS_MIN_MEAL_CARBS = 20;

const MIN = 60_000;

function toMs(v: Date | string | number): number {
  return v instanceof Date ? v.getTime() : new Date(v).getTime();
}

/** Point le plus proche de `targetMs` à ±OBS_MEAL_POINT_TOLERANCE_MIN, sinon null. */
function nearestValue(
  points: { t: number; value: number }[],
  targetMs: number,
): number | null {
  const tol = OBS_MEAL_POINT_TOLERANCE_MIN * MIN;
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const p of points) {
    if (!Number.isFinite(p.t) || !(p.value > 0)) continue;
    const diff = Math.abs(p.t - targetMs);
    if (diff <= tol && diff < bestDiff) {
      bestDiff = diff;
      best = p.value;
    }
  }
  return best;
}

export interface BuiltObservedCarbs {
  /** `InsulinLog.id` du repas visé (= `sourceId` de l'événement de prédiction). */
  sourceId: string;
  /** Glucides saisis (confirmé ?? estimé). */
  enteredG: number;
  /** Quantité déclarée incertaine (`!isLearnable`). */
  uncertain: boolean;
  input: ObservedCarbsInput;
}

/**
 * Choisit le repas à lire sur la courbe et assemble `ObservedCarbsInput`.
 *
 * Repas visé : le dernier `InsulinLog` hors correction/split avec ≥ 20 g,
 * à condition qu'il ait entre 90 et 240 min. Glycémie au repas : la saisie
 * du calculateur si > 0, sinon le point d'historique 8h puis d'archive à
 * ±20 min. Glycémie actuelle : UNIQUEMENT la lecture capteur `live` (son
 * âge vient de `live.date`) — jamais un champ de formulaire par défaut.
 * Renvoie null quand aucun repas n'est dans la fenêtre.
 */
export function buildObservedCarbsInput(opts: {
  insulinLogs: InsulinLog[];
  carbEntries: CarbEntry[];
  /** Historique 8h LibreLink (`date` ISO). */
  history: { value: number; date: string }[];
  /** Archive long terme (`t` en ms). */
  archive: { t: number; value: number }[];
  live: { value: number; date: string } | null;
  nowMs: number;
  isf: number;
  ratios?: MealRatios;
  dia?: number;
}): BuiltObservedCarbs | null {
  const { nowMs } = opts;
  const meals = (opts.insulinLogs ?? [])
    .filter(
      (l) =>
        l &&
        l.mealType !== "correction" &&
        !l.isSplitDose &&
        resolveCarbs(l) >= OBS_MIN_MEAL_CARBS,
    )
    .map((l) => ({ log: l, t: toMs(l.injectedAt) }))
    .filter((m) => Number.isFinite(m.t) && m.t <= nowMs)
    .sort((a, b) => b.t - a.t);
  const target = meals[0];
  if (!target) return null;

  const mealMinutesAgo = (nowMs - target.t) / MIN;
  if (mealMinutesAgo < OBS_WINDOW_MIN || mealMinutesAgo > OBS_WINDOW_MAX) return null;

  const windowStart = target.t - OBS_WINDOW_MAX * MIN;
  const inWindow = (t: number) => Number.isFinite(t) && t >= windowStart && t <= nowMs;

  // Injections de [repas − 240, maintenant] : bolus loggés + insuline des glucides libres.
  const boluses: { units: number; minutesAgo: number }[] = [];
  for (const l of opts.insulinLogs ?? []) {
    const t = toMs(l.injectedAt);
    if (l.units > 0 && inWindow(t)) boluses.push({ units: l.units, minutesAgo: (nowMs - t) / MIN });
  }
  for (const c of opts.carbEntries ?? []) {
    const t = toMs(c.eatenAt);
    if ((c.insulinUnits ?? 0) > 0 && inWindow(t)) {
      boluses.push({ units: c.insulinUnits!, minutesAgo: (nowMs - t) / MIN });
    }
  }

  // Perturbateurs : autres repas ≥ 20 g et re-sucrages dans la fenêtre.
  const otherLogMeals = meals.filter((m) => m !== target && inWindow(m.t)).length;
  const otherCarbMeals = (opts.carbEntries ?? []).filter(
    (c) => !c.hypoEventId && (c.carbsGrams ?? 0) >= OBS_MIN_MEAL_CARBS && inWindow(toMs(c.eatenAt)),
  ).length;
  const rescueInWindow = (opts.carbEntries ?? []).some(
    (c) => !!c.hypoEventId && inWindow(toMs(c.eatenAt)),
  );

  // Glycémie au repas : saisie > 0, sinon historique 8h, sinon archive (±20 min).
  const log = target.log;
  let glucoseAtMeal: number | null = log.glucoseBefore > 0 ? log.glucoseBefore : null;
  if (glucoseAtMeal == null) {
    glucoseAtMeal = nearestValue(
      (opts.history ?? []).map((p) => ({ t: toMs(p.date), value: p.value })),
      target.t,
    );
  }
  if (glucoseAtMeal == null) glucoseAtMeal = nearestValue(opts.archive ?? [], target.t);

  // Glycémie actuelle : capteur seulement.
  const liveMs = opts.live ? toMs(opts.live.date) : NaN;
  const glucoseNow = opts.live && opts.live.value > 0 && Number.isFinite(liveMs) ? opts.live.value : null;
  const glucoseNowAgeMin = glucoseNow != null ? Math.max(0, (nowMs - liveMs) / MIN) : null;

  const enteredG = resolveCarbs(log);
  return {
    sourceId: log.id,
    enteredG,
    uncertain: !isLearnable(log),
    input: {
      carbsGrams: enteredG,
      mealMinutesAgo,
      carbSensitivity: carbSensitivity(opts.isf, ratioForMeal(opts.ratios, log.mealType)),
      boluses,
      glucoseAtMeal,
      glucoseNow,
      glucoseNowAgeMin,
      isf: opts.isf,
      dia: opts.dia,
      otherMealsInWindow: otherLogMeals + otherCarbMeals,
      rescueInWindow,
    },
  };
}
