// ============================================
// APEX Coach — Split Templates
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
      { name: 'Push', focus: ['chest', 'chest_upper', 'shoulders', 'side_delts', 'front_delts', 'triceps'] },
      { name: 'Pull', focus: ['back', 'lats', 'rear_delts', 'traps', 'biceps'] },
      { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
    4: [
      { name: 'Push A', focus: ['chest', 'chest_upper', 'shoulders', 'side_delts', 'triceps'] },
      { name: 'Pull A', focus: ['back', 'lats', 'rear_delts', 'traps', 'biceps'] },
      { name: 'Legs', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Push B + Pull B', focus: ['chest', 'shoulders', 'side_delts', 'triceps', 'lats', 'rear_delts', 'biceps'] },
    ],
    5: [
      { name: 'Push A', focus: ['chest', 'chest_upper', 'shoulders', 'side_delts', 'triceps'] },
      { name: 'Pull A', focus: ['back', 'lats', 'rear_delts', 'traps', 'biceps'] },
      { name: 'Legs A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Push B', focus: ['chest', 'chest_upper', 'front_delts', 'side_delts', 'triceps'] },
      { name: 'Pull B', focus: ['lats', 'back', 'rear_delts', 'biceps'] },
    ],
    6: [
      { name: 'Push A', focus: ['chest', 'chest_upper', 'shoulders', 'side_delts', 'triceps'] },
      { name: 'Pull A', focus: ['back', 'lats', 'rear_delts', 'traps', 'biceps'] },
      { name: 'Legs A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Push B', focus: ['chest', 'chest_upper', 'front_delts', 'side_delts', 'triceps'] },
      { name: 'Pull B', focus: ['lats', 'back', 'rear_delts', 'biceps'] },
      { name: 'Legs B', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // UPPER / LOWER
  // ═══════════════════════════════════════════════════════
  upper_lower: {
    3: [
      { name: 'Upper', focus: ['chest', 'chest_upper', 'back', 'lats', 'shoulders', 'side_delts', 'biceps', 'triceps'] },
      { name: 'Lower', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Upper B', focus: ['chest', 'lats', 'rear_delts', 'side_delts', 'biceps', 'triceps'] },
    ],
    4: [
      { name: 'Upper A', focus: ['chest', 'chest_upper', 'back', 'lats', 'shoulders', 'side_delts', 'biceps', 'triceps'] },
      { name: 'Lower A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Upper B', focus: ['chest', 'lats', 'rear_delts', 'side_delts', 'biceps', 'triceps'] },
      { name: 'Lower B', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
    ],
    5: [
      { name: 'Upper A', focus: ['chest', 'chest_upper', 'back', 'lats', 'shoulders', 'side_delts', 'biceps', 'triceps'] },
      { name: 'Lower A', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
      { name: 'Upper B', focus: ['chest', 'lats', 'rear_delts', 'side_delts', 'biceps', 'triceps'] },
      { name: 'Lower B', focus: ['quads', 'hamstrings', 'glutes', 'calves', 'abs'] },
      { name: 'Upper C', focus: ['chest_upper', 'lats', 'shoulders', 'rear_delts', 'biceps', 'triceps'] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // FULL BODY
  // ═══════════════════════════════════════════════════════
  full_body: {
    2: [
      { name: 'Full Body A', focus: ['chest', 'lats', 'shoulders', 'quads', 'hamstrings', 'abs'] },
      { name: 'Full Body B', focus: ['chest_upper', 'back', 'side_delts', 'quads', 'glutes', 'biceps', 'triceps'] },
    ],
    3: [
      { name: 'Full Body A', focus: ['chest', 'lats', 'shoulders', 'quads', 'hamstrings', 'abs'] },
      { name: 'Full Body B', focus: ['chest_upper', 'back', 'side_delts', 'glutes', 'quads', 'biceps', 'triceps'] },
      { name: 'Full Body C', focus: ['chest', 'lats', 'rear_delts', 'hamstrings', 'quads', 'calves', 'abs'] },
    ],
    4: [
      { name: 'Full Body A', focus: ['chest', 'lats', 'shoulders', 'quads', 'hamstrings'] },
      { name: 'Full Body B', focus: ['chest_upper', 'back', 'side_delts', 'glutes', 'quads'] },
      { name: 'Full Body C', focus: ['chest', 'lats', 'rear_delts', 'hamstrings', 'calves'] },
      { name: 'Full Body D', focus: ['chest_upper', 'back', 'shoulders', 'quads', 'glutes', 'abs'] },
    ],
  },

  // ═══════════════════════════════════════════════════════
  // BRO SPLIT (1 muscle/jour)
  // ═══════════════════════════════════════════════════════
  bro_split: {
    4: [
      { name: 'Pecs / Triceps', focus: ['chest', 'chest_upper', 'chest_lower', 'triceps'] },
      { name: 'Dos / Biceps', focus: ['back', 'lats', 'traps', 'rear_delts', 'biceps'] },
      { name: 'Épaules / Abdos', focus: ['shoulders', 'front_delts', 'side_delts', 'rear_delts', 'abs', 'obliques'] },
      { name: 'Jambes', focus: ['quads', 'hamstrings', 'glutes', 'calves'] },
    ],
    5: [
      { name: 'Pecs', focus: ['chest', 'chest_upper', 'chest_lower'] },
      { name: 'Dos', focus: ['back', 'lats', 'traps', 'rhomboids', 'rear_delts'] },
      { name: 'Épaules', focus: ['shoulders', 'front_delts', 'side_delts', 'rear_delts'] },
      { name: 'Bras', focus: ['biceps', 'triceps', 'forearms'] },
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
