// ============================================
// Nutrition Calculator — BMR / TDEE / Macros
// ============================================

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
  dailyActivityLevel: "sedentary" | "light" | "moderate" | "active" | "very_active";
  jobType: "desk" | "standing" | "physical";

  // Step 3: Goal
  primaryGoal: "bulk" | "cut" | "maintain" | "recomp";
  targetWeight?: number;
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
}

const ACTIVITY_MULTIPLIERS: Record<string, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const CALORIE_ADJUSTMENTS: Record<string, Record<string, number>> = {
  bulk: { slow: 250, moderate: 400, aggressive: 550 },
  cut: { slow: -250, moderate: -400, aggressive: -550 },
  maintain: { slow: 0, moderate: 0, aggressive: 0 },
  recomp: { slow: -100, moderate: -150, aggressive: -200 },
};

const PROTEIN_PER_KG: Record<string, number> = {
  bulk: 2.0,
  cut: 2.4,
  maintain: 1.8,
  recomp: 2.2,
};

export function calculateNutrition(diagnostic: NutritionDiagnosticData): NutritionCalculation {
  // 1. BMR — Mifflin-St Jeor or Katch-McArdle
  let bmr: number;

  if (diagnostic.bodyFatPercentage) {
    const leanMass = diagnostic.weight * (1 - diagnostic.bodyFatPercentage / 100);
    bmr = 370 + 21.6 * leanMass;
  } else {
    if (diagnostic.sex === "male") {
      bmr = 10 * diagnostic.weight + 6.25 * diagnostic.height - 5 * diagnostic.age + 5;
    } else {
      bmr = 10 * diagnostic.weight + 6.25 * diagnostic.height - 5 * diagnostic.age - 161;
    }
  }

  // 2. NEAT
  const baseActivityFactor = ACTIVITY_MULTIPLIERS[diagnostic.dailyActivityLevel] || 1.375;
  const neat = bmr * (baseActivityFactor - 1);

  // 3. Exercise Calories
  const muscuCaloriesPerSession = 60 * 5.5; // ~330 kcal for 60min
  const weeklyMuscuCalories = diagnostic.muscuSessionsPerWeek * muscuCaloriesPerSession;

  const runningCaloriesPerMinute = diagnostic.weight * 0.9;
  const weeklyRunningCalories =
    diagnostic.runningSessionsPerWeek * diagnostic.averageRunningDuration * runningCaloriesPerMinute;

  const dailyExerciseCalories = (weeklyMuscuCalories + weeklyRunningCalories) / 7;

  // 4. TEF (~10%)
  const baseTdee = bmr + neat + dailyExerciseCalories;
  const tef = baseTdee * 0.1;

  // 5. TDEE
  const tdee = Math.round(bmr + neat + dailyExerciseCalories + tef);

  // 6. Target Calories
  const adjustment = CALORIE_ADJUSTMENTS[diagnostic.primaryGoal]?.[diagnostic.aggressiveness] || 0;
  const targetCalories = Math.round(tdee + adjustment);

  // 7. Macronutrients
  let protein = Math.round(diagnostic.weight * (PROTEIN_PER_KG[diagnostic.primaryGoal] || 2.0));

  // Extra protein for heavy runners
  if (diagnostic.runningSessionsPerWeek >= 3) {
    protein = Math.round(protein * 1.1);
  }

  // Fat: minimum 0.8g/kg, ideal ~1g/kg
  const fatPerKg = diagnostic.primaryGoal === "cut" ? 0.8 : 1.0;
  let fat = Math.round(diagnostic.weight * fatPerKg);

  // Low-carb adjustment
  const carbMultiplier =
    diagnostic.t1dConsiderations?.lowCarbPreference === "moderate"
      ? 0.8
      : diagnostic.t1dConsiderations?.lowCarbPreference === "low"
      ? 0.6
      : 1.0;

  const proteinCalories = protein * 4;
  const fatCalories = fat * 9;
  const carbCalories = (targetCalories - proteinCalories - fatCalories) * carbMultiplier;

  // Redistribute saved carb calories to fat if low-carb
  if (carbMultiplier < 1) {
    const savedCarbCalories = (targetCalories - proteinCalories - fatCalories) * (1 - carbMultiplier);
    fat += Math.round(savedCarbCalories / 9);
  }

  let carbs = Math.round(carbCalories / 4);
  carbs = Math.max(carbs, 100); // Minimum for brain function

  // Final ratios
  const totalCalories = protein * 4 + carbs * 4 + fat * 9;

  return {
    bmr: Math.round(bmr),
    neat: Math.round(neat),
    tef: Math.round(tef),
    exerciseCalories: Math.round(dailyExerciseCalories),
    tdee,
    targetCalories,
    macros: { protein, carbs, fat },
    macroRatios: {
      protein: Math.round((protein * 4 / totalCalories) * 100),
      carbs: Math.round((carbs * 4 / totalCalories) * 100),
      fat: Math.round((fat * 9 / totalCalories) * 100),
    },
  };
}
