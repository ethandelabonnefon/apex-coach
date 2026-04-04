import type { ActiveProgram } from "./store";
import type { DiagnosticEntry } from "./store";
import type { MuscleData } from "./body-analysis/muscle-config";
import { analyzeFromMeasurements } from "./body-analysis/analyze-measurements";
import { analyzeFromStrength } from "./body-analysis/analyze-strength";
import { combineAnalyses, applyUserWeakPoints } from "./body-analysis/combine-analyses";
import { generateProgramLocal } from "./generators/program-generator-local";
import type { Equipment } from "./data/exercises-database";

// Default equipment list (full gym)
const DEFAULT_EQUIPMENT: Equipment[] = [
  'barbell', 'dumbbell', 'cable', 'machine', 'bodyweight',
  'kettlebell', 'bands', 'pull_up_bar', 'dip_station', 'bench',
  'squat_rack', 'leg_press', 'smith_machine',
];

// Build body analysis from diagnostic data
function buildBodyAnalysis(
  entry: DiagnosticEntry | null,
  height: number,
  weight: number
): MuscleData[] | null {
  if (!entry) return null;

  const measurementResults = analyzeFromMeasurements(
    entry.mensurations as Record<string, string>,
    height,
    weight
  );
  const strengthResults = analyzeFromStrength(
    entry.historique as Record<string, string>,
    weight
  );
  let combined = combineAnalyses(measurementResults, strengthResults);
  if (entry.weakPoints?.length) {
    combined = applyUserWeakPoints(combined, entry.weakPoints);
  }
  return combined;
}

// Extract body map from muscle analysis
function extractBodyMap(bodyMap: MuscleData[] | null): {
  weakPoints: string[];
  improvePoints: string[];
  strongPoints: string[];
} {
  if (!bodyMap) return { weakPoints: [], improvePoints: [], strongPoints: [] };

  const weakPoints: string[] = [];
  const improvePoints: string[] = [];
  const strongPoints: string[] = [];

  for (const m of bodyMap) {
    if (m.status === 'weak') weakPoints.push(m.name);
    else if (m.status === 'improve') improvePoints.push(m.name);
    else if (m.status === 'strong') strongPoints.push(m.name);
  }

  return { weakPoints, improvePoints, strongPoints };
}

// Map mobility diagnostic values to our format
function mapMobility(mobilite: Record<string, string> | undefined): {
  shoulders: 'limited' | 'normal' | 'good';
  hips: 'limited' | 'normal' | 'good';
  ankles: 'limited' | 'normal' | 'good';
} {
  const map = (val: string | undefined): 'limited' | 'normal' | 'good' => {
    if (!val) return 'normal';
    const lower = val.toLowerCase();
    if (lower.includes('limit') || lower.includes('faible') || lower.includes('raide')) return 'limited';
    if (lower.includes('bon') || lower.includes('excel') || lower.includes('souple')) return 'good';
    return 'normal';
  };

  return {
    shoulders: map(mobilite?.epaules || mobilite?.shoulders),
    hips: map(mobilite?.hanches || mobilite?.hips),
    ankles: map(mobilite?.chevilles || mobilite?.ankles),
  };
}

// Map morphology lengths
function mapLength(val: string | undefined): 'short' | 'medium' | 'long' {
  if (!val) return 'medium';
  const lower = val.toLowerCase();
  if (lower.includes('court') || lower.includes('short')) return 'short';
  if (lower.includes('long')) return 'long';
  return 'medium';
}

// Map experience level
function mapExperienceLevel(data: Record<string, unknown>): 'beginner' | 'intermediate' | 'advanced' {
  const level = String(data.experienceLevel || data.level || 'intermediate').toLowerCase();
  if (level.includes('débutant') || level.includes('beginner')) return 'beginner';
  if (level.includes('avancé') || level.includes('advanced')) return 'advanced';
  return 'intermediate';
}

// Generate personalized program using LOCAL deterministic generator (no API)
export async function generatePersonalizedProgram(params: {
  muscuDiagnosticData: Record<string, unknown>;
  morphologyEntry: DiagnosticEntry | null;
  profile: { name: string; age: number; height: number; weight: number; goals: string[] };
}): Promise<ActiveProgram> {
  const { muscuDiagnosticData, morphologyEntry, profile } = params;

  // Build body map analysis
  const bodyMapAnalysis = morphologyEntry
    ? buildBodyAnalysis(morphologyEntry, profile.height, profile.weight)
    : null;

  const bodyMap = extractBodyMap(bodyMapAnalysis);

  // Add user-specified weak points from diagnostic
  const userWeakPoints = (muscuDiagnosticData.weakPoints as string[]) || [];
  for (const wp of userWeakPoints) {
    if (!bodyMap.weakPoints.includes(wp)) bodyMap.weakPoints.push(wp);
  }

  // Extract morphology from diagnostic
  const longueurs = (morphologyEntry?.longueurs || {}) as Record<string, string>;
  const mobilite = (morphologyEntry?.mobilite || {}) as Record<string, string>;

  // Build equipment list
  const diagEquipment = muscuDiagnosticData.equipment as string[] | undefined;
  const equipment: Equipment[] = diagEquipment?.length
    ? diagEquipment.filter((e): e is Equipment => DEFAULT_EQUIPMENT.includes(e as Equipment))
    : DEFAULT_EQUIPMENT;

  // Generate program locally — instant, deterministic, free
  const result = generateProgramLocal({
    daysPerWeek: Number(muscuDiagnosticData.daysPerWeek) || 4,
    splitType: String(muscuDiagnosticData.preferredSplit || ''),
    morphology: {
      armLength: mapLength(longueurs.bras || longueurs.arms),
      femurLength: mapLength(longueurs.femur || longueurs.femurs),
      torsoLength: mapLength(longueurs.torse || longueurs.torso),
    },
    mobility: mapMobility(mobilite),
    bodyMap,
    equipment,
    avoidExercises: (muscuDiagnosticData.avoidExercises as string[]) || [],
    experienceLevel: mapExperienceLevel(muscuDiagnosticData),
    trainingStyle: (muscuDiagnosticData.trainingStyle as 'strength' | 'hypertrophy' | 'endurance') || 'hypertrophy',
    sessionDuration: Number(muscuDiagnosticData.sessionDuration) || 60,
  });

  // Transform to ActiveProgram format
  const program: ActiveProgram = {
    id: crypto.randomUUID(),
    name: result.programName,
    splitType: result.split,
    daysPerWeek: Number(muscuDiagnosticData.daysPerWeek) || 4,
    currentWeek: 1,
    currentPhase: "accumulation",
    sessions: result.sessions.map(session => ({
      id: session.id,
      day: session.day,
      name: session.name,
      focus: session.focus,
      duration: session.duration,
      exercises: session.exercises.map(ex => ({
        order: ex.order,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        rir: ex.rir,
        rest: ex.rest,
        reasoning: ex.reasoning,
        cues: ex.cues,
        alternatives: ex.alternatives,
      })),
    })),
    volumeDistribution: result.volumePerMuscle,
    generationReasoning: result.fullAnalysis,
    generatedFrom: {
      muscuDiagDate: new Date().toISOString(),
      morphologyDate: morphologyEntry?.date,
    },
    predictions: {},
    t1dProtocol: { preworkout: "", postworkout: "", alerts: [] },
    createdAt: new Date().toISOString(),
    version: 1,
    isGenerated: true,
  };

  return program;
}
