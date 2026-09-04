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
  type PendingSplit,
} from "./glucose-prediction";
import {
  buildPredictionEvents,
  ratioForMeal,
  type MealRatios,
} from "./prediction-inputs";
import type { RecentExercise } from "./exercise-insulin-adjustment";
import { TOPUP_MAX_GLUCOSE_AGE_MIN } from "./carbs-on-board";
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

/**
 * Horizon de simulation (min) : DIA 195 + absorption glucides 195.
 *
 * Étendu quand un split (2e dose FPU) est en attente — voir
 * `simulateMinAfterGrace`. Cette constante reste la valeur du cas SANS
 * split ; ne pas la modifier ici pour couvrir le cas split (cf. brief
 * final-fix-brief.md C1 : « ne change pas le comportement du cas sans
 * split »).
 */
export const CAPPING_HORIZON_MIN = 300;

/** Pas de simulation (min) — même granularité que le reste du moteur. */
const CAPPING_STEP_MIN = 15;

/**
 * Plancher de sécurité (règle 2, sept 2026, décision utilisateur) : marge
 * en-dessous du bolus glucides que le plafond ne franchit jamais. Sur 60 g
 * (bolus glucides 6 U), le plafond ne peut pas proposer moins de 4 U —
 * même si la trajectoire prédite réclame moins. Ce n'est PAS une valeur
 * figée listée dans le brief historique (PREDICTION_SAFETY_LIMIT,
 * CAPPING_GRACE_MIN, le décrément d'1 U) : elle est nouvelle.
 */
export const CARB_BOLUS_FLOOR_MARGIN = 2;

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
  /**
   * Âge (min) de `currentGlucose`. Une lecture périmée et HAUTE simule une
   * trajectoire saine (rien à raboter) — c'est le seul sens dans lequel une
   * lecture périmée est dangereuse ici (une lecture périmée basse
   * capitulerait déjà côté "avant" en refusant la dose complète, ce qui
   * reste sûr). Au-delà de `TOPUP_MAX_GLUCOSE_AGE_MIN` (seuil déjà utilisé
   * par `suggestTopUp`, pas réinventé ici), on refuse de plafonner — on ne
   * DÉSACTIVE PAS la vérification, on le dit explicitement (`reason`).
   * `undefined`/`null` = fraîcheur inconnue → comportement historique
   * conservé (pas de refus), pour ne pas casser les appelants qui ne la
   * renseignent pas encore.
   */
  glucoseAgeMin?: number | null;
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
  /**
   * 2e dose (split FPU) programmée par le MÊME clic « Enregistrer
   * l'injection ». Le plafond doit la voir : sans elle, il valide une dose
   * que l'app reprogramme aussitôt après coup (C1, final-fix-brief.md) —
   * mesuré : badge « ta trajectoire tient » affiché pendant que la
   * trajectoire réelle (candidate + split) descend à 67 mg/dL. Ce n'est PAS
   * un plafonnement du split : `splitDose.later` n'est jamais modifié ici,
   * seulement rendu visible à la simulation.
   */
  pendingSplit?: PendingSplit;
  nowMs?: number;
  /**
   * Bolus glucides (U) de la dose candidate — tel que calculé par
   * `calculateBolus` (`bolusResult.carbBolus`), PAS redérivé ici depuis
   * `pendingMeal.carbsGrams`. Le calculateur applique des réductions
   * (pré-sport, sensibilité post-exercice) que ce module ne doit pas
   * recalculer en double, au risque de diverger de la vraie candidate.
   *
   * Sert de plancher de sécurité (règle 2, sept 2026, décision
   * utilisateur) : le plafond ne descend jamais sous
   * `carbBolusUnits - CARB_BOLUS_FLOOR_MARGIN`. Mesuré : 60 g à 70 mg/dL
   * avec 3 U actives → la boucle de décrément proposait 0 U ; défendable
   * pour le prédicteur, mais sur un vrai repas de 60 g, 0 U garantit une
   * hyperglycémie. `undefined`/absent → traité comme 0 (aucun plancher),
   * pour ne pas casser les appelants qui ne la renseignent pas encore.
   */
  carbBolusUnits?: number;
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

  // Horizon étendu si un split est en attente. La 2e dose continue de
  // baisser la glycémie jusqu'à DIA (195 min) APRÈS SON PROPRE
  // déclenchement — donc jusqu'à `pendingSplit.minutesUntil + 195` au-delà
  // de maintenant, ce qui dépasse l'horizon standard (300 min) dès qu'un
  // split est prévu à plus de ~105 min (le calibrage actuel va jusqu'à
  // 150 min, cf. lib/insulin-calculator.ts).
  //
  // Vérifié empiriquement (pas une hypothèse) : sans extension, un cas
  // réaliste — glycémie 120, split de 8U à +150min (borne haute du
  // calibrage) — est déclaré sûr par l'horizon standard (creux 151 mg/dL,
  // au bord de l'horizon) alors que le vrai creux, 40 minutes plus tard,
  // descend à 78 mg/dL, sous la limite. C'est un FAUX NÉGATIF de sécurité,
  // pas seulement un problème d'affichage.
  //
  // Balayage des repas split-worthy réels de l'app (pâtes énorme, pizza,
  // viande+accompagnement, cas Ethan 152g) × glycémies 90 à 220 mg/dL, sans
  // sport ni IOB additionnel : l'extension ne change la dose retenue dans
  // AUCUN de ces cas — elle ne rend donc pas le plafonnement systématique
  // en usage normal, elle ferme seulement le trou de sécurité ci-dessus.
  const horizonMinutes = ctx.pendingSplit
    ? Math.max(CAPPING_HORIZON_MIN, ctx.pendingSplit.minutesUntil + CAPPING_HORIZON_MIN)
    : CAPPING_HORIZON_MIN;

  const prediction = predictGlucoseCurve({
    currentGlucose: ctx.currentGlucose as number,
    events,
    isf: ctx.isf,
    sport: ctx.sport,
    pendingSplit: ctx.pendingSplit,
    horizonMinutes,
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
  // de l'appelant. On tronque donc dès l'entrée avec Math.floor plutôt que
  // Math.round : un round (ex. 7,6 → 8) rendrait une dose SUPÉRIEURE à la
  // candidate, ce qui contredit l'invariant « ne jamais augmenter » (le
  // chemin réel arrondit déjà en amont, donc c'est un no-op ici — mais
  // strictement plus sûr si un futur appelant oublie d'arrondir). Ce dépôt
  // a aussi déjà corrigé un Math.ceil qui ajoutait jusqu'à 0,9 U par repas
  // chez un patient sujet aux hypoglycémies — même famille de bug.
  const candidate = Math.floor(candidateUnits);

  // Rien à plafonner.
  if (!(candidate > 0)) {
    // Math.floor(NaN) = NaN, donc Math.max(0, candidate) resterait NaN sans
    // ce garde — le clamp défensif n'en serait pas un, et une dose NaN
    // pourrait redescendre jusqu'à l'UI (bouton actif, écriture possible).
    return unchanged(Number.isFinite(candidate) ? Math.max(0, candidate) : 0, null);
  }

  // Pas de mesure capteur → pas de point de départ crédible pour simuler.
  const glucose = ctx.currentGlucose;
  if (typeof glucose !== "number" || !Number.isFinite(glucose)) {
    return unchanged(
      candidate,
      "Pas de mesure capteur — dose non vérifiée par la prédiction.",
    );
  }

  // Lecture périmée : une lecture bloquée HAUTE pendant que la vraie
  // glycémie descend simule une trajectoire saine → aucun plafonnement,
  // en silence. On refuse explicitement plutôt que de laisser filer.
  // Seuil réutilisé de suggestTopUp (TOPUP_MAX_GLUCOSE_AGE_MIN), pas
  // réinventé. `glucoseAgeMin` absent = fraîcheur inconnue → pas de refus
  // (comportement historique conservé).
  const ageMin = ctx.glucoseAgeMin;
  if (
    typeof ageMin === "number" &&
    Number.isFinite(ageMin) &&
    ageMin > TOPUP_MAX_GLUCOSE_AGE_MIN
  ) {
    return unchanged(
      candidate,
      `Lecture capteur périmée (${Math.round(ageMin)} min) — dose non vérifiée par la prédiction.`,
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

  // Plancher (règle 2, sept 2026) : le décrément ne descend jamais sous
  // `carbBolusUnits - CARB_BOLUS_FLOOR_MARGIN`, borné à 0. `Math.min(...,
  // candidate)` empêche le plancher de dépasser la candidate elle-même —
  // l'invariant « le plafond ne peut que réduire » doit tenir même si un
  // appelant renseigne un `carbBolusUnits` incohérent avec sa candidate.
  const carbBolusUnits = Number.isFinite(ctx.carbBolusUnits) ? (ctx.carbBolusUnits as number) : 0;
  const floor = Math.min(candidate, Math.max(0, Math.round(carbBolusUnits) - CARB_BOLUS_FLOOR_MARGIN));

  // La trajectoire plonge : on rabote d'une unité entière à la fois, sans
  // descendre sous le plancher.
  for (let units = candidate - 1; units >= floor; units--) {
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

  // La boucle a atteint le plancher sans trouver de dose sûre : on s'y
  // arrête et on le DIT — c'est le seul endroit où l'app assume
  // délibérément de rester sous la limite de sécurité prédite. On ne
  // masque pas ce cas derrière le message générique « aucune dose ne
  // tient » : `predictedMinAfter` reflète la trajectoire à la dose
  // RÉELLEMENT retenue (le plancher), pas une valeur qui tiendrait la
  // limite.
  if (floor > 0) {
    const atFloor = simulateMinAfterGrace(floor, ctx, baseEvents);
    return {
      units: floor,
      originalUnits: candidate,
      capped: true,
      predictedMinBefore: before.min,
      predictedMinAfter: atFloor?.min ?? null,
      predictedMinMinute: before.minute,
      reason: `Dose maintenue à ${floor} U (bolus glucides − ${CARB_BOLUS_FLOOR_MARGIN} U minimum) alors que la prédiction réclamerait moins — surveille ta glycémie de près dans les heures qui suivent.`,
    };
  }

  // Aucune dose ne tient, et il n'y a pas de plancher à faire respecter
  // (pas de glucides à couvrir, ou candidate déjà nulle) : on ne propose rien.
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
