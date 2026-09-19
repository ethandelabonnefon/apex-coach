// ============================================
// APEX Coach — Exercise Selection Algorithm
// Scores and selects exercises based on user profile
// ============================================

import { EXERCISES } from '../data/exercises';
import type { Exercise, MuscleGroup, Equipment, DifficultyLevel, TrainingStyle } from '../data/exercises-database';

export interface SelectionCriteria {
  muscleGroup: MuscleGroup;

  // User profile
  morphology: {
    armLength?: 'short' | 'medium' | 'long';
    femurLength?: 'short' | 'medium' | 'long';
    torsoLength?: 'short' | 'medium' | 'long';
  };
  mobility: {
    shoulders: 'limited' | 'normal' | 'good';
    hips: 'limited' | 'normal' | 'good';
    ankles: 'limited' | 'normal' | 'good';
  };

  // Constraints
  availableEquipment: Equipment[];
  avoidExercises: string[];
  experienceLevel: DifficultyLevel;

  // Preferences
  exerciseType: 'compound' | 'isolation' | 'both';
  trainingStyle: TrainingStyle;

  // How many exercises to select
  count: number;

  // Already selected exercises in this session (to avoid duplicates)
  alreadySelected?: string[];
}

type ScoredExercise = Exercise & { score: number };

export function selectExercisesForMuscle(criteria: SelectionCriteria): Exercise[] {
  const levelOrder: Record<DifficultyLevel, number> = { beginner: 1, intermediate: 2, advanced: 3 };

  // 1. Filter by muscle group (exact match or sub-group)
  let candidates = EXERCISES.filter(ex =>
    ex.muscleGroup === criteria.muscleGroup ||
    ex.muscleGroup.startsWith(criteria.muscleGroup + '_') ||
    criteria.muscleGroup.startsWith(ex.muscleGroup + '_') ||
    ex.muscleGroup === criteria.muscleGroup.split('_')[0]
  );

  // 2. Filter by available equipment
  candidates = candidates.filter(ex =>
    ex.equipment.every(eq => criteria.availableEquipment.includes(eq))
  );

  // 3. Filter out avoided exercises
  candidates = candidates.filter(ex =>
    !criteria.avoidExercises.includes(ex.id) &&
    !criteria.avoidExercises.includes(ex.name)
  );

  // 4. Filter by experience level
  candidates = candidates.filter(ex =>
    levelOrder[ex.difficulty] <= levelOrder[criteria.experienceLevel]
  );

  // 5. Filter by mobility
  candidates = candidates.filter(ex => {
    if (ex.mobilityRequired.shoulders === 'high' && criteria.mobility.shoulders === 'limited') return false;
    if (ex.mobilityRequired.hips === 'high' && criteria.mobility.hips === 'limited') return false;
    if (ex.mobilityRequired.ankles === 'high' && criteria.mobility.ankles === 'limited') return false;
    return true;
  });

  // 6. Filter out already selected exercises
  if (criteria.alreadySelected?.length) {
    candidates = candidates.filter(ex => !criteria.alreadySelected!.includes(ex.id));
  }

  // 7. Score and sort
  const scored: ScoredExercise[] = candidates.map(ex => ({
    ...ex,
    score: calculateExerciseScore(ex, criteria),
  }));
  scored.sort((a, b) => b.score - a.score);

  // 8. Select: compounds first, then isolations
  const selected: Exercise[] = [];

  if (criteria.exerciseType === 'compound' || criteria.exerciseType === 'both') {
    const compounds = scored.filter(ex => ex.exerciseType === 'compound');
    const compoundCount = criteria.count > 2 ? 2 : 1;
    selected.push(...compounds.slice(0, compoundCount));
  }

  if (criteria.exerciseType === 'isolation' || criteria.exerciseType === 'both') {
    const remaining = criteria.count - selected.length;
    const isolations = scored.filter(ex =>
      ex.exerciseType === 'isolation' && !selected.find(s => s.id === ex.id)
    );
    selected.push(...isolations.slice(0, remaining));
  }

  // Fill if not enough
  while (selected.length < criteria.count) {
    const next = scored.find(ex => !selected.find(s => s.id === ex.id));
    if (next) selected.push(next);
    else break;
  }

  return selected;
}

function calculateExerciseScore(exercise: Exercise, criteria: SelectionCriteria): number {
  let score = 50;

  // Morphology bonuses
  if (exercise.bestFor.armLength && exercise.bestFor.armLength === criteria.morphology.armLength) score += 20;
  if (exercise.bestFor.femurLength && exercise.bestFor.femurLength === criteria.morphology.femurLength) score += 20;
  if (exercise.bestFor.torsoLength && exercise.bestFor.torsoLength === criteria.morphology.torsoLength) score += 20;

  // Compound bonus (prioritize at start of session)
  if (exercise.exerciseType === 'compound') score += 15;

  // Mobility penalties for medium requirements when limited
  if (exercise.mobilityRequired.shoulders === 'medium' && criteria.mobility.shoulders === 'limited') score -= 10;
  if (exercise.mobilityRequired.hips === 'medium' && criteria.mobility.hips === 'limited') score -= 10;
  if (exercise.mobilityRequired.ankles === 'medium' && criteria.mobility.ankles === 'limited') score -= 10;

  // Exact muscle group match bonus
  if (exercise.muscleGroup === criteria.muscleGroup) score += 10;

  // Beginner-friendly bonus for beginners
  if (criteria.experienceLevel === 'beginner' && exercise.difficulty === 'beginner') score += 10;

  // Machine/cable bonus for beginners (more guided movement)
  if (criteria.experienceLevel === 'beginner' && exercise.equipment.includes('machine')) score += 5;

  return score;
}
