/**
 * NUTRITION CALCULATOR — Pure deterministic functions
 *
 * TOUTES ces fonctions sont DÉTERMINISTES :
 * Même input = TOUJOURS même output
 * PAS d'appel API, PAS de random, PAS d'estimation
 */

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface NutritionInput {
  // Données physiques
  height: number; // cm
  weight: number; // kg
  age: number; // années
  sex: "male" | "female";
  bodyFatPercent?: number; // optionnel, 0-100

  // Activité
  muscuSessionsPerWeek: number; // 0-7
  muscuDurationMinutes: number; // durée moyenne d'une séance
  runningSessionsPerWeek: number; // 0-7
  runningDurationMinutes: number; // durée moyenne
  dailyActivityLevel:
    | "sedentary"
    | "lightly_active"
    | "moderately_active"
    | "very_active"
    | "extremely_active";

  // Objectif
  goal: "bulk" | "cut" | "maintain" | "recomp";
  aggressiveness: "slow" | "moderate" | "aggressive";
}

export interface NutritionOutput {
  // Calculs intermédiaires
  bmr: number;
  neat: number;
  exerciseCalories: number;
  tef: number;
  tdee: number;

  // Objectifs finaux
  targetCalories: number;
  protein: number;
  carbs: number;
  fat: number;

  // Ratios
  proteinPerKg: number;
  carbsPerKg: number;
  fatPerKg: number;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
}

// ═══════════════════════════════════════════════════════════
// CONSTANTES (ne changent JAMAIS)
// ═══════════════════════════════════════════════════════════

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2, // Bureau, pas d'exercice
  lightly_active: 1.375, // Exercice léger 1-3j/sem
  moderately_active: 1.55, // Exercice modéré 3-5j/sem
  very_active: 1.725, // Exercice intense 6-7j/sem
  extremely_active: 1.9, // Athlète, travail physique
} as const;

const CALORIE_ADJUSTMENTS = {
  bulk: { slow: 250, moderate: 400, aggressive: 550 },
  cut: { slow: -300, moderate: -500, aggressive: -700 },
  maintain: { slow: 0, moderate: 0, aggressive: 0 },
  recomp: { slow: -100, moderate: -150, aggressive: -200 },
} as const;

const PROTEIN_PER_KG = {
  bulk: 2.0,
  cut: 2.4, // Plus haut en sèche pour préserver le muscle
  maintain: 1.8,
  recomp: 2.2,
} as const;

const FAT_PER_KG = {
  bulk: 1.0,
  cut: 0.8, // Un peu moins en sèche
  maintain: 1.0,
  recomp: 0.9,
} as const;

// Calories brûlées par minute d'exercice
const MUSCU_CALORIES_PER_MINUTE = 5.5; // Moyenne pour muscu intense
const RUNNING_CALORIES_PER_KG_PER_MINUTE = 0.9; // Environ 1 MET par minute

// ═══════════════════════════════════════════════════════════
// FONCTION PRINCIPALE
// ═══════════════════════════════════════════════════════════

export function calculateNutrition(input: NutritionInput): NutritionOutput {
  // 1. BMR
  const bmr = calculateBMR(input);

  // 2. NEAT
  const baseMultiplier = ACTIVITY_MULTIPLIERS[input.dailyActivityLevel];
  const neat = Math.round(bmr * (baseMultiplier - 1));

  // 3. Calories d'exercice
  const exerciseCalories = calculateExerciseCalories(input);

  // 4. TEF (~10%)
  const subtotal = bmr + neat + exerciseCalories;
  const tef = Math.round(subtotal * 0.1);

  // 5. TDEE
  const tdee = bmr + neat + exerciseCalories + tef;

  // 6. Calories cibles
  const adjustment = CALORIE_ADJUSTMENTS[input.goal][input.aggressiveness];
  const targetCalories = tdee + adjustment;

  // 7. Macronutriments
  const macros = calculateMacros(input, targetCalories);

  return {
    bmr,
    neat,
    exerciseCalories,
    tef,
    tdee,
    targetCalories,
    ...macros,
  };
}

// ═══════════════════════════════════════════════════════════
// BMR — MÉTABOLISME DE BASE
// ═══════════════════════════════════════════════════════════

export function calculateBMR(input: {
  weight: number;
  height: number;
  age: number;
  sex: "male" | "female";
  bodyFatPercent?: number;
}): number {
  // Si on a le % de masse grasse → Katch-McArdle (plus précis)
  if (input.bodyFatPercent !== undefined && input.bodyFatPercent > 0) {
    const leanMass = input.weight * (1 - input.bodyFatPercent / 100);
    return Math.round(370 + 21.6 * leanMass);
  }

  // Sinon → Mifflin-St Jeor
  if (input.sex === "male") {
    return Math.round(10 * input.weight + 6.25 * input.height - 5 * input.age + 5);
  } else {
    return Math.round(10 * input.weight + 6.25 * input.height - 5 * input.age - 161);
  }
}

// ═══════════════════════════════════════════════════════════
// CALORIES D'EXERCICE
// ═══════════════════════════════════════════════════════════

export function calculateExerciseCalories(input: {
  muscuSessionsPerWeek: number;
  muscuDurationMinutes: number;
  runningSessionsPerWeek: number;
  runningDurationMinutes: number;
  weight: number;
}): number {
  const weeklyMuscuCalories =
    input.muscuSessionsPerWeek * input.muscuDurationMinutes * MUSCU_CALORIES_PER_MINUTE;

  const weeklyRunningCalories =
    input.runningSessionsPerWeek *
    input.runningDurationMinutes *
    input.weight *
    RUNNING_CALORIES_PER_KG_PER_MINUTE;

  const dailyExerciseCalories = (weeklyMuscuCalories + weeklyRunningCalories) / 7;

  return Math.round(dailyExerciseCalories);
}

// ═══════════════════════════════════════════════════════════
// MACRONUTRIMENTS
// ═══════════════════════════════════════════════════════════

interface MacroOutput {
  protein: number;
  carbs: number;
  fat: number;
  proteinPerKg: number;
  carbsPerKg: number;
  fatPerKg: number;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
}

export function calculateMacros(
  input: { weight: number; goal: "bulk" | "cut" | "maintain" | "recomp" },
  targetCalories: number
): MacroOutput {
  // Protéines
  const proteinPerKg = PROTEIN_PER_KG[input.goal];
  const protein = Math.round(input.weight * proteinPerKg);

  // Lipides
  const fatPerKg = FAT_PER_KG[input.goal];
  const fat = Math.round(input.weight * fatPerKg);

  // Glucides = le reste
  const proteinCalories = protein * 4;
  const fatCalories = fat * 9;
  const carbCalories = targetCalories - proteinCalories - fatCalories;
  const rawCarbs = Math.round(carbCalories / 4);

  // Minimum 100g de glucides pour le cerveau
  const carbs = Math.max(rawCarbs, 100);

  // Pourcentages
  const totalCalories = protein * 4 + carbs * 4 + fat * 9;
  const proteinPercent = Math.round((protein * 4 / totalCalories) * 100);
  const carbsPercent = Math.round((carbs * 4 / totalCalories) * 100);
  const fatPercent = Math.round((fat * 9 / totalCalories) * 100);

  return {
    protein,
    carbs,
    fat,
    proteinPerKg: Math.round(proteinPerKg * 10) / 10,
    carbsPerKg: Math.round((carbs / input.weight) * 10) / 10,
    fatPerKg: Math.round(fatPerKg * 10) / 10,
    proteinPercent,
    carbsPercent,
    fatPercent,
  };
}
