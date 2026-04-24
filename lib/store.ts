import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { USER_PROFILE, DIABETES_CONFIG, MUSCU_PROGRAM } from './constants';
import type { UserProfile, DiabetesConfig, InsulinLog, Meal, GlucoseReading, CompletedExercise, CompletedRunningSession } from '@/types';

interface CompletedWorkout {
  id: string;
  sessionId: string;
  date: string;
  exercises: CompletedExercise[];
  duration: number;
  glucoseBefore: number | null;
  glucoseAfter: number | null;
  recoveryScore: number | null;
  difficulty: number;
  notes: string;
}

export interface DiagnosticEntry {
  id: string;
  date: string;
  mensurations: Record<string, string>;
  longueurs: Record<string, string>;
  mobilite: Record<string, string>;
  historique: Record<string, string>;
  weakPoints: string[];
  photos: string[];
  analysis: { ratios: { label: string; value: number; ideal: string; status: string }[]; recommendations: string[] } | null;
  photoAnalysis: string | null;
}

export interface ProgramChange {
  id: string;
  date: string;
  programType: 'muscu' | 'running';
  triggerReason: string;
  changesSummary: string[];
  comparativeAnalysis: { aspect: string; before: string; after: string; reasoning: string }[];
  exerciseChanges: { oldExercise: string; newExercise: string; reason: string }[];
  volumeAdjustments: Record<string, { before: number; after: number; reason: string }>;
  priorities: { rank: number; muscle: string; reason: string }[];
  predictions: Record<string, string>;
  fullAnalysis: string;
  acknowledged: boolean;
}

// Active program (generated or static fallback)
export interface ActiveProgram {
  id: string;
  name: string;
  splitType: string;
  daysPerWeek: number;
  currentWeek: number;
  currentPhase: string;
  sessions: { id: string; name: string; day: string; focus: string; duration: number; exercises: { order: number; name: string; sets: number; reps: string; rir: number; rest: number; reasoning?: string; cues?: string[]; alternatives?: (string | { name: string; reason: string })[]; weight?: unknown }[]; notes?: unknown }[];
  volumeDistribution: Record<string, { setsPerWeek: number; status: string; justification: string }>;
  generationReasoning: string;
  generatedFrom: { morphologyDate?: string; muscuDiagDate?: string; bodyMapDate?: string };
  predictions: Record<string, string>;
  t1dProtocol: { preworkout: string; postworkout: string; alerts: string[] };
  createdAt: string;
  version: number;
  isGenerated: boolean; // true = AI-generated, false = static fallback
}

interface AppState {
  // User
  profile: UserProfile;
  updateProfile: (updates: Partial<UserProfile>) => void;

  // Diabetes
  diabetesConfig: DiabetesConfig;
  updateDiabetesConfig: (updates: Partial<DiabetesConfig>) => void;
  glucoseReadings: GlucoseReading[];
  addGlucoseReading: (reading: GlucoseReading) => void;
  insulinLogs: InsulinLog[];
  addInsulinLog: (log: InsulinLog) => void;

  // Nutrition
  meals: Meal[];
  addMeal: (meal: Meal) => void;

  // Muscu
  muscuProgram: typeof MUSCU_PROGRAM;
  completedWorkouts: CompletedWorkout[];
  addCompletedWorkout: (workout: CompletedWorkout) => void;

  // Active generated program
  activeProgram: ActiveProgram | null;
  setActiveProgram: (program: ActiveProgram | null) => void;
  hasActiveProgram: () => boolean;

  // Running
  currentRunningWeek: number;
  setRunningWeek: (week: number) => void;
  completedRunningSessions: CompletedRunningSession[];
  addCompletedRunningSession: (session: CompletedRunningSession) => void;
  deleteCompletedRunningSession: (id: string) => void;

  // Diagnostic
  diagnosticCompleted: boolean;
  setDiagnosticCompleted: (val: boolean) => void;
  diagnosticData: Record<string, unknown>;
  setDiagnosticData: (data: Record<string, unknown>) => void;

  // Diagnostic History
  diagnosticHistory: DiagnosticEntry[];
  addDiagnosticEntry: (entry: DiagnosticEntry) => void;

  // Program Changes
  programChanges: ProgramChange[];
  addProgramChange: (change: ProgramChange) => void;
  acknowledgeProgramChange: (id: string) => void;
  pendingProgramChanges: () => ProgramChange[];

  // Muscu Diagnostic
  muscuDiagnosticCompleted: boolean;
  muscuDiagnosticData: Record<string, unknown>;
  setMuscuDiagnosticData: (data: Record<string, unknown>) => void;
  generatedMuscuProgram: Record<string, unknown> | null;
  setGeneratedMuscuProgram: (program: Record<string, unknown> | null) => void;

  // Running Diagnostic
  runningDiagnosticCompleted: boolean;
  runningDiagnosticData: Record<string, unknown>;
  setRunningDiagnosticData: (data: Record<string, unknown>) => void;
  generatedRunningPlan: Record<string, unknown> | null;
  setGeneratedRunningPlan: (plan: Record<string, unknown> | null) => void;

  // Nutrition Diagnostic
  nutritionDiagnosticCompleted: boolean;
  nutritionDiagnosticData: Record<string, unknown> | null;
  setNutritionDiagnosticData: (data: Record<string, unknown> | null) => void;
  nutritionTargets: { calories: number; protein: number; carbs: number; fat: number } | null;
  setNutritionTargets: (targets: { calories: number; protein: number; carbs: number; fat: number } | null) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      profile: USER_PROFILE,
      updateProfile: (updates) => set((s) => ({ profile: { ...s.profile, ...updates } })),

      diabetesConfig: DIABETES_CONFIG,
      updateDiabetesConfig: (updates) => set((s) => ({ diabetesConfig: { ...s.diabetesConfig, ...updates } })),
      glucoseReadings: [],
      addGlucoseReading: (reading) => set((s) => ({ glucoseReadings: [reading, ...s.glucoseReadings].slice(0, 500) })),
      insulinLogs: [],
      addInsulinLog: (log) => set((s) => ({ insulinLogs: [log, ...s.insulinLogs].slice(0, 500) })),

      meals: [],
      addMeal: (meal) => set((s) => ({ meals: [meal, ...s.meals].slice(0, 500) })),

      muscuProgram: MUSCU_PROGRAM,
      completedWorkouts: [],
      addCompletedWorkout: (workout) => set((s) => ({ completedWorkouts: [workout, ...s.completedWorkouts] })),

      // Active generated program
      activeProgram: null,
      setActiveProgram: (program) => set({ activeProgram: program }),
      hasActiveProgram: () => false, // computed in selectors

      currentRunningWeek: 1,
      setRunningWeek: (week) => set({ currentRunningWeek: week }),
      completedRunningSessions: [],
      addCompletedRunningSession: (session) => set((s) => ({
        completedRunningSessions: [session, ...s.completedRunningSessions].slice(0, 500),
      })),
      deleteCompletedRunningSession: (id) => set((s) => ({
        completedRunningSessions: s.completedRunningSessions.filter((r) => r.id !== id),
      })),

      diagnosticCompleted: false,
      setDiagnosticCompleted: (val) => set({ diagnosticCompleted: val }),
      diagnosticData: {},
      setDiagnosticData: (data) => set({ diagnosticData: data }),

      // Diagnostic History
      diagnosticHistory: [],
      addDiagnosticEntry: (entry) => set((s) => ({
        diagnosticHistory: [entry, ...s.diagnosticHistory].slice(0, 50),
      })),

      // Program Changes
      programChanges: [],
      addProgramChange: (change) => set((s) => ({
        programChanges: [change, ...s.programChanges].slice(0, 100),
      })),
      acknowledgeProgramChange: (id) => set((s) => ({
        programChanges: s.programChanges.map((c) =>
          c.id === id ? { ...c, acknowledged: true } : c
        ),
      })),
      pendingProgramChanges: () => {
        return [];
      },

      // Muscu Diagnostic
      muscuDiagnosticCompleted: false,
      muscuDiagnosticData: {},
      setMuscuDiagnosticData: (data) => set({ muscuDiagnosticData: data, muscuDiagnosticCompleted: true }),
      generatedMuscuProgram: null,
      setGeneratedMuscuProgram: (program) => set({ generatedMuscuProgram: program }),

      // Running Diagnostic
      runningDiagnosticCompleted: false,
      runningDiagnosticData: {},
      setRunningDiagnosticData: (data) => set({ runningDiagnosticData: data, runningDiagnosticCompleted: true }),
      generatedRunningPlan: null,
      setGeneratedRunningPlan: (plan) => set({ generatedRunningPlan: plan }),

      // Nutrition Diagnostic
      nutritionDiagnosticCompleted: false,
      nutritionDiagnosticData: null,
      setNutritionDiagnosticData: (data) => set({ nutritionDiagnosticData: data, nutritionDiagnosticCompleted: !!data }),
      nutritionTargets: null,
      setNutritionTargets: (targets) => set({ nutritionTargets: targets }),
    }),
    {
      name: 'apex-coach-storage',
      version: 2,
      // Migration v1 → v2 : force-update des ratios insuline Ethan.
      // Les anciennes installations avaient les valeurs pré-Phase 5
      // (morning ≈ 5, lunch ≈ 7, dinner ≈ 9 gPerU) qui correspondent
      // au vieux format "1:5, 1:7, 1:9" et donnent des bolus incorrects
      // (ex: 60g × 1/7 = 8.57U au lieu de 6U à 1U/10g).
      // On détecte les vieilles valeurs et on réimporte DIABETES_CONFIG
      // sans toucher au reste du state (glucose, injections, etc.).
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown> | null;
        if (!state) return state;
        if (version < 2) {
          const cfg = state.diabetesConfig as DiabetesConfig | undefined;
          if (cfg) {
            const lunchOld = cfg.ratios?.lunch;
            const morningOld = cfg.ratios?.morning;
            const looksLegacy =
              // heuristique : si lunch < 9 (donc >1.1 U/10g), on est en
              // mode legacy "1:7" → on écrase avec les bonnes valeurs.
              typeof lunchOld === 'number' && lunchOld < 9 ||
              typeof morningOld === 'number' && morningOld < 6;
            if (looksLegacy) {
              state.diabetesConfig = {
                ...cfg,
                ratios: { ...DIABETES_CONFIG.ratios },
                insulinRatios: [...DIABETES_CONFIG.insulinRatios],
                insulinSensitivityFactor: DIABETES_CONFIG.insulinSensitivityFactor,
              };
            } else if (!cfg.ratios?.snack) {
              // Ajoute snack si absent (nouveau champ Phase 9)
              state.diabetesConfig = {
                ...cfg,
                ratios: {
                  ...cfg.ratios,
                  snack: DIABETES_CONFIG.ratios.snack,
                } as DiabetesConfig['ratios'],
              };
            }
          }
        }
        return state;
      },
    }
  )
);
