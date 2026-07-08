/**
 * Docteur — assemblage du payload borné envoyé à Claude.
 *
 * Pure function : reprend exactement la préparation de contexte de
 * `app/api/diabete/weekly-insight/route.ts` (rapport déterministe
 * `buildWeeklyReport` + patterns/sport/repas cappés) — jamais la donnée
 * brute non filtrée. La lecture KV (`readPoints`) reste dans la route.
 */

import {
  buildWeeklyReport,
  type WeeklyReport,
} from "@/lib/glucose-archive/analytics";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import type { InsulinLog } from "@/types";

/** Pattern détecté par le moteur déterministe (Phase 11 Bloc 3). */
export interface ClientDetectedPattern {
  type: string;
  severity: string;
  title: string;
  message: string;
  occurrences: number;
  timeWindow: string;
  suggestion: string;
}

/** Séance sport (depuis store muscu/running). */
export interface WorkoutSummary {
  date: string; // ISO
  type: "muscu" | "running";
  startTime?: string;
  durationMin: number;
}

/** Résumé d'un repas tagué. */
export interface MealContextEntry {
  mealType: string;
  mealTag?: string;
  mealSize?: string;
  carbsGrams: number;
  fatGrams?: number;
  proteinGrams?: number;
  injectedAt: string;
  glucoseBefore: number;
}

export interface DoctorContextInput {
  points: ArchivedPoint[];
  injections: InsulinLog[];
  range: { fromMs: number; toMs: number; days: number };
  detectedPatterns?: ClientDetectedPattern[];
  workoutSessions?: WorkoutSummary[];
  mealContext?: MealContextEntry[];
  activeProfileName?: string;
}

export interface DoctorContext {
  report: WeeklyReport;
  /** Payload compact injecté dans le prompt (agrégats, pas de raw data). */
  payload: Record<string, unknown>;
}

export function buildDoctorContext(input: DoctorContextInput): DoctorContext {
  const { points, range } = input;
  const { fromMs, toMs } = range;

  // Normalize injections (timestamps peuvent être Date | string)
  const injections = (input.injections ?? [])
    .map((log) => {
      const t =
        log.injectedAt instanceof Date
          ? log.injectedAt.getTime()
          : new Date(log.injectedAt).getTime();
      return {
        t,
        units: log.units,
        mealType: log.mealType,
        carbsGrams: log.carbsGrams,
        profileId: log.profileId,
      };
    })
    .filter((i) => Number.isFinite(i.t) && i.t >= fromMs && i.t <= toMs);

  const report = buildWeeklyReport({ points, injections, range });

  // Capping identique à weekly-insight (Phase 11 Bloc 5)
  const detectedPatterns = (input.detectedPatterns ?? []).slice(0, 6);

  const workoutSessions = (input.workoutSessions ?? [])
    .filter((w) => {
      const t = new Date(w.date).getTime();
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 30);

  const mealContext = (input.mealContext ?? [])
    .filter((m) => {
      const t = new Date(m.injectedAt).getTime();
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    })
    .sort(
      (a, b) =>
        new Date(b.injectedAt).getTime() - new Date(a.injectedAt).getTime(),
    )
    .slice(0, 40);

  const payload = {
    range: report.range,
    profileActif: input.activeProfileName ?? "inconnu",
    pointsCount: report.pointsCount,
    injectionsCount: report.injectionsCount,
    overall: report.overall,
    byTimeBucket: report.byTimeBucket,
    riskyHours: report.riskyHours,
    postMeal: report.postMeal,
    hypoEventsCount: report.hypoEvents.length,
    hyperEventsCount: report.hyperEvents.length,
    hypoEvents: report.hypoEvents.slice(0, 3).map((e) => ({
      durationMin: e.durationMin,
      minValue: e.minValue,
      startMs: e.startMs,
    })),
    hyperEvents: report.hyperEvents.slice(0, 3).map((e) => ({
      durationMin: e.durationMin,
      maxValue: e.maxValue,
      startMs: e.startMs,
    })),
    byProfile: report.byProfile,
    detectedPatterns,
    workoutSessions,
    mealContext,
  };

  return { report, payload };
}
