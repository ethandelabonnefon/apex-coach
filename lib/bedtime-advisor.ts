/**
 * Bedtime Advisor — Phase G (juin 2026).
 *
 * Pure function qui combine TOUT le contexte de fin de journée pour
 * prédire la glycémie nocturne et recommander une action :
 *  - Glycémie actuelle + trend Libre
 *  - IOB résiduel
 *  - Dernier repas (FPU encore en cours de digestion)
 *  - Sport du soir (insulin sensitivity ↑)
 *  - Split dose en attente
 *  - Phénomène de l'aube (4h-8h du matin)
 *
 * Output : prédictions à T+2h / T+4h / T+7h + recommandation
 * (manger glucides / faire correction / tout va bien / monitor).
 *
 * Modèle simplifié mais validé sur les principes physiologiques T1D :
 *  - IOB linéaire sur 195min (Novorapid)
 *  - FPU absorbé sur 5h post-repas
 *  - Trend velocity court terme (≤30min)
 *  - Sport sensitivity ↑ amplifie l'effet IOB
 *  - Dawn phenomenon : +30 mg/dL entre 4h et 8h
 *
 * ⚠️ Garde-fous T1D :
 *  - Correction nocturne max 2U (anti-hypo brutale)
 *  - Cible nocturne 90-160 (plus large que diurne 80-180)
 *  - Si IOB > 0.5U → on évite de recommander une correction
 *    (anti-stacking, déjà beaucoup d'insuline active)
 */

import { iobRemainingFraction } from "./night-calibration";

export interface BedtimeAdvisorInput {
  /** Glycémie actuelle (live FreeStyle Libre ou manuelle). */
  currentGlucose: number;
  /** Trend Libre numérique : 1=↓↓ ... 5=↑↑. */
  trendArrow?: number;
  /** IOB total en U. */
  iobUnits: number;
  /**
   * Injections récentes (units + minutesAgo) pour un IOB exponentiel précis.
   * Si fourni, on l'utilise à la place du modèle linéaire sur `iobUnits`.
   */
  iobInjections?: { units: number; minutesAgo: number }[];
  /** Insulin Sensitivity Factor (mg/dL par U). */
  isfMgPerU: number;

  // ─── Calibration perso (lib/night-calibration.ts) ──────────────
  /** Dérive basale nocturne mesurée (mg/dL/h). Négatif = tu descends. */
  nightDriftPerHour?: number;
  /** Courbe dawn mesurée : heure du jour (4..9) → rise mg/dL. Remplace le +40 figé. */
  dawnCurveByHour?: Record<number, number>;
  /** Biais appris (mg/dL) à ajouter à la prédiction de réveil (backtest). */
  wakeupBias?: number;
  /**
   * Montée glycémique par gramme de glucides (mg/dL/g) = ISF / ratio (g par U).
   * Sert à modéliser la montée FPU sur la même échelle que la dose split qui
   * la couvre (facteur 6), pour que les deux s'équilibrent. Default 4.
   */
  mgPerGramCarb?: number;
  /** Durée d'action insuline rapide en minutes (default 195). */
  insulinActiveMinutes: number;
  /** Cible glycémie diurne (default 110). */
  targetGlucose: number;
  /** Heures jusqu'au réveil estimé (default 7h). */
  hoursUntilWakeup?: number;

  // ─── Dernier repas ─────────────────────────────
  /** Heures depuis le début du dernier repas. */
  lastMealHoursAgo?: number;
  /** FPU calculé du repas (juste les fat/protein equivalents, pas glucides). */
  lastMealFpu?: number;
  /** Glucides du repas (pour estimer digestion résiduelle). */
  lastMealCarbs?: number;

  // ─── Sport ─────────────────────────────────────
  /** Pourcentage réduction post-exercice si applicable. */
  exerciseAdjustmentPct?: number;
  /** Source de la séance pour message contextuel. */
  exerciseSource?: 'running' | 'muscu' | 'cardio-other';
  /** Heures depuis fin de séance. */
  exerciseHoursAgo?: number;

  // ─── Split dose en attente ─────────────────────
  /** U du split dose pas encore fait. */
  pendingSplitUnits?: number;
  /** Min avant que le split soit déclenché. */
  pendingSplitMinutesUntil?: number;

  // ─── Heure actuelle ────────────────────────────
  /** Date/heure de référence (default now). Utile pour tests. */
  nowMs?: number;
}

export interface BedtimePrediction {
  /** Décalage en heures depuis maintenant. */
  offsetHours: number;
  /** Glycémie prédite mg/dL. */
  glucose: number;
  /** Label lisible : "Coucher+2h", "Réveil", etc. */
  label: string;
  /** Heure absolue prédite (ex: "01:30"). */
  hourLabel: string;
}

export type BedtimeRisk =
  | 'safe'
  | 'caution-low'
  | 'caution-high'
  | 'risk-low'
  | 'risk-high'
  | 'iob-warning';

export interface BedtimeRecommendation {
  type: 'all-good' | 'eat-carbs' | 'correction-bolus' | 'monitor' | 'wait-iob' | 'reduce-split';
  headline: string;
  detail: string;
  /** Action concrète (quantité + unité) si applicable. */
  action?: {
    label: string;
    quantity: number;
    unit: 'g' | 'U';
  };
  /**
   * Phase G fix juin 2026 — Suggestion explicite sur le split dose en
   * attente, si applicable. Donne à l'utilisateur la consigne combinée :
   * glucides + ajustement split.
   */
  splitAdjustment?: {
    type: 'skip' | 'reduce' | 'keep' | 'delay';
    /** Units actuelles du split en attente (pour affichage). */
    originalUnits: number;
    /** Units suggérées après ajustement (0 = skip, sinon < original = reduce). */
    suggestedUnits: number;
    /** Texte explicatif court. */
    detail: string;
  };
}

export interface BedtimeAdvice {
  predictions: BedtimePrediction[];
  risk: BedtimeRisk;
  recommendation: BedtimeRecommendation;
  /** Breakdown des effets pour transparence UI. */
  breakdown: {
    iobDrop: number;
    /** Effet montant des glucides résiduels du dernier repas (mg/dL). */
    carbsRise: number;
    fpuRise: number;
    splitDrop: number;
    sportBoostDrop: number;
    trendShift: number;
    dawnBump: number;
  };
  /** Flag : true si le repas est trop récent pour prédire fiablement. */
  unreliableTooFresh: boolean;
}

// ───────────────────────────────────────────────────────────────────────
// Trend velocities (mg/dL/min) — slide rule Abbott
// ───────────────────────────────────────────────────────────────────────

function trendVelocity(arrow?: number): number {
  switch (arrow) {
    case 1: return -1.5;
    case 2: return -0.7;
    case 4: return 0.7;
    case 5: return 1.5;
    default: return 0;
  }
}

// ───────────────────────────────────────────────────────────────────────
// FPU ↔ split : paire couplée (fix juin 2026)
// ───────────────────────────────────────────────────────────────────────
//
// La dose split est calculée avec FPU_CARB_EQUIVALENT_FACTOR = 6
// (insulin-calculator.ts). On modélise la MONTÉE FPU avec ce même facteur 6,
// donc un split bien dosé annule la montée par construction (net ≈ 0).
//  - Pas de split → la montée FPU apparaît → hyper prédite → on recommande
//    de GARDER le split (au lieu de le sauter à tort).
//  - Split bien dosé → net ≈ 0 → "tout va bien".
//
// Plancher sur la chute nette : un split qui couvre du FPU ne doit pas se lire
// comme une grosse chute "gratuite" (c'était le bug qui faisait recommander
// "saute ton split" en permanence). Il peut tirer un peu (effet correctif
// léger) mais pas te faire plonger.
const FPU_GLUCOSE_FACTOR = 6;
const FPU_WINDOW_H = 5;
const SPLIT_NET_DROP_FLOOR = 35;

// ───────────────────────────────────────────────────────────────────────
// Prédiction glycémie à un horizon donné
// ───────────────────────────────────────────────────────────────────────

interface PredictionBreakdown {
  trendShift: number;
  iobDrop: number;
  carbsRise: number;
  splitDrop: number;
  fpuRise: number;
  sportBoostDrop: number;
  dawnBump: number;
  finalGlucose: number;
}

function predictGlucoseAt(
  hoursFromNow: number,
  input: BedtimeAdvisorInput,
): PredictionBreakdown {
  let glucose = input.currentGlucose;
  const nowMs = input.nowMs ?? Date.now();

  // ─── 1. Effet trend court terme (cap 30min) ──────────
  const trendCapMinutes = Math.min(30, hoursFromNow * 60);
  const trendShift = trendVelocity(input.trendArrow) * trendCapMinutes;
  glucose += trendShift;

  // ─── 2. Effet IOB ────────────────────────────────────
  // L'IOB va continuer à baisser la glycémie sur les prochaines heures.
  // Modèle linéaire : à T0 on a iobUnits actives, à T+activeMinutes 0.
  // Drop max théorique = iobUnits × ISF, mais on plafonne (anti-irréalisme).
  //
  // ⚠️ FIX juin 2026 : le cap dépend du contexte. Si on vient de manger
  // (< 2h), l'IOB est principalement là pour COUVRIR les glucides du
  // repas, pas pour baisser la glycémie nette. On utilise donc un cap
  // plus serré dans cette fenêtre.
  const justAteRecently =
    input.lastMealHoursAgo !== undefined && input.lastMealHoursAgo < 2;
  const PRACTICAL_IOB_CAP = justAteRecently ? 0.3 : 0.5;
  let iobDrop: number;
  if (input.iobInjections && input.iobInjections.length > 0) {
    // Modèle EXPONENTIEL par injection (plus juste que le linéaire) : on
    // somme la baisse de chaque injection entre maintenant et l'horizon.
    const horizonMin = hoursFromNow * 60;
    let drop = 0;
    for (const inj of input.iobInjections) {
      const remNow = iobRemainingFraction(inj.minutesAgo, input.insulinActiveMinutes);
      const remFuture = iobRemainingFraction(
        inj.minutesAgo + horizonMin,
        input.insulinActiveMinutes,
      );
      drop += inj.units * Math.max(0, remNow - remFuture);
    }
    iobDrop = drop * input.isfMgPerU;
    // Anti double-comptage : si on vient de manger, l'IOB couvre surtout les
    // glucides (modélisés à part en carbsRise) → on amortit.
    if (justAteRecently) iobDrop *= 0.6;
  } else {
    // Fallback linéaire (pas d'historique d'injections fourni).
    const fractionConsumed = Math.min(
      PRACTICAL_IOB_CAP,
      (hoursFromNow * 60) / input.insulinActiveMinutes,
    );
    iobDrop = input.iobUnits * input.isfMgPerU * fractionConsumed;
  }
  glucose -= iobDrop;

  // ─── 2bis. Glucides résiduels du dernier repas (effet montant) ─
  // FIX juin 2026 : les glucides du dernier repas continuent d'être
  // absorbés sur ~3h. Ils font MONTER la glycémie en parallèle de l'IOB
  // qui descend. Sans ce contre-effet, on sur-estime massivement le drop
  // net dans la fenêtre 0-3h post-repas.
  //
  // En théorie : si le bolus a été bien dosé, carbsRise ≈ iobDrop sur
  // les premières heures → effet net = 0. Si sous-dosé : monte. Si
  // sur-dosé : descend. La modélisation EXPLICITE des deux nous donne
  // la prédiction nette correcte.
  //
  // Modèle simple : absorption linéaire sur 3h. Effet ~3.5 mg/dL/g de
  // glucides absorbé, étalé sur la fenêtre restante d'absorption.
  let carbsRise = 0;
  if (
    input.lastMealCarbs &&
    input.lastMealCarbs > 0 &&
    input.lastMealHoursAgo !== undefined &&
    input.lastMealHoursAgo < 3
  ) {
    const absorptionWindow = 3;
    const ratioAlreadyAbsorbed = Math.min(1, input.lastMealHoursAgo / absorptionWindow);
    const residualCarbs = input.lastMealCarbs * (1 - ratioAlreadyAbsorbed);
    const hoursAheadOfAbsorption = Math.max(
      0,
      Math.min(hoursFromNow, absorptionWindow - input.lastMealHoursAgo),
    );
    const remainingAbsorptionHours = Math.max(0.1, absorptionWindow - input.lastMealHoursAgo);
    // 3.5 mg/dL par gramme étalé linéairement sur le reste d'absorption
    const carbsRatePerHour = (residualCarbs * 3.5) / remainingAbsorptionHours;
    carbsRise = carbsRatePerHour * hoursAheadOfAbsorption;
    glucose += carbsRise;
  }

  // ─── 3+4. FPU restant ↔ split qui le couvre (paire couplée) ──
  // On modélise la montée FPU (facteur 6) et la couverture du split sur la
  // MÊME échelle, puis on les nette. Un split bien dosé annule la montée FPU
  // (net ≈ 0) ; pas de split → la montée apparaît → hyper prédite. Plancher
  // sur la chute nette pour qu'un split couvrant ne se lise pas comme un crash.
  let fpuRise = 0;
  let rawSplitDrop = 0;
  const mgPerG = input.mgPerGramCarb ?? 4;
  if (
    input.lastMealFpu &&
    input.lastMealFpu >= 1 &&
    input.lastMealHoursAgo !== undefined &&
    input.lastMealHoursAgo < FPU_WINDOW_H
  ) {
    const totalFpuGlucose = input.lastMealFpu * FPU_GLUCOSE_FACTOR * mgPerG;
    const ratePerHour = totalFpuGlucose / FPU_WINDOW_H;
    const remaining = FPU_WINDOW_H - input.lastMealHoursAgo;
    const effectiveHours = Math.max(0, Math.min(remaining, hoursFromNow));
    fpuRise = ratePerHour * effectiveHours;
  }
  if (input.pendingSplitUnits && input.pendingSplitMinutesUntil !== undefined) {
    const splitWillFireAtHours = input.pendingSplitMinutesUntil / 60;
    if (hoursFromNow > splitWillFireAtHours) {
      const hoursSinceSplit = hoursFromNow - splitWillFireAtHours;
      // Le split est là pour couvrir le FPU : on le laisse couvrir jusqu'à
      // 100% de son potentiel (pas le cap 0.5 de l'IOB de fond).
      const splitFraction = Math.min(
        1,
        (hoursSinceSplit * 60) / input.insulinActiveMinutes,
      );
      rawSplitDrop = input.pendingSplitUnits * input.isfMgPerU * splitFraction;
    }
  }
  // Net couplé, avec plancher sur la chute
  let netFpuSplit = fpuRise - rawSplitDrop;
  if (netFpuSplit < 0) netFpuSplit = Math.max(netFpuSplit, -SPLIT_NET_DROP_FLOOR);
  glucose += netFpuSplit;
  // splitDrop "effectif" pour la transparence UI (réconcilie avec le net)
  const splitDrop = fpuRise - netFpuSplit;

  // ─── 5. Effet sport (sensibilité insuline ↑) ─────────
  // L'IOB est plus efficace que prévu → on retire en plus.
  let sportBoostDrop = 0;
  if (
    input.exerciseAdjustmentPct &&
    input.exerciseAdjustmentPct > 0 &&
    (input.exerciseHoursAgo ?? 99) < 12
  ) {
    const sensitivityBoost = input.exerciseAdjustmentPct / 100;
    const totalActiveInsulin = input.iobUnits + (input.pendingSplitUnits ?? 0);
    sportBoostDrop = totalActiveInsulin * input.isfMgPerU * sensitivityBoost * 0.4;
    glucose -= sportBoostDrop;
  }

  // ─── 6. Dawn phenomenon — courbe mesurée si dispo, sinon ladder ──
  const predictedDate = new Date(nowMs + hoursFromNow * 3600_000);
  const predictedHour = predictedDate.getHours();
  let dawnBump = 0;
  const measuredDawn = input.dawnCurveByHour?.[predictedHour];
  if (measuredDawn !== undefined) {
    dawnBump = measuredDawn; // ta vraie montée mesurée sur l'archive
    glucose += dawnBump;
  } else if (predictedHour >= 4 && predictedHour <= 8) {
    if (predictedHour >= 6 && predictedHour <= 7) dawnBump = 40;
    else if (predictedHour === 5 || predictedHour === 8) dawnBump = 25;
    else dawnBump = 15;
    glucose += dawnBump;
  }

  // ─── 6bis. Dérive basale apprise (Lantus) ────────────
  // La pente nocturne réelle mesurée sur tes nuits propres. Négatif = tu
  // descends (basale trop forte) → on l'intègre pour ne pas rater une dérive.
  if (input.nightDriftPerHour) {
    const driftEffect = input.nightDriftPerHour * hoursFromNow;
    glucose += Math.max(-80, Math.min(80, driftEffect));
  }

  // ─── 6ter. Biais appris (backtest prédit vs réel) ────
  // Correction du biais systématique, proportionnelle à l'horizon (pleine au
  // réveil, faible à T+2h).
  if (input.wakeupBias) {
    glucose += input.wakeupBias * Math.min(1, hoursFromNow / 6);
  }

  // ─── 7. Clamp 40-350 mg/dL pour réalisme ─────────────
  glucose = Math.min(350, Math.max(40, Math.round(glucose)));

  return {
    trendShift: Math.round(trendShift),
    iobDrop: Math.round(iobDrop),
    carbsRise: Math.round(carbsRise),
    splitDrop: Math.round(splitDrop),
    fpuRise: Math.round(fpuRise),
    sportBoostDrop: Math.round(sportBoostDrop),
    dawnBump,
    finalGlucose: glucose,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Fonction principale
// ───────────────────────────────────────────────────────────────────────

export function computeBedtimeAdvice(input: BedtimeAdvisorInput): BedtimeAdvice {
  const hoursUntilWakeup = input.hoursUntilWakeup ?? 7;
  const nowMs = input.nowMs ?? Date.now();

  // ─── Prédictions à T+2h / T+4h / Réveil ──────────────
  const horizons = [2, 4, hoursUntilWakeup];
  const predictions: BedtimePrediction[] = horizons.map((h) => {
    const breakdown = predictGlucoseAt(h, input);
    const time = new Date(nowMs + h * 3600_000);
    const hourLabel = time.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      offsetHours: h,
      glucose: breakdown.finalGlucose,
      label: h === hoursUntilWakeup ? 'Réveil' : `+${h}h`,
      hourLabel,
    };
  });

  // ─── Breakdown global (T+2h pour résumé) ─────────────
  const breakdown2h = predictGlucoseAt(2, input);
  const globalBreakdown = {
    iobDrop: breakdown2h.iobDrop,
    carbsRise: breakdown2h.carbsRise,
    fpuRise: breakdown2h.fpuRise,
    splitDrop: breakdown2h.splitDrop,
    sportBoostDrop: breakdown2h.sportBoostDrop,
    trendShift: breakdown2h.trendShift,
    dawnBump: predictions.some((p) => p.label === 'Réveil')
      ? predictGlucoseAt(hoursUntilWakeup, input).dawnBump
      : 0,
  };

  const minPred = Math.min(...predictions.map((p) => p.glucose));
  const maxPred = Math.max(...predictions.map((p) => p.glucose));

  // ─── Détection prédiction peu fiable ─────────────────
  // Si on vient juste de manger (< 1h) ET qu'on a un IOB élevé, la
  // dynamique glucides/insuline est encore très instable. La prédiction
  // peut être fausse. On préfère le dire honnêtement.
  const unreliableTooFresh =
    (input.lastMealHoursAgo !== undefined && input.lastMealHoursAgo < 1 && input.iobUnits > 2) ||
    (input.iobUnits > 4 && input.lastMealHoursAgo !== undefined && input.lastMealHoursAgo < 1.5);

  // ─── Évaluation risque ───────────────────────────────
  let risk: BedtimeRisk = 'safe';
  if (minPred < 70) risk = 'risk-low';
  else if (minPred < 90) risk = 'caution-low';
  else if (maxPred > 200) risk = 'risk-high';
  else if (maxPred > 160) risk = 'caution-high';

  // Override : si IOB élevé et glycémie déjà OK → on monitor
  if (input.iobUnits > 1.5 && minPred >= 90 && maxPred <= 160) {
    risk = 'iob-warning';
  }

  // ─── Recommandation ──────────────────────────────────
  const reco = unreliableTooFresh
    ? {
        type: 'monitor' as const,
        headline: 'Repas trop récent pour prédire fiablement',
        detail: `Tu viens de manger (il y a ${input.lastMealHoursAgo?.toFixed(1).replace('.', ',')}h) avec ${input.iobUnits.toFixed(1).replace('.', ',')}U d'IOB en cours. La dynamique glucides/insuline est encore instable. Reviens dans 1-2h pour une prédiction fiable.`,
      }
    : buildRecommendation(predictions, input, risk);

  return {
    predictions,
    risk,
    recommendation: reco,
    breakdown: globalBreakdown,
    unreliableTooFresh,
  };
}

/**
 * Calcule la suggestion d'ajustement du split dose en attente.
 * Logique :
 *   - Prédiction min < 70 ET split contribue significativement → SKIP
 *   - Prédiction min 70-85 → RÉDUIRE de 50%
 *   - Prédiction min 85-100 → KEEP mais avec warning
 *   - Prédiction min > 100 OU pas d'effet significatif → KEEP normal
 */
function buildSplitAdjustment(
  predictions: BedtimePrediction[],
  input: BedtimeAdvisorInput,
): BedtimeRecommendation['splitAdjustment'] | undefined {
  if (!input.pendingSplitUnits || input.pendingSplitUnits <= 0) return undefined;
  if (input.pendingSplitMinutesUntil === undefined) return undefined;
  const minPred = Math.min(...predictions.map((p) => p.glucose));
  const original = input.pendingSplitUnits;

  // SKIP : prédiction min critique (< 70) → on annule le split
  if (minPred < 70) {
    return {
      type: 'skip',
      originalUnits: original,
      suggestedUnits: 0,
      detail: `Skip les ${original}U du split (sinon hypo aggravée). La couverture FPU sera incomplète mais c'est mieux qu'une hypo nocturne.`,
    };
  }

  // REDUCE : prédiction limite (70-85)
  if (minPred < 85) {
    const reduced = Math.max(1, Math.floor(original / 2));
    return {
      type: 'reduce',
      originalUnits: original,
      suggestedUnits: reduced,
      detail: `Réduis le split à ${reduced}U (au lieu de ${original}U). Couverture FPU partielle mais plus sûr.`,
    };
  }

  // KEEP avec warning (85-100)
  if (minPred < 100) {
    return {
      type: 'keep',
      originalUnits: original,
      suggestedUnits: original,
      detail: `Fais quand même les ${original}U (couverture FPU nécessaire) mais surveille à 2h post-split.`,
    };
  }

  // KEEP normal (>100)
  return {
    type: 'keep',
    originalUnits: original,
    suggestedUnits: original,
    detail: `Fais les ${original}U normalement à l'heure prévue.`,
  };
}

function buildRecommendation(
  predictions: BedtimePrediction[],
  input: BedtimeAdvisorInput,
  risk: BedtimeRisk,
): BedtimeRecommendation {
  const minPred = Math.min(...predictions.map((p) => p.glucose));
  const maxPred = Math.max(...predictions.map((p) => p.glucose));
  const wakeupPred = predictions[predictions.length - 1].glucose;
  const splitAdjustment = buildSplitAdjustment(predictions, input);

  // ─── Hypo prédite (< 70) ─────────────────────────────
  if (minPred < 70) {
    const carbsNeeded = Math.max(15, Math.ceil((110 - minPred) / 4));
    return {
      type: 'eat-carbs',
      headline: `Mange ${carbsNeeded}g de glucides avant de te coucher`,
      detail: `Sans rien, ta glycémie tomberait à ~${minPred} mg/dL dans la nuit. ${carbsNeeded}g de glucides (1 jus de fruit + 1 biscotte / 3 sucres) te maintiendront en cible.`,
      action: { label: `${carbsNeeded}g`, quantity: carbsNeeded, unit: 'g' },
      splitAdjustment,
    };
  }

  // ─── Hypo limite (70-90) ─────────────────────────────
  if (minPred < 90) {
    return {
      type: 'eat-carbs',
      headline: `Mini-collation conseillée (~10g)`,
      detail: `Glycémie minimale prédite : ~${minPred} mg/dL. Une petite collation (1 sucre + verre d'eau ou 1 biscotte) sécurise la nuit sans risquer l'hyper.`,
      action: { label: '10g', quantity: 10, unit: 'g' },
      splitAdjustment,
    };
  }

  // ─── Hyper sévère prédite (> 200) ────────────────────
  if (maxPred > 200) {
    // Garde-fou T1D : si IOB > 0.5 déjà, anti-stacking
    if (input.iobUnits > 0.5) {
      return {
        type: 'wait-iob',
        headline: `Attends, ${input.iobUnits.toFixed(1).replace('.', ',')}U sont encore actives`,
        detail: `Pic prédit à ~${maxPred} mg/dL mais tu as déjà ${input.iobUnits.toFixed(1).replace('.', ',')}U d'IOB qui travaillent. Ne corrige pas maintenant. Surveille dans 2h, re-corrige si besoin.`,
        splitAdjustment,
      };
    }
    // Sinon correction modérée (max 2U la nuit pour safety)
    const theoretical = (maxPred - input.targetGlucose) / input.isfMgPerU;
    const units = Math.min(2, Math.max(1, Math.round(theoretical)));
    return {
      type: 'correction-bolus',
      headline: `Fais ${units}U de correction maintenant`,
      detail: `Sans rien, ta glycémie monterait à ~${maxPred} mg/dL. ${units}U te ramènera vers ${input.targetGlucose} d'ici quelques heures. (Plafonné à 2U max la nuit pour éviter une hypo brutale).`,
      action: { label: `${units}U`, quantity: units, unit: 'U' },
      splitAdjustment,
    };
  }

  // ─── Hyper modéré (160-200) ──────────────────────────
  if (maxPred > 160 && wakeupPred > 140) {
    if (input.iobUnits > 0.5) {
      return {
        type: 'wait-iob',
        headline: `${input.iobUnits.toFixed(1).replace('.', ',')}U IOB en cours — surveille`,
        detail: `Pic prédit ~${maxPred} mg/dL mais ton IOB travaille encore. Ne corrige pas, vérifie la glycémie dans 2h.`,
        splitAdjustment,
      };
    }
    return {
      type: 'correction-bolus',
      headline: `1U de correction te placera dans la cible`,
      detail: `Sans correction, réveil à ~${wakeupPred} mg/dL. 1U te ramène autour de ${input.targetGlucose} pour un réveil propre.`,
      action: { label: '1U', quantity: 1, unit: 'U' },
      splitAdjustment,
    };
  }

  // ─── IOB warning ────────────────────────────────────
  if (risk === 'iob-warning') {
    return {
      type: 'monitor',
      headline: `Tout va bien — mais ${input.iobUnits.toFixed(1).replace('.', ',')}U IOB en cours`,
      detail: `Prédictions OK (${predictions.map((p) => `${p.label} ${p.glucose}`).join(' · ')}). Vérifie à 2h pour t'assurer que tu ne descends pas trop bas.`,
      splitAdjustment,
    };
  }

  // ─── Tout va bien ───────────────────────────────────
  return {
    type: 'all-good',
    headline: 'Va te coucher, rien à ajuster',
    detail: `Prédictions : ${predictions.map((p) => `${p.label} ${p.glucose}`).join(' · ')} mg/dL. Cible nocturne (90-160) respectée toute la nuit.`,
    splitAdjustment,
  };
}
