/**
 * Nuits exclues de l'apprentissage : une nuit « non comptée » par Ethan
 * (alcool, maladie, capteur douteux…) ne doit pas alimenter les calibrations.
 *
 * Pur, sans I/O. Heure LOCALE partout : une nuit court du soir (J, 18h)
 * au lendemain midi (J+1) et porte la clé « YYYY-MM-DD » du soir.
 */

import type { NightPredictionRecord } from "./night-calibration";

export interface NightReview {
  /** « YYYY-MM-DD » du soir. */
  night: string;
  counted: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Clé de la nuit d'un instant : avant midi (heure locale) -> la veille. */
export function nightKeyFor(ms: number): string {
  const d = new Date(ms);
  if (d.getHours() < 12) d.setDate(d.getDate() - 1);
  return ymd(d);
}

export function excludedNightKeys(reviews: NightReview[]): Set<string> {
  return new Set(reviews.filter((r) => !r.counted).map((r) => r.night));
}

/** Retire les points de 18h à 12h appartenant à une nuit exclue. */
export function filterExcludedNightPoints<T extends { t: number }>(
  points: T[],
  excluded: Set<string>,
): T[] {
  if (excluded.size === 0) return points;
  return points.filter((p) => {
    const h = new Date(p.t).getHours();
    const inNightHours = h >= 18 || h < 12;
    return !(inNightHours && excluded.has(nightKeyFor(p.t)));
  });
}

/** Version du format du log de réveil (2 = réécrit jusqu'au coucher). */
export const NIGHT_LOG_VERSION = 2;

const NIGHT_LOG_CAP = 60;

/**
 * Insère un enregistrement de prédiction : pour une même nuit, le log non
 * résolu est remplacé (le dernier calcul avant le coucher fait foi) ; un log
 * déjà résolu n'est jamais écrasé. Plafond à 60 entrées.
 */
export function upsertNightLog(
  logs: NightPredictionRecord[],
  rec: NightPredictionRecord,
): NightPredictionRecord[] {
  const key = nightKeyFor(new Date(rec.createdAt).getTime());
  const kept = logs.filter((l) => {
    if (l.actualWakeupGlucose !== undefined) return true;
    return nightKeyFor(new Date(l.createdAt).getTime()) !== key;
  });
  return [rec, ...kept].slice(0, NIGHT_LOG_CAP);
}

/** Délai mini entre deux réécritures du log de réveil d'une même nuit. */
export const NIGHT_LOG_REWRITE_MIN = 15;
/** Écart de prédiction (mg/dL) qui justifie une réécriture immédiate. */
export const NIGHT_LOG_REWRITE_DELTA = 5;

/**
 * Faut-il (ré)écrire le log de réveil de la nuit en cours ? Oui s'il n'y a
 * pas encore de log non résolu pour cette nuit, si la dernière écriture a
 * ≥ 15 min, ou si la prédiction a bougé d'au moins 5 mg/dL. Jamais pour une
 * prédiction non finie.
 */
export function shouldWriteNightLog(
  logs: NightPredictionRecord[],
  predicted: number,
  nowMs: number,
): boolean {
  if (!Number.isFinite(predicted)) return false;
  const tonight = nightKeyFor(nowMs);
  const current = logs.find(
    (l) =>
      l.actualWakeupGlucose === undefined &&
      nightKeyFor(new Date(l.createdAt).getTime()) === tonight,
  );
  if (!current) return true;
  const ageMs = nowMs - new Date(current.createdAt).getTime();
  if (!(ageMs < NIGHT_LOG_REWRITE_MIN * 60_000)) return true;
  return Math.abs(predicted - current.predictedWakeupGlucose) >= NIGHT_LOG_REWRITE_DELTA;
}

/**
 * Nuit à faire valider le matin : de 5h à 12h (heure locale), la nuit qui
 * vient de finir (`nightKeyFor(now − 12 h)`) si Ethan ne l'a pas encore
 * jugée. Sinon null.
 */
export function pendingMorningReview(nowMs: number, reviews: NightReview[]): string | null {
  const h = new Date(nowMs).getHours();
  if (h < 5 || h >= 12) return null;
  const night = nightKeyFor(nowMs - 12 * 3_600_000);
  return reviews.some((r) => r.night === night) ? null : night;
}
