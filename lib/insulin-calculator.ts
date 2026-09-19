import { DIABETES_CONFIG } from './constants';
import type { DiabetesConfig, MealTime } from '@/types';
import { preWorkoutReductionPct, type ExerciseSource } from './exercise-insulin-adjustment';
import { computeFatCoverage, FAT_COVERAGE_MIN_G } from './fat-coverage';

// Le calibrage FPU (facteur 6, caps relatif et absolu) qui vivait ici a été
// retiré en septembre 2026 : la 2ᵉ injection ne se calcule plus depuis les
// FPU mais depuis les seuls lipides — cf. lib/fat-coverage.ts, qui porte
// aussi les mesures qui ont motivé le changement.
//
// Le FPU reste calculé plus bas pour la COMPLEXITÉ DIGESTIVE uniquement :
// un indicateur de durée, où compter les protéines est justifié puisqu'elles
// ralentissent réellement la vidange gastrique.

// ───────────────────────────────────────────────────────────────────────
// Règle hypo simple (sept 2026, décision utilisateur)
// ───────────────────────────────────────────────────────────────────────
//
// « Sous 75 mg/dL, moins une unité. » Volontairement indépendante de
// `capDoseByPrediction` (lib/dose-capping.ts) : cette règle ne lit qu'UN
// chiffre de glycémie, jamais une simulation. Elle s'applique donc même
// quand le capteur est muet ou périmé et que le plafonnement prédictif se
// désactive faute de mesure fraîche — le trou exact que cette règle comble.
//
// Distincte de `targetRange.min` (70 mg/dL, seuil d'hypoglycémie utilisé
// ailleurs dans ce fichier) : les deux notions ne doivent pas être
// confondues, sous peine de rendre l'une des deux impossible à ajuster
// indépendamment de l'autre.
const HYPO_SAFETY_THRESHOLD = 75;
const HYPO_SAFETY_REDUCTION_UNITS = 1;

function getRatioForMeal(config: DiabetesConfig, mealTime: MealTime): number {
  // "other" = saisie libre (correction seule, pas de repas) → on retombe
  // sur le ratio midi par défaut au cas où l'utilisateur entre quand même
  // des glucides. Cas typique : injection d'appoint en hyper sans repas.
  if (mealTime === 'other') {
    return config.ratios.lunch;
  }
  // Try insulinRatios first (new system)
  if (config.insulinRatios?.length) {
    const found = config.insulinRatios.find((r) => r.mealKey === mealTime);
    if (found) return found.ratio;
  }
  // Fallback to legacy ratios
  if (mealTime in config.ratios) {
    return config.ratios[mealTime as keyof typeof config.ratios];
  }
  // Default fallback
  return config.ratios.lunch;
}

/**
 * Déduit le repas depuis l'heure locale (juillet 2026) — pour pré-sélectionner
 * le bon ratio sans que l'utilisateur y pense. Fenêtres calées sur le rythme
 * réel d'Ethan (goûter ~17h30, dîner ~19h) :
 *   04h00-10h59 → matin · 11h00-14h59 → midi · 15h00-18h29 → goûter
 *   18h30-03h59 → soir (un vrai repas nocturne se comporte comme un dîner ;
 *   une injection sans repas passe par « Autre » de toute façon).
 */
export function inferMealTimeFromClock(date: Date): MealTime {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes >= 4 * 60 && minutes < 11 * 60) return 'morning';
  if (minutes >= 11 * 60 && minutes < 15 * 60) return 'lunch';
  if (minutes >= 15 * 60 && minutes < 18 * 60 + 30) return 'snack';
  return 'dinner';
}

/** Tendance Libre numérique (Abbott) → ajustement insuline en U.
 *  Phase 11 — slide rule publié pour bolus pré-prandial. */
function trendAdjustmentUnits(trend?: number): number {
  switch (trend) {
    case 1: // SingleDown ↓↓
      return -1.0;
    case 2: // FortyFiveDown ↘
      return -0.5;
    case 3: // Flat →
      return 0;
    case 4: // FortyFiveUp ↗
      return 0.5;
    case 5: // SingleUp ↑↑
      return 1.0;
    default:
      return 0;
  }
}

function trendArrowChar(trend?: number): string {
  switch (trend) {
    case 1: return '↓↓';
    case 2: return '↘';
    case 3: return '→';
    case 4: return '↗';
    case 5: return '↑↑';
    default: return '';
  }
}

export interface BolusResult {
  carbBolus: number;
  correctionBolus: number;
  trendBolus: number;
  totalBolus: number;
  adjustments: string[];
  reasoning: string[];
  digestiveComplexity: 'simple' | 'moderate' | 'complex';
  splitDose?: {
    now: number;
    later: number;
    delayMinutes: number;
  };
}

export function calculateBolus(
  carbsGrams: number,
  mealTime: MealTime,
  currentGlucose: number,
  isPreWorkout: boolean = false,
  workoutType: ExerciseSource | null = null,
  minutesUntilWorkout: number = 0,
  configOverride?: DiabetesConfig,
  /** Insuline encore active (IOB) — on l'utilise pour réduire la PART CORRECTION
   *  (jamais le bolus repas) afin d'éviter le stacking quand l'utilisateur fait
   *  plusieurs corrections d'affilée. Phase 11. */
  currentIOB: number = 0,
  /** Phase 11 — lipides du repas (g) pour calcul FPU + split dose. */
  fatGrams: number = 0,
  /** Phase 11 — protéines du repas (g) pour calcul FPU. */
  proteinGrams: number = 0,
  /** Phase 11 — flèche de tendance Libre (1..5) au moment du bolus. */
  trendArrow?: number,
  /** Phase 11 (calibrage mai 2026) — profil glycémique du tag repas pour
   *  désactiver le split sur glucides rapides (crêpes, snack sucré, etc.). */
  glycemicProfile?: 'fast' | 'medium' | 'slow',
  /** Phase F (mai 2026) — réduction insuline post-exercice (0-50%).
   *  Calculée par computeExerciseAdjustment() depuis strain + heures écoulées.
   *  Appliquée sur carbBolus + correctionBolus (PAS sur fpuBolus différé,
   *  qui reste critique pour la couverture FPU 2-3h plus tard). */
  exerciseAdjustmentPct?: number,
): BolusResult {
  const config = configOverride || DIABETES_CONFIG;
  const ratio = getRatioForMeal(config, mealTime);
  const isf = config.insulinSensitivityFactor;
  const target = config.targetGlucose;

  let carbBolus = carbsGrams / ratio;
  let correctionBolus = 0;
  let trendBolus = 0;
  const adjustments: string[] = [];
  const reasoning: string[] = [];

  // Affichage du ratio dans le format naturel : X U pour 10g
  const unitsPer10g = 10 / ratio;
  const mealLabel: Record<MealTime, string> = {
    morning: "matin",
    lunch: "midi",
    snack: "goûter",
    dinner: "soir",
    other: "saisie libre",
  };
  // En mode "saisie libre" sans glucides, on ne mentionne pas le ratio dans
  // le raisonnement : c'est juste une correction (ou rien) — moins de bruit.
  if (mealTime !== 'other' || carbsGrams > 0) {
    reasoning.push(
      `Ratio ${mealLabel[mealTime]} : ${unitsPer10g.toFixed(1).replace(".", ",")}U pour 10g → ${carbsGrams}g = ${carbBolus.toFixed(1).replace(".", ",")}U`
    );
  }

  // Correction si glycémie au-dessus de la cible
  if (currentGlucose > config.targetRange.max) {
    const rawCorrection = (currentGlucose - target) / isf;
    const diff = currentGlucose - target;
    // Sensibilité au format naturel : X U pour 50 mg/dL au-dessus
    const unitsPer50mg = 50 / isf;
    reasoning.push(
      `Correction : ${diff} mg/dL au-dessus de la cible → ${rawCorrection.toFixed(1).replace(".", ",")}U (${unitsPer50mg.toFixed(1).replace(".", ",")}U pour 50 mg/dL)`
    );

    // T1D-safe : on soustrait l'IOB UNIQUEMENT de la part correction
    // (jamais du bolus repas, sinon on sous-dose la nourriture qui arrive).
    // Évite le stacking : si une correction précédente travaille encore,
    // on en tient compte avant d'en superposer une nouvelle.
    if (currentIOB > 0) {
      const adjusted = Math.max(0, rawCorrection - currentIOB);
      if (adjusted < rawCorrection) {
        reasoning.push(
          `IOB actif : ${currentIOB.toFixed(1).replace(".", ",")}U → correction réduite de ${rawCorrection.toFixed(1).replace(".", ",")}U à ${adjusted.toFixed(1).replace(".", ",")}U (anti-stacking)`
        );
      }
      correctionBolus = adjusted;
    } else {
      correctionBolus = rawCorrection;
    }
  } else if (currentGlucose < config.targetRange.min && carbsGrams === 0) {
    // Uniquement pour une correction PURE (pas de glucides) : la règle
    // hypo simple ci-dessous prend le relais dès qu'il y a des glucides,
    // avec un message qui montre la réduction plutôt qu'un conseil vague.
    reasoning.push(`Glycémie basse (${currentGlucose} mg/dL) — considérer des glucides supplémentaires avant l'injection`);
  }

  // ─── FPU (Fat-Protein Units) — Phase 11 ──────────────────────────────
  // ~50% des protéines se convertissent en glucose sur 5-6h, les lipides
  // ralentissent la digestion → un repas riche n'est pas couvert par le
  // Novorapid (~3h15) seul. On calcule un bolus FPU additionnel.
  let totalFPU = 0;
  let digestiveComplexity: 'simple' | 'moderate' | 'complex' = 'simple';
  if (fatGrams > 0 || proteinGrams > 0) {
    const fatCalories = fatGrams * 9;
    const proteinCalories = proteinGrams * 4;
    totalFPU = (fatCalories + proteinCalories) / 100;
    if (totalFPU >= 3) digestiveComplexity = 'complex';
    else if (totalFPU >= 1) digestiveComplexity = 'moderate';
    else digestiveComplexity = 'simple';

    if (totalFPU >= 0.5) {
      reasoning.push(
        `Digestion : ${fatGrams}g lipides + ${proteinGrams}g protéines = ${totalFPU.toFixed(1).replace(".", ",")} FPU. Indicateur de durée de digestion — la dose, elle, se calcule sur les seuls lipides.`
      );
    }
  }

  // ─── Trend arrow adjustment (slide rule) — Phase 11 ──────────────────
  trendBolus = trendAdjustmentUnits(trendArrow);
  if (trendBolus !== 0) {
    const arrow = trendArrowChar(trendArrow);
    const sign = trendBolus > 0 ? '+' : '';
    reasoning.push(
      `Tendance ${arrow} : ${sign}${trendBolus.toFixed(1).replace(".", ",")}U (glycémie ${trendBolus > 0 ? 'en montée' : 'en descente'} au moment du bolus)`
    );
  }

  // Warning si bolus repas + IOB élevé (la correction précédente est encore
  // active, surveiller la post-prandiale pour ne pas tomber en hypo).
  if (carbBolus > 0 && currentIOB > 1.5) {
    adjustments.push(`IOB ${currentIOB.toFixed(1).replace(".", ",")}U — surveille post-prandiale`);
    reasoning.push(
      `Tu as ${currentIOB.toFixed(1).replace(".", ",")}U d'insuline encore active. Le bolus repas n'est pas réduit (la nourriture nécessite sa pleine couverture) mais surveille ta glycémie 1-2h post-repas pour anticiper une hypo.`
    );
  }

  // Ajustements pré-entraînement (s'appliquent uniquement au bolus glucides).
  // Table partagée `preWorkoutReductionPct` (lib/exercise-insulin-adjustment.ts)
  // — les 4 familles du briefing, plus seulement muscu/running (sept. 2026).
  if (isPreWorkout && workoutType) {
    const pct = preWorkoutReductionPct(workoutType, minutesUntilWorkout);
    const label = exerciseFamilyLabel(workoutType);
    if (pct > 0) {
      carbBolus *= 1 - pct / 100;
      adjustments.push(`-${pct}% bolus (${label} dans ${minutesUntilWorkout <= 60 ? '<1h' : '<2h'})`);
      reasoning.push(
        workoutType === 'intermittent'
          ? `${label} dans ${minutesUntilWorkout}min: réduction bolus de ${pct}% — la glycémie tient pendant l'effort, c'est après qu'elle chute (l'appoint post-séance s'en charge)`
          : `${label} dans ${minutesUntilWorkout}min: réduction bolus de ${pct}% car cardio prolongé fait baisser ~60 mg/dL`,
      );
    } else if (workoutType === 'muscu') {
      reasoning.push(`Muscu prévue: pas de réduction car la muscu fait MONTER la glycémie (+45 mg/dL en moyenne). Prévoir correction post-séance si >180.`);
    } else {
      reasoning.push(`${label} dans ${minutesUntilWorkout}min: trop loin pour réduire le bolus, l'insuline du repas aura fini d'agir.`);
    }
  }

  // ─── Phase F — Réduction post-exercice (insulin sensitivity ↑) ──────
  // Appliquée sur carbBolus + correctionBolus (pas sur fpuBolus différé
  // ni trendBolus). L'effet "insulin sensitivity post-exercise" dure
  // 12-24h selon l'intensité (Riddell & Zaharieva 2017).
  //
  // ⚠️ Cumulé avec la réduction pre-workout : si l'utilisateur a couru
  // il y a 1h ET prévoit un running dans 30min, les 2 réductions
  // s'appliquent (effet protecteur anti-hypo).
  if (exerciseAdjustmentPct !== undefined && exerciseAdjustmentPct > 0) {
    const factor = 1 - Math.min(50, exerciseAdjustmentPct) / 100;
    const carbBefore = carbBolus;
    const corrBefore = correctionBolus;
    carbBolus *= factor;
    correctionBolus *= factor;
    adjustments.push(`Sensibilité ↑ post-sport : -${exerciseAdjustmentPct}%`);
    reasoning.push(
      `Sensibilité insuline ↑ : tu as fait du sport récemment → réduction de ${exerciseAdjustmentPct}% sur le bolus (${carbBefore.toFixed(1).replace(".", ",")}U → ${carbBolus.toFixed(1).replace(".", ",")}U glucides${corrBefore > 0 ? `, ${corrBefore.toFixed(1).replace(".", ",")}U → ${correctionBolus.toFixed(1).replace(".", ",")}U correction` : ""}).`
    );
  }

  // Stylo Novorapid d'Ethan = pas de demi-unités, il faut donc choisir un
  // entier. ⚠️ FIX (sept 2026, retour terrain hypos fréquentes/sévères) :
  // l'ancien choix — arrondir SYSTÉMATIQUEMENT au-dessus — ajoutait jusqu'à
  // +0.9U d'insuline à chaque repas, toujours dans le sens qui fait
  // descendre la glycémie. À l'ISF d'Ethan (100 mg/dL/U) ça représente
  // jusqu'à 90 mg/dL d'insuline en trop, systématiquement. Pour un patient
  // qui fait des hypos fréquentes (parfois sévères), c'est le mauvais
  // arbitrage : mieux vaut arrondir au PLUS PROCHE (erreur max ±0.5U dans
  // les deux sens) que de biaiser tout le monde vers le bas en continu.
  //
  // Seuils split dose (Phase 11, calibrage final mai 2026 basé sur les
  // guidelines NHS Cambridge / Whittington / ADA + Pankowska Warsaw method).
  //
  // **Critères cumulatifs** — TOUS doivent être réunis pour suggérer un split :
  //   - FPU ≥ 2.5             → seuil "vraiment riche" (vs 1.0 effet
  //                              modélisable mais pas split-worthy)
  //   - fat ≥ 30 OU prot ≥ 40 → seuils absolus NHS pour "high-fat" et
  //                              "high-protein" — un repas peut avoir
  //                              FPU élevé sans atteindre ces seuils
  //                              (ex: 20g lip + 20g prot = 2.6 FPU mais
  //                              en dessous des deux seuils → pas split)
  //   - carbsGrams ≥ 50       → un repas léger en glucides ne génère pas
  //                              de "trou de couverture" tardif même avec
  //                              FPU élevé
  //   - fpuBolus ≥ 1.5        → si l'apport calculé est < 1.5U, le split
  //                              donnerait < 2U arrondi → pas la peine
  //   - glycemicProfile ≠ 'fast' → glucides rapides (crêpes Nutella, pain
  //                                de mie, snack sucré, petit-déj cérèales)
  //                                → digestion principale rapide même avec
  //                                lipides → split contre-productif
  // Le FPU ne dose plus rien depuis septembre 2026 : la 2ᵉ injection se
  // calcule sur les seuls lipides (lib/fat-coverage.ts). `fpuBolusNow`
  // reste à 0 — le bolus initial n'a jamais contenu de FPU depuis le fix
  // de mai 2026, et ça ne change pas.
  const fpuBolusNow = 0;

  // ─── Règle hypo simple — Phase (sept 2026, décision utilisateur) ────────
  // « Sous 75 mg/dL, moins une unité. » Ne s'applique QUE quand le repas
  // porte des glucides (une correction pure n'est pas concernée — rien à
  // « sécuriser » côté nourriture). Appliquée sur le TOTAL, avant l'arrondi
  // final : sinon elle se ferait absorber par l'arrondi au plus proche.
  let hypoSafetyReduction = 0;
  if (carbsGrams > 0 && currentGlucose < HYPO_SAFETY_THRESHOLD) {
    hypoSafetyReduction = HYPO_SAFETY_REDUCTION_UNITS;
    adjustments.push(`-${HYPO_SAFETY_REDUCTION_UNITS}U sécurité (glycémie basse)`);
    reasoning.push(
      `Glycémie basse (${currentGlucose} mg/dL) : −${HYPO_SAFETY_REDUCTION_UNITS} U de sécurité`
    );
  }

  const rawTotal = Math.max(0, carbBolus + correctionBolus + trendBolus + fpuBolusNow - hypoSafetyReduction);
  // Arrondi au PLUS PROCHE (pas systématiquement au-dessus, cf. commentaire
  // au-dessus) — jamais négatif puisque rawTotal est déjà clampé à 0 par
  // Math.max ci-dessus.
  const totalBolus = Math.round(rawTotal);
  const roundedRawTotal = Math.round(rawTotal * 10) / 10;
  if (rawTotal > 0 && totalBolus !== roundedRawTotal) {
    const direction = totalBolus > rawTotal ? "au-dessus" : "en dessous";
    reasoning.push(
      `Arrondi ${direction} : ${rawTotal.toFixed(1).replace(".", ",")}U → ${totalBolus}U (stylo sans demi-unités)`
    );
  }

  // ─── Couverture des lipides — 2ᵉ injection (sept. 2026) ───────────────
  //
  // Remplace le calcul par FPU, qui mêlait calories des lipides ET des
  // protéines. Mesuré sur les données d'Ethan : les protéines n'ont AUCUNE
  // relation dose-effet avec la montée tardive, et le montant était très
  // surestimé (5 U réclamées là où 4 suffisaient, 2 U réclamées sur un
  // repas qui n'en demande aucune). Le détail et les ancrages sont dans
  // lib/fat-coverage.ts.
  //
  // Le FPU reste calculé plus haut : il alimente le badge de complexité
  // digestive et l'estimation de durée. Il informe, il ne dose plus.
  let splitDose: BolusResult['splitDose'];
  const fatCoverage = computeFatCoverage({
    fatGrams,
    carbBolusUnits: carbBolus,
    tiers: config.fatCoverageTiers,
  });
  if (fatCoverage.units > 0) {
    const delayMinutes = fatCoverage.delayMinutes;
    splitDose = {
      now: totalBolus,
      later: fatCoverage.units,
      delayMinutes,
    };
    const hours = Math.floor(delayMinutes / 60);
    const mins = delayMinutes % 60;
    const delayLabel = mins === 0 ? `${hours}h` : `${hours}h${mins.toString().padStart(2, '0')}`;
    const pctLabel = Math.round(fatCoverage.pctApplied * 100);
    reasoning.push(
      `Repas gras (${fatGrams}g de lipides) : la digestion s'étale et la glycémie monte tard. ${fatCoverage.units}U dans ${delayLabel}, soit ${pctLabel}% du bolus glucides.`
    );
    if (fatCoverage.capped) {
      reasoning.push(
        `Sécurité MDI : plafonné à ${fatCoverage.units}U en 2e injection.`
      );
    }
    adjustments.push(`Couverture lipides : +${fatCoverage.units}U dans ${delayLabel}`);
  } else if (fatGrams > 0 && fatGrams < FAT_COVERAGE_MIN_G && totalFPU >= 1.5) {
    // Repas avec des macros mais sous le seuil de lipides. Les trois anciens
    // messages parlaient encore de « seuils high-protein 40g » et de repas
    // « split-worthy » : un vocabulaire qui ne correspond plus à la règle
    // appliquée. Un seul message, aligné sur ce que le code fait vraiment.
    reasoning.push(
      `Pas de 2e injection : ${fatGrams}g de lipides, sous le seuil de ${FAT_COVERAGE_MIN_G}g. Tes données montrent qu'en dessous la montée tardive est négligeable. Surveille quand même la glycémie à T+3h.`
    );
  }

  return {
    carbBolus,
    correctionBolus,
    trendBolus,
    totalBolus,
    adjustments,
    reasoning,
    digestiveComplexity,
    splitDose,
  };
}

export function estimateGlucoseImpact(
  currentGlucose: number,
  insulinUnits: number,
  carbsGrams: number,
  mealTime: MealTime,
  configOverride?: DiabetesConfig,
): { estimatedPeak: number; estimatedTrough: number; timeline: { time: number; glucose: number }[] } {
  const config = configOverride || DIABETES_CONFIG;
  const ratio = getRatioForMeal(config, mealTime);
  const isf = config.insulinSensitivityFactor;

  // Estimation simplifiée de l'impact
  const carbImpact = (carbsGrams / ratio) * isf; // mg/dL que les glucides vont faire monter (via le ratio)
  // En réalité: glucides montent ~3-4 mg/dL par gramme, insuline baisse de ISF par unité
  const glucoseRise = carbsGrams * 3.5; // estimation
  const insulinDrop = insulinUnits * isf;

  const peakTime = 45; // minutes après le repas
  const insulinPeak = 90; // minutes

  const timeline: { time: number; glucose: number }[] = [];
  for (let t = 0; t <= 240; t += 15) {
    // Modèle simplifié: montée rapide des glucides puis descente de l'insuline
    const carbEffect = glucoseRise * Math.exp(-((t - peakTime) ** 2) / (2 * 30 ** 2));
    const insulinEffect = insulinDrop * (1 - Math.exp(-t / 60)) * Math.exp(-Math.max(0, t - insulinPeak) / 120);
    const glucose = currentGlucose + carbEffect * (t < peakTime ? t / peakTime : 1) - insulinEffect;
    timeline.push({ time: t, glucose: Math.round(glucose) });
  }

  const estimatedPeak = Math.max(...timeline.map((t) => t.glucose));
  const estimatedTrough = Math.min(...timeline.slice(4).map((t) => t.glucose));

  return { estimatedPeak, estimatedTrough, timeline: timeline.filter((_, i) => i <= 16) };
}

// ─── Glucides pré-sport par famille d'effort (sept. 2026) ───────────────
//
// Jusqu'ici, le briefing ne savait combler que l'ÉCART entre la glycémie
// estimée au départ et une cible (composante "avant l'effort", inchangée
// ci-dessous). Il ignorait complètement la DURÉE et la FAMILLE du sport :
// un padel de 90 minutes et une muscu de 30 recevaient le même conseil.
//
// Cette section ajoute la composante "pendant l'effort" : combien de
// glucides pour couvrir la baisse causée par l'effort lui-même, selon sa
// durée et l'insuline active (IOB). Consensus Riddell et al. 2017 : 30-60
// g/h quand l'insuline circulante est faible, jusqu'à 75 g/h quand elle
// est élevée, pour un aérobie continu de 60-150 min. Les valeurs
// intermittentes sont posées à environ la moitié — cohérentes avec la
// stabilité glycémique observée PENDANT l'effort (l'adrénaline soutient
// la glycémie tant que le match dure) — et sont des AMORCES à recalibrer
// sur les données réelles d'Ethan, pas des constantes établies.
//
// ⚠️ Garde-fous nés d'un incident réel (mai 2026) : une formule non
// bornée a un jour conseillé "191g de glucides" avec une glycémie prédite
// à -633 mg/dL. `MAX_PRE_SPORT_CARBS_G` est le plafond ABSOLU sur le
// total (composante avant + composante pendant, jamais l'une sans
// l'autre) et ne doit jamais être contourné. La règle des 120 minutes
// (`BRIEFING_MAX_WINDOW_MIN` dans lib/pre-sport-briefing.ts) reste le second garde-fou : au
// delà, on n'affiche plus de chiffre du tout.
export const HIGH_IOB_THRESHOLD_U = 1.5;
export const AEROBIC_CARBS_PER_HOUR_LOW_IOB = 45;
export const AEROBIC_CARBS_PER_HOUR_HIGH_IOB = 75;
export const INTERMITTENT_CARBS_PER_HOUR_LOW_IOB = 20;
export const INTERMITTENT_CARBS_PER_HOUR_HIGH_IOB = 40;
export const MAX_PRE_SPORT_CARBS_G = 80;
export const MAX_PLANNED_DURATION_MIN = 180;

/**
 * Garde-fous de l'apport PRÉVENTIF sur la durée (revue finale F2, sept. 2026).
 *
 * Sans eux, la branche préventive se déclenchait sur la seule condition
 * « glycémie < 180 » : 80 g conseillés à 179 mg/dL avec zéro insuline active.
 * Les 30-75 g/h du consensus Riddell s'adressent à quelqu'un qui risque de
 * chuter, pas à quelqu'un qui a de la marge.
 *
 * - Plancher d'insuline active : en dessous, rien ne « tire » la glycémie vers
 *   le bas et l'apport préventif n'a pas de justification.
 * - Plafond de trajectoire : si la glycémie prédite pendant l'effort reste
 *   au-dessus, la réserve est suffisante pour terminer sans apport.
 */
export const PREVENTIVE_CARBS_MIN_IOB_U = 0.5;
export const PREVENTIVE_CARBS_GLUCOSE_CEILING = 160;

/**
 * Durée (min) à partir de laquelle un effort aérobie ou intermittent
 * justifie un apport même sans insuline active (revue des correctifs,
 * sept. 2026). Le premier correctif ne gardait que le plancher d'IOB et
 * fermait du même coup le seul canal sensible à la durée : un running de
 * 2 h à 175 mg/dL sans insuline active ne conseillait plus rien, alors
 * qu'un effort long épuise le glycogène quelle que soit l'insuline à bord.
 *
 * L'absurdité d'origine venait d'efforts COURTS avec de la marge, pas des
 * efforts longs — d'où un critère de durée à côté du critère d'insuline,
 * les deux restant soumis au plafond de trajectoire.
 */
export const PREVENTIVE_CARBS_MIN_DURATION_MIN = 90;

const CARB_RATES: Record<ExerciseSource, { low: number; high: number }> = {
  running: { low: AEROBIC_CARBS_PER_HOUR_LOW_IOB, high: AEROBIC_CARBS_PER_HOUR_HIGH_IOB },
  "cardio-other": { low: AEROBIC_CARBS_PER_HOUR_LOW_IOB, high: AEROBIC_CARBS_PER_HOUR_HIGH_IOB },
  intermittent: {
    low: INTERMITTENT_CARBS_PER_HOUR_LOW_IOB,
    high: INTERMITTENT_CARBS_PER_HOUR_HIGH_IOB,
  },
  // Résistance : la muscu fait plutôt MONTER la glycémie (adrénaline +
  // glycogénolyse hépatique, Yardley et al. 2013) — jamais de glucides
  // pour "couvrir l'effort" ici, ce serait une hyperglycémie garantie.
  muscu: { low: 0, high: 0 },
};

/**
 * Glucides (g) à prévoir pour couvrir la baisse PENDANT l'effort, selon la
 * famille du sport, sa durée et l'insuline active (IOB). Distinct du
 * comblement de l'écart AVANT l'effort que le briefing (lib/pre-sport-briefing.ts) calcule
 * déjà depuis l'IOB et la tendance : les deux s'additionnent, sous
 * plafond — voir MAX_PRE_SPORT_CARBS_G.
 *
 * - Muscu → toujours 0, quelle que soit la durée ou l'IOB.
 * - Durée plafonnée à MAX_PLANNED_DURATION_MIN (180min) : au delà, on ne
 *   prévoit pas plus, la fenêtre de fiabilité de la prédiction est de
 *   toute façon dépassée bien avant (cf. règle des 120min plus bas).
 * - IOB interpolé linéairement entre le débit "IOB faible" et "IOB élevé"
 *   (seuil HIGH_IOB_THRESHOLD_U), plafonné à 100% au delà du seuil.
 */
export function exerciseCarbsForDuration(
  family: ExerciseSource,
  durationMin: number,
  iobUnits: number,
): number {
  const rates = CARB_RATES[family];
  if (!rates || (rates.low === 0 && rates.high === 0)) return 0;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return 0;
  const iob = Number.isFinite(iobUnits) ? Math.max(0, iobUnits) : 0;
  const t = Math.min(1, iob / HIGH_IOB_THRESHOLD_U);
  const perHour = rates.low + (rates.high - rates.low) * t;
  const hours = Math.min(durationMin, MAX_PLANNED_DURATION_MIN) / 60;
  return Math.min(MAX_PRE_SPORT_CARBS_G, Math.round(perHour * hours));
}

/** Libellé court d'une famille d'effort, pour le raisonnement affiché. */
export function exerciseFamilyLabel(family: ExerciseSource): string {
  switch (family) {
    case 'running': return 'Running';
    case 'cardio-other': return 'Cardio';
    case 'intermittent': return 'Sport intermittent';
    case 'muscu': return 'Muscu';
  }
}

/**
 * Conseil de timing d'injection — pré-bolus calé sur la pharmacocinétique
 * réelle du Novorapid (insuline aspart, stylo — schéma d'Ethan).
 *
 * PK Novorapid (SmPC Novo Nordisk / StatPearls) : début d'action 10-20 min,
 * pic 1-3h, durée 3-5h. Le fabricant recommande 5-10 min avant le repas ;
 * les études cliniques (Cobry 2010 ; revue Slattery 2018) montrent que 15-20
 * min avant est optimal sur le pic post-prandial — MAIS un pré-bolus de 15-20
 * min est trop agressif près de ~90 mg/dL ou en descente : l'insuline commence
 * à tirer avant que les glucides montent → petite hypo précoce (le cas d'Ethan).
 *
 * Donc le délai N'EST PAS fixe : il monte avec la glycémie de départ et
 * s'annule près de la cible / en descente. Barème (cible ~110 mg/dL) :
 *   < 80 ou ↓↓  → au repas / après les 1res bouchées (jamais anticiper)
 *   80-109      → au repas (0 min) — proche/​sous cible : pas de pré-bolus
 *   110-139     → ~10 min
 *   140-179     → ~15 min
 *   180-249     → ~20 min
 *   ≥ 250       → ~25 min
 * Ajusté par la tendance Libre : ↘ -10 min · ↗ +5 min · ↑↑ +10 min.
 * Snack rapide (<20g) → jamais de long pré-bolus (cap 5 min).
 *
 * Sources :
 *  - Novo Nordisk NovoRapid Product Monograph (onset 10-20 min, pic 1-3h)
 *  - StatPearls "Aspart Insulin" (NCBI NBK500030)
 *  - Cobry E. et al. 2010, Diabetes Care (aspart -30/-15/0 min : -15 optimal)
 *  - Slattery D. et al. 2018, Diabetic Medicine (revue timing pré-bolus)
 *
 * Renvoie null pour les saisies sans repas (mealTime "other" / 0g) ou en mode
 * pré-sport (l'advisor pré-sport prend le relais).
 */
export function getInjectionTimingAdvice(
  currentGlucose: number,
  carbsGrams: number,
  mealTime: MealTime,
  trendArrow?: number,
  isPreWorkout: boolean = false,
): {
  tone: 'standard' | 'early' | 'delay' | 'with-meal';
  /** Phrase courte type "Injecte ~15 min avant le repas". */
  headline: string;
  /** Justification en une phrase. */
  rationale: string;
  /** Minutes de pré-bolus recommandées (0 = au repas, <0 = après les bouchées). */
  leadMinutes: number;
} | null {
  // Pas de repas → pas de conseil
  if (carbsGrams === 0 || mealTime === 'other') return null;
  // En mode pré-sport, l'advisor sport prend le relais
  if (isPreWorkout) return null;

  // Filet de sécurité : glycémie basse ou en chute rapide → jamais anticiper.
  // Le Novorapid tire en 10-20 min ; un pré-bolus ferait tomber avant le repas.
  if (currentGlucose < 80 || trendArrow === 1) {
    return {
      tone: 'delay',
      leadMinutes: -1,
      headline: 'Injecte au moment du repas (ou après les 1res bouchées)',
      rationale:
        currentGlucose < 80
          ? `Glycémie ${currentGlucose} mg/dL : trop bas pour anticiper. Le Novorapid agit en 10-20 min → tu tomberais avant que les glucides montent.`
          : 'Glycémie en chute rapide : pas de pré-bolus, laisse-la se stabiliser d\'abord.',
    };
  }

  // Délai de base selon la glycémie (mg/dL), calé sur onset Novorapid 10-20 min.
  let lead: number;
  if (currentGlucose < 110) lead = 0;        // proche/​sous cible → au repas
  else if (currentGlucose < 140) lead = 10;
  else if (currentGlucose < 180) lead = 15;
  else if (currentGlucose < 250) lead = 20;
  else lead = 25;

  // Ajustement tendance Libre (↘ raccourcit, ↗/↑↑ rallongent).
  if (trendArrow === 2) lead = Math.max(0, lead - 10); // ↘
  else if (trendArrow === 4) lead += 5;                // ↗
  else if (trendArrow === 5) lead += 10;               // ↑↑

  // Snack à absorption rapide (<20g) → jamais de long pré-bolus.
  if (mealTime === 'snack' && carbsGrams < 20) lead = Math.min(lead, 5);

  // Au moment du repas (0 min) — proche de la cible : le cas anti-hypo d'Ethan.
  if (lead === 0) {
    return {
      tone: 'with-meal',
      leadMinutes: 0,
      headline: 'Injecte au moment du repas',
      rationale: `Glycémie ${currentGlucose} mg/dL (proche de ta cible) : pas de pré-bolus, sinon le Novorapid te fait une petite hypo avant que les glucides montent.`,
    };
  }

  // Pré-bolus gradué.
  return {
    tone: lead >= 20 ? 'early' : 'standard',
    leadMinutes: lead,
    headline: `Injecte ~${lead} min avant le repas`,
    rationale: `Glycémie ${currentGlucose} mg/dL : le Novorapid met 10-20 min à agir, ~${lead} min de pré-bolus lissent le pic glucides sans te faire tomber bas.`,
  };
}

/**
 * Score de complexité digestive basé sur les macros — Phase 11.
 * Réutilisable hors calcul bolus (UI badges, analytics meal-tag).
 */
export function getDigestiveComplexity(
  carbsGrams: number,
  fatGrams: number,
  proteinGrams: number,
): {
  level: 'simple' | 'moderate' | 'complex';
  estimatedDigestionHours: number;
  message: string;
  fpu: number;
} {
  const fpu = (fatGrams * 9 + proteinGrams * 4) / 100;
  if (fpu >= 3) {
    return {
      level: 'complex',
      estimatedDigestionHours: 5,
      message: 'Digestion longue (~5h). Re-check glycémie à T+3h.',
      fpu,
    };
  }
  if (fpu >= 1.5) {
    return {
      level: 'moderate',
      estimatedDigestionHours: 3.5,
      message: 'Digestion modérée (~3-4h). Surveille à T+2h30.',
      fpu,
    };
  }
  return {
    level: 'simple',
    estimatedDigestionHours: 2,
    message: 'Digestion rapide (~2h). Pic glycémique attendu à T+45min.',
    fpu,
  };
}

export function getInsulinOnBoard(
  recentInjections: { units: number; minutesAgo: number }[],
): { totalIOB: number; details: { units: number; minutesAgo: number; remaining: number }[] } {
  const activeDuration = DIABETES_CONFIG.insulinActiveDuration;
  const details = recentInjections
    .filter((inj) => inj.minutesAgo < activeDuration)
    .map((inj) => {
      // Modèle linéaire simplifié de l'IOB
      const remaining = inj.units * Math.max(0, 1 - inj.minutesAgo / activeDuration);
      return { ...inj, remaining };
    });

  const totalIOB = details.reduce((sum, d) => sum + d.remaining, 0);
  return { totalIOB: Math.round(totalIOB * 10) / 10, details };
}
