/**
 * Correction suggérée en hyperglycémie — calcul (fable-5.2, nov. 2026).
 *
 * Extrait de `components/glucose/CorrectionSuggestion.tsx`, où le calcul
 * arrondissait la dose AU-DESSUS (`Math.ceil`). À l'ISF de 100 mg/dL par
 * unité, ça donnait :
 *
 *   181 mg/dL → 0,71 U → 1 U → atterrissage à  81 mg/dL
 *   211 mg/dL → 1,01 U → 2 U → atterrissage à  11 mg/dL
 *
 * Le même défaut avait été corrigé dans le calculateur de bolus en
 * septembre 2026 ; cette carte avait été oubliée. Une correction se fait
 * sans repas derrière : rien ne rattrape une unité de trop. On arrondit
 * donc EN DESSOUS, comme le plan de nuit.
 *
 * Trois autres garde-fous que la carte n'avait pas :
 *  - l'insuline déjà active est SOUSTRAITE de la correction (et plus
 *    seulement comparée à un seuil) ;
 *  - une glycémie qui descend déjà ne se corrige pas ;
 *  - la sensibilité accrue après le sport réduit la correction, comme dans
 *    le calculateur.
 *
 * Pur : aucun React, aucun store.
 */

/** Au-delà de cette insuline active, on ne corrige pas : on attend (U). */
export const CORRECTION_MAX_IOB_U = 0.5;
/** Réduction post-sport maximale appliquée (%), alignée sur le calculateur. */
const MAX_EXERCISE_REDUCTION_PCT = 50;

export interface CorrectionInput {
  glucose: number;
  /** Cible à atteindre (mg/dL). */
  target: number;
  /** Seuil au-dessus duquel une correction est envisagée (mg/dL). */
  thresholdHigh: number;
  /** Sensibilité (mg/dL par U). */
  isf: number;
  /** Insuline rapide encore active (U). */
  iobUnits: number;
  /** Flèche Libre 1..5 (1 = ↓↓, 2 = ↘, 3 = →, 4 = ↗, 5 = ↑↑). */
  trendArrow?: number;
  /** Réduction due à la sensibilité post-sport (%). */
  exerciseReductionPct?: number;
}

export type CorrectionSuggestion =
  | { kind: "wait-iob"; iobUnits: number }
  | { kind: "falling" }
  | { kind: "too-small"; raw: number }
  | {
      kind: "dose";
      units: number;
      /** Dose théorique avant arrondi (U). */
      raw: number;
      /** Glycémie attendue une fois la dose épuisée (mg/dL). */
      landing: number;
      /** Part retirée pour l'insuline déjà active (U). */
      iobDeducted: number;
      /** Réduction post-sport appliquée (%). */
      exerciseReductionPct: number;
    };

/** `null` quand la glycémie ne justifie aucune correction. */
export function computeHyperCorrection(input: CorrectionInput): CorrectionSuggestion | null {
  const { glucose, target, thresholdHigh, isf } = input;
  if (!Number.isFinite(glucose) || !(isf > 0)) return null;
  if (glucose <= thresholdHigh) return null;

  const iob = Number.isFinite(input.iobUnits) ? Math.max(0, input.iobUnits) : 0;
  if (iob > CORRECTION_MAX_IOB_U) return { kind: "wait-iob", iobUnits: iob };

  if (input.trendArrow === 1 || input.trendArrow === 2) return { kind: "falling" };

  const pct = Math.max(
    0,
    Math.min(MAX_EXERCISE_REDUCTION_PCT, input.exerciseReductionPct ?? 0),
  );
  const gross = ((glucose - target) / isf) * (1 - pct / 100);
  const raw = Math.max(0, gross - iob);
  const units = Math.floor(raw);
  if (units < 1) return { kind: "too-small", raw };

  return {
    kind: "dose",
    units,
    raw,
    landing: Math.round(glucose - (units + iob) * isf),
    iobDeducted: iob,
    exerciseReductionPct: pct,
  };
}
