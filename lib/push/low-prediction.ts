/**
 * Alerte « hypo en approche » (fable-5.2, nov. 2026).
 *
 * L'alerte hypo existante ne part qu'une fois SOUS 70 mg/dL : à ce moment
 * l'hypo est déjà là. Avec la flèche de tendance du capteur on peut prévenir
 * 10 à 20 minutes plus tôt, quand un resucrage léger suffit encore.
 *
 * Projection volontairement simple — la flèche Libre, rien d'autre :
 *   ↓↓ ≈ −2 mg/dL/min · ↘ ≈ −1 mg/dL/min
 * On alerte si la glycémie projetée à 20 minutes passe sous 70.
 *
 * Pur : testable sans KV ni capteur.
 */

/** Au-delà, la lecture est trop vieille pour qu'on agisse dessus (min). */
export const MAX_READING_AGE_MIN = 20;
/** Horizon de projection (min). */
export const LOW_SOON_HORIZON_MIN = 20;
/** Seuil d'hypoglycémie (mg/dL). */
export const LOW_SOON_THRESHOLD = 70;

const TREND_VELOCITY: Record<string, number> = {
  SingleDown: -2,
  FortyFiveDown: -1,
};

export interface LowSoonInput {
  value: number;
  trend: string | undefined;
  /** Âge de la lecture capteur (min). */
  readingAgeMin: number;
}

export interface LowSoonResult {
  warn: boolean;
  /** Glycémie projetée à l'horizon (mg/dL), si une projection a été faite. */
  projected: number | null;
}

export function assessLowSoon(input: LowSoonInput): LowSoonResult {
  const { value, trend, readingAgeMin } = input;
  if (!Number.isFinite(value) || !Number.isFinite(readingAgeMin)) {
    return { warn: false, projected: null };
  }
  if (readingAgeMin > MAX_READING_AGE_MIN || readingAgeMin < 0) {
    return { warn: false, projected: null };
  }
  // Déjà en hypo : c'est l'alerte hypo qui parle, pas celle-ci.
  if (value < LOW_SOON_THRESHOLD) return { warn: false, projected: null };
  const velocity = trend ? TREND_VELOCITY[trend] : undefined;
  if (velocity === undefined) return { warn: false, projected: null };
  const projected = Math.round(value + velocity * LOW_SOON_HORIZON_MIN);
  return { warn: projected < LOW_SOON_THRESHOLD, projected };
}

/** Âge d'une lecture capteur en minutes ; `Infinity` si la date est illisible. */
export function readingAgeMinutes(readingIso: string, nowMs: number): number {
  const t = new Date(readingIso).getTime();
  if (!Number.isFinite(t)) return Infinity;
  return (nowMs - t) / 60_000;
}
