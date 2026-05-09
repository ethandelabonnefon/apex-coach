/**
 * Sport-Glucose Correlation Engine — Phase 11 Bloc 6.
 *
 * Pure function : croise les séances loggées (`completedWorkouts` muscu et
 * `completedRunningSessions`) avec l'archive glycémie (90j KV) pour
 * mesurer l'impact RÉEL du sport sur la glycémie d'Ethan.
 *
 * Stratégie : pas de persistance. On calcule les checkpoints (T-30, T+0,
 * T+30, T+60, T+120) à la demande depuis l'archive, qui est la source de
 * vérité (FreeStyle Libre 2 → cron /api/cron/archive-glucose 4h).
 *
 * ⚠️ Aucun import serveur — utilisable côté client.
 */

import type { ArchivedPoint } from "@/lib/glucose-archive/store";

export interface SportSession {
  /** Date ISO de début de séance (ou date du jour si seul le jour est connu). */
  date: string;
  /** Durée en minutes. */
  durationMin: number;
  type: "muscu" | "running";
}

export interface GlucoseCheckpoint {
  /** "T-30" | "T+0" | "T+30" | "T+60" | "T+120" */
  label: string;
  /** Décalage en minutes par rapport au début de la séance. */
  offsetMin: number;
  /** Glycémie au checkpoint (mg/dL), null si point archive manquant. */
  value: number | null;
  /** Timestamp ms du point archive choisi. */
  timestamp: number | null;
}

export interface EnrichedSportSession {
  startMs: number;
  type: "muscu" | "running";
  durationMin: number;
  checkpoints: GlucoseCheckpoint[];
  /** Delta entre T+45 (mi-séance estimée) et T-30. */
  delta: number | null;
  /** Pic glycémique sur la fenêtre T-30 → T+120. */
  peak: number | null;
  /** Creux glycémique sur la fenêtre T-30 → T+120. */
  trough: number | null;
}

const CHECKPOINT_OFFSETS = [-30, 0, 30, 60, 120];
const SAMPLE_TOLERANCE_MS = 18 * 60 * 1000; // ±18min

function findClosestPoint(
  points: ArchivedPoint[],
  targetMs: number,
  tolerance: number = SAMPLE_TOLERANCE_MS,
): ArchivedPoint | null {
  let best: ArchivedPoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const d = Math.abs(p.t - targetMs);
    if (d <= tolerance && d < bestDelta) {
      best = p;
      bestDelta = d;
    }
  }
  return best;
}

/**
 * Pour une séance, calcule les checkpoints en cherchant les points
 * archive les plus proches de chaque offset (±18min de tolérance).
 */
export function enrichSession(
  session: SportSession,
  archivePoints: ArchivedPoint[],
): EnrichedSportSession {
  const startMs = new Date(session.date).getTime();

  const checkpoints: GlucoseCheckpoint[] = CHECKPOINT_OFFSETS.map((offset) => {
    const targetMs = startMs + offset * 60_000;
    const closest = findClosestPoint(archivePoints, targetMs);
    return {
      label: offset === 0 ? "T+0" : `T${offset > 0 ? "+" : ""}${offset}`,
      offsetMin: offset,
      value: closest?.value ?? null,
      timestamp: closest?.t ?? null,
    };
  });

  const baseline = checkpoints[0].value; // T-30
  const tPlus30 = checkpoints[2].value;
  const delta = baseline !== null && tPlus30 !== null ? tPlus30 - baseline : null;

  // Pic et creux sur la fenêtre complète
  const allValues = checkpoints.map((c) => c.value).filter((v): v is number => v !== null);
  const peak = allValues.length > 0 ? Math.max(...allValues) : null;
  const trough = allValues.length > 0 ? Math.min(...allValues) : null;

  return {
    startMs,
    type: session.type,
    durationMin: session.durationMin,
    checkpoints,
    delta,
    peak,
    trough,
  };
}

export interface SportImpactSummary {
  type: "muscu" | "running";
  trackedCount: number;
  /** Delta moyen T+30 - T-30. */
  avgDelta: number | null;
  /** Pire delta (le plus extrême selon le signe attendu). */
  worstDelta: number | null;
  worstDeltaDate: string | null;
  /** Courbe agrégée moyenne aux 5 checkpoints. */
  avgCurve: { offsetMin: number; label: string; avg: number | null; count: number }[];
}

/**
 * Agrège les EnrichedSportSession pour calculer l'impact moyen et la
 * courbe moyenne. Pour la "muscu", `worstDelta` = max delta (montée).
 * Pour le "running", `worstDelta` = min delta (descente).
 */
export function summarizeSportImpact(
  sessions: EnrichedSportSession[],
  type: "muscu" | "running",
): SportImpactSummary {
  const filtered = sessions.filter((s) => s.type === type);

  if (filtered.length === 0) {
    return {
      type,
      trackedCount: 0,
      avgDelta: null,
      worstDelta: null,
      worstDeltaDate: null,
      avgCurve: CHECKPOINT_OFFSETS.map((o) => ({
        offsetMin: o,
        label: o === 0 ? "T+0" : `T${o > 0 ? "+" : ""}${o}`,
        avg: null,
        count: 0,
      })),
    };
  }

  // Agrège la courbe : pour chaque offset, moyenne des valeurs disponibles
  const avgCurve = CHECKPOINT_OFFSETS.map((offset) => {
    const values: number[] = [];
    for (const s of filtered) {
      const cp = s.checkpoints.find((c) => c.offsetMin === offset);
      if (cp?.value !== null && cp?.value !== undefined) values.push(cp.value);
    }
    return {
      offsetMin: offset,
      label: offset === 0 ? "T+0" : `T${offset > 0 ? "+" : ""}${offset}`,
      avg: values.length === 0 ? null : Math.round(values.reduce((s, v) => s + v, 0) / values.length),
      count: values.length,
    };
  });

  // Delta moyen et pire delta
  const deltas = filtered
    .map((s) => ({ delta: s.delta, startMs: s.startMs }))
    .filter((x): x is { delta: number; startMs: number } => x.delta !== null);
  const avgDelta = deltas.length === 0
    ? null
    : Math.round(deltas.reduce((s, x) => s + x.delta, 0) / deltas.length);

  let worstDelta: number | null = null;
  let worstDeltaMs: number | null = null;
  if (deltas.length > 0) {
    if (type === "muscu") {
      const w = deltas.reduce((max, x) => (x.delta > max.delta ? x : max), deltas[0]);
      worstDelta = w.delta;
      worstDeltaMs = w.startMs;
    } else {
      const w = deltas.reduce((min, x) => (x.delta < min.delta ? x : min), deltas[0]);
      worstDelta = w.delta;
      worstDeltaMs = w.startMs;
    }
  }

  return {
    type,
    trackedCount: filtered.length,
    avgDelta,
    worstDelta,
    worstDeltaDate: worstDeltaMs ? new Date(worstDeltaMs).toISOString() : null,
    avgCurve,
  };
}

/**
 * Helper utilisé par le pre-workout advisor (Bloc 6.3) pour personnaliser
 * la prédiction d'impact à partir des données réelles d'Ethan plutôt que
 * des moyennes académiques. Fallback à null si < 3 séances trackées
 * (le caller devra utiliser ses valeurs génériques).
 */
export function computeAvgSportImpact(
  sessions: EnrichedSportSession[],
  type: "muscu" | "running",
  minSample: number = 3,
): number | null {
  const summary = summarizeSportImpact(sessions, type);
  if (summary.trackedCount < minSample) return null;
  return summary.avgDelta;
}

/**
 * Recommandation pré-séance basée sur l'historique : étant donné une
 * glycémie de départ, prédit la valeur attendue à T+45min.
 * Renvoie null si on n'a pas l'avgDelta (pas assez de data).
 */
export function predictGlucoseAtMidWorkout(
  startGlucose: number,
  sessions: EnrichedSportSession[],
  type: "muscu" | "running",
): number | null {
  const avg = computeAvgSportImpact(sessions, type);
  if (avg === null) return null;
  return startGlucose + avg;
}
