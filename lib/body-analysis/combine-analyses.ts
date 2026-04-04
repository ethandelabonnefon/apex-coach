import type { MuscleData, MuscleStatus } from "./muscle-config";
import { MUSCLE_NAMES } from "./muscle-config";

const STATUS_SCORES: Record<MuscleStatus, number> = {
  strong: 4,
  normal: 3,
  improve: 2,
  weak: 1,
  unknown: 0,
};

const SCORE_TO_STATUS = (score: number): MuscleStatus => {
  if (score >= 3.5) return "strong";
  if (score >= 2.5) return "normal";
  if (score >= 1.5) return "improve";
  if (score > 0) return "weak";
  return "unknown";
};

// Source weights
const SOURCE_WEIGHTS: Record<string, number> = {
  measurement: 0.3,
  photo: 0.5,
  strength: 0.2,
  user_input: 0.4,
};

// Recommended volume per status
const VOLUME_RECOMMENDATIONS: Record<MuscleStatus, { small: number; large: number }> = {
  strong: { small: 8, large: 10 },
  normal: { small: 12, large: 14 },
  improve: { small: 16, large: 18 },
  weak: { small: 18, large: 22 },
  unknown: { small: 10, large: 12 },
};

// Whether a muscle is "large" (for volume recommendations)
const LARGE_MUSCLES = ["chest", "lats", "quads", "hamstrings", "glutes"];

// Priority exercises per muscle
const PRIORITY_EXERCISES: Record<string, Record<MuscleStatus, string[]>> = {
  chest: {
    weak: ["Développé incliné haltères", "Écarté câble poulie haute", "Dips larges"],
    improve: ["Développé couché", "Écarté incliné", "Cable crossover"],
    normal: ["Développé couché", "Écarté haltères"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  shoulders: {
    weak: ["Élévations latérales 4-6x/sem", "OHP strict", "Face pulls"],
    improve: ["Élévations latérales", "Arnold press", "Oiseau"],
    normal: ["Développé militaire", "Élévations latérales"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  lats: {
    weak: ["Tractions prise large", "Pulldown", "Pullover câble"],
    improve: ["Tractions", "Rowing unilatéral", "Pulldown"],
    normal: ["Tractions", "Rowing"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  biceps: {
    weak: ["Curl incliné", "Spider curl", "Curl marteau"],
    improve: ["Curl barre EZ", "Curl incliné", "Curl concentré"],
    normal: ["Curl barre", "Curl marteau"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  triceps: {
    weak: ["Barre au front", "Extension poulie corde", "Dips serrés"],
    improve: ["Développé serré", "Extension overhead", "Pushdown"],
    normal: ["Pushdown", "Extension"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  quads: {
    weak: ["Front squat", "Hack squat", "Leg extension"],
    improve: ["Squat", "Leg press", "Fentes"],
    normal: ["Squat", "Leg press"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  hamstrings: {
    weak: ["RDL", "Leg curl nordique", "Glute-ham raise"],
    improve: ["RDL", "Leg curl allongé", "Good morning"],
    normal: ["RDL", "Leg curl"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  calves: {
    weak: ["Mollets debout 4-5x/sem (3s excentrique)", "Mollets assis"],
    improve: ["Mollets debout 3x/sem", "Mollets assis"],
    normal: ["Mollets debout", "Mollets assis"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  abs: {
    weak: ["Ab rollout", "Hanging leg raises", "Pallof press 3-4x/sem"],
    improve: ["Crunch câble", "Leg raises", "Planche"],
    normal: ["Ab rollout", "Crunch"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  traps: {
    weak: ["Shrugs lourds", "Face pulls", "Farmer walks"],
    improve: ["Shrugs", "Rowing menton"],
    normal: ["Shrugs"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  glutes: {
    weak: ["Hip thrust", "Bulgarian split squat", "Fentes marchées"],
    improve: ["Hip thrust", "Squat profond", "Fentes"],
    normal: ["Squat", "Hip thrust"],
    strong: ["Maintien volume actuel"],
    unknown: [],
  },
  lower_back: {
    weak: ["Good morning", "Hyperextensions", "Bird dog"],
    improve: ["Deadlift", "Hyperextensions"],
    normal: ["Deadlift"],
    strong: ["Maintien"],
    unknown: [],
  },
  rear_delts: {
    weak: ["Oiseau haltères", "Face pulls", "Reverse pec deck"],
    improve: ["Face pulls", "Oiseau"],
    normal: ["Face pulls"],
    strong: ["Maintien"],
    unknown: [],
  },
  forearms: {
    weak: ["Curl poignet", "Reverse curl", "Dead hangs"],
    improve: ["Farmer walks", "Curl poignet"],
    normal: ["Farmer walks"],
    strong: ["Maintien"],
    unknown: [],
  },
  obliques: {
    weak: ["Pallof press", "Rotation câble", "Crunch oblique"],
    improve: ["Pallof press", "Rotation"],
    normal: ["Pallof press"],
    strong: ["Maintien"],
    unknown: [],
  },
};

export function combineAnalyses(
  ...analysesList: Partial<MuscleData>[][]
): MuscleData[] {
  const muscleMap: Record<string, { scores: { score: number; weight: number; source: string }[]; sources: Partial<MuscleData>[] }> = {};

  // Collect all analyses
  for (const analyses of analysesList) {
    for (const result of analyses) {
      if (!result.id || !result.status) continue;
      if (!muscleMap[result.id]) {
        muscleMap[result.id] = { scores: [], sources: [] };
      }
      const weight = SOURCE_WEIGHTS[result.analysisSource || "measurement"] || 0.2;
      muscleMap[result.id].scores.push({
        score: STATUS_SCORES[result.status],
        weight,
        source: result.analysisSource || "measurement",
      });
      muscleMap[result.id].sources.push(result);
    }
  }

  // Calculate final scores
  return Object.entries(MUSCLE_NAMES).map(([id, name]) => {
    const data = muscleMap[id];
    if (!data || data.scores.length === 0) {
      return {
        id,
        name,
        status: "unknown" as MuscleStatus,
        analysisSource: "combined" as const,
        reasoning: "Pas assez de données pour évaluer ce muscle",
        priorityExercises: [],
      };
    }

    const totalWeight = data.scores.reduce((sum, s) => sum + s.weight, 0);
    const weightedScore = data.scores.reduce((sum, s) => sum + s.score * s.weight, 0) / totalWeight;
    const finalStatus = SCORE_TO_STATUS(weightedScore);

    // Get best source for reasoning
    const primarySource = data.sources[0];

    // Volume recommendation
    const isLarge = LARGE_MUSCLES.includes(id);
    const volRec = VOLUME_RECOMMENDATIONS[finalStatus];

    // Priority exercises
    const exercises = PRIORITY_EXERCISES[id]?.[finalStatus] || [];

    return {
      id,
      name,
      status: finalStatus,
      score: parseFloat(weightedScore.toFixed(1)),
      analysisSource: "combined" as const,
      reasoning: primarySource?.reasoning || `Score pondéré : ${weightedScore.toFixed(1)}/4`,
      measurement: primarySource?.measurement,
      measurementUnit: primarySource?.measurementUnit,
      previousMeasurement: primarySource?.previousMeasurement,
      weeklyVolume: isLarge ? 12 : 8, // Assumed current
      recommendedVolume: isLarge ? volRec.large : volRec.small,
      priorityExercises: exercises,
    };
  });
}

// Add weak points from user input
export function applyUserWeakPoints(
  muscles: MuscleData[],
  weakPoints: string[]
): MuscleData[] {
  const weakPointMapping: Record<string, string[]> = {
    "Pectoraux": ["chest"],
    "Dos largeur": ["lats"],
    "Dos épaisseur": ["traps", "lower_back"],
    "Épaules": ["shoulders", "rear_delts"],
    "Bras": ["biceps", "triceps"],
    "Quadriceps": ["quads"],
    "Ischio-jambiers": ["hamstrings"],
    "Mollets": ["calves"],
    "Abdos": ["abs", "obliques"],
  };

  const affectedMuscleIds = new Set<string>();
  for (const wp of weakPoints) {
    const muscleIds = weakPointMapping[wp] || [];
    muscleIds.forEach((id) => affectedMuscleIds.add(id));
  }

  return muscles.map((muscle) => {
    if (!affectedMuscleIds.has(muscle.id)) return muscle;

    // Downgrade status by 1 level if user says it's weak
    const downgraded: MuscleStatus =
      muscle.status === "strong" ? "normal" :
      muscle.status === "normal" ? "improve" :
      muscle.status === "improve" ? "weak" :
      muscle.status === "unknown" ? "weak" :
      "weak";

    const isLarge = LARGE_MUSCLES.includes(muscle.id);
    const volRec = VOLUME_RECOMMENDATIONS[downgraded];
    const exercises = PRIORITY_EXERCISES[muscle.id]?.[downgraded] || muscle.priorityExercises || [];

    return {
      ...muscle,
      status: downgraded,
      reasoning: `${muscle.reasoning || ""} — Signalé comme point faible par l'utilisateur`.trim(),
      analysisSource: "combined" as const,
      recommendedVolume: isLarge ? volRec.large : volRec.small,
      priorityExercises: exercises,
    };
  });
}
