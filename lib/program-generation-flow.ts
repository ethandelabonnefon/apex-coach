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

// Type for the AI route's JSON response
interface AIProgramResponse {
  fullAnalysis?: string;
  programName?: string;
  split?: string;
  sessions?: Array<{
    day: string;
    name: string;
    focus: string;
    duration: number;
    exercises: Array<{
      name: string;
      sets: number;
      reps: string;
      rir: number;
      rest: number;
      reasoning?: string;
      cues?: string[];
      alternatives?: string[];
    }>;
    t1dNotes?: string;
  }>;
  volumePerMuscle?: Record<string, { setsPerWeek: number; status?: string; justification?: string }>;
  t1dProtocol?: { preworkout?: string; postworkout?: string; alerts?: string[] };
}

function aiResponseToActiveProgram(
  ai: AIProgramResponse,
  daysPerWeek: number,
  morphologyEntry: DiagnosticEntry | null,
): ActiveProgram {
  const sessions = (ai.sessions ?? []).map((s, sIdx) => ({
    id: `ai-${sIdx}-${crypto.randomUUID().slice(0, 8)}`,
    day: s.day,
    name: s.name,
    focus: s.focus,
    duration: s.duration,
    exercises: (s.exercises ?? []).map((ex, exIdx) => ({
      order: exIdx + 1,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      rir: ex.rir,
      rest: ex.rest,
      reasoning: ex.reasoning,
      cues: ex.cues,
      alternatives: ex.alternatives,
    })),
  }));

  return {
    id: crypto.randomUUID(),
    name: ai.programName || "Programme personnalisé",
    splitType: ai.split || "ppl",
    daysPerWeek,
    currentWeek: 1,
    currentPhase: "accumulation",
    sessions,
    volumeDistribution: Object.fromEntries(
      Object.entries(ai.volumePerMuscle ?? {}).map(([k, v]) => [
        k,
        {
          setsPerWeek: v.setsPerWeek,
          status: v.status ?? "",
          justification: v.justification ?? "",
        },
      ]),
    ),
    generationReasoning: ai.fullAnalysis || "",
    generatedFrom: {
      muscuDiagDate: new Date().toISOString(),
      morphologyDate: morphologyEntry?.date,
    },
    predictions: {},
    t1dProtocol: {
      preworkout: ai.t1dProtocol?.preworkout || "",
      postworkout: ai.t1dProtocol?.postworkout || "",
      alerts: ai.t1dProtocol?.alerts || [],
    },
    createdAt: new Date().toISOString(),
    version: 1,
    isGenerated: true,
  };
}

// Generate personalized program — AI first (Claude), local fallback on failure.
export async function generatePersonalizedProgram(params: {
  muscuDiagnosticData: Record<string, unknown>;
  morphologyEntry: DiagnosticEntry | null;
  profile: { name: string; age: number; height: number; weight: number; goals: string[] };
}): Promise<ActiveProgram> {
  const { muscuDiagnosticData, morphologyEntry, profile } = params;
  const daysPerWeek = Number(muscuDiagnosticData.daysPerWeek) || 4;

  // ─── 1) Try AI generation first ──────────────────────────────
  try {
    console.log("[program-gen] trying AI generation");
    const bodyMapAnalysisForAI = morphologyEntry
      ? buildBodyAnalysis(morphologyEntry, profile.height, profile.weight)
      : null;
    const bodyMapText = bodyMapAnalysisForAI
      ? bodyMapAnalysisForAI
          .map((m) => `- ${m.name}: ${m.status}`)
          .join("\n")
      : null;

    const res = await fetch("/api/generate-muscu-program", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        diagnosticData: muscuDiagnosticData,
        userContext: {
          name: profile.name,
          age: profile.age,
          height: profile.height,
          weight: profile.weight,
          goals: profile.goals,
        },
        bodyMapAnalysis: bodyMapText,
        morphologyData: morphologyEntry,
      }),
    });

    if (res.ok) {
      const ai = (await res.json()) as AIProgramResponse;
      if (ai.sessions && ai.sessions.length > 0) {
        console.log("[program-gen] AI generation succeeded");
        return aiResponseToActiveProgram(ai, daysPerWeek, morphologyEntry);
      }
      console.warn("[program-gen] AI returned empty sessions, falling back to local");
    } else {
      const body = await res.json().catch(() => ({}));
      console.warn(`[program-gen] AI route ${res.status}, falling back to local`, body);
    }
  } catch (err) {
    console.warn("[program-gen] AI generation failed, falling back to local:", err);
  }

  // ─── 2) Local deterministic fallback ─────────────────────────
  console.log("[program-gen] using local generator");

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

  // Build equipment list — accept either an array of items or a single
  // string preset (e.g. "gym_complete", "home_minimal").
  const rawEquipment = muscuDiagnosticData.equipment as string | string[] | undefined;
  const diagEquipment: string[] = Array.isArray(rawEquipment)
    ? rawEquipment
    : typeof rawEquipment === "string" && rawEquipment.length > 0
      ? [rawEquipment]
      : [];
  const filtered = diagEquipment.filter((e): e is Equipment =>
    DEFAULT_EQUIPMENT.includes(e as Equipment),
  );
  const equipment: Equipment[] = filtered.length > 0 ? filtered : DEFAULT_EQUIPMENT;

  // Generate program locally — instant, deterministic, free
  const result = generateProgramLocal({
    daysPerWeek,
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
    daysPerWeek,
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
