/**
 * LibreLink Up — utilitaires partagés (client + serveur).
 *
 * Mapping des tendances Abbott → affichage français,
 * et classification des valeurs en tonalités visuelles.
 */

import { GLUCOSE_THRESHOLDS } from "./config";

export type GlucoseTrend =
  | "SingleDown"
  | "FortyFiveDown"
  | "Flat"
  | "FortyFiveUp"
  | "SingleUp"
  | "NotComputable";

export type GlucoseTone = "hypo" | "low" | "target" | "high" | "hyper";

/**
 * Tonalité visuelle d'une glycémie — utilisée pour colorer les tuiles.
 */
export function glucoseTone(value: number): GlucoseTone {
  if (value < GLUCOSE_THRESHOLDS.hypo) return "hypo";
  if (value < GLUCOSE_THRESHOLDS.low) return "low";
  if (value > GLUCOSE_THRESHOLDS.hyper) return "hyper";
  if (value > GLUCOSE_THRESHOLDS.high) return "high";
  return "target";
}

/**
 * Variable CSS correspondant à la tonalité.
 */
export function glucoseToneColor(tone: GlucoseTone): string {
  switch (tone) {
    case "hypo":
      return "var(--error)";
    case "low":
      return "var(--warning)";
    case "target":
      return "var(--success)";
    case "high":
      return "var(--warning)";
    case "hyper":
      return "var(--error)";
  }
}

/**
 * Libellé court français de la tonalité (UI / badges).
 */
export function glucoseToneLabel(tone: GlucoseTone): string {
  switch (tone) {
    case "hypo":
      return "Hypo";
    case "low":
      return "Basse";
    case "target":
      return "En plage";
    case "high":
      return "Élevée";
    case "hyper":
      return "Très élevée";
  }
}

/**
 * Flèche directionnelle (emoji-like mais pur Unicode) pour une tendance.
 */
export function trendArrow(trend: GlucoseTrend): string {
  switch (trend) {
    case "SingleDown":
      return "↓↓";
    case "FortyFiveDown":
      return "↘";
    case "Flat":
      return "→";
    case "FortyFiveUp":
      return "↗";
    case "SingleUp":
      return "↑↑";
    default:
      return "—";
  }
}

/**
 * Tendance Libre → entier 1..5 (slide rule Abbott) attendu par les calculs
 * insuline/prédiction. Renvoie undefined si inconnue.
 */
export function trendStringToNumber(
  trend: GlucoseTrend | string | undefined,
): number | undefined {
  switch (trend) {
    case "SingleDown": return 1;
    case "FortyFiveDown": return 2;
    case "Flat": return 3;
    case "FortyFiveUp": return 4;
    case "SingleUp": return 5;
    default: return undefined;
  }
}

/**
 * Libellé français d'une tendance.
 */
export function trendLabel(trend: GlucoseTrend): string {
  switch (trend) {
    case "SingleDown":
      return "Chute rapide";
    case "FortyFiveDown":
      return "Descente";
    case "Flat":
      return "Stable";
    case "FortyFiveUp":
      return "Montée";
    case "SingleUp":
      return "Montée rapide";
    default:
      return "Tendance indisponible";
  }
}

/**
 * Âge d'une lecture en minutes depuis maintenant (entier arrondi).
 */
export function readingAgeMinutes(isoDate: string, now: number = Date.now()): number {
  const t = new Date(isoDate).getTime();
  return Math.max(0, Math.round((now - t) / 60_000));
}

/**
 * Âge maximal (min) d'une mesure capteur pour qu'elle compte comme « en
 * direct ». Au-delà, l'app la traite comme une ABSENCE de mesure : elle ne
 * colore plus la tuile, ne projette plus de tendance, n'entre plus dans un
 * calcul de dose.
 *
 * Pourquoi (incident du 12/11/2026) : pendant une coupure Abbott, l'écran
 * gardait la dernière mesure reçue sans limite de durée, et le calculateur
 * la lisait comme la glycémie du moment. Une glycémie de 40 minutes, en
 * pleine descente, ne doit pas décider d'une dose.
 *
 * 15 min = la même borne que le plan de nuit (« lecture ≤ 15 min ») et que
 * le serveur quand il ressert une mesure faute de réponse d'Abbott.
 */
export const LIVE_MAX_AGE_MIN = 15;

/** Une mesure datée `isoDate` est-elle encore « en direct » ? */
export function isReadingFresh(isoDate: string | undefined | null, now: number = Date.now()): boolean {
  if (!isoDate) return false;
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return false;
  const ageMin = (now - t) / 60_000;
  // −5 min de tolérance : horloges du téléphone et du serveur décalées.
  return ageMin >= -5 && ageMin <= LIVE_MAX_AGE_MIN;
}

/**
 * Formatage "il y a X min" / "à l'instant".
 */
export function formatReadingAge(isoDate: string, now: number = Date.now()): string {
  const minutes = readingAgeMinutes(isoDate, now);
  if (minutes < 1) return "à l'instant";
  if (minutes === 1) return "il y a 1 min";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours === 1 ? "il y a 1 h" : `il y a ${hours} h`;
}
