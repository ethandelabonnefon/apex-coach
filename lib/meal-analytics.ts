/**
 * Meal-tag analytics — Phase 11 Bloc 2.3.
 *
 * Pure function : croise les `InsulinLog[]` (tagués `mealTag`) avec les
 * points archive glucose pour calculer pour un type de repas donné :
 *   - delta moyen à T+2h et T+4h post-bolus
 *   - pic moyen
 *   - suggestion contextuelle ("envisage un split dose")
 *
 * Utilisée côté client : la page `/diabete` fetch `/api/glucose/archive?days=30`
 * + lit le store Zustand pour avoir injections + points, puis appelle cette
 * fonction au moment où un meal tag est sélectionné dans le calculateur.
 */

import type { InsulinLog } from "@/types";
import { isLearnable, resolveFat, resolveProtein } from "./insulin-log-values";

export interface ArchivePoint {
  t: number;          // timestamp ms
  value: number;      // mg/dL
  trend?: string;
  isHigh?: boolean;
  isLow?: boolean;
}

export interface MealTypeHistory {
  count: number;            // nombre d'occurrences trouvées (>= limit)
  avgDeltaAtT2h: number | null;
  avgDeltaAtT4h: number | null;
  avgPeak: number | null;
  suggestion: string | null;
  /** Tag analysé (echo). */
  mealTag: string;
}

const T_PLUS_2H_MS = 2 * 60 * 60 * 1000;
const T_PLUS_4H_MS = 4 * 60 * 60 * 1000;
const PEAK_WINDOW_MS = 4 * 60 * 60 * 1000; // pic dans les 4h post-bolus
const SAMPLE_TOLERANCE_MS = 20 * 60 * 1000; // ±20min pour matcher un point archive

/** Cherche le point d'archive le plus proche d'un targetMs (dans la tolérance). */
function findClosestPoint(points: ArchivePoint[], targetMs: number, tolerance: number = SAMPLE_TOLERANCE_MS): ArchivePoint | null {
  let best: ArchivePoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const delta = Math.abs(p.t - targetMs);
    if (delta <= tolerance && delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }
  return best;
}

/** Pic glycémique sur la fenêtre [startMs, startMs+windowMs]. */
function findPeak(points: ArchivePoint[], startMs: number, windowMs: number = PEAK_WINDOW_MS): number | null {
  let peak: number | null = null;
  for (const p of points) {
    if (p.t >= startMs && p.t <= startMs + windowMs) {
      if (peak === null || p.value > peak) peak = p.value;
    }
  }
  return peak;
}

export function getMealTypeHistory(
  insulinLogs: InsulinLog[],
  archivePoints: ArchivePoint[],
  mealTag: string,
  limit: number = 5,
): MealTypeHistory {
  // Filtrer les injections du tag, les plus récentes en premier, garder les N
  const tagged = insulinLogs
    .filter((log) => log.mealTag === mealTag && !log.isSplitDose && isLearnable(log))
    .map((log) => ({ ...log, ts: new Date(log.injectedAt).getTime() }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);

  const empty: MealTypeHistory = {
    count: 0,
    avgDeltaAtT2h: null,
    avgDeltaAtT4h: null,
    avgPeak: null,
    suggestion: null,
    mealTag,
  };

  if (tagged.length === 0) return empty;

  const deltas2h: number[] = [];
  const deltas4h: number[] = [];
  const peaks: number[] = [];

  for (const inj of tagged) {
    const baseline = inj.glucoseBefore;
    if (!baseline || baseline <= 0) continue;

    const p2h = findClosestPoint(archivePoints, inj.ts + T_PLUS_2H_MS);
    if (p2h) deltas2h.push(p2h.value - baseline);

    const p4h = findClosestPoint(archivePoints, inj.ts + T_PLUS_4H_MS);
    if (p4h) deltas4h.push(p4h.value - baseline);

    const peak = findPeak(archivePoints, inj.ts);
    if (peak !== null) peaks.push(peak);
  }

  const avg = (arr: number[]): number | null =>
    arr.length === 0 ? null : Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);

  const result: MealTypeHistory = {
    count: tagged.length,
    avgDeltaAtT2h: avg(deltas2h),
    avgDeltaAtT4h: avg(deltas4h),
    avgPeak: avg(peaks),
    suggestion: null,
    mealTag,
  };

  // ─── Suggestion contextuelle ───────────────────────────────────────
  // Logique simple : si delta T+4h est >= +60 mg/dL, le ratio classique
  // ne couvre pas la digestion lente → suggestion split dose. Si T+2h
  // est très haut (≥ +80), c'est un sous-dosage du ratio (pas de FPU).
  if (result.avgDeltaAtT4h !== null && result.avgDeltaAtT4h >= 60) {
    result.suggestion = `Tes ${tagged.length} derniers '${mealTag}' : +${result.avgDeltaAtT4h} mg/dL en moyenne à T+4h → envisage un split dose pour couvrir la digestion lente.`;
  } else if (result.avgDeltaAtT2h !== null && result.avgDeltaAtT2h >= 80) {
    result.suggestion = `Tes ${tagged.length} derniers '${mealTag}' : +${result.avgDeltaAtT2h} mg/dL à T+2h → ton ratio actuel sous-dose ces repas.`;
  } else if (result.avgPeak !== null && result.avgPeak >= 220) {
    result.suggestion = `Tes ${tagged.length} derniers '${mealTag}' : pic moyen à ${result.avgPeak} mg/dL → essaie un pré-bolus 15min avant.`;
  }

  return result;
}

// ─── Phase 11 — Auto-calibration personnelle des macros par tag ──────
// Moyennes des macros (lipides/protéines) saisies réellement par
// l'utilisateur pour un meal-tag donné. Permet d'auto-suggérer ses
// vraies valeurs perso au lieu des presets statistiques.

export interface AvgMacrosForTag {
  count: number;            // nb d'occurrences avec macros renseignées
  avgFat: number | null;
  avgProtein: number | null;
}

export function getAvgMacrosForTag(
  insulinLogs: InsulinLog[],
  mealTag: string,
  limit: number = 5,
): AvgMacrosForTag {
  const tagged = insulinLogs
    .filter((log) =>
      log.mealTag === mealTag &&
      !log.isSplitDose &&
      isLearnable(log) &&
      // Au moins une macro renseignée pour compter — sur les valeurs
      // confirmées si elles existent, c'est la moyenne de ce qu'Ethan a
      // VRAIMENT mangé qu'on lui propose de réutiliser.
      (resolveFat(log) > 0 || resolveProtein(log) > 0)
    )
    .map((log) => ({ ...log, ts: new Date(log.injectedAt).getTime() }))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, limit);

  if (tagged.length === 0) {
    return { count: 0, avgFat: null, avgProtein: null };
  }

  const fats = tagged.map(resolveFat);
  const prots = tagged.map(resolveProtein);

  return {
    count: tagged.length,
    avgFat: Math.round(fats.reduce((s, v) => s + v, 0) / tagged.length),
    avgProtein: Math.round(prots.reduce((s, v) => s + v, 0) / tagged.length),
  };
}
