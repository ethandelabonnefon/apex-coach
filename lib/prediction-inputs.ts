/**
 * Mapping store → entrées du moteur de prédiction (juin 2026).
 *
 * SOURCE UNIQUE de la conversion `InsulinLog` + `CarbEntry` → `PredictionEvent[]`.
 * Utilisé à la fois côté serveur (endpoint /api/diabete/predict) et côté client
 * (plan nuit) pour garantir que les DEUX prédictions partent exactement des
 * mêmes événements — fini les deux moteurs qui divergent.
 */

import { carbSensitivity, type PredictionEvent } from "./glucose-prediction";
import {
  resolveCarbs,
  resolveFat,
  resolveProtein,
} from "./insulin-log-values";
import type { InsulinLog, CarbEntry } from "@/types";

export type MealRatios = { morning: number; lunch: number; snack: number; dinner: number };

/** Ratio (g par U) pour un mealType, repli sur le ratio midi puis 10. */
export function ratioForMeal(ratios: MealRatios | undefined, mealType: string): number {
  const fallback = ratios?.lunch ?? 10;
  if (!ratios) return fallback;
  if (mealType === "morning" || mealType === "lunch" || mealType === "snack" || mealType === "dinner") {
    return ratios[mealType] ?? fallback;
  }
  return fallback;
}

/**
 * Au-delà de cette ancienneté (min), un événement n'a plus d'effet : l'IOB
 * (DIA ~195) est épuisé ET la fenêtre FPU (~300) est passée.
 */
export const EVENT_ACTIVE_WINDOW_MIN = 360;

/** Convertit un timestamp (Date | ISO | number) en ms, ou NaN. */
function toMs(v: Date | string | number): number {
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/**
 * Construit la liste d'événements actifs pour `predictGlucoseCurve` à partir
 * du store : injections (bolus + macros) et glucides sans insuline.
 *
 * - chaque InsulinLog → événement {units, carbs, fat, prot, CSF=ISF/ratio}
 * - chaque CarbEntry sans insuline → événement glucides purs (montée seule)
 * - chaque CarbEntry avec insuline → événement {units, carbs, …}
 */
export function buildPredictionEvents(opts: {
  insulinLogs: InsulinLog[];
  carbEntries?: CarbEntry[];
  isf: number;
  ratios?: MealRatios;
  nowMs?: number;
  windowMin?: number;
}): PredictionEvent[] {
  const now = opts.nowMs ?? Date.now();
  const windowMin = opts.windowMin ?? EVENT_ACTIVE_WINDOW_MIN;
  const events: PredictionEvent[] = [];

  for (const log of opts.insulinLogs ?? []) {
    if (!log || typeof log.units !== "number") continue;
    const minutesAgo = (now - toMs(log.injectedAt)) / 60_000;
    if (!Number.isFinite(minutesAgo) || minutesAgo < -5 || minutesAgo > windowMin) continue;
    events.push({
      minutesAgo: Math.max(0, minutesAgo),
      units: log.units > 0 ? log.units : undefined,
      // Confirmé ?? estimé : sans ça, le patient confirme 140 g au lieu de
      // 100 et la prédiction du réveil — celle qui pilote la correction du
      // coucher — modélise toujours 100 g (≈ 140 mg/dL d'écart).
      carbsGrams: resolveCarbs(log),
      fatGrams: resolveFat(log),
      proteinGrams: resolveProtein(log),
      carbSensitivity: carbSensitivity(opts.isf, ratioForMeal(opts.ratios, log.mealType)),
    });
  }

  for (const c of opts.carbEntries ?? []) {
    if (!c || typeof c.carbsGrams !== "number") continue;
    const minutesAgo = (now - toMs(c.eatenAt)) / 60_000;
    if (!Number.isFinite(minutesAgo) || minutesAgo < -5 || minutesAgo > windowMin) continue;
    events.push({
      minutesAgo: Math.max(0, minutesAgo),
      units: c.insulinUnits && c.insulinUnits > 0 ? c.insulinUnits : undefined,
      carbsGrams: c.carbsGrams || 0,
      fatGrams: c.fatGrams ?? 0,
      proteinGrams: c.proteinGrams ?? 0,
      // glucides sans bolus précis → on retombe sur le ratio midi (CSF générique)
      carbSensitivity: carbSensitivity(opts.isf, ratioForMeal(opts.ratios, "lunch")),
    });
  }

  return events;
}
