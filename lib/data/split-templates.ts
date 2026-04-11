// ============================================
// APEX Coach — Split Templates
// Simplified: max 4 muscle groups per session to stay under 6 exercises
// ============================================

import type { MuscleGroup } from './exercises-database';

export interface SessionTemplate {
  name: string;
  focus: MuscleGroup[];
}

// Each split type maps number of days to an array of session templates
export const SPLIT_TEMPLATES: Record<string, Record<number, SessionTemplate[]>> = {

  // ═══════════════════════════════════════════════════════
  // PUSH / PULL / LEGS
  // ═══════════════════════════════════════════════════════
  ppl: {
    3: [
      { name: 'Push', focus: ['chest', 'shoulders', 'triceps'] },
      { name: 'Pull', focus: ['back', 'rear_delts', 'biceps'] },
      { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
    4: [
      { name: 'Push A', focus: ['chest', 'shoulders', 'triceps'] },
      { name: 'Pull A', focus: ['back', 'rear_delts', 'biceps'] },
      { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Push B + Pull B', focus: ['chest', 'shoulders', 'back', 'biceps'] },
    ],
    5: [
      { name: 'Push A', focus: ['chest', 'shoulders', 'triceps'] },
      { name: 'Pull A', focus: ['back', 'rear_delts', 'biceps'] },
      { name: 'Legs A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Push B', focus: ['chest', 'shoulders', 'triceps'] },
      { name: 'Pull B', focus: ['back', 'rear_delts', 'biceps'] },
    ],
    6: [
      { name: 'Push A', focus: ['chest', 'shoulders', 'triceps'] },
      { name: 'Pull A', focus: ['back', 'rear_delts', 'biceps'] },
      { name: 'Legs A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Push B', focus: ['chest', 'shoulders', 'triceps'] },
      { name: 'Pull B', focus: ['back', 'rear_delts', 'biceps'] },
      { name: 'Legs B', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // UPPER / LOWER
  // ═══════════════════════════════════════════════════════
  upper_lower: {
    3: [
      { name: 'Upper', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
      { name: 'Lower', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Upper B', focus: ['chest', 'back', 'shoulders', 'biceps'] },
    ],
    4: [
      { name: 'Upper A', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
      { name: 'Lower A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Upper B', focus: ['chest', 'back', 'shoulders', 'biceps'] },
      { name: 'Lower B', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
    5: [
      { name: 'Upper A', focus: ['chest', 'back', 'shoulders', 'biceps', 'triceps'] },
      { name: 'Lower A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Upper B', focus: ['chest', 'back', 'shoulders', 'biceps'] },
      { name: 'Lower B', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Upper C', focus: ['chest', 'back', 'shoulders', 'triceps'] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // FULL BODY
  // ═══════════════════════════════════════════════════════
  full_body: {
    2: [
      { name: 'Full Body A', focus: ['chest', 'back', 'shoulders', 'quads', 'hamstrings'] },
      { name: 'Full Body B', focus: ['chest', 'back', 'shoulders', 'quads', 'glutes'] },
    ],
    3: [
      { name: 'Full Body A', focus: ['chest', 'back', 'shoulders', 'quads', 'hamstrings'] },
      { name: 'Full Body B', focus: ['chest', 'back', 'shoulders', 'glutes', 'quads'] },
      { name: 'Full Body C', focus: ['chest', 'back', 'shoulders', 'hamstrings', 'calves'] },
    ],
    4: [
      { name: 'Full Body A', focus: ['chest', 'back', 'shoulders', 'quads', 'hamstrings'] },
      { name: 'Full Body B', focus: ['chest', 'back', 'shoulders', 'glutes', 'quads'] },
      { name: 'Full Body C', focus: ['chest', 'back', 'shoulders', 'hamstrings', 'calves'] },
      { name: 'Full Body D', focus: ['chest', 'back', 'shoulders', 'quads', 'glutes'] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // BRO SPLIT (1 muscle/jour)
  // ═══════════════════════════════════════════════════════
  bro_split: {
    4: [
      { name: 'Pecs / Triceps', focus: ['chest', 'triceps'] },
      { name: 'Dos / Biceps', focus: ['back', 'rear_delts', 'biceps'] },
      { name: 'Épaules / Abdos', focus: ['shoulders', 'rear_delts'] },
      { name: 'Jambes', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
    5: [
      { name: 'Pecs', focus: ['chest'] },
      { name: 'Dos', focus: ['back', 'rear_delts'] },
      { name: 'Épaules', focus: ['shoulders', 'rear_delts'] },
      { name: 'Bras', focus: ['biceps', 'triceps'] },
      { name: 'Jambes', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },
};

// Auto-determine best split based on days per week
export function determineSplit(daysPerWeek: number): string {
  if (daysPerWeek <= 2) return 'full_body';
  if (daysPerWeek === 3) return 'ppl';
  if (daysPerWeek === 4) return 'upper_lower';
  if (daysPerWeek >= 5) return 'ppl';
  return 'ppl';
}

// Get all available split types for a given number of days
export function getAvailableSplits(daysPerWeek: number): string[] {
  return Object.entries(SPLIT_TEMPLATES)
    .filter(([, templates]) => templates[daysPerWeek] !== undefined)
    .map(([name]) => name);
}
