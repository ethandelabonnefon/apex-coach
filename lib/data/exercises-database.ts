// ============================================
// APEX Coach — Exercise Database Types
// ============================================

export type MuscleGroup =
  | 'chest' | 'chest_upper' | 'chest_lower'
  | 'back' | 'lats' | 'traps' | 'rhomboids'
  | 'shoulders' | 'front_delts' | 'side_delts' | 'rear_delts'
  | 'biceps' | 'triceps' | 'forearms'
  | 'quads' | 'hamstrings' | 'glutes' | 'calves' | 'adductors'
  | 'abs' | 'obliques' | 'lower_back';

export type MovementPattern =
  | 'horizontal_push' | 'horizontal_pull'
  | 'vertical_push' | 'vertical_pull'
  | 'hip_hinge' | 'squat' | 'lunge'
  | 'isolation_upper' | 'isolation_lower'
  | 'carry' | 'rotation';

export type Equipment =
  | 'barbell' | 'dumbbell' | 'cable' | 'machine'
  | 'bodyweight' | 'kettlebell' | 'bands'
  | 'pull_up_bar' | 'dip_station' | 'bench'
  | 'squat_rack' | 'leg_press' | 'smith_machine'
  | 'ab_wheel';

export type DifficultyLevel = 'beginner' | 'intermediate' | 'advanced';
export type MobilityLevel = 'low' | 'medium' | 'high';
export type LimbLength = 'short' | 'medium' | 'long';
export type TrainingStyle = 'strength' | 'hypertrophy' | 'endurance';

export interface Exercise {
  id: string;
  name: string;

  // Classification
  muscleGroup: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  movementPattern: MovementPattern;
  exerciseType: 'compound' | 'isolation';

  // Equipment
  equipment: Equipment[];

  // Difficulty & prerequisites
  difficulty: DifficultyLevel;
  mobilityRequired: {
    shoulders?: MobilityLevel;
    hips?: MobilityLevel;
    ankles?: MobilityLevel;
  };

  // Morphological adaptation
  bestFor: {
    armLength?: LimbLength;
    torsoLength?: LimbLength;
    femurLength?: LimbLength;
  };

  // Training parameters
  defaultSets: number;
  repRanges: Record<TrainingStyle, string>;
  restSeconds: Record<TrainingStyle, number>;

  // Instructions
  cues: string[];
  commonMistakes: string[];

  // Alternatives & progressions
  alternatives: string[];
  regressions: string[];
  progressions: string[];
}
