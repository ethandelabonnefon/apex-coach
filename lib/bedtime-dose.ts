/**
 * Dose du coucher « pic ≤ 130, plancher 80 » (octobre 2026).
 *
 * Remplace la correction « atterrir à 120 au réveil, 0,5 U près, plafond
 * 2 U » en mode events. On ne vise plus un chiffre au réveil : on cherche
 * la plus petite dose ENTIÈRE (stylo au pas de 1 U) qui garde la courbe
 * prédite sous 130 à partir de T+2h, sans jamais la faire passer sous 80.
 * Si aucune dose ne tient les deux, on prend la plus grosse qui respecte le
 * plancher : l'hypo nocturne est toujours pire que la nuit un peu haute.
 *
 * Pure : la simulation de courbe est injectée (`simulate`), ce module ne
 * connaît rien du moteur de prédiction.
 */

import type { PredictionPoint } from "./glucose-prediction";

/** Pic de nuit à ne pas dépasser (mg/dL). */
export const NIGHT_CEILING = 130;
/** Point bas à ne jamais franchir (mg/dL). */
export const NIGHT_FLOOR = 80;
/** Le plafond s'applique à partir de T+2h (la montée du repas d'ici là est normale). */
export const CEILING_FROM_MIN = 120;
/** Borne de recherche, pas un plafond de dose. */
export const DOSE_SEARCH_LIMIT_U = 10;

export interface CurveSummary {
  max: number;
  maxAtMs: number;
  min: number;
  minAtMs: number;
}

export type BedtimeDose =
  | { kind: "none"; base: CurveSummary } // 0 U tient déjà
  | { kind: "fits"; units: number; base: CurveSummary; withDose: CurveSummary }
  | {
      kind: "compromise";
      units: number;
      base: CurveSummary;
      withDose: CurveSummary;
      nextUp: CurveSummary;
    };

/**
 * Pic sur les points à minute ≥ 120, point bas sur tous les points futurs
 * (minute > 0). Si la courbe est trop courte pour T+2h, le pic retombe sur
 * l'ensemble des points futurs.
 */
export function summarizeCurve(curve: PredictionPoint[], nowMs: number): CurveSummary {
  const future = curve.filter((p) => p.minute > 0);
  const pts = future.length > 0 ? future : curve;
  const late = pts.filter((p) => p.minute >= CEILING_FROM_MIN);
  const ceilingPts = late.length > 0 ? late : pts;
  const atMs = (p: PredictionPoint) => p.at ?? nowMs + p.minute * 60_000;

  let maxP = ceilingPts[0];
  for (const p of ceilingPts) if (p.value > maxP.value) maxP = p;
  let minP = pts[0];
  for (const p of pts) if (p.value < minP.value) minP = p;

  return { max: maxP.value, maxAtMs: atMs(maxP), min: minP.value, minAtMs: atMs(minP) };
}

const fitsNight = (s: CurveSummary) => s.max <= NIGHT_CEILING && s.min >= NIGHT_FLOOR;

/**
 * u = 0, 1, …, 10 : la première dose qui tient pic ET plancher gagne
 * (`none` si c'est 0). Sinon, la plus grosse dose qui respecte encore le
 * plancher (`compromise`), avec `nextUp` = ce que ferait 1 U de plus.
 *
 * Si même 0 U passe sous le plancher, renvoie `compromise` à 0 U : c'est à
 * l'appelant de ne pas émettre d'étape de dose dans ce cas (les étapes
 * hypo prennent le relais).
 */
export function findBedtimeDose(simulate: (units: number) => CurveSummary): BedtimeDose {
  const base = simulate(0);
  if (fitsNight(base)) return { kind: "none", base };

  // Plus grosse dose qui respecte le plancher (on s'arrête au premier
  // franchissement : la courbe baisse quand la dose monte).
  let bestUnits = 0;
  let bestSummary = base;
  for (let u = 1; u <= DOSE_SEARCH_LIMIT_U; u++) {
    const s = simulate(u);
    if (s.min < NIGHT_FLOOR) {
      return { kind: "compromise", units: bestUnits, base, withDose: bestSummary, nextUp: s };
    }
    if (s.max <= NIGHT_CEILING) return { kind: "fits", units: u, base, withDose: s };
    bestUnits = u;
    bestSummary = s;
  }
  return {
    kind: "compromise",
    units: bestUnits,
    base,
    withDose: bestSummary,
    nextUp: simulate(bestUnits + 1),
  };
}
