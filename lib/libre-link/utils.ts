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
