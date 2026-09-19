import type { MuscleData, MuscleStatus } from "./muscle-config";

// Strength standards as ratios of bodyweight
const STRENGTH_STANDARDS: Record<string, { beginner: number; intermediate: number; advanced: number }> = {
  bench: { beginner: 0.5, intermediate: 1.0, advanced: 1.5 },
  squat: { beginner: 0.75, intermediate: 1.25, advanced: 2.0 },
  deadlift: { beginner: 1.0, intermediate: 1.5, advanced: 2.5 },
  ohp: { beginner: 0.35, intermediate: 0.65, advanced: 1.0 },
};

function getStatusFromRatio(ratio: number, standards: { beginner: number; intermediate: number; advanced: number }): MuscleStatus {
  if (ratio >= standards.advanced) return "strong";
  if (ratio >= standards.intermediate) return "normal";
  if (ratio >= standards.beginner) return "improve";
  return "weak";
}

export function analyzeFromStrength(
  historique: Record<string, string>,
  bodyweight: number
): Partial<MuscleData>[] {
  if (!bodyweight || bodyweight <= 0) return [];

  const results: Partial<MuscleData>[] = [];

  // Bench press → chest, triceps, shoulders (front)
  const bench = parseFloat(historique.benchPress1RM);
  if (bench > 0) {
    const ratio = bench / bodyweight;
    const status = getStatusFromRatio(ratio, STRENGTH_STANDARDS.bench);
    const reasoning = `DC 1RM ${bench}kg = ${ratio.toFixed(2)}x poids de corps`;
    results.push({ id: "chest", status, analysisSource: "strength", reasoning });
    results.push({ id: "triceps", status, analysisSource: "strength", reasoning });
  }

  // Squat → quads, glutes
  const squat = parseFloat(historique.squat1RM);
  if (squat > 0) {
    const ratio = squat / bodyweight;
    const status = getStatusFromRatio(ratio, STRENGTH_STANDARDS.squat);
    const reasoning = `Squat 1RM ${squat}kg = ${ratio.toFixed(2)}x poids de corps`;
    results.push({ id: "quads", status, analysisSource: "strength", reasoning });
    results.push({ id: "glutes", status, analysisSource: "strength", reasoning });
  }

  // Deadlift → hamstrings, lower_back, lats, traps
  const deadlift = parseFloat(historique.deadlift1RM);
  if (deadlift > 0) {
    const ratio = deadlift / bodyweight;
    const status = getStatusFromRatio(ratio, STRENGTH_STANDARDS.deadlift);
    const reasoning = `DL 1RM ${deadlift}kg = ${ratio.toFixed(2)}x poids de corps`;
    results.push({ id: "hamstrings", status, analysisSource: "strength", reasoning });
    results.push({ id: "lower_back", status, analysisSource: "strength", reasoning });
    results.push({ id: "lats", status, analysisSource: "strength", reasoning });
    results.push({ id: "traps", status, analysisSource: "strength", reasoning });
  }

  // OHP → shoulders
  const ohp = parseFloat(historique.ohp1RM);
  if (ohp > 0) {
    const ratio = ohp / bodyweight;
    const status = getStatusFromRatio(ratio, STRENGTH_STANDARDS.ohp);
    const reasoning = `OHP 1RM ${ohp}kg = ${ratio.toFixed(2)}x poids de corps`;
    results.push({ id: "shoulders", status, analysisSource: "strength", reasoning });
    results.push({ id: "rear_delts", status, analysisSource: "strength", reasoning: `Estimé depuis OHP (${ratio.toFixed(2)}x BW)` });
  }

  // Pull-ups → lats, biceps
  const pullups = parseFloat(historique.pullups);
  if (pullups > 0) {
    let status: MuscleStatus;
    if (pullups >= 20) status = "strong";
    else if (pullups >= 10) status = "normal";
    else if (pullups >= 5) status = "improve";
    else status = "weak";
    const reasoning = `${pullups} tractions max`;
    results.push({ id: "lats", status, analysisSource: "strength", reasoning });
    results.push({ id: "biceps", status, analysisSource: "strength", reasoning });
  }

  return results;
}
