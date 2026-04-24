// ============================================
// Nutrition Calculator — BMR / TDEE / Macros
// ============================================
//
// REFONTE SCIENTIFIQUE (Phase 8, avril 2026)
//
// Corrections apportées vs version 2024 :
//
//  1. **Fin du double-comptage NEAT vs exercice**
//     L'ancienne version appliquait les multiplicateurs standards
//     (sedentary 1.2 → very_active 1.9) qui incluent DÉJÀ l'exercice
//     3-5×/sem, puis ajoutait les calories d'exercice par-dessus.
//     Classique erreur Harris-Benedict qui gonflait la TDEE de ~30-50%.
//     Nouvelle approche : `dailyActivityLevel` = NEAT uniquement
//     (job + marche quotidienne, sans sport). Multiplicateurs réduits
//     en conséquence (1.2 à 1.55). L'exercice est ajouté explicitement.
//
//  2. **Formule running basée sur le MET (standard ACSM)**
//     Ancienne : `weight × 0.9 kcal/min` → 77 kcal/min pour 86kg (≈
//     5× trop haut ; correspondrait à un sprint à 16 km/h soutenu).
//     Nouvelle : `kcal/min = (MET × 3.5 × weightKg) / 200`.
//     MET par défaut : 8.3 (jogging ~9-10 km/h, conservatif pour
//     entraînement Z2 type semi-marathon). Réaliste : ~12 kcal/min à
//     86kg, soit ~720 kcal pour 1h, ce qui est cohérent avec la règle
//     de ~1 kcal/kg/km.
//
//  3. **Formule muscu MET-based** (vs constante 5.5 kcal/min)
//     5.5 kcal/min correspond à un 70kg moyen. Pour 86kg, on sous-
//     estime. Nouvelle : MET 5.5 (musculation vigoureuse). À 86kg →
//     ~8.3 kcal/min (~500 kcal/h), cohérent avec les études.
//
//  4. **Calcul inversé depuis l'objectif** (`targetTimelineWeeks`)
//     Au lieu du champ flou "agressivité slow/moderate/aggressive",
//     l'utilisateur peut fournir un poids cible + une durée en
//     semaines. On calcule alors :
//         kcalDelta = (targetWeight - currentWeight) × 7700 / weeks / 7
//     (7700 kcal ≈ 1 kg de masse corporelle nette, standard accepté).
//     Clampé entre ±800 kcal/j pour éviter l'extrême.
//     Si `targetTimelineWeeks` n'est pas fourni, on retombe sur la
//     logique "agressivité" historique (pour rétrocompat du form).
//
//  5. **Sanity checks** (`warnings: string[]` dans l'output)
//     Warnings explicites si le résultat sort des plages saines
//     (target < BMR × 1.1 → risque métabolique, target > BMR × 2.8 →
//     surplus excessif, kcalDelta hors [-800, +800] → rythme
//     non-soutenable, etc.). Le UI affiche ces warnings en bannière.
//

export interface NutritionDiagnosticData {
  // Step 1: Physical data
  height: number;
  weight: number;
  age: number;
  sex: "male" | "female";
  bodyFatPercentage?: number;

  // Step 2: Activity level
  muscuSessionsPerWeek: number;
  runningSessionsPerWeek: number;
  averageRunningDuration: number; // minutes
  averageMuscuDuration?: number; // minutes (optionnel, défaut 60)
  dailyActivityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  jobType: "desk" | "standing" | "physical";

  // Step 3: Goal
  primaryGoal: "bulk" | "cut" | "maintain" | "recomp";
  targetWeight?: number;
  targetTimelineWeeks?: number; // NEW — optionnel. Si fourni avec targetWeight, override aggressiveness
  aggressiveness: "slow" | "moderate" | "aggressive";

  // Step 4: Preferences & T1D
  mealsPerDay: number;
  dietaryRestrictions: string[];
  carbTiming: "spread" | "around_workout" | "backloaded";
  t1dConsiderations: {
    countCarbs: boolean;
    lowCarbPreference: "no" | "moderate" | "low";
    insulinSensitivity: "high" | "normal" | "low";
  };
}

export interface NutritionCalculation {
  bmr: number;
  neat: number;
  tef: number;
  exerciseCalories: number;
  tdee: number;
  targetCalories: number;
  calorieDelta: number; // surplus ou déficit par rapport à TDEE
  weeklyWeightChangeKg: number; // variation hebdo prévue (+/- kg/sem)
  surplusSource: "timeline" | "aggressiveness" | "maintain"; // d'où vient kcalDelta
  macros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  macroRatios: {
    protein: number;
    carbs: number;
    fat: number;
  };
  warnings: string[]; // sanity check humainement lisible (FR)
}

// ────────────────────────────────────────────────
// Constantes scientifiques
// ────────────────────────────────────────────────

/**
 * Multiplicateurs NEAT uniquement (sans exercice structuré).
 * Décomposition du TDEE standard : BMR + NEAT + exercice + TEF.
 * Plus faibles que les multiplicateurs Harris-Benedict classiques
 * qui eux INCLUENT l'exercice.
 */
const NEAT_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2, // Bureau, pas de marche (~1500 pas/j)
  light: 1.3, // Bureau + marche quotidienne (~5k pas/j)
  moderate: 1.4, // Debout souvent, déplacements fréquents (~8k pas/j)
  active: 1.5, // Travail physique léger (~12k pas/j)
  very_active: 1.55, // Travail physique intense (~15k+ pas/j)
};

/**
 * Bonus NEAT selon le type de travail.
 * Petit ajustement additif pour capter la variance job vs marche.
 */
const JOB_NEAT_BONUS: Record<string, number> = {
  desk: 0, // déjà capté par dailyActivityLevel
  standing: 0.05,
  physical: 0.1,
};

/**
 * Ajustements calorique par agressivité (mode "aggressiveness" historique).
 * Utilisé uniquement si `targetTimelineWeeks` n'est pas fourni.
 */
const CALORIE_ADJUSTMENTS: Record<string, Record<string, number>> = {
  bulk: { slow: 250, moderate: 400, aggressive: 550 },
  cut: { slow: -300, moderate: -450, aggressive: -600 },
  maintain: { slow: 0, moderate: 0, aggressive: 0 },
  recomp: { slow: -100, moderate: -150, aggressive: -200 },
};

/**
 * Protéines cibles par kg de poids corporel, selon objectif.
 * Ref : Helms et al. 2014, ISSN 2018 position stand.
 */
const PROTEIN_PER_KG: Record<string, number> = {
  bulk: 2.0,
  cut: 2.4, // plus haut en déficit pour préserver le muscle
  maintain: 1.8,
  recomp: 2.2,
};

/**
 * MET par défaut pour le calcul des dépenses caloriques.
 * Source : Ainsworth et al. Compendium of Physical Activities (2011).
 *
 * - Muscu vigoureuse (machines, haltères, circuit) : 5.5 MET
 * - Jogging modéré 8-10 km/h (zone Z2 semi-marathon prep) : 8.3 MET
 *
 * Formule standard ACSM :
 *   kcal/minute = (MET × 3.5 × weightKg) / 200
 */
const METS = {
  muscuVigorous: 5.5,
  runningModerate: 8.3,
} as const;

/**
 * Équivalence énergie ↔ masse corporelle.
 * ~7700 kcal = 1 kg de tissu composite (muscle + graisse + eau).
 * Standard accepté en nutrition clinique.
 */
const KCAL_PER_KG_BODYWEIGHT = 7700;

/**
 * Plafond raisonnable pour le delta calorique quotidien.
 * Au-delà, le rythme de prise/perte devient non-soutenable ou
 * très défavorable (perte musculaire, adaptation métabolique).
 */
const MAX_DAILY_DELTA = 800;

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

/** kcal brûlées par minute d'activité à un MET donné. */
function kcalPerMinuteFromMET(met: number, weightKg: number): number {
  return (met * 3.5 * weightKg) / 200;
}

/**
 * Calcule le delta kcal/j nécessaire pour atteindre `targetWeight`
 * en `weeks` semaines, à partir de `currentWeight`.
 * Retourne `null` si les inputs sont invalides ou le rythme déraisonnable.
 */
function computeTimelineDelta(
  currentWeight: number,
  targetWeight: number | undefined,
  weeks: number | undefined,
): number | null {
  if (!targetWeight || !weeks || weeks <= 0) return null;
  const kgDelta = targetWeight - currentWeight;
  if (Math.abs(kgDelta) < 0.1) return 0; // déjà sur place
  const totalKcal = kgDelta * KCAL_PER_KG_BODYWEIGHT;
  const dailyDelta = totalKcal / weeks / 7;
  return Math.round(dailyDelta);
}

// ────────────────────────────────────────────────
// Fonction principale
// ────────────────────────────────────────────────

export function calculateNutrition(diagnostic: NutritionDiagnosticData): NutritionCalculation {
  const warnings: string[] = [];

  // 1. BMR — Mifflin-St Jeor (default) ou Katch-McArdle si bodyFat connu
  let bmr: number;
  if (diagnostic.bodyFatPercentage && diagnostic.bodyFatPercentage > 0) {
    const leanMass = diagnostic.weight * (1 - diagnostic.bodyFatPercentage / 100);
    bmr = 370 + 21.6 * leanMass;
  } else {
    if (diagnostic.sex === "male") {
      bmr = 10 * diagnostic.weight + 6.25 * diagnostic.height - 5 * diagnostic.age + 5;
    } else {
      bmr = 10 * diagnostic.weight + 6.25 * diagnostic.height - 5 * diagnostic.age - 161;
    }
  }

  // 2. NEAT (non-exercise activity) — basé UNIQUEMENT sur activité quotidienne,
  //    SANS inclure les séances structurées (corrige le double-comptage historique)
  const baseNeatMultiplier = NEAT_MULTIPLIERS[diagnostic.dailyActivityLevel] ?? 1.3;
  const jobBonus = JOB_NEAT_BONUS[diagnostic.jobType] ?? 0;
  const neatMultiplier = baseNeatMultiplier + jobBonus;
  const neat = bmr * (neatMultiplier - 1);

  // 3. Calories d'exercice structuré — formule MET-based
  const muscuDuration = diagnostic.averageMuscuDuration ?? 60;
  const muscuKcalPerMin = kcalPerMinuteFromMET(METS.muscuVigorous, diagnostic.weight);
  const weeklyMuscuCalories =
    diagnostic.muscuSessionsPerWeek * muscuDuration * muscuKcalPerMin;

  const runningKcalPerMin = kcalPerMinuteFromMET(METS.runningModerate, diagnostic.weight);
  const weeklyRunningCalories =
    diagnostic.runningSessionsPerWeek *
    diagnostic.averageRunningDuration *
    runningKcalPerMin;

  const dailyExerciseCalories = (weeklyMuscuCalories + weeklyRunningCalories) / 7;

  // 4. TEF (~10% du TDEE brut, approximation standard)
  const baseTdee = bmr + neat + dailyExerciseCalories;
  const tef = baseTdee * 0.1;

  // 5. TDEE final
  const tdee = Math.round(bmr + neat + dailyExerciseCalories + tef);

  // 6. Delta calorique — timeline prioritaire sur aggressiveness
  const timelineDelta = computeTimelineDelta(
    diagnostic.weight,
    diagnostic.targetWeight,
    diagnostic.targetTimelineWeeks,
  );

  let calorieDelta: number;
  let surplusSource: "timeline" | "aggressiveness" | "maintain";

  if (diagnostic.primaryGoal === "maintain") {
    calorieDelta = 0;
    surplusSource = "maintain";
  } else if (timelineDelta !== null) {
    // Mode "objectif chiffré" — calcul inversé depuis targetWeight + weeks
    calorieDelta = timelineDelta;
    surplusSource = "timeline";

    // Vérifie cohérence goal vs signe du delta
    if (diagnostic.primaryGoal === "bulk" && calorieDelta < 0) {
      warnings.push(
        "Ton objectif indique une prise de masse mais le poids cible est inférieur au poids actuel. Vérifie la saisie.",
      );
    }
    if (diagnostic.primaryGoal === "cut" && calorieDelta > 0) {
      warnings.push(
        "Ton objectif indique une sèche mais le poids cible est supérieur au poids actuel. Vérifie la saisie.",
      );
    }

    // Clamp si déraisonnable
    if (Math.abs(calorieDelta) > MAX_DAILY_DELTA) {
      const original = calorieDelta;
      calorieDelta = Math.sign(calorieDelta) * MAX_DAILY_DELTA;
      warnings.push(
        `Rythme demandé trop rapide (${original > 0 ? "+" : ""}${original} kcal/j). Plafonné à ${
          calorieDelta > 0 ? "+" : ""
        }${calorieDelta} kcal/j pour rester durable. Étale ton objectif sur plus de semaines.`,
      );
    }
  } else {
    // Mode "agressivité" historique
    calorieDelta = CALORIE_ADJUSTMENTS[diagnostic.primaryGoal]?.[diagnostic.aggressiveness] ?? 0;
    surplusSource = "aggressiveness";
  }

  const targetCalories = Math.round(tdee + calorieDelta);

  // Variation hebdomadaire prévue
  const weeklyWeightChangeKg =
    Math.round(((calorieDelta * 7) / KCAL_PER_KG_BODYWEIGHT) * 100) / 100; // 2 décimales

  // 7. Sanity checks finaux
  const tdeeToBmrRatio = tdee / bmr;
  if (tdeeToBmrRatio > 2.6) {
    warnings.push(
      `TDEE très élevé (${Math.round(tdeeToBmrRatio * 10) / 10}× ton BMR). Vérifie que tu n'as pas surévalué la fréquence ou la durée de tes séances.`,
    );
  }
  if (targetCalories < bmr * 1.1) {
    warnings.push(
      `Cibles à ${targetCalories} kcal, très proche de ton métabolisme de base (${Math.round(bmr)} kcal). Déficit trop agressif — risque de perte musculaire et ralentissement métabolique.`,
    );
  }
  if (targetCalories > bmr * 2.8) {
    warnings.push(
      `Cibles à ${targetCalories} kcal, très supérieur à ton métabolisme de base. Surplus excessif — la prise de gras va dominer la prise musculaire.`,
    );
  }
  if (targetCalories < 1500 && diagnostic.sex === "male") {
    warnings.push(
      "Apport inférieur à 1500 kcal/j pour un homme — non recommandé sur la durée sans suivi médical.",
    );
  }
  if (targetCalories < 1200 && diagnostic.sex === "female") {
    warnings.push(
      "Apport inférieur à 1200 kcal/j pour une femme — non recommandé sur la durée sans suivi médical.",
    );
  }

  // 8. Macronutriments
  let protein = Math.round(diagnostic.weight * (PROTEIN_PER_KG[diagnostic.primaryGoal] ?? 2.0));
  if (diagnostic.runningSessionsPerWeek >= 3) {
    protein = Math.round(protein * 1.1); // bonus runners
  }

  const fatPerKg = diagnostic.primaryGoal === "cut" ? 0.8 : 1.0;
  let fat = Math.round(diagnostic.weight * fatPerKg);

  // Ajustement low-carb
  const carbMultiplier =
    diagnostic.t1dConsiderations?.lowCarbPreference === "moderate"
      ? 0.8
      : diagnostic.t1dConsiderations?.lowCarbPreference === "low"
      ? 0.6
      : 1.0;

  const proteinCalories = protein * 4;
  const fatCalories = fat * 9;
  const remainingForCarbs = targetCalories - proteinCalories - fatCalories;
  const carbCalories = remainingForCarbs * carbMultiplier;

  if (carbMultiplier < 1) {
    const saved = remainingForCarbs * (1 - carbMultiplier);
    fat += Math.round(saved / 9);
  }

  let carbs = Math.round(carbCalories / 4);
  carbs = Math.max(carbs, 100); // minimum cérébral

  const totalCalories = protein * 4 + carbs * 4 + fat * 9;

  return {
    bmr: Math.round(bmr),
    neat: Math.round(neat),
    tef: Math.round(tef),
    exerciseCalories: Math.round(dailyExerciseCalories),
    tdee,
    targetCalories,
    calorieDelta,
    weeklyWeightChangeKg,
    surplusSource,
    macros: { protein, carbs, fat },
    macroRatios: {
      protein: Math.round(((protein * 4) / totalCalories) * 100),
      carbs: Math.round(((carbs * 4) / totalCalories) * 100),
      fat: Math.round(((fat * 9) / totalCalories) * 100),
    },
    warnings,
  };
}
