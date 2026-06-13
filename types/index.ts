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
  // ─── Phase 11 — Meal context ────────────────────────────────────────
  /** Lipides du repas en grammes (optionnel — copié depuis Yazio). */
  fatGrams?: number;
  /** Protéines du repas en grammes (optionnel). */
  proteinGrams?: number;
  /** Quick-tag visuel du repas (ex: "pates", "pizza", "snack-sucre"…). */
  mealTag?: string;
  /** Taille du repas (multiplie les valeurs moyennes du tag). */
  mealSize?: 'normal' | 'big' | 'huge';
  /** Tendance Libre au moment de l'injection (Abbott numérique 1..5). */
  trendArrow?: number;
  /** True si c'est la 2e injection d'un split (FPU). */
  isSplitDose?: boolean;
  /** Lien vers la 1re injection si split. */
  parentInjectionId?: string;
}

/**
 * Rappel programmé pour la seconde injection d'un split dose (FPU).
 * Persisté côté client (Zustand persist) — le service worker peut lire
 * cette structure pour déclencher une notification approximative.
 */
export interface SplitDoseReminder {
  id: string;
  parentInjectionId: string;
  units: number;
  triggerAt: string;        // ISO timestamp
  createdAt: string;        // ISO
  mealLabel?: string;       // ex: "pâtes", "pizza"
  /** "pending" | "fired" | "dismissed" — pour ne pas re-tirer le rappel */
  status: 'pending' | 'fired' | 'dismissed';
}

/**
 * Repas déclaré à la main en cours de digestion (Night Brain, juin 2026).
 *
 * Permet à Ethan de dire « voilà ce que j'ai actuellement dans le ventre »
 * (glucides/lipides/protéines + insuline prise) pour que le plan nuit en
 * tienne compte et alerte s'il a trop mangé pour son insuline.
 */
export interface ManualDigestion {
  carbsGrams: number;
  fatGrams: number;
  proteinGrams: number;
  /** Insuline prise pour ce repas (U). 0 si rien (ex: glucides d'hypo). */
  insulinUnits: number;
  /** ISO du moment où il a commencé à manger. */
  eatenAt: string;
}

/**
 * Hypoglycemia event — Phase H (juin 2026).
 *
 * Trace une hypo et son re-sucrage pour permettre :
 *  - L'apprentissage du GRG perso (Glucose Response per Gram)
 *  - Le feedback "tu as bien fait" / "trop" / "pas assez"
 *  - L'amélioration des recommandations futures
 */
export interface HypoEvent {
  id: string;
  /** ISO du moment où l'hypo a été détectée (ou loggée). */
  detectedAt: string;
  /** Glycémie initiale (au moment du re-sucrage). */
  initialGlucose: number;
  /** Grammes de glucides consommés au re-sucrage. */
  carbsConsumed: number;
  /** ISO du moment du re-sucrage. */
  consumedAt: string;
  /** Checkpoints glycémie auto-trackés (en mg/dL) ou null si pas encore. */
  glucoseAt15min: number | null;
  glucoseAt30min: number | null;
  glucoseAt45min: number | null;
  glucoseAt60min: number | null;
  /** Pic glycémique atteint entre T+15 et T+90 (auto). */
  peakGlucose: number | null;
  /** Évaluation auto à T+60 :
   *  - 'pending'     : pas encore évalué (avant T+60)
   *  - 'just-right'  : glycémie remontée en cible 90-160 sans over-correction
   *  - 'too-much'    : pic > 180 → tu as mangé trop
   *  - 'too-little'  : encore < 80 à T+30 → pas assez
   *  - 'unknown'     : pas assez de data (capteur down, etc.)
   */
  assessment: 'pending' | 'just-right' | 'too-much' | 'too-little' | 'unknown';
  notes?: string;
  // ── Contexte au moment de la détection (anti-pollution GRG) ──────────
  /** IOB en U au moment du re-sucrage. Optional pour compat anciennes hypos. */
  iobAtDetection?: number;
  /** Minutes depuis le dernier bolus repas (null si > 6h ou aucun). */
  lastBolusMinutesAgo?: number | null;
  /** Units du dernier bolus repas (pour contexte). */
  lastBolusUnits?: number | null;
  /** Contexte auto-classé :
   *  - 'normal'       : hypo "vraie" (IOB faible, pas de bolus récent), utilisée pour le GRG
   *  - 'over-bolus'   : IOB ou bolus récent suspect → exclue par défaut du GRG
   *  - 'post-exercise': hypo post-sport (sensibilité accrue) → exclue par défaut
   *  - 'unknown'      : pas d'info, inclus par défaut
   */
  context?: 'normal' | 'over-bolus' | 'post-exercise' | 'unknown';
  /** Si true → exclu du calcul du GRG perso (auto ou choix utilisateur). */
  excludeFromLearning?: boolean;
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

/**
 * Checkpoint glycémie capturé pendant une séance GPS (Phase C).
 * Stocké dans la session pour permettre :
 *  - Replay coloré sur la carte (polyline segmentée)
 *  - Graphique glycémie post-séance
 *  - Enrichissement direct de SportGlucoseCorrelation (Bloc 6)
 */
export interface SessionGlucoseCheckpoint {
  /** Label sémantique : "T+0", "T+5min", "Km 1", "Km 2", "Pause", "T+30min post"… */
  label: string;
  /** Offset en secondes depuis le début de la séance. */
  offsetSec: number;
  /** Glycémie en mg/dL. */
  value: number;
  /** Timestamp ms absolu. */
  timestamp: number;
  /** Distance cumulée en mètres au moment du checkpoint (0 si pré-séance). */
  distanceMeters: number;
  /** Trend Libre numérique (1=↓↓ ... 5=↑↑) si dispo. */
  trend?: number;
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
  /** Phase C — points GPS bruts pour replay (optionnel, peut être lourd). */
  gpsPoints?: {
    lat: number;
    lon: number;
    altitude: number | null;
    accuracy: number;
    t: number;
  }[];
  /** Phase C — checkpoints glycémie capturés pendant la séance. */
  glucoseCheckpoints?: SessionGlucoseCheckpoint[];
  /** Phase C — dénivelé positif cumulé en mètres (si altitude dispo). */
  elevationGainM?: number;
}

export type MealTime = 'morning' | 'lunch' | 'snack' | 'dinner' | 'other';
