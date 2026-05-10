import { DIABETES_CONFIG } from './constants';
import type { DiabetesConfig, MealTime } from '@/types';

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
  } else if (currentGlucose < config.targetRange.min) {
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
    // 1 FPU ≈ 10g de glucides équivalents → on applique le même ratio
    const fpuCarbEquivalent = totalFPU * 10;
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

  // Stylo Novorapid d'Ethan = pas de demi-unités. On arrondit au-dessus
  // pour éviter de sous-doser (le risque "hyper" est plus prévisible que
  // le risque "hypo brutal" en post-prandial avec une dose insuffisante).
  // On inclut FPU + trendBolus dans le total quand pas de split (cas où
  // FPU est petit ou non renseigné). Si split actif → only carb+correction
  // dans "now".
  //
  // Seuils split dose (Phase 11, ajustés mai 2026) : on ne suggère un
  // split QUE pour les vrais repas lourds (pâtes, pizza, viande+accomp.).
  //   - FPU ≥ 2.0       → digestion vraiment longue, bolus glucides
  //                        seul ne suffit pas
  //   - carbsGrams ≥ 40 → un repas léger en glucides ne pose pas de
  //                        problème d'absorption tardive même avec FPU
  //                        élevé (cas salade + huile/protéines)
  //   - fpuBolus ≥ 1.5  → si l'apport FPU calculé est < 1,5U, le split
  //                        donnerait <2U arrondi → pas la peine de
  //                        casser en deux
  // Les 3 conditions doivent être réunies. Sinon, le FPU est intégré
  // directement au bolus principal.
  const useSplit = totalFPU >= 2 && carbsGrams >= 40 && fpuBolus >= 1.5;
  const rawTotalNoSplit = Math.max(0, carbBolus + correctionBolus + trendBolus + fpuBolus);
  const rawTotalWithSplit = Math.max(0, carbBolus + correctionBolus + trendBolus);

  const rawTotal = useSplit ? rawTotalWithSplit : rawTotalNoSplit;
  const totalBolus = Math.ceil(rawTotal);
  if (rawTotal > 0 && totalBolus !== Math.round(rawTotal * 10) / 10) {
    reasoning.push(
      `Arrondi au-dessus : ${rawTotal.toFixed(1).replace(".", ",")}U → ${totalBolus}U (stylo sans demi-unités)`
    );
  }

  // ─── Split dose — Phase 11 ────────────────────────────────────────────
  let splitDose: BolusResult['splitDose'];
  if (useSplit && fpuBolus > 0) {
    const laterUnits = Math.ceil(fpuBolus);
    // Délai = 150min pour repas très lourds (FPU ≥ 3, ex: pâtes énorme,
    // pizza, viande+accomp), 120min sinon (cas standard).
    const delayMinutes = totalFPU >= 3 ? 150 : 120;
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
      `${complexityLabel} (${totalFPU.toFixed(1).replace(".", ",")} FPU) : la digestion va durer ${digestionHours}. Suggestion split : ${totalBolus}U maintenant, puis ${laterUnits}U dans ${delayLabel}.`
    );
    adjustments.push(`Split dose : +${laterUnits}U dans ${delayLabel}`);
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
 * Conseil de timing d'injection — Phase 11.
 *
 * Le pré-bolus 15min avant le repas est le standard T1D pour anticiper le
 * pic glycémique des glucides. Mais ça dépend du contexte :
 *  - Glycémie basse / trend descendante → injecter au moment du repas
 *    (ou même 15min après) pour éviter une hypo précoce
 *  - Glycémie haute / trend montante → injecter 20-30 min avant pour
 *    laisser à l'insuline le temps d'agir avant le pic
 *  - Snack / petit repas → moins critique, au moment du repas suffit
 *  - Pré-workout → géré par l'advisor pré-sport, on ne dit rien ici
 *
 * Renvoie null pour les saisies sans repas (correction seule, mealTime "other"
 * sans glucides) — pas de conseil de timing pertinent.
 */
export function getInjectionTimingAdvice(
  currentGlucose: number,
  carbsGrams: number,
  mealTime: MealTime,
  trendArrow?: number,
  isPreWorkout: boolean = false,
): {
  tone: 'standard' | 'early' | 'delay' | 'with-meal';
  /** Phrase courte type "Injecte 15 min avant le repas". */
  headline: string;
  /** Justification en une phrase. */
  rationale: string;
} | null {
  // Pas de repas → pas de conseil
  if (carbsGrams === 0 || mealTime === 'other') return null;
  // En mode pré-sport, l'advisor sport prend le relais
  if (isPreWorkout) return null;

  const isFalling = trendArrow === 1 || trendArrow === 2; // ↓↓ ou ↘
  const isRising = trendArrow === 4 || trendArrow === 5;  // ↗ ou ↑↑
  const isSnack = mealTime === 'snack';

  // 1. Glycémie basse OU en chute → injecter pendant le repas, pas avant
  if (currentGlucose < 90 || trendArrow === 1) {
    return {
      tone: 'with-meal',
      headline: 'Injecte au moment du repas',
      rationale:
        currentGlucose < 90
          ? `Glycémie ${currentGlucose} mg/dL : pas de pré-bolus, sinon risque d'hypo précoce.`
          : 'Glycémie en chute : pas de pré-bolus, attends que ça se stabilise.',
    };
  }

  // 2. Trend descendante simple → injecte au moment du repas
  if (isFalling) {
    return {
      tone: 'with-meal',
      headline: 'Injecte au moment du repas',
      rationale: 'Glycémie en descente : un pré-bolus risquerait de te faire tomber bas avant le pic glucides.',
    };
  }

  // 3. Glycémie haute (>180) ou trend montante → pré-bolus plus long
  if (currentGlucose > 180 || isRising) {
    return {
      tone: 'early',
      headline: 'Injecte 20-30 min avant le repas',
      rationale:
        currentGlucose > 180
          ? `Glycémie ${currentGlucose} mg/dL : laisse à l'insuline le temps de redescendre avant que les glucides arrivent.`
          : 'Glycémie en montée : pré-bolus plus long pour anticiper le pic.',
    };
  }

  // 4. Snack avec peu de glucides → moins critique
  if (isSnack && carbsGrams < 20) {
    return {
      tone: 'with-meal',
      headline: 'Injecte au moment du goûter',
      rationale: 'Petit snack : pas besoin de pré-bolus, l\'absorption est rapide.',
    };
  }

  // 5. Cas standard : glycémie en plage, trend stable → pré-bolus 15min
  return {
    tone: 'standard',
    headline: 'Injecte idéalement 15 min avant le repas',
    rationale: 'Pré-bolus standard : l\'insuline commence à agir avant le pic glycémique des glucides.',
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
