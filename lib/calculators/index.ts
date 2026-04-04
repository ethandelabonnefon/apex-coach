/**
 * Centralized export for all deterministic calculators.
 *
 * RULE: If the result must be IDENTICAL every time → use these functions.
 *       If the result can/should vary (creative) → use Claude API.
 */

export {
  calculateNutrition,
  calculateBMR,
  calculateExerciseCalories,
  calculateMacros,
  type NutritionInput,
  type NutritionOutput,
} from "./nutrition";

export {
  calculateRunning,
  calculateVMA,
  calculateZones,
  predictRaceTime,
  estimateMaxHR,
  formatPace,
  formatTime,
  getPhase,
  getGlucoseAdvice,
  type RunningInput,
  type RunningOutput,
  type RacePrediction,
} from "./running";
