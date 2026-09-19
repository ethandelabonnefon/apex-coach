// ============================================
// APEX Coach — Local Program Generator (No AI)
// Deterministic program generation using exercise DB + algorithms
// ============================================

import type { Exercise, Equipment, MuscleGroup, TrainingStyle, DifficultyLevel } from '../data/exercises-database';
import { EXERCISES } from '../data/exercises';
import { selectExercisesForMuscle } from './exercise-selector';
import { SPLIT_TEMPLATES, determineSplit } from '../data/split-templates';
import { calculateSessionVolume, calculateWeeklyVolume } from './volume-calculator';

const EXERCISES_MAP = new Map(EXERCISES.map(ex => [ex.id, ex]));

export interface ProgramConfig {
  daysPerWeek: number;
  splitType?: string;

  morphology: {
    armLength: 'short' | 'medium' | 'long';
    femurLength: 'short' | 'medium' | 'long';
    torsoLength: 'short' | 'medium' | 'long';
  };
  mobility: {
    shoulders: 'limited' | 'normal' | 'good';
    hips: 'limited' | 'normal' | 'good';
    ankles: 'limited' | 'normal' | 'good';
  };

  bodyMap: {
    weakPoints: string[];
    improvePoints: string[];
    strongPoints: string[];
  };

  equipment: Equipment[];
  avoidExercises: string[];
  experienceLevel: DifficultyLevel;
  trainingStyle: TrainingStyle;
  sessionDuration: number;
}

export interface GeneratedExercise {
  order: number;
  name: string;
  sets: number;
  reps: string;
  rir: number;
  rest: number;
  reasoning: string;
  cues: string[];
  alternatives: string[];
  exerciseId: string;
}

export interface GeneratedSession {
  id: string;
  name: string;
  day: string;
  focus: string;
  duration: number;
  exercises: GeneratedExercise[];
}

export interface GeneratedProgram {
  programName: string;
  split: string;
  sessions: GeneratedSession[];
  volumePerMuscle: Record<string, { setsPerWeek: number; status: string; justification: string }>;
  fullAnalysis: string;
}

const DAY_MAPPINGS: Record<number, number[]> = {
  2: [0, 3],
  3: [0, 2, 4],
  4: [0, 1, 3, 4],
  5: [0, 1, 2, 3, 4],
  6: [0, 1, 2, 3, 4, 5],
};

const DAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

function assignDay(index: number, totalDays: number): string {
  const mapping = DAY_MAPPINGS[totalDays];
  if (!mapping) return DAYS[index] || 'Lundi';
  return DAYS[mapping[index] ?? 0];
}

function generateReasoning(exercise: Exercise, config: ProgramConfig, muscleGroup: MuscleGroup): string {
  const reasons: string[] = [];

  if (exercise.bestFor.armLength === config.morphology.armLength) {
    reasons.push(`adapté à tes bras ${config.morphology.armLength}s`);
  }
  if (exercise.bestFor.femurLength === config.morphology.femurLength) {
    reasons.push(`adapté à tes fémurs ${config.morphology.femurLength}s`);
  }
  if (exercise.bestFor.torsoLength === config.morphology.torsoLength) {
    reasons.push(`adapté à ton torse ${config.morphology.torsoLength}`);
  }
  if (exercise.exerciseType === 'compound') {
    reasons.push('exercice composé pour maximiser le recrutement musculaire');
  }
  if (config.bodyMap.weakPoints.some(wp =>
    wp.toLowerCase().includes(muscleGroup.split('_')[0])
  )) {
    reasons.push('cible ton point faible');
  }

  return reasons.length > 0
    ? `Choisi car ${reasons.join(', ')}.`
    : 'Exercice efficace pour ce groupe musculaire.';
}

function getExerciseAlternativeNames(exercise: Exercise): string[] {
  return exercise.alternatives
    .map((altId: string) => {
      const alt = EXERCISES_MAP.get(altId);
      return alt ? alt.name : altId;
    })
    .slice(0, 3);
}

/**
 * Generate a complete training program locally (no API call).
 * Same input = same output = deterministic.
 */
export function generateProgramLocal(config: ProgramConfig): GeneratedProgram {
  const splitType = config.splitType || determineSplit(config.daysPerWeek);
  const splitTemplates = SPLIT_TEMPLATES[splitType];

  if (!splitTemplates || !splitTemplates[config.daysPerWeek]) {
    // Fallback to PPL or best available
    const fallbackSplit = determineSplit(config.daysPerWeek);
    const fallbackTemplates = SPLIT_TEMPLATES[fallbackSplit];
    if (!fallbackTemplates || !fallbackTemplates[config.daysPerWeek]) {
      throw new Error(`Pas de template pour ${config.daysPerWeek} jours/semaine`);
    }
    return generateFromTemplates(fallbackTemplates[config.daysPerWeek], fallbackSplit, config);
  }

  return generateFromTemplates(splitTemplates[config.daysPerWeek], splitType, config);
}

function generateFromTemplates(
  templates: { name: string; focus: MuscleGroup[] }[],
  splitType: string,
  config: ProgramConfig
): GeneratedProgram {
  const sessions: GeneratedSession[] = [];
  const volumePerMuscle = calculateWeeklyVolume(config.bodyMap);

  for (let i = 0; i < templates.length; i++) {
    const template = templates[i];

    // Calculate volume for each muscle in this session
    const volumeTargets = calculateSessionVolume(
      template.focus,
      config.bodyMap,
      templates.length
    );

    // Group muscles to avoid too many exercises per session
    // Deduplicate parent/child groups
    const processedMuscles = deduplicateMuscleGroups(template.focus);

    const exercises: GeneratedExercise[] = [];
    const alreadySelectedIds: string[] = [];
    let order = 1;

    // Select exercises for each muscle group
    for (const muscleGroup of processedMuscles) {
      const setsTarget = volumeTargets[muscleGroup] || 4;
      const exerciseCount = setsTarget <= 4 ? 1 : setsTarget <= 8 ? 2 : 3;

      const selectedExercises = selectExercisesForMuscle({
        muscleGroup,
        morphology: config.morphology,
        mobility: config.mobility,
        availableEquipment: config.equipment,
        avoidExercises: config.avoidExercises,
        experienceLevel: config.experienceLevel,
        exerciseType: 'both',
        trainingStyle: config.trainingStyle,
        count: exerciseCount,
        alreadySelected: alreadySelectedIds,
      });

      for (const ex of selectedExercises) {
        alreadySelectedIds.push(ex.id);

        const setsPerExercise = Math.max(2, Math.ceil(setsTarget / exerciseCount));
        const reps = ex.repRanges[config.trainingStyle];
        const rest = ex.restSeconds[config.trainingStyle];
        const rir = config.trainingStyle === 'strength' ? 2 : config.trainingStyle === 'hypertrophy' ? 2 : 1;

        exercises.push({
          order: order++,
          name: ex.name,
          sets: setsPerExercise,
          reps,
          rir,
          rest,
          reasoning: generateReasoning(ex, config, muscleGroup),
          cues: ex.cues,
          alternatives: getExerciseAlternativeNames(ex),
          exerciseId: ex.id,
        });
      }
    }

    // Sort: compounds first, then isolations
    exercises.sort((a, b) => {
      const aEx = EXERCISES_MAP.get(a.exerciseId);
      const bEx = EXERCISES_MAP.get(b.exerciseId);
      if (aEx?.exerciseType === 'compound' && bEx?.exerciseType === 'isolation') return -1;
      if (aEx?.exerciseType === 'isolation' && bEx?.exerciseType === 'compound') return 1;
      return 0;
    });

    // HARD LIMIT: max 6 exercises per session
    if (exercises.length > 6) {
      exercises.splice(6);
    }

    // HARD LIMIT: max 20 sets per session
    let totalSets = exercises.reduce((sum, ex) => sum + ex.sets, 0);
    while (totalSets > 20 && exercises.length > 0) {
      const lastEx = exercises[exercises.length - 1];
      if (lastEx.sets > 2) {
        lastEx.sets--;
        totalSets--;
      } else {
        break;
      }
    }

    // Re-number after sorting and trimming
    exercises.forEach((ex, idx) => { ex.order = idx + 1; });

    // Estimate session duration
    const estimatedDuration = estimateSessionDuration(exercises);

    sessions.push({
      id: `gen-${i + 1}`,
      name: template.name,
      day: assignDay(i, config.daysPerWeek),
      focus: template.focus.map(formatMuscleName).filter((v, idx, arr) => arr.indexOf(v) === idx).join(' / '),
      duration: Math.min(estimatedDuration, config.sessionDuration),
      exercises,
    });
  }

  // Build analysis text
  const analysis = buildAnalysisText(config, splitType, sessions, volumePerMuscle);

  const splitNames: Record<string, string> = {
    ppl: 'Push/Pull/Legs',
    upper_lower: 'Upper/Lower',
    full_body: 'Full Body',
    bro_split: 'Bro Split',
  };

  return {
    programName: `Programme ${splitNames[splitType] || splitType} ${config.daysPerWeek}j`,
    split: splitType,
    sessions,
    volumePerMuscle,
    fullAnalysis: analysis,
  };
}

function deduplicateMuscleGroups(muscles: MuscleGroup[]): MuscleGroup[] {
  // If we have both parent and child (e.g., 'chest' and 'chest_upper'),
  // keep only the more specific ones to avoid double-selecting
  const result: MuscleGroup[] = [];
  const seen = new Set<string>();

  for (const m of muscles) {
    if (seen.has(m)) continue;
    seen.add(m);

    // Check if a parent already exists
    const parent = m.split('_')[0];
    if (parent !== m && seen.has(parent)) {
      // Parent already added, skip this child (parent covers it)
      continue;
    }

    // Check if we should replace parent with this child
    // Only add if no duplicate
    result.push(m);
  }

  return result;
}

function estimateSessionDuration(exercises: GeneratedExercise[]): number {
  let totalMinutes = 5; // warm-up
  for (const ex of exercises) {
    const setTime = 0.5; // ~30s per set average
    const restTime = (ex.rest / 60) * (ex.sets - 1); // rest between sets
    totalMinutes += ex.sets * setTime + restTime;
  }
  return Math.round(totalMinutes);
}

function formatMuscleName(muscle: MuscleGroup): string {
  const names: Record<string, string> = {
    chest: 'Pectoraux',
    chest_upper: 'Pectoraux',
    chest_lower: 'Pectoraux',
    back: 'Dos',
    lats: 'Dorsaux',
    traps: 'Trapèzes',
    rhomboids: 'Rhomboïdes',
    shoulders: 'Épaules',
    front_delts: 'Épaules',
    side_delts: 'Épaules',
    rear_delts: 'Épaules',
    biceps: 'Biceps',
    triceps: 'Triceps',
    forearms: 'Avant-bras',
    quads: 'Quadriceps',
    hamstrings: 'Ischio-jambiers',
    glutes: 'Fessiers',
    calves: 'Mollets',
    adductors: 'Adducteurs',
    abs: 'Abdominaux',
    obliques: 'Obliques',
    lower_back: 'Lombaires',
  };
  return names[muscle] || muscle;
}

function buildAnalysisText(
  config: ProgramConfig,
  splitType: string,
  sessions: GeneratedSession[],
  volumePerMuscle: Record<string, { setsPerWeek: number; status: string; justification: string }>
): string {
  const lines: string[] = [];

  lines.push(`Programme généré localement (algorithme déterministe)`);
  lines.push(`Split: ${splitType} — ${config.daysPerWeek} jours/semaine`);
  lines.push(`Style: ${config.trainingStyle}`);
  lines.push(`Niveau: ${config.experienceLevel}`);
  lines.push('');

  if (config.bodyMap.weakPoints.length > 0) {
    lines.push(`Points faibles ciblés (volume +40%): ${config.bodyMap.weakPoints.join(', ')}`);
  }
  if (config.bodyMap.improvePoints.length > 0) {
    lines.push(`À améliorer (volume +15%): ${config.bodyMap.improvePoints.join(', ')}`);
  }
  if (config.bodyMap.strongPoints.length > 0) {
    lines.push(`Points forts (maintien): ${config.bodyMap.strongPoints.join(', ')}`);
  }
  lines.push('');

  lines.push('Résumé des séances:');
  for (const session of sessions) {
    lines.push(`  ${session.day} — ${session.name}: ${session.exercises.length} exercices, ~${session.duration}min`);
  }

  return lines.join('\n');
}
