import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { USER_PROFILE, DIABETES_CONFIG, DIABETES_PROFILES_DEFAULT, MUSCU_PROGRAM } from './constants';
import type { UserProfile, DiabetesConfig, InsulinLog, Meal, GlucoseReading, CompletedExercise, CompletedRunningSession, RatioProfile } from '@/types';

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
  // Multi-profils ratios (Phase 10a)
  setActiveRatioProfile: (profileId: string) => void;
  addRatioProfile: (profile: RatioProfile) => void;
  updateRatioProfile: (profileId: string, updates: Partial<RatioProfile>) => void;
  deleteRatioProfile: (profileId: string) => void;
  duplicateRatioProfile: (profileId: string, newName: string) => void;
  glucoseReadings: GlucoseReading[];
  addGlucoseReading: (reading: GlucoseReading) => void;
  insulinLogs: InsulinLog[];
  addInsulinLog: (log: InsulinLog) => void;
  removeInsulinLog: (id: string) => void;

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
      updateDiabetesConfig: (updates) => set((s) => {
        const next = { ...s.diabetesConfig, ...updates };
        // Si l'update touche les flat fields (ratios, insulinRatios, ISF),
        // on répercute aussi dans le profil actif pour rester cohérent.
        const touchesFlat =
          updates.ratios !== undefined ||
          updates.insulinRatios !== undefined ||
          updates.insulinSensitivityFactor !== undefined;
        if (touchesFlat) {
          next.profiles = next.profiles.map((p) =>
            p.id === next.activeProfileId
              ? {
                  ...p,
                  ratios: next.ratios,
                  insulinRatios: next.insulinRatios,
                  insulinSensitivityFactor: next.insulinSensitivityFactor,
                }
              : p,
          );
        }
        return { diabetesConfig: next };
      }),

      // Multi-profils ratios (Phase 10a) ────────────────────────────────────
      // Bascule le profil actif : on met à jour activeProfileId ET on copie
      // les valeurs du profil vers les champs flat (ratios/insulinRatios/ISF)
      // pour que tous les consumers existants les voient. On met aussi à
      // jour profile.basalDose pour que le Profil affiche la bonne valeur.
      setActiveRatioProfile: (profileId) => set((s) => {
        const target = s.diabetesConfig.profiles.find((p) => p.id === profileId);
        if (!target) return {};
        return {
          diabetesConfig: {
            ...s.diabetesConfig,
            activeProfileId: target.id,
            ratios: { ...target.ratios },
            insulinRatios: target.insulinRatios.map((r) => ({ ...r })),
            insulinSensitivityFactor: target.insulinSensitivityFactor,
          },
          profile: { ...s.profile, basalDose: target.basalDose },
        };
      }),
      addRatioProfile: (profile) => set((s) => ({
        diabetesConfig: {
          ...s.diabetesConfig,
          profiles: [...s.diabetesConfig.profiles, profile],
        },
      })),
      updateRatioProfile: (profileId, updates) => set((s) => {
        const updatedProfiles = s.diabetesConfig.profiles.map((p) =>
          p.id === profileId ? { ...p, ...updates } : p,
        );
        const isActive = s.diabetesConfig.activeProfileId === profileId;
        const active = updatedProfiles.find((p) => p.id === profileId);
        if (isActive && active) {
          // Resync les miroirs pour le profil actif
          return {
            diabetesConfig: {
              ...s.diabetesConfig,
              profiles: updatedProfiles,
              ratios: { ...active.ratios },
              insulinRatios: active.insulinRatios.map((r) => ({ ...r })),
              insulinSensitivityFactor: active.insulinSensitivityFactor,
            },
            profile: { ...s.profile, basalDose: active.basalDose },
          };
        }
        return {
          diabetesConfig: { ...s.diabetesConfig, profiles: updatedProfiles },
        };
      }),
      deleteRatioProfile: (profileId) => set((s) => {
        // Garde-fou : impossible de supprimer le dernier profil ou le profil actif.
        if (s.diabetesConfig.profiles.length <= 1) return {};
        if (s.diabetesConfig.activeProfileId === profileId) return {};
        return {
          diabetesConfig: {
            ...s.diabetesConfig,
            profiles: s.diabetesConfig.profiles.filter((p) => p.id !== profileId),
          },
        };
      }),
      duplicateRatioProfile: (profileId, newName) => set((s) => {
        const source = s.diabetesConfig.profiles.find((p) => p.id === profileId);
        if (!source) return {};
        const newId = `prof-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const cloned: RatioProfile = {
          ...source,
          id: newId,
          name: newName,
          insulinRatios: source.insulinRatios.map((r) => ({
            ...r,
            id: `${r.id}-copy-${Date.now().toString(36)}`,
          })),
          createdAt: new Date().toISOString(),
        };
        return {
          diabetesConfig: {
            ...s.diabetesConfig,
            profiles: [...s.diabetesConfig.profiles, cloned],
          },
        };
      }),

      glucoseReadings: [],
      addGlucoseReading: (reading) => set((s) => ({ glucoseReadings: [reading, ...s.glucoseReadings].slice(0, 500) })),
      insulinLogs: [],
      addInsulinLog: (log) => set((s) => ({
        // Tag automatique avec le profil actif si non fourni (Phase 10a).
        insulinLogs: [
          { ...log, profileId: log.profileId ?? s.diabetesConfig.activeProfileId },
          ...s.insulinLogs,
        ].slice(0, 500),
      })),
      removeInsulinLog: (id) => set((s) => ({
        insulinLogs: s.insulinLogs.filter((log) => log.id !== id),
      })),

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
      version: 3,
      // Migration v1 → v2 : force-update des ratios insuline Ethan.
      // Migration v2 → v3 : introduction multi-profils ratios (Phase 10a).
      // Les valeurs actuelles deviennent le profil "Par défaut" et on ajoute
      // les profils "Sèche" et "PDM" (clones du défaut à ajuster par l'user).
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown> | null;
        if (!state) return state;

        // ─── v1 → v2 : fix ratios legacy "1:5, 1:7, 1:9" ─────────────────
        if (version < 2) {
          const cfg = state.diabetesConfig as DiabetesConfig | undefined;
          if (cfg) {
            const lunchOld = cfg.ratios?.lunch;
            const morningOld = cfg.ratios?.morning;
            const looksLegacy =
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

        // ─── v2 → v3 : multi-profils ratios (Phase 10a) ──────────────────
        if (version < 3) {
          const cfg = state.diabetesConfig as DiabetesConfig | undefined;
          const userProfile = state.profile as UserProfile | undefined;
          if (cfg && !cfg.profiles) {
            // Wrap les valeurs actuelles dans un profil "Par défaut" qui
            // reprend exactement ce que l'user avait (ratios, ISF, basal).
            const currentAsDefault: RatioProfile = {
              id: 'prof-default',
              name: 'Par défaut',
              description: 'Ratios courants — à utiliser hors phase spécifique.',
              ratios: cfg.ratios
                ? { ...cfg.ratios }
                : { ...DIABETES_CONFIG.ratios },
              insulinRatios: (cfg.insulinRatios ?? DIABETES_CONFIG.insulinRatios).map((r) => ({ ...r })),
              insulinSensitivityFactor:
                cfg.insulinSensitivityFactor ??
                DIABETES_CONFIG.insulinSensitivityFactor,
              basalDose: userProfile?.basalDose ?? 26,
              createdAt: new Date().toISOString(),
            };
            // Clone pour Sèche (basal -1U) et PDM (basal +1U) comme points
            // de départ. L'utilisateur ajustera selon son endo.
            const cutProfile: RatioProfile = {
              ...currentAsDefault,
              id: 'prof-cut',
              name: 'Sèche',
              description: 'Déficit calorique. Glucides réduits, basal légèrement plus bas.',
              basalDose: Math.max(0, currentAsDefault.basalDose - 1),
              insulinRatios: currentAsDefault.insulinRatios.map((r) => ({
                ...r,
                id: r.id.replace(/^r-default-/, 'r-cut-'),
              })),
              createdAt: new Date().toISOString(),
            };
            const bulkProfile: RatioProfile = {
              ...currentAsDefault,
              id: 'prof-bulk',
              name: 'PDM',
              description: 'Prise de masse. Glucides élevés, basal légèrement plus haut.',
              basalDose: currentAsDefault.basalDose + 1,
              insulinRatios: currentAsDefault.insulinRatios.map((r) => ({
                ...r,
                id: r.id.replace(/^r-default-/, 'r-bulk-'),
              })),
              createdAt: new Date().toISOString(),
            };
            state.diabetesConfig = {
              ...cfg,
              profiles: [currentAsDefault, cutProfile, bulkProfile],
              activeProfileId: currentAsDefault.id,
              // Miroirs conservés pour rétrocompat
              ratios: currentAsDefault.ratios,
              insulinRatios: currentAsDefault.insulinRatios,
              insulinSensitivityFactor: currentAsDefault.insulinSensitivityFactor,
            } as DiabetesConfig;
          }
        }

        return state;
      },
    }
  )
);
