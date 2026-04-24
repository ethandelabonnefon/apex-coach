// ============================================
// APEX Coach — Core Types
// ============================================

export interface UserProfile {
  name: string;
  age: number;
  height: number;
  weight: number;
  diabetesType: string;
  insulinSystem: string;
  insulinRapid: string;
  basalDose: number;
  hasCGM: boolean;
  cgmType: string;
  vo2max: number;
  benchPress1RM: number;
  measurements: Measurements;
  morphology: MorphologyData;
  mobility: MobilityData;
  goals: string[];
  trainingDaysPerWeek: number;
  runningLevel: string;
  muscuLevel: string;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  weakPoints: string[];
  injuries: string[];
  bodyType: string;
}

export interface Measurements {
  chest: number | null;
  shoulders: number | null;
  waist: number | null;
  hips: number | null;
  armLeft: number | null;
  armRight: number | null;
  thighLeft: number | null;
  thighRight: number | null;
  calfLeft: number | null;
  calfRight: number | null;
}

export interface MorphologyData {
  bodyType: string | null;
  armLength: string | null;
  femurLength: string | null;
  torsoLength: string | null;
  shoulderWidth: string | null;
  hipWidth: string | null;
  muscleInsertions: Record<string, string>;
}

export interface MobilityData {
  shoulderFlexion: string | null;
  hipFlexion: string | null;
  ankleFlexion: string | null;
  thoracicRotation: string | null;
}

export interface InsulinRatio {
  id: string;
  label: string;
  mealKey: string;       // 'morning' | 'lunch' | 'snack' | 'dinner' | custom
  timeStart: string;     // "07:00"
  timeEnd: string;       // "10:00"
  ratio: number;         // 1:X
}

/**
 * Profil de ratios insuline — permet de switcher entre Sèche / PDM / Maintenance
 * selon la période (chaque phase a ses propres ratios + basal).
 * Source de vérité en Phase 10a. Les champs flat dans DiabetesConfig
 * (ratios, insulinRatios, insulinSensitivityFactor) sont des miroirs du
 * profil actif, synchronisés par les setters du store (rétrocompat consumers).
 */
export interface RatioProfile {
  id: string;
  name: string;                // "Par défaut" | "Sèche" | "PDM" | custom
  description?: string;
  ratios: { morning: number; lunch: number; snack: number; dinner: number };
  insulinRatios: InsulinRatio[];
  insulinSensitivityFactor: number;
  basalDose: number;           // lent du soir (Lantus/Toujeo/Tresiba…)
  createdAt: string;           // ISO
}

export interface DiabetesConfig {
  // Multi-profils (Phase 10a)
  profiles: RatioProfile[];
  activeProfileId: string;
  // Global (pas par profil)
  targetGlucose: number;
  targetRange: { min: number; max: number };
  insulinActiveDuration: number;
  knownPatterns: DiabetesPattern[];
  // Miroirs du profil actif (rétrocompat — Phase 5 à 9)
  ratios: { morning: number; lunch: number; snack: number; dinner: number };
  insulinRatios: InsulinRatio[];
  insulinSensitivityFactor: number;
}

export interface DiabetesPattern {
  name: string;
  description: string;
  suggestion: string;
}

export interface GlucoseReading {
  id: string;
  value: number;
  trend: string;
  recordedAt: Date;
}

export interface InsulinLog {
  id: string;
  units: number;
  insulinType: string;
  mealType: string;
  carbsGrams: number;
  glucoseBefore: number;
  notes: string;
  injectedAt: Date;
  /** ID du profil ratio actif au moment de l'injection (Phase 10a). */
  profileId?: string;
}

export interface Meal {
  id: string;
  mealType: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  foods: FoodItem[];
  eatenAt: Date;
}

export interface FoodItem {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Exercise {
  order: number;
  name: string;
  sets: number;
  reps: string;
  rir: number;
  rest: number;
  weight: number | null;
  reasoning: string;
  cues: string[];
  alternatives: { name: string; reason: string }[];
}

export interface WorkoutSession {
  id: string;
  name: string;
  type: 'muscu' | 'running';
  duration: number;
  focus: string;
  exercises: Exercise[];
  notes: { glycemia: string; recovery: string; progression: string };
}

export interface CompletedSet {
  reps: number;
  weight: number;
  rir: number;
}

export interface CompletedExercise {
  name: string;
  sets: CompletedSet[];
  difficulty: number;
  pumpRating: number;
}

export interface RunningZone {
  name: string;
  percentVMA: { min: number; max: number };
  speedKmh: { min: number; max: number };
  paceMinKm: { min: number; max: number };
  hrPercent: { min: number; max: number };
  feeling: string;
  purpose: string;
}

export interface RunningSession {
  name: string;
  type: string;
  zone: string;
  structure: RunningSegment[];
  reasoning: string;
  t1Note?: string;
}

export interface RunningSegment {
  segment: string;
  distance?: number;
  pace?: { min: number; max: number };
  zone?: string;
  description?: string;
  intervals?: { reps: number; distance: number; recovery: number };
  recoveryPace?: { min: number; max: number };
}

export interface WeekPlan {
  weekNumber: number;
  phase: string;
  totalVolume: string;
  sessions: RunningSession[];
}

export interface CompletedRunningSession {
  id: string;
  weekNumber: number;
  sessionIndex: number;
  date: string;
  plannedDistance: number;
  actualDistance: number;
  actualDuration: number; // minutes
  avgPace: number; // min/km
  glucoseBefore: number | null;
  glucoseAfter: number | null;
  feeling: 'great' | 'good' | 'ok' | 'hard' | 'bad';
  notes: string;
}

export type MealTime = 'morning' | 'lunch' | 'snack' | 'dinner';
