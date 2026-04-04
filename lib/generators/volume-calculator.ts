// ============================================
// APEX Coach — Volume Calculator
// Sets per muscle group per week based on body map
// ============================================

import type { MuscleGroup } from '../data/exercises-database';

interface BodyMap {
  weakPoints: string[];
  improvePoints: string[];
  strongPoints: string[];
}

// Base weekly sets per muscle group (hypertrophy-oriented)
const BASE_VOLUME: Record<string, number> = {
  chest: 10,
  chest_upper: 6,
  chest_lower: 4,
  back: 10,
  lats: 10,
  traps: 6,
  rhomboids: 4,
  shoulders: 8,
  front_delts: 4,
  side_delts: 8,
  rear_delts: 6,
  biceps: 8,
  triceps: 8,
  forearms: 4,
  quads: 12,
  hamstrings: 10,
  glutes: 8,
  calves: 8,
  adductors: 4,
  abs: 6,
  obliques: 4,
  lower_back: 4,
};

// Volume multipliers based on body map status
const VOLUME_MULTIPLIERS = {
  weak: 1.4,     // +40% volume for weak points
  improve: 1.15, // +15% for points to improve
  strong: 0.8,   // -20% for strong points (maintenance)
  neutral: 1.0,
};

// Map user-facing muscle names to our internal MuscleGroup keys
const MUSCLE_NAME_MAP: Record<string, MuscleGroup[]> = {
  pectoraux: ['chest', 'chest_upper', 'chest_lower'],
  pecs: ['chest', 'chest_upper', 'chest_lower'],
  chest: ['chest', 'chest_upper', 'chest_lower'],
  dos: ['back', 'lats'],
  back: ['back', 'lats'],
  dorsaux: ['lats'],
  trapèzes: ['traps'],
  traps: ['traps'],
  épaules: ['shoulders', 'side_delts', 'front_delts', 'rear_delts'],
  shoulders: ['shoulders', 'side_delts', 'front_delts', 'rear_delts'],
  deltoïdes: ['shoulders', 'side_delts', 'front_delts', 'rear_delts'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  bras: ['biceps', 'triceps'],
  arms: ['biceps', 'triceps'],
  quadriceps: ['quads'],
  quads: ['quads'],
  cuisses: ['quads', 'hamstrings'],
  ischio: ['hamstrings'],
  'ischio-jambiers': ['hamstrings'],
  hamstrings: ['hamstrings'],
  fessiers: ['glutes'],
  glutes: ['glutes'],
  mollets: ['calves'],
  calves: ['calves'],
  abdos: ['abs', 'obliques'],
  abs: ['abs', 'obliques'],
  abdominaux: ['abs', 'obliques'],
  lombaires: ['lower_back'],
};

function getMuscleGroups(muscleName: string): MuscleGroup[] {
  const normalized = muscleName.toLowerCase().trim();
  return MUSCLE_NAME_MAP[normalized] || [normalized as MuscleGroup];
}

function getMuscleStatus(
  muscle: MuscleGroup,
  bodyMap: BodyMap
): 'weak' | 'improve' | 'strong' | 'neutral' {
  // Check all body map categories
  for (const name of bodyMap.weakPoints) {
    const groups = getMuscleGroups(name);
    if (groups.includes(muscle)) return 'weak';
  }
  for (const name of bodyMap.improvePoints) {
    const groups = getMuscleGroups(name);
    if (groups.includes(muscle)) return 'improve';
  }
  for (const name of bodyMap.strongPoints) {
    const groups = getMuscleGroups(name);
    if (groups.includes(muscle)) return 'strong';
  }
  return 'neutral';
}

/**
 * Calculate weekly volume targets (sets) for each muscle in a session.
 * Distributes total weekly volume across the number of sessions that hit each muscle.
 */
export function calculateSessionVolume(
  sessionMuscles: MuscleGroup[],
  bodyMap: BodyMap,
  totalSessionsPerWeek: number
): Record<string, number> {
  const result: Record<string, number> = {};

  // Deduplicate: for parent groups like 'chest', don't double-count with 'chest_upper'
  const parentGroups = new Set<string>();
  const uniqueMuscles = sessionMuscles.filter(m => {
    // If we have both 'chest' and 'chest_upper', keep both but handle volume splitting
    const parent = m.split('_')[0];
    if (parentGroups.has(m)) return false;
    parentGroups.add(m);
    return true;
  });

  for (const muscle of uniqueMuscles) {
    const baseVolume = BASE_VOLUME[muscle] ?? 6;
    const status = getMuscleStatus(muscle, bodyMap);
    const multiplier = VOLUME_MULTIPLIERS[status];

    // Weekly volume adjusted by body map
    const weeklyVolume = Math.round(baseVolume * multiplier);

    // How many times this muscle appears per week (estimate)
    // For PPL 6x: each muscle hit ~2x/week; for 3x: ~1x/week
    const frequency = Math.max(1, Math.round(totalSessionsPerWeek / 3));

    // Sets for this session
    const sessionSets = Math.max(2, Math.round(weeklyVolume / frequency));

    result[muscle] = sessionSets;
  }

  return result;
}

/**
 * Get the full weekly volume plan for all muscles
 */
export function calculateWeeklyVolume(
  bodyMap: BodyMap
): Record<string, { setsPerWeek: number; status: string; justification: string }> {
  const result: Record<string, { setsPerWeek: number; status: string; justification: string }> = {};

  for (const [muscle, baseVol] of Object.entries(BASE_VOLUME)) {
    const status = getMuscleStatus(muscle as MuscleGroup, bodyMap);
    const multiplier = VOLUME_MULTIPLIERS[status];
    const setsPerWeek = Math.round(baseVol * multiplier);

    const justifications: Record<string, string> = {
      weak: `Point faible identifié — volume augmenté à ${setsPerWeek} séries/semaine (+${Math.round((multiplier - 1) * 100)}%)`,
      improve: `À améliorer — volume légèrement augmenté à ${setsPerWeek} séries/semaine`,
      strong: `Point fort — volume de maintien à ${setsPerWeek} séries/semaine`,
      neutral: `Volume standard de ${setsPerWeek} séries/semaine`,
    };

    result[muscle] = {
      setsPerWeek,
      status,
      justification: justifications[status],
    };
  }

  return result;
}
