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

export function calculateBolus(
  carbsGrams: number,
  mealTime: MealTime,
  currentGlucose: number,
  isPreWorkout: boolean = false,
  workoutType: 'muscu' | 'running' | null = null,
  minutesUntilWorkout: number = 0,
  configOverride?: DiabetesConfig,
): {
  carbBolus: number;
  correctionBolus: number;
  totalBolus: number;
  adjustments: string[];
  reasoning: string[];
} {
  const config = configOverride || DIABETES_CONFIG;
  const ratio = getRatioForMeal(config, mealTime);
  const isf = config.insulinSensitivityFactor;
  const target = config.targetGlucose;

  let carbBolus = carbsGrams / ratio;
  let correctionBolus = 0;
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
      `Ratio ${mealLabel[mealTime]} : ${unitsPer10g.toFixed(1).replace(".", ",")}U pour 10g → ${carbsGrams}g = ${carbBolus.toFixed(1)}U`
    );
  }

  // Correction si glycémie au-dessus de la cible
  if (currentGlucose > config.targetRange.max) {
    correctionBolus = (currentGlucose - target) / isf;
    const diff = currentGlucose - target;
    // Sensibilité au format naturel : X U pour 50 mg/dL au-dessus
    const unitsPer50mg = 50 / isf;
    reasoning.push(
      `Correction : ${diff} mg/dL au-dessus de la cible → ${correctionBolus.toFixed(1)}U (${unitsPer50mg.toFixed(1).replace(".", ",")}U pour 50 mg/dL)`
    );
  } else if (currentGlucose < config.targetRange.min) {
    reasoning.push(`Glycémie basse (${currentGlucose} mg/dL) — considérer des glucides supplémentaires avant l'injection`);
  }

  // Ajustements pré-entraînement
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
  const rawTotal = Math.max(0, carbBolus + correctionBolus);
  const totalBolus = Math.ceil(rawTotal);
  if (rawTotal > 0 && totalBolus !== Math.round(rawTotal * 10) / 10) {
    reasoning.push(
      `Arrondi au-dessus : ${rawTotal.toFixed(1).replace(".", ",")}U → ${totalBolus}U (stylo sans demi-unités)`
    );
  }

  return { carbBolus, correctionBolus, totalBolus, adjustments, reasoning };
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
