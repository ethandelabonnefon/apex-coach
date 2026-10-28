/**
 * Nuits exclues de l'apprentissage : une nuit « non comptée » par Ethan
 * (alcool, maladie, capteur douteux…) ne doit pas alimenter les calibrations.
 *
 * Pur, sans I/O. Heure LOCALE partout : une nuit court du soir (J, 18h)
 * au lendemain midi (J+1) et porte la clé « YYYY-MM-DD » du soir.
 */

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
