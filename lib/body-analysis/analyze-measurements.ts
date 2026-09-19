import type { MuscleData, MuscleStatus } from "./muscle-config";

// Ideal ratios based on height (natural bodybuilding standards)
function getIdealRatios(height: number) {
  return {
    chest: { ideal: height * 0.55, tolerance: 0.05 },
    shoulders: { ideal: height * 0.65, tolerance: 0.05 },
    biceps: { ideal: height * 0.20, tolerance: 0.02 }, // arm flexed
    waist: { ideal: height * 0.42, tolerance: 0.03 },
    quads: { ideal: height * 0.32, tolerance: 0.03 },
    calves: { ideal: height * 0.20, tolerance: 0.02 },
  };
}

// Muscle ID mapping from measurement keys
const MEASUREMENT_TO_MUSCLE: Record<string, string> = {
  chest: "chest",
  shoulders: "shoulders",
  armFlexed: "biceps",
  thigh: "quads",
  calf: "calves",
};

function getStatus(deviation: number, tolerance: number): MuscleStatus {
  if (deviation > tolerance) return "strong";
  if (deviation > -tolerance) return "normal";
  if (deviation > -tolerance * 2) return "improve";
  return "weak";
}

export function analyzeFromMeasurements(
  mensurations: Record<string, string>,
  height: number,
  _weight: number
): Partial<MuscleData>[] {
  const ideals = getIdealRatios(height);
  const results: Partial<MuscleData>[] = [];

  // Chest
  const chest = parseFloat(mensurations.chest);
  if (chest > 0 && ideals.chest) {
    const deviation = (chest - ideals.chest.ideal) / ideals.chest.ideal;
    results.push({
      id: "chest",
      status: getStatus(deviation, ideals.chest.tolerance),
      measurement: chest,
      measurementUnit: "cm",
      analysisSource: "measurement",
      reasoning: `Tour de poitrine ${chest}cm vs idéal ${ideals.chest.ideal.toFixed(0)}cm (${(deviation * 100).toFixed(1)}%)`,
    });
  }

  // Shoulders
  const shoulders = parseFloat(mensurations.shoulders);
  if (shoulders > 0 && ideals.shoulders) {
    const deviation = (shoulders - ideals.shoulders.ideal) / ideals.shoulders.ideal;
    results.push({
      id: "shoulders",
      status: getStatus(deviation, ideals.shoulders.tolerance),
      measurement: shoulders,
      measurementUnit: "cm",
      analysisSource: "measurement",
      reasoning: `Tour d'épaules ${shoulders}cm vs idéal ${ideals.shoulders.ideal.toFixed(0)}cm (${(deviation * 100).toFixed(1)}%)`,
    });
  }

  // Arms (biceps from armFlexed)
  const armFlexed = parseFloat(mensurations.armFlexed);
  if (armFlexed > 0 && ideals.biceps) {
    const deviation = (armFlexed - ideals.biceps.ideal) / ideals.biceps.ideal;
    results.push({
      id: "biceps",
      status: getStatus(deviation, ideals.biceps.tolerance),
      measurement: armFlexed,
      measurementUnit: "cm",
      analysisSource: "measurement",
      reasoning: `Tour de bras contracté ${armFlexed}cm vs idéal ${ideals.biceps.ideal.toFixed(0)}cm (${(deviation * 100).toFixed(1)}%)`,
    });
    // Triceps follows biceps (same arm measurement)
    results.push({
      id: "triceps",
      status: getStatus(deviation, ideals.biceps.tolerance),
      measurement: armFlexed,
      measurementUnit: "cm",
      analysisSource: "measurement",
      reasoning: `Déduit du tour de bras contracté ${armFlexed}cm`,
    });
  }

  // Quads
  const thigh = parseFloat(mensurations.thigh);
  if (thigh > 0 && ideals.quads) {
    const deviation = (thigh - ideals.quads.ideal) / ideals.quads.ideal;
    results.push({
      id: "quads",
      status: getStatus(deviation, ideals.quads.tolerance),
      measurement: thigh,
      measurementUnit: "cm",
      analysisSource: "measurement",
      reasoning: `Tour de cuisse ${thigh}cm vs idéal ${ideals.quads.ideal.toFixed(0)}cm (${(deviation * 100).toFixed(1)}%)`,
    });
    // Hamstrings follow quads
    results.push({
      id: "hamstrings",
      status: getStatus(deviation - 0.02, ideals.quads.tolerance), // Slight penalty — hamstrings usually less visible
      analysisSource: "measurement",
      reasoning: `Estimé depuis le tour de cuisse ${thigh}cm`,
    });
  }

  // Calves
  const calf = parseFloat(mensurations.calf);
  if (calf > 0 && ideals.calves) {
    const deviation = (calf - ideals.calves.ideal) / ideals.calves.ideal;
    results.push({
      id: "calves",
      status: getStatus(deviation, ideals.calves.tolerance),
      measurement: calf,
      measurementUnit: "cm",
      analysisSource: "measurement",
      reasoning: `Tour de mollet ${calf}cm vs idéal ${ideals.calves.ideal.toFixed(0)}cm (${(deviation * 100).toFixed(1)}%)`,
    });
  }

  // Waist → abs (inverse: smaller waist = better abs)
  const waist = parseFloat(mensurations.waist);
  if (waist > 0 && ideals.waist) {
    const deviation = (ideals.waist.ideal - waist) / ideals.waist.ideal; // Inverse
    results.push({
      id: "abs",
      status: getStatus(deviation, ideals.waist.tolerance),
      measurement: waist,
      measurementUnit: "cm",
      analysisSource: "measurement",
      reasoning: `Tour de taille ${waist}cm vs idéal ${ideals.waist.ideal.toFixed(0)}cm — plus petit = mieux`,
    });
  }

  return results;
}
