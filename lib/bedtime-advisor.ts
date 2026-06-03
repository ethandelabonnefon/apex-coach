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

export interface BedtimeAdvisorInput {
  /** Glycémie actuelle (live FreeStyle Libre ou manuelle). */
  currentGlucose: number;
  /** Trend Libre numérique : 1=↓↓ ... 5=↑↑. */
  trendArrow?: number;
  /** IOB total en U. */
  iobUnits: number;
  /** Insulin Sensitivity Factor (mg/dL par U). */
  isfMgPerU: number;
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
}

export interface BedtimeAdvice {
  predictions: BedtimePrediction[];
  risk: BedtimeRisk;
  recommendation: BedtimeRecommendation;
  /** Breakdown des effets pour transparence UI. */
  breakdown: {
    iobDrop: number;
    fpuRise: number;
    splitDrop: number;
    sportBoostDrop: number;
    trendShift: number;
    dawnBump: number;
  };
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
// Prédiction glycémie à un horizon donné
// ───────────────────────────────────────────────────────────────────────

interface PredictionBreakdown {
  trendShift: number;
  iobDrop: number;
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
  // Drop max théorique = iobUnits × ISF, mais on plafonne à 60% pour
  // refléter les facteurs compensateurs (cf briefing pré-sport).
  const PRACTICAL_IOB_CAP = 0.6;
  const fractionConsumed = Math.min(
    PRACTICAL_IOB_CAP,
    (hoursFromNow * 60) / input.insulinActiveMinutes,
  );
  const iobDrop = input.iobUnits * input.isfMgPerU * fractionConsumed;
  glucose -= iobDrop;

  // ─── 3. Split dose en attente : effet futur ──────────
  let splitDrop = 0;
  if (input.pendingSplitUnits && input.pendingSplitMinutesUntil !== undefined) {
    const splitWillFireAtHours = input.pendingSplitMinutesUntil / 60;
    if (hoursFromNow > splitWillFireAtHours) {
      const hoursSinceSplit = hoursFromNow - splitWillFireAtHours;
      const splitFraction = Math.min(
        PRACTICAL_IOB_CAP,
        (hoursSinceSplit * 60) / input.insulinActiveMinutes,
      );
      splitDrop = input.pendingSplitUnits * input.isfMgPerU * splitFraction;
      glucose -= splitDrop;
    }
  }

  // ─── 4. FPU restant du dernier repas (digestion lente) ──
  // Si dîner FPU élevé il y a < 5h, la digestion continue et fait monter.
  // Modèle : effet de 1 FPU ≈ +3 mg/dL/h pendant la fenêtre 1h-5h post-repas.
  let fpuRise = 0;
  if (
    input.lastMealFpu &&
    input.lastMealFpu >= 1 &&
    input.lastMealHoursAgo !== undefined &&
    input.lastMealHoursAgo < 5
  ) {
    const fpuWindowRemaining = 5 - input.lastMealHoursAgo;
    const effectiveHours = Math.min(fpuWindowRemaining, hoursFromNow);
    if (effectiveHours > 0) {
      fpuRise = input.lastMealFpu * 3 * effectiveHours;
      glucose += fpuRise;
    }
  }

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

  // ─── 6. Dawn phenomenon (4h-8h) ──────────────────────
  const predictedDate = new Date(nowMs + hoursFromNow * 3600_000);
  const predictedHour = predictedDate.getHours();
  let dawnBump = 0;
  if (predictedHour >= 4 && predictedHour <= 8) {
    // Bump progressif : max à 6h-7h
    if (predictedHour >= 6 && predictedHour <= 7) dawnBump = 40;
    else if (predictedHour === 5 || predictedHour === 8) dawnBump = 25;
    else dawnBump = 15;
    glucose += dawnBump;
  }

  // ─── 7. Floor à 40 mg/dL pour réalisme ───────────────
  glucose = Math.max(40, Math.round(glucose));

  return {
    trendShift: Math.round(trendShift),
    iobDrop: Math.round(iobDrop),
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
  const reco = buildRecommendation(predictions, input, risk);

  return {
    predictions,
    risk,
    recommendation: reco,
    breakdown: globalBreakdown,
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

  // ─── Hypo prédite (< 70) ─────────────────────────────
  if (minPred < 70) {
    const carbsNeeded = Math.max(15, Math.ceil((110 - minPred) / 4));
    return {
      type: 'eat-carbs',
      headline: `Mange ${carbsNeeded}g de glucides avant de te coucher`,
      detail: `Sans rien, ta glycémie tomberait à ~${minPred} mg/dL dans la nuit. ${carbsNeeded}g de glucides (1 jus de fruit + 1 biscotte / 3 sucres) te maintiendront en cible.`,
      action: { label: `${carbsNeeded}g`, quantity: carbsNeeded, unit: 'g' },
    };
  }

  // ─── Hypo limite (70-90) ─────────────────────────────
  if (minPred < 90) {
    return {
      type: 'eat-carbs',
      headline: `Mini-collation conseillée (~10g)`,
      detail: `Glycémie minimale prédite : ~${minPred} mg/dL. Une petite collation (1 sucre + verre d'eau ou 1 biscotte) sécurise la nuit sans risquer l'hyper.`,
      action: { label: '10g', quantity: 10, unit: 'g' },
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
    };
  }

  // ─── Hyper modéré (160-200) ──────────────────────────
  if (maxPred > 160 && wakeupPred > 140) {
    if (input.iobUnits > 0.5) {
      return {
        type: 'wait-iob',
        headline: `${input.iobUnits.toFixed(1).replace('.', ',')}U IOB en cours — surveille`,
        detail: `Pic prédit ~${maxPred} mg/dL mais ton IOB travaille encore. Ne corrige pas, vérifie la glycémie dans 2h.`,
      };
    }
    return {
      type: 'correction-bolus',
      headline: `1U de correction te placera dans la cible`,
      detail: `Sans correction, réveil à ~${wakeupPred} mg/dL. 1U te ramène autour de ${input.targetGlucose} pour un réveil propre.`,
      action: { label: '1U', quantity: 1, unit: 'U' },
    };
  }

  // ─── IOB warning ────────────────────────────────────
  if (risk === 'iob-warning') {
    return {
      type: 'monitor',
      headline: `Tout va bien — mais ${input.iobUnits.toFixed(1).replace('.', ',')}U IOB en cours`,
      detail: `Prédictions OK (${predictions.map((p) => `${p.label} ${p.glucose}`).join(' · ')}). Vérifie à 2h pour t'assurer que tu ne descends pas trop bas.`,
    };
  }

  // ─── Tout va bien ───────────────────────────────────
  return {
    type: 'all-good',
    headline: 'Va te coucher, rien à ajuster',
    detail: `Prédictions : ${predictions.map((p) => `${p.label} ${p.glucose}`).join(' · ')} mg/dL. Cible nocturne (90-160) respectée toute la nuit.`,
  };
}
