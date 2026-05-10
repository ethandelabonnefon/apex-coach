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
  /** Glycémie estimée au début du sport (compte tenu IOB + split). */
  estimatedAtWorkoutStart: number;
  /** Glycémie estimée pendant le sport (en intégrant l'impact sport). */
  estimatedDuringWorkout: number;
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

  // Floor à 40 mg/dL : en dessous c'est juste pas réaliste (l'utilisateur
  // aurait corrigé bien avant). Évite des recommandations absurdes type
  // "mange 191g de glucides".
  const rawEstimate = currentGlucose - dropFromIob - dropFromSplit;
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
    risk,
    recommendations: recos,
  };
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
