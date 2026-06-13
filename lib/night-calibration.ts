/**
 * Night Calibration — personnalisation de la prédiction nuit (juin 2026).
 *
 * Transforme l'archive 90j (CGM) + les injections + l'historique de
 * prédictions en PARAMÈTRES PERSO qui remplacent les constantes scolaires :
 *
 *  1. estimateNightDrift   → dérive basale réelle (mg/dL/h) sur nuits propres
 *  2. estimateDawnCurve     → vraie montée du dawn par heure (vs +40 figé)
 *  3. iobRemainingFraction  → courbe IOB exponentielle (vs linéaire)
 *  4. resolve + estimateBias → boucle d'auto-apprentissage (prédit vs réel)
 *
 * Toutes pures, aucun import serveur, testables standalone.
 */

import type { ArchivedPoint } from "@/lib/glucose-archive/store";

export interface NightInjection {
  /** ISO du moment de l'injection. */
  injectedAt: string;
  units: number;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Pente d'une régression linéaire (y vs x). Renvoie null si dégénéré. */
function linregSlope(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let cov = 0;
  let varx = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i] - mx) * (ys[i] - my);
    varx += (xs[i] - mx) ** 2;
  }
  if (varx === 0) return null;
  return cov / varx;
}

/** Moyenne en retirant les valeurs extrêmes (trim 20% de chaque côté). */
function trimmedMean(values: number[]): number | null {
  if (values.length === 0) return null;
  if (values.length < 5) return values.reduce((s, v) => s + v, 0) / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const cut = Math.floor(sorted.length * 0.2);
  const kept = sorted.slice(cut, sorted.length - cut);
  return kept.reduce((s, v) => s + v, 0) / kept.length;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

// ───────────────────────────────────────────────────────────────────────
// 1. Dérive basale nocturne (mg/dL/h) — sur nuits "propres"
// ───────────────────────────────────────────────────────────────────────

export interface NightDriftResult {
  /** mg/dL par heure. Négatif = tu descends (basale trop forte). */
  driftPerHour: number;
  /** Nb de nuits exploitées. */
  sampleNights: number;
  /** Confiance basée sur l'échantillon. */
  confidence: "low" | "medium" | "high";
  /** True si on a pu exclure les nuits avec injection (sinon best-effort). */
  injectionsAvailable: boolean;
}

/**
 * Mesure la pente moyenne de la glycémie dans la fenêtre stable 00h-03h
 * (avant le dawn), sur les nuits sans injection nocturne. Cette pente
 * reflète l'adéquation de la basale (Lantus).
 */
export function estimateNightDrift(
  points: ArchivedPoint[],
  injections: NightInjection[],
): NightDriftResult {
  const WINDOW_START = 0; // 00h
  const WINDOW_END = 3; // 03h
  const injectionsAvailable = injections.length > 0;

  // Index des injections par jour (pour exclure les nuits avec intervention)
  const injectionMs = injections.map((i) => new Date(i.injectedAt).getTime());

  // Grouper les points de la fenêtre par nuit
  const byNight = new Map<string, ArchivedPoint[]>();
  for (const p of points) {
    const h = new Date(p.t).getHours();
    if (h >= WINDOW_START && h < WINDOW_END) {
      const key = dayKey(p.t);
      if (!byNight.has(key)) byNight.set(key, []);
      byNight.get(key)!.push(p);
    }
  }

  const slopes: number[] = [];
  for (const [, nightPoints] of byNight) {
    if (nightPoints.length < 6) continue;
    const sorted = [...nightPoints].sort((a, b) => a.t - b.t);
    const spanH = (sorted[sorted.length - 1].t - sorted[0].t) / 3_600_000;
    if (spanH < 1.5) continue;

    // Exclure si injection entre 23h (veille) et 04h cette nuit-là
    const firstMs = sorted[0].t;
    const winStart = firstMs - 60 * 60_000; // 1h avant le 1er point
    const winEnd = sorted[sorted.length - 1].t + 60 * 60_000;
    const hasInjection = injectionMs.some((m) => m >= winStart && m <= winEnd);
    if (hasInjection) continue;

    const xs = sorted.map((p) => p.t / 3_600_000); // heures
    const ys = sorted.map((p) => p.value);
    const slope = linregSlope(xs, ys);
    if (slope === null) continue;
    // Garde-fou : ignorer les pentes absurdes (artefacts capteur)
    if (Math.abs(slope) > 40) continue;
    slopes.push(slope);
  }

  const drift = trimmedMean(slopes) ?? 0;
  const n = slopes.length;
  return {
    driftPerHour: Math.round(drift * 10) / 10,
    sampleNights: n,
    confidence: n >= 10 ? "high" : n >= 4 ? "medium" : "low",
    injectionsAvailable,
  };
}

// ───────────────────────────────────────────────────────────────────────
// 2. Courbe du dawn mesurée (rise par heure 4h-9h)
// ───────────────────────────────────────────────────────────────────────

export interface DawnCurveResult {
  /** rise mg/dL par heure du jour (clé = heure 4..9). */
  curve: Record<number, number>;
  sampleDays: number;
  confidence: "low" | "medium" | "high";
}

/**
 * Mesure la montée typique du phénomène de l'aube : médiane glycémique par
 * heure, montée relative à la baseline de 3h. Remplace le +40 codé en dur.
 */
export function estimateDawnCurve(points: ArchivedPoint[]): DawnCurveResult {
  const byHour = new Map<number, number[]>();
  const days = new Set<string>();
  for (const p of points) {
    const h = new Date(p.t).getHours();
    if (h >= 1 && h <= 9) {
      if (!byHour.has(h)) byHour.set(h, []);
      byHour.get(h)!.push(p.value);
      days.add(dayKey(p.t));
    }
  }

  const medByHour = new Map<number, number>();
  for (const [h, vals] of byHour) {
    const m = median(vals);
    if (m !== null) medByHour.set(h, m);
  }

  // Baseline = médiane à 3h (sinon 2h, sinon 1h)
  const baseline =
    medByHour.get(3) ?? medByHour.get(2) ?? medByHour.get(1) ?? null;

  const curve: Record<number, number> = {};
  if (baseline !== null) {
    for (let h = 4; h <= 9; h++) {
      const m = medByHour.get(h);
      if (m !== undefined) curve[h] = Math.max(0, Math.round(m - baseline));
    }
  }

  const sampleDays = days.size;
  return {
    curve,
    sampleDays,
    confidence: sampleDays >= 10 ? "high" : sampleDays >= 4 ? "medium" : "low",
  };
}

// ───────────────────────────────────────────────────────────────────────
// 3. Courbe IOB exponentielle (modèle Loop)
// ───────────────────────────────────────────────────────────────────────

/**
 * Fraction d'insuline ENCORE active à t minutes post-injection.
 * Modèle exponentiel standard (Loop / openAPS), peak ~75min pour rapide.
 * Plus réaliste que le linéaire (qui sur-estime l'action précoce).
 */
export function iobRemainingFraction(
  minutesAgo: number,
  durationMin: number = 195,
  peakMin: number = 75,
): number {
  if (minutesAgo <= 0) return 1;
  if (minutesAgo >= durationMin) return 0;
  const td = durationMin;
  const tp = peakMin;
  const tau = (tp * (1 - tp / td)) / (1 - (2 * tp) / td);
  const a = (2 * tau) / td;
  const S = 1 / (1 - a + (1 + a) * Math.exp(-td / tau));
  const t = minutesAgo;
  const iob =
    1 -
    S *
      (1 - a) *
      (((t * t) / (tau * td * (1 - a)) - t / tau - 1) * Math.exp(-t / tau) + 1);
  return Math.min(1, Math.max(0, iob));
}

// ───────────────────────────────────────────────────────────────────────
// 4. Boucle d'auto-apprentissage : prédit vs réel
// ───────────────────────────────────────────────────────────────────────

export interface NightPredictionRecord {
  id: string;
  /** ISO du moment où la prédiction a été faite (soir). */
  createdAt: string;
  /** Glycémie prédite au réveil. */
  predictedWakeupGlucose: number;
  /** ms cible du réveil (createdAt + hoursUntilWakeup). */
  wakeupAtMs: number;
  /** Rempli a posteriori depuis l'archive. */
  actualWakeupGlucose?: number;
  /** actual - predicted (signé). Positif = on a sous-estimé. */
  errorMgDl?: number;
}

/**
 * Résout les prédictions passées : pour chaque record non résolu dont le
 * réveil est passé, cherche la glycémie réelle dans l'archive (±30min) et
 * calcule l'erreur. Renvoie les records mis à jour (immutable).
 */
export function resolveNightLogs(
  logs: NightPredictionRecord[],
  points: ArchivedPoint[],
  nowMs: number = Date.now(),
): NightPredictionRecord[] {
  const TOLERANCE_MS = 30 * 60_000;
  return logs.map((log) => {
    if (log.actualWakeupGlucose !== undefined) return log;
    if (log.wakeupAtMs > nowMs) return log; // pas encore l'heure
    // Cherche le point archive le plus proche du réveil
    let best: ArchivedPoint | null = null;
    let bestDiff = Infinity;
    for (const p of points) {
      const diff = Math.abs(p.t - log.wakeupAtMs);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = p;
      }
    }
    if (!best || bestDiff > TOLERANCE_MS) return log;
    const actual = best.value;
    return {
      ...log,
      actualWakeupGlucose: actual,
      errorMgDl: actual - log.predictedWakeupGlucose,
    };
  });
}

export interface WakeupBiasResult {
  /** Correction signée (mg/dL) à ajouter aux prédictions de réveil. */
  bias: number;
  sampleSize: number;
  confidence: "low" | "medium" | "high";
}

/**
 * Estime le biais systématique de la prédiction de réveil : moyenne des
 * (actual - predicted) sur les N dernières nuits résolues. On l'ajoute aux
 * prédictions futures pour corriger les biais récurrents.
 */
export function estimateWakeupBias(
  logs: NightPredictionRecord[],
  recentN: number = 14,
): WakeupBiasResult {
  const resolved = logs
    .filter((l) => l.errorMgDl !== undefined)
    .sort((a, b) => b.wakeupAtMs - a.wakeupAtMs)
    .slice(0, recentN);
  if (resolved.length < 3) {
    return { bias: 0, sampleSize: resolved.length, confidence: "low" };
  }
  // Moyenne tronquée des erreurs (robuste aux nuits aberrantes)
  const errs = resolved.map((l) => l.errorMgDl!);
  const bias = trimmedMean(errs) ?? 0;
  // Cap de sécurité : la correction apprise ne dépasse pas ±40 mg/dL
  const capped = Math.max(-40, Math.min(40, bias));
  return {
    bias: Math.round(capped),
    sampleSize: resolved.length,
    confidence: resolved.length >= 10 ? "high" : resolved.length >= 5 ? "medium" : "low",
  };
}
