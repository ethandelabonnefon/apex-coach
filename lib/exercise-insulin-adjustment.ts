/**
 * Exercise → Insulin Sensitivity adjustment — Phase F (mai 2026).
 *
 * Modélise l'effet "insulin sensitivity ↑" post-exercice qui dure 12-24h
 * après une séance et expose une fonction qui calcule la réduction du
 * bolus à appliquer.
 *
 * Sources scientifiques :
 *  - Riddell & Zaharieva (2017) — Insulin Management Strategies for Exercise
 *  - Frontiers in Endocrinology (2022) — Exercise timing implications T1D
 *  - UCLA Health T1D Exercise Guidelines
 *
 * Mapping strain → réduction bolus (cf doc CLAUDE.md) :
 *   Strain < 6       → 0%   (récup, pas d'effet)
 *   Strain 6-9       → -15% sur 6h
 *   Strain 10-13     → -25% sur 12h (cas standard running 45-60min)
 *   Strain 14-17     → -40% sur 18h (tempo / intervals / longue sortie)
 *   Strain 18+       → -50% sur 24h (très intense / overreaching)
 *
 * Décroissance dans la fenêtre :
 *   0-2h post-exercice  : 100% de la réduction
 *   2-6h                : 75%
 *   6-12h               : 50%
 *   12-24h              : 25%
 *   > window            : 0%
 *
 * ⚠️ Pure function. Aucun import serveur.
 */

import type { GpsPoint } from "@/lib/running-tracker";
import { totalDistance } from "@/lib/running-tracker";

/** Source de la séance détectée (utilisée pour l'UI). */
export type ExerciseSource = "running" | "muscu" | "cardio-other";

/**
 * Mapping nom de sport Whoop → catégorie APEX.
 * Whoop fournit `sport_name` (string libre) ; on classe en 3 catégories.
 *
 * - "running" : effet sensibilité ↑ marqué (running, trail)
 * - "cardio-other" : effet sensibilité ↑ similaire au running (cycling,
 *   swimming, rowing, HIIT cardio…)
 * - "muscu" : effet sensibilité quasi-nul à modéré selon durée/intensité
 *   (weightlifting, functional fitness, strength training, powerlifting)
 *
 * Référence : Yardley et al., Diabetes Care 2013 — sensibilité insuline
 * UNCHANGED à 12h ET 36h après résistance (vs marquée après cardio).
 */
export function classifySport(sportName: string | null | undefined): ExerciseSource {
  if (!sportName) return "cardio-other";
  const s = sportName.toLowerCase();
  // Running et trail
  if (/run|jog|trail/.test(s)) return "running";
  // Muscu / résistance
  if (/weight|strength|powerlift|crossfit|functional|hyrox|lifting|gym/.test(s)) {
    return "muscu";
  }
  // Cardio autres (vélo, natation, rameur, HIIT cardio, elliptical…)
  if (/cycl|bike|swim|row|elliptical|stair|cardio|hiit|interval/.test(s)) {
    return "cardio-other";
  }
  // Yoga / pilates / etc. — peu d'effet glycémique
  if (/yoga|pilates|stretch|mobility/.test(s)) return "muscu";
  // Fallback : cardio (plus prudent côté anti-hypo)
  return "cardio-other";
}

export interface RecentExercise {
  source: ExerciseSource;
  /** Timestamp ms de fin de séance. */
  endedAtMs: number;
  /** Durée en minutes. */
  durationMin: number;
  /** Strain estimé (0-21). Calculé depuis durée + intensité si pas fourni. */
  strain: number;
  /** Si fourni directement par Whoop, marquer la source pour transparence. */
  strainSource: "whoop" | "estimated";
}

export interface ExerciseAdjustment {
  /** Pourcentage de réduction à appliquer (0-50). */
  reductionPct: number;
  /** Heures écoulées depuis la fin de séance. */
  hoursAgo: number;
  /** Source de la séance (pour UI). */
  source: ExerciseSource;
  /** Durée de la séance en minutes (pour UI / debug). */
  durationMin: number;
  strain: number;
  strainSource: "whoop" | "estimated";
  /** Durée totale de la fenêtre d'effet en heures. */
  windowHours: number;
  /** % de la réduction actuelle vs réduction max (pour UI). */
  decayPct: number;
  /** Coefficient sport appliqué (0.1-1.0). UI peut expliquer "muscu = effet ↓". */
  sportFactor: number;
}

// ───────────────────────────────────────────────────────────────────────
// Estimation du strain quand on n'a pas Whoop
// ───────────────────────────────────────────────────────────────────────

/**
 * Estime un strain équivalent Whoop depuis durée + type de sport +
 * éventuellement variation glycémique observée pendant la séance.
 *
 * Heuristique conservative validée sur les retours T1D :
 *  - Plus long = plus de strain (logarithmique)
 *  - Running > muscu en strain cardiovasculaire pour durée égale
 *  - Si la glycémie a chuté >50 mg/dL pendant → intensité réelle élevée
 */
export function estimateStrain(
  source: ExerciseSource,
  durationMin: number,
  glucoseDeltaDuringSession?: number,
): number {
  // Base selon durée (log pour refléter la nature Whoop)
  let base: number;
  if (durationMin < 20) base = 6;
  else if (durationMin < 35) base = 9;
  else if (durationMin < 50) base = 12;
  else if (durationMin < 70) base = 14;
  else if (durationMin < 90) base = 16;
  else base = 18;

  // Bonus intensité selon source (running = cardio + intense)
  if (source === "running") base += 0;
  else if (source === "muscu") base -= 2;

  // Ajustement intensité basé sur la chute glycémie observée
  // (plus la chute est forte, plus l'effort est intense)
  if (glucoseDeltaDuringSession !== undefined) {
    if (glucoseDeltaDuringSession < -80) base += 3;
    else if (glucoseDeltaDuringSession < -50) base += 2;
    else if (glucoseDeltaDuringSession < -20) base += 1;
    else if (glucoseDeltaDuringSession > 30) base -= 1; // monte = anaérobie peut-être
  }

  return Math.max(4, Math.min(21, base));
}

/**
 * Calcule le delta glycémie pendant une séance running depuis ses
 * checkpoints (Phase C). Renvoie undefined si pas assez de checkpoints.
 */
export function glucoseDeltaFromCheckpoints(
  checkpoints: { value: number; offsetSec: number }[],
): number | undefined {
  if (checkpoints.length < 2) return undefined;
  const sorted = [...checkpoints].sort((a, b) => a.offsetSec - b.offsetSec);
  return sorted[sorted.length - 1].value - sorted[0].value;
}

// ───────────────────────────────────────────────────────────────────────
// Mapping strain → réduction + décroissance dans la fenêtre
// ───────────────────────────────────────────────────────────────────────

interface StrainBracket {
  minStrain: number;
  maxReductionPct: number;
  windowHours: number;
}

const STRAIN_BRACKETS: StrainBracket[] = [
  { minStrain: 18, maxReductionPct: 50, windowHours: 24 },
  { minStrain: 14, maxReductionPct: 40, windowHours: 18 },
  { minStrain: 10, maxReductionPct: 25, windowHours: 12 },
  { minStrain: 6,  maxReductionPct: 15, windowHours: 6  },
  { minStrain: 0,  maxReductionPct: 0,  windowHours: 0  },
];

function bracketForStrain(strain: number): StrainBracket {
  for (const b of STRAIN_BRACKETS) {
    if (strain >= b.minStrain) return b;
  }
  return STRAIN_BRACKETS[STRAIN_BRACKETS.length - 1];
}

/**
 * Coefficient de décroissance dans la fenêtre post-exercice.
 * 0-2h → 1.0  /  2-6h → 0.75  /  6-12h → 0.5  /  12-24h → 0.25  / > 24h → 0
 */
function decayCoefficient(hoursAgo: number, windowHours: number): number {
  if (hoursAgo < 0 || hoursAgo > windowHours) return 0;
  if (hoursAgo <= 2) return 1.0;
  if (hoursAgo <= 6) return 0.75;
  if (hoursAgo <= 12) return 0.5;
  return 0.25;
}

/**
 * Coefficient multiplicatif selon le type de sport (Phase F2 fix, juin 2026).
 *
 * Yardley et al. Diabetes Care 2013 : la résistance ne modifie PAS la
 * sensibilité insuline à 12h ni 36h post-exercice (vs marquée pour cardio).
 * Catécholamines + glycogénolyse hépatique → la muscu peut même faire
 * monter la glycémie pendant et juste après.
 *
 * Donc on applique un facteur sport :
 *   - Running : 1.0 (effet plein, mapping strain → réduction direct)
 *   - Cardio-other (vélo, swim, etc.) : 1.0 (similaire au running)
 *   - Muscu < 45min : 0.1 (quasi nul, anti-hypo négligeable)
 *   - Muscu 45-75min : 0.25 (effet limité)
 *   - Muscu > 75min OU strain Whoop ≥ 16 : 0.5 (effet modéré, séance
 *     vraiment longue ou très intense → composante "cardio" non
 *     négligeable type CrossFit / HIIT muscu)
 */
export function getSportFactor(
  source: ExerciseSource,
  durationMin: number,
  strain: number,
): number {
  if (source === "running" || source === "cardio-other") return 1.0;
  // Muscu : modulé par durée + intensité
  if (durationMin < 45) return 0.1;
  if (durationMin < 75 && strain < 16) return 0.25;
  return 0.5;
}

// ───────────────────────────────────────────────────────────────────────
// Fonction principale
// ───────────────────────────────────────────────────────────────────────

/**
 * Étant donné la séance la plus récente, calcule la réduction à
 * appliquer au bolus actuel. Renvoie null s'il n'y a pas de séance
 * pertinente (aucune dans les 24h ou strain < 6).
 *
 * @param exercise La séance la plus récente (peut être muscu ou running,
 *                 strain Whoop si dispo sinon estimé)
 * @param nowMs    Timestamp actuel (default Date.now())
 */
export function computeExerciseAdjustment(
  exercise: RecentExercise | null,
  nowMs: number = Date.now(),
): ExerciseAdjustment | null {
  if (!exercise) return null;
  const hoursAgo = Math.max(0, (nowMs - exercise.endedAtMs) / 3_600_000);
  const bracket = bracketForStrain(exercise.strain);
  if (bracket.maxReductionPct === 0) return null;
  if (hoursAgo > bracket.windowHours) return null;

  const decay = decayCoefficient(hoursAgo, bracket.windowHours);
  const sportFactor = getSportFactor(exercise.source, exercise.durationMin, exercise.strain);
  // Réduction = max × décroissance × facteur sport
  const reductionPct = Math.round(bracket.maxReductionPct * decay * sportFactor);
  if (reductionPct === 0) return null;

  return {
    reductionPct,
    hoursAgo: Math.round(hoursAgo * 10) / 10,
    source: exercise.source,
    durationMin: exercise.durationMin,
    strain: exercise.strain,
    strainSource: exercise.strainSource,
    windowHours: bracket.windowHours,
    decayPct: Math.round(decay * 100),
    sportFactor,
  };
}

/**
 * Helper qui détermine la séance la plus récente parmi muscu + running
 * dans les 24 dernières heures. Estime le strain si Whoop n'est pas
 * connecté.
 */
export function findMostRecentExercise(
  completedWorkouts: { id: string; date: string; duration: number }[],
  completedRunningSessions: {
    id: string;
    date: string;
    actualDuration: number;
    glucoseCheckpoints?: { value: number; offsetSec: number }[];
    gpsPoints?: GpsPoint[];
  }[],
  /** Strain Whoop par session ID si dispo (workout strain via API Whoop). */
  whoopStrainBySessionId?: Record<string, number>,
  nowMs: number = Date.now(),
): RecentExercise | null {
  const cutoff = nowMs - 24 * 3_600_000;
  const candidates: RecentExercise[] = [];

  for (const w of completedWorkouts) {
    const startMs = new Date(w.date).getTime();
    if (Number.isNaN(startMs)) continue;
    const endedAtMs = startMs + (w.duration || 60) * 60_000;
    if (endedAtMs < cutoff || endedAtMs > nowMs) continue;
    const whoopStrain = whoopStrainBySessionId?.[w.id];
    candidates.push({
      source: "muscu",
      endedAtMs,
      durationMin: w.duration || 60,
      strain: whoopStrain ?? estimateStrain("muscu", w.duration || 60),
      strainSource: whoopStrain ? "whoop" : "estimated",
    });
  }

  for (const r of completedRunningSessions) {
    const startMs = new Date(r.date).getTime();
    if (Number.isNaN(startMs)) continue;
    const endedAtMs = startMs + (r.actualDuration || 45) * 60_000;
    if (endedAtMs < cutoff || endedAtMs > nowMs) continue;
    const glucoseDelta = r.glucoseCheckpoints
      ? glucoseDeltaFromCheckpoints(r.glucoseCheckpoints)
      : undefined;
    const whoopStrain = whoopStrainBySessionId?.[r.id];
    candidates.push({
      source: "running",
      endedAtMs,
      durationMin: r.actualDuration || 45,
      strain: whoopStrain ?? estimateStrain("running", r.actualDuration || 45, glucoseDelta),
      strainSource: whoopStrain ? "whoop" : "estimated",
    });
  }

  if (candidates.length === 0) return null;
  // Garde la plus récente (fin la plus proche de maintenant)
  candidates.sort((a, b) => b.endedAtMs - a.endedAtMs);
  return candidates[0];
}

/** Dernier workout Whoop (sous-ensemble du snapshot useWhoop). */
export interface LastWhoopWorkout {
  sport: string | null;
  startedAt: string;
  endedAt: string;
  strain: number;
}

/**
 * Résout la séance récente à utiliser pour la modulation insuline/prédiction,
 * en priorisant le strain Whoop réel (< 24h) puis en retombant sur
 * findMostRecentExercise (estimation depuis nos données). Renvoie un
 * RecentExercise prêt pour computeExerciseAdjustment / predictGlucoseCurve.
 *
 * Centralise l'assemblage Whoop-first-sinon-estimation pour éviter de le
 * dupliquer entre le calculateur de dose et le prédicteur.
 */
export function resolveRecentExercise(input: {
  nowMs?: number;
  lastWhoopWorkout?: LastWhoopWorkout | null;
  completedWorkouts: { id: string; date: string; duration?: number }[];
  completedRunningSessions: {
    id: string;
    date: string;
    actualDuration?: number;
    glucoseCheckpoints?: { value: number; offsetSec: number }[];
  }[];
}): RecentExercise | null {
  const nowMs = input.nowMs ?? Date.now();
  const lw = input.lastWhoopWorkout;
  if (lw) {
    const endedAtMs = new Date(lw.endedAt).getTime();
    if (!Number.isNaN(endedAtMs) && endedAtMs <= nowMs && nowMs - endedAtMs < 24 * 3_600_000) {
      const durationMin = Math.max(
        1,
        Math.round((endedAtMs - new Date(lw.startedAt).getTime()) / 60_000),
      );
      return {
        source: classifySport(lw.sport),
        endedAtMs,
        durationMin,
        strain: lw.strain,
        strainSource: "whoop",
      };
    }
  }
  return findMostRecentExercise(
    input.completedWorkouts.map((w) => ({ id: w.id, date: w.date, duration: w.duration ?? 60 })),
    input.completedRunningSessions.map((r) => ({
      id: r.id,
      date: r.date,
      actualDuration: r.actualDuration ?? 45,
      glucoseCheckpoints: r.glucoseCheckpoints,
    })),
    undefined,
    nowMs,
  );
}

/** Compte les points GPS valides (utilitaire pour debug). */
export function _countValidGpsPoints(points: GpsPoint[] | undefined): number {
  if (!points) return 0;
  return totalDistance(points) > 50 ? points.length : 0;
}
