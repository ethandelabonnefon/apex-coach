import { DIABETES_CONFIG } from './constants';
import type { DiabetesConfig, MealTime } from '@/types';

// ───────────────────────────────────────────────────────────────────────
// Phase 11 — Calibrage FPU (mai 2026, retour terrain Ethan)
// ───────────────────────────────────────────────────────────────────────
//
// Le facteur "1 FPU = 10g équivalent glucides" est l'EXTRAPOLATION
// THÉORIQUE MAXIMALE de Pankowska 2009. En pratique MDI (stylos),
// les études cliniques ultérieures (Bell et al. 2015, NHS Cambridge,
// Smart et al. 2018) recommandent un facteur empirique plus prudent :
//   - Seulement ~50% des protéines se convertissent en glucose (gluconéogenèse)
//   - Les lipides ralentissent l'absorption mais ne créent pas de glucose
//   - Le risque d'hypo sévère en MDI justifie un seuil conservatif
//
// Calibrage Ethan retour terrain : 152g carbs + 82g lip + 94g prot
// → FPU = 11.14 → fpuBolus théorique = 11.1U (avec factor 10)
// → Glycémie observée à T+2h sans 2e dose : 160 mg/dL (proche cible)
// → 12U auraient causé hypo sévère ; 6-7U max acceptable
//
// Trois garde-fous cumulatifs :
//   - FPU_CARB_EQUIVALENT_FACTOR = 6 (au lieu de 10 théorique)
//   - LATER_DOSE_RELATIVE_CAP = 0.4 (max 40% du bolus glucides initial)
//   - LATER_DOSE_ABSOLUTE_CAP = 8 (plafond absolu MDI)
const FPU_CARB_EQUIVALENT_FACTOR = 6;
const LATER_DOSE_RELATIVE_CAP = 0.4;
const LATER_DOSE_ABSOLUTE_CAP = 8;

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
  fpuBolus: number;
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
  workoutType: 'muscu' | 'running' | null = null,
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
  let fpuBolus = 0;
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
    // Empirique MDI : 1 FPU ≈ 6g équivalent glucides (au lieu du 10g
    // théorique de Pankowska). Cf constante FPU_CARB_EQUIVALENT_FACTOR
    // en haut du fichier pour la justification scientifique.
    const fpuCarbEquivalent = totalFPU * FPU_CARB_EQUIVALENT_FACTOR;
    fpuBolus = fpuCarbEquivalent / ratio;

    if (totalFPU >= 3) digestiveComplexity = 'complex';
    else if (totalFPU >= 1) digestiveComplexity = 'moderate';
    else digestiveComplexity = 'simple';

    if (totalFPU >= 0.5) {
      reasoning.push(
        `FPU : ${fatGrams}g lipides + ${proteinGrams}g protéines = ${totalFPU.toFixed(1).replace(".", ",")} FPU → équivalent ~${fpuCarbEquivalent.toFixed(0)}g glucides → ${fpuBolus.toFixed(1).replace(".", ",")}U supplémentaires`
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

  // Ajustements pré-entraînement (s'appliquent uniquement au bolus glucides)
  if (isPreWorkout && workoutType) {
    if (workoutType === 'running') {
      if (minutesUntilWorkout <= 60) {
        const reduction = 0.5;
        carbBolus *= reduction;
        adjustments.push(`-50% bolus (running dans <1h)`);
        reasoning.push(`Running dans ${minutesUntilWorkout}min: réduction bolus de 50% car cardio prolongé fait baisser ~60 mg/dL`);
      } else if (minutesUntilWorkout <= 120) {
        const reduction = 0.7;
        carbBolus *= reduction;
        adjustments.push(`-30% bolus (running dans <2h)`);
        reasoning.push(`Running dans ${minutesUntilWorkout}min: réduction bolus de 30%`);
      }
    } else if (workoutType === 'muscu') {
      reasoning.push(`Muscu prévue: pas de réduction car la muscu fait MONTER la glycémie (+45 mg/dL en moyenne). Prévoir correction post-séance si >180.`);
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
  const fastCarbs = glycemicProfile === 'fast';
  const meetsClinicalHigh = fatGrams >= 30 || proteinGrams >= 40;
  const useSplit =
    totalFPU >= 2.5 &&
    meetsClinicalHigh &&
    carbsGrams >= 50 &&
    fpuBolus >= 1.5 &&
    !fastCarbs;

  // Quand split actif → 100% des glucides+correction au repas, 100% du FPU
  // différé en 2e injection (modèle Pankowska classique).
  //
  // ⚠️ FIX mai 2026 (itération 2) : le FPU n'est JAMAIS intégré au bolus
  // initial. Précédemment, pour les repas non split-worthy avec FPU
  // notable (cas Ethan : 74g + 23 lip + 29 prot = 3.23 FPU mais
  // fat<30/prot<40), le FPU 100% était ajouté au bolus initial →
  // 7.4U + 3.23U = 11U → hypo systématique.
  //
  // Logique correcte (NHS conservative MDI) :
  //  - useSplit = TRUE  → bolus initial = glucides+correction uniquement,
  //                       FPU 100% différé en 2e injection
  //  - useSplit = FALSE → bolus initial = glucides+correction uniquement,
  //                       PAS de FPU (le bolus glucides seul suffit pour
  //                       les repas non split-worthy). Si la glycémie
  //                       monte tardivement, l'utilisateur peut ajuster
  //                       son ratio ou activer manuellement un split.
  const fpuBolusNow = 0; // jamais dans le bolus initial
  const fpuBolusLater = useSplit ? fpuBolus : 0;

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

  // ─── Split dose 50/50 — Phase 11 (calibrage mai 2026) ─────────────────
  let splitDose: BolusResult['splitDose'];
  if (useSplit && fpuBolusLater > 0) {
    // ─── 3 garde-fous sécurité MDI (calibrage retour terrain Ethan) ────
    // 1. Calcul théorique arrondi au-dessus (stylo sans demi-unités)
    const theoretical = Math.max(1, Math.ceil(fpuBolusLater));
    // 2. Cap relatif : max 40% du bolus glucides initial
    const relativeMax = Math.max(1, Math.floor(carbBolus * LATER_DOSE_RELATIVE_CAP));
    // 3. Cap absolu : 8U max en 2e injection
    const laterUnits = Math.min(theoretical, relativeMax, LATER_DOSE_ABSOLUTE_CAP);
    const wasCapped = theoretical > laterUnits;
    // Délais Pankowska adaptés MDI : pic de digestion vs durée d'action
    // du Novorapid (~3h15). Cap à 150min car au-delà la 1ère injection
    // commence à finir et le risque d'hypo précoce baisse mais l'utilité
    // du split aussi.
    //   FPU 2.5-3   → 90 min  (digestion ~3-4h, mi-temps)
    //   FPU 3-4     → 120 min (digestion ~4-5h)
    //   FPU > 4     → 150 min (digestion 5h+, repas très lourd)
    const delayMinutes =
      totalFPU >= 4 ? 150 :
      totalFPU >= 3 ? 120 :
      90;
    splitDose = {
      now: totalBolus,
      later: laterUnits,
      delayMinutes,
    };
    const hours = Math.floor(delayMinutes / 60);
    const mins = delayMinutes % 60;
    const delayLabel = mins === 0 ? `${hours}h` : `${hours}h${mins.toString().padStart(2, '0')}`;
    const complexityLabel =
      digestiveComplexity === 'complex' ? 'Repas complexe' : 'Repas modéré';
    const digestionHours = digestiveComplexity === 'complex' ? '~5h' : '~3-4h';
    reasoning.push(
      `${complexityLabel} (${totalFPU.toFixed(1).replace(".", ",")} FPU) : la digestion va durer ${digestionHours}. Split classique : ${totalBolus}U maintenant (juste les glucides), puis ${laterUnits}U dans ${delayLabel} pour couvrir les graisses/protéines.`
    );
    if (wasCapped) {
      reasoning.push(
        `Sécurité MDI : ${theoretical}U théoriques plafonnés à ${laterUnits}U (max 40% du bolus initial ou 8U absolus) pour éviter une hypo précoce.`
      );
    }
    adjustments.push(`Split dose : +${laterUnits}U dans ${delayLabel}`);
  } else if (fastCarbs && totalFPU >= 2.5 && carbsGrams >= 50) {
    // Cas explicite : repas qui SERAIT split-worthy mais glucides rapides
    // → on l'explique pour pédagogie
    reasoning.push(
      `Pas de split dose : tu manges des glucides rapides (${totalFPU.toFixed(1).replace(".", ",")} FPU mais digestion principale rapide). Le bolus initial couvre les glucides.`
    );
  } else if (totalFPU >= 1.5 && totalFPU < 2.5 && carbsGrams >= 40) {
    // FPU notable mais en dessous des seuils split-worthy → warning info
    // pour que l'utilisateur surveille la montée tardive
    reasoning.push(
      `FPU notable (${totalFPU.toFixed(1).replace(".", ",")} FPU) mais en dessous des seuils high-fat (30g) / high-protein (40g). Le bolus couvre les glucides — surveille la glycémie à T+3h pour détecter une montée tardive éventuelle.`
    );
  } else if (totalFPU >= 2.5 && !meetsClinicalHigh && carbsGrams >= 50) {
    // Cas border-line : FPU élevé en absolu mais ni high-fat ni high-protein
    // (cas Ethan 74/23/29 = 3.23 FPU mais fat<30 ET prot<40)
    reasoning.push(
      `FPU élevé (${totalFPU.toFixed(1).replace(".", ",")} FPU) mais ni high-fat (${fatGrams}g < 30g) ni high-protein (${proteinGrams}g < 40g). Le bolus couvre les glucides — surveille la glycémie à T+3h.`
    );
  }

  return {
    carbBolus,
    correctionBolus,
    fpuBolus,
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

/**
 * Briefing pré-sport — Phase 11.
 *
 * Quand l'utilisateur a déjà fait son bolus repas et planifie un sport
 * dans X minutes, on évalue le contexte global (IOB + glycémie + split
 * dose en attente) pour donner des recommandations ACTIONNABLES :
 *  - Manger des glucides avant le sport
 *  - Réduire la 2e dose du split dose si elle tombe pendant ou après
 *    une séance de running (qui fait baisser la glycémie)
 *  - Reporter le split dose après le sport
 *
 * Ce briefing est INDÉPENDANT du calculateur de bolus — il sert de
 * "filet de sécurité" entre deux moments d'injection.
 *
 * Renvoie un set de recommandations classées par priorité (la première
 * est la plus actionnable). Renvoie [] si pas de risque détecté.
 */
export function computePreSportBriefing(input: {
  currentGlucose: number;
  trendArrow?: number;
  iobUnits: number;
  isfMgPerU: number;          // Insulin Sensitivity Factor (mg/dL par U)
  insulinActiveMinutes: number; // durée d'action insuline (par défaut 195)
  workoutType: 'muscu' | 'running';
  minutesUntilWorkout: number;
  workoutDurationMinutes?: number;
  /** Split dose en attente : units + délai jusqu'au moment où il sera dû */
  pendingSplitUnits?: number;
  pendingSplitMinutesUntil?: number;
  /** Impact sport perso (depuis Bloc 6) — fallback sur valeurs académiques. */
  personalSportImpact?: number | null;
}): {
  /** Glycémie estimée au début du sport (compte tenu IOB + split + trend). */
  estimatedAtWorkoutStart: number;
  /** Glycémie estimée pendant le sport (en intégrant l'impact sport). */
  estimatedDuringWorkout: number;
  /** Décomposition des drops (transparence UI) — Phase 11. */
  breakdown: {
    glucoseInput: number;
    trendArrowUsed?: number;
    dropFromIob: number;
    dropFromSplit: number;
    dropFromTrend: number;
    sportImpact: number;
  };
  /** Niveau de risque global. */
  risk: 'safe' | 'caution' | 'risk';
  /** Recommandations classées par priorité (la 1ère = la plus actionnable). */
  recommendations: {
    type: 'eat-carbs' | 'reduce-split' | 'delay-split' | 'delay-workout' | 'check-glucose' | 'safe';
    headline: string;
    detail: string;
    /** Quantité numérique associée si pertinent (ex: 15 pour "15g"). */
    quantity?: number;
  }[];
} {
  const {
    currentGlucose,
    trendArrow,
    iobUnits,
    isfMgPerU,
    insulinActiveMinutes,
    workoutType,
    minutesUntilWorkout,
    pendingSplitUnits = 0,
    pendingSplitMinutesUntil,
    personalSportImpact,
  } = input;

  // 1. Estimation glycémie au début du sport
  // - drop dû à l'IOB pendant la fenêtre minutesUntilWorkout
  // - drop additionnel si le split tombe avant le sport
  // - effet de la trend Libre actuelle (extrapolation court terme)
  //
  // ⚠️ Calibrage important : la formule pure (IOB × ISF × fraction) donne
  // des prédictions absurdes pour les fenêtres longues car elle ignore les
  // facteurs compensateurs (digestion en cours, contre-régulation, glucides
  // résiduels du repas). On plafonne donc le drop pratique à un max
  // physiologique (≈ 50% du potentiel total IOB×ISF) qui reflète mieux
  // la réalité observée chez les T1D bien régulés.
  const PRACTICAL_DROP_CAP = 0.5; // facteur de plafonnement vs potentiel total
  const fractionDuringWindow = Math.min(PRACTICAL_DROP_CAP, minutesUntilWorkout / insulinActiveMinutes);
  const dropFromIob = iobUnits * isfMgPerU * fractionDuringWindow;

  let dropFromSplit = 0;
  const splitFallsBeforeWorkout =
    pendingSplitUnits > 0 &&
    pendingSplitMinutesUntil !== undefined &&
    pendingSplitMinutesUntil < minutesUntilWorkout;
  if (splitFallsBeforeWorkout) {
    const splitActiveMinutes = minutesUntilWorkout - (pendingSplitMinutesUntil ?? 0);
    const splitFraction = Math.min(PRACTICAL_DROP_CAP, splitActiveMinutes / insulinActiveMinutes);
    dropFromSplit = pendingSplitUnits * isfMgPerU * splitFraction;
  }

  // ─── Effet de la trend Libre — Phase 11 ─────────────────────
  // La trend reflète le mouvement glycémique en ce moment (signal court
  // terme). On extrapole linéairement sur la fenêtre du sport, mais on
  // limite l'effet à 30min max (au-delà la trend perd toute valeur car
  // elle change rapidement avec les facteurs en jeu).
  // Vitesses Abbott (mg/dL/min, valeurs conservatives pour pas double-comptage avec IOB) :
  //   ↓↓ (1) : -1.5  ↘ (2) : -0.7   → (3) : 0   ↗ (4) : +0.7   ↑↑ (5) : +1.5
  const trendVelocity =
    trendArrow === 1 ? -1.5 :
    trendArrow === 2 ? -0.7 :
    trendArrow === 4 ? 0.7 :
    trendArrow === 5 ? 1.5 :
    0;
  const trendWindow = Math.min(30, minutesUntilWorkout); // cap à 30min
  const dropFromTrend = -trendVelocity * trendWindow; // positif = baisse

  // Floor à 40 mg/dL : en dessous c'est juste pas réaliste (l'utilisateur
  // aurait corrigé bien avant). Évite des recommandations absurdes type
  // "mange 191g de glucides".
  const rawEstimate = currentGlucose - dropFromIob - dropFromSplit - dropFromTrend;
  const estimatedAtWorkoutStart = Math.max(40, Math.round(rawEstimate));

  // Détection : fenêtre trop longue → la prédiction n'est plus fiable
  // (au-delà de 120min les facteurs compensateurs dominent).
  const windowTooLong = minutesUntilWorkout > 120;

  // 2. Estimation pendant le sport (intègre l'impact sport)
  const sportImpact =
    personalSportImpact !== null && personalSportImpact !== undefined
      ? personalSportImpact
      : workoutType === 'muscu'
      ? 40
      : -60;
  const estimatedDuringWorkout = estimatedAtWorkoutStart + sportImpact;

  const breakdown = {
    glucoseInput: currentGlucose,
    trendArrowUsed: trendArrow,
    dropFromIob: Math.round(dropFromIob),
    dropFromSplit: Math.round(dropFromSplit),
    dropFromTrend: Math.round(dropFromTrend),
    sportImpact,
  };

  // 3. Trend descendante = facteur aggravant
  const isFalling = trendArrow === 1 || trendArrow === 2;

  // 4. Évaluation du risque
  const recos: ReturnType<typeof computePreSportBriefing>["recommendations"] = [];
  let risk: 'safe' | 'caution' | 'risk' = 'safe';

  // ─── Fenêtre trop longue → recommandation prudente ─────────
  // Au-delà de 2h, la prédiction n'est plus fiable. On invite l'utilisateur
  // à re-vérifier sa glycémie 30min avant son sport plutôt que d'agir sur
  // la base d'un chiffre absurde.
  if (windowTooLong) {
    risk = 'caution';
    recos.push({
      type: 'check-glucose',
      headline: 'Re-vérifie ta glycémie 30 min avant le sport',
      detail: `À ${minutesUntilWorkout} min d'écart, beaucoup de choses peuvent évoluer (digestion en cours, contre-régulation). Reviens ici à 30-60 min du sport pour une prédiction fiable.`,
    });
    // On retourne quand même les estimations pour info, mais sans recos
    // alarmistes basées sur un chiffre peu fiable.
    return {
      estimatedAtWorkoutStart,
      estimatedDuringWorkout: estimatedAtWorkoutStart + (
        personalSportImpact !== null && personalSportImpact !== undefined
          ? personalSportImpact
          : workoutType === 'muscu' ? 40 : -60
      ),
      breakdown,
      risk,
      recommendations: recos,
    };
  }

  // ─── Risque hypo en début de sport ─────────────────────────
  if (estimatedAtWorkoutStart < 90 || (estimatedAtWorkoutStart < 110 && isFalling)) {
    risk = 'risk';
    const target = workoutType === 'running' ? 150 : 130;
    // Plafonné à 60g (au-delà c'est plus une collation qu'un re-sucrage).
    const carbsNeeded = Math.min(60, Math.max(15, Math.ceil((target - estimatedAtWorkoutStart) / 4)));
    recos.push({
      type: 'eat-carbs',
      headline: `Mange ${carbsNeeded}g de glucides rapides avant le sport`,
      detail: `Ta glycémie estimée au début du ${workoutType} est ${estimatedAtWorkoutStart} mg/dL — trop bas pour démarrer en sécurité.`,
      quantity: carbsNeeded,
    });
  }

  // ─── Split dose qui tombe avant ou pendant le sport ─────────
  if (splitFallsBeforeWorkout && pendingSplitUnits > 0) {
    const splitDuringWorkout = workoutType === 'running'
      ? estimatedDuringWorkout < 120  // running fait baisser, split rajoute
      : estimatedDuringWorkout < 100; // muscu monte mais split peut compenser
    if (splitDuringWorkout || estimatedDuringWorkout < 100) {
      const reducedSplit = Math.max(0, Math.ceil(pendingSplitUnits / 2));
      risk = risk === 'risk' ? 'risk' : 'caution';
      recos.push({
        type: 'reduce-split',
        headline: `Réduis ta 2e dose à ${reducedSplit}U au lieu de ${pendingSplitUnits}U`,
        detail: `Le split dose tombe avant ton sport. Avec l'effet ${workoutType === 'running' ? 'hypoglycémiant du running' : 'de l\'IOB'}, ${pendingSplitUnits}U risque d'être trop. Réduis à ${reducedSplit}U.`,
        quantity: reducedSplit,
      });
      recos.push({
        type: 'delay-split',
        headline: `Ou décale ta 2e dose à après le sport`,
        detail: `Reporte le split dose 30min après ta séance — la couverture FPU sera moins risquée à ce moment.`,
      });
    }
  }

  // ─── Hypo prévue PENDANT le sport (sans split en jeu) ──────
  if (estimatedDuringWorkout < 80 && recos.length === 0) {
    risk = 'risk';
    const carbsNeeded = workoutType === 'running' ? 30 : 20;
    recos.push({
      type: 'eat-carbs',
      headline: `Mange ${carbsNeeded}g de glucides avant le sport`,
      detail: `Ta glycémie va probablement chuter à ~${estimatedDuringWorkout} mg/dL pendant ton ${workoutType}.`,
      quantity: carbsNeeded,
    });
  } else if (estimatedDuringWorkout < 110 && recos.length === 0) {
    risk = 'caution';
    recos.push({
      type: 'eat-carbs',
      headline: `Prends 10-15g de glucides avant le sport`,
      detail: `Ta glycémie sera autour de ${estimatedDuringWorkout} mg/dL pendant — un peu juste pour finir la séance sans hypo.`,
      quantity: 15,
    });
  }

  // ─── Hyper en début de sport ───────────────────────────────
  if (estimatedAtWorkoutStart > 250) {
    risk = 'caution';
    recos.push({
      type: workoutType === 'running' ? 'check-glucose' : 'delay-workout',
      headline:
        workoutType === 'running'
          ? 'Vérifie tes cétones avant de courir'
          : 'Glycémie trop haute, attends 30min',
      detail: `Glycémie estimée ${estimatedAtWorkoutStart} mg/dL au début du sport — risque de cétoacidose en aérobie ou faible perf en muscu.`,
    });
  }

  // ─── Aucun risque détecté → message safe ───────────────────
  if (recos.length === 0) {
    recos.push({
      type: 'safe',
      headline: 'Tu peux y aller, rien à ajuster',
      detail:
        workoutType === 'muscu'
          ? `Glycémie estimée ${estimatedAtWorkoutStart} → ~${estimatedDuringWorkout} pendant la muscu (qui fait monter de ~${sportImpact > 0 ? '+' : ''}${sportImpact} mg/dL).`
          : `Glycémie estimée ${estimatedAtWorkoutStart} → ~${estimatedDuringWorkout} pendant le running. Garde du sucre sur toi au cas où.`,
    });
  }

  return {
    estimatedAtWorkoutStart,
    estimatedDuringWorkout,
    breakdown,
    risk,
    recommendations: recos,
  };
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
