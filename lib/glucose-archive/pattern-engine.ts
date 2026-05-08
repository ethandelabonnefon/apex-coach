/**
 * Pattern Engine déterministe — Phase 11 Bloc 3.
 *
 * Détecte automatiquement les patterns glycémiques récurrents (règle des 3
 * jours / 4 sur 7, standard clinique) à partir des points archivés et des
 * injections taguées. Pure function — testable en standalone.
 *
 * 5 règles implémentées :
 *  - night-hyper      : ≥3 nuits récentes avec moyenne 23h-6h > 180
 *  - recurring-hypo   : ≥3 hypos < 70 dans le même créneau de 2h sur 7j
 *  - post-meal-spike  : ≥3 bolus du même mealType avec pic > 220 dans 3h
 *  - dawn-phenomenon  : ≥3 jours/5 avec glycémie 5h-8h > 160 (sans inj nocturne)
 *  - cv-degradation   : CV semaine courante > 36% ET semaine précédente ≤ 36%
 *
 * ⚠️ Pas d'import serveur. Lu côté client (Zustand store + fetch archive).
 */

import type { ArchivedPoint } from "./store";
import type { DiabetesConfig, InsulinLog, MealTime } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export type PatternType =
  | "night-hyper"
  | "recurring-hypo"
  | "post-meal-spike"
  | "dawn-phenomenon"
  | "cv-degradation";

export type PatternSeverity = "info" | "warning" | "alert";

export interface DetectedPattern {
  id: string;
  type: PatternType;
  severity: PatternSeverity;
  title: string;
  message: string;
  occurrences: number;
  timeWindow: string;
  suggestion: string;
  detectedAt: string; // ISO
}

// ───────────────────────────────────────────────────────────────────────
// Helpers temporels (pure)
// ───────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function avg(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = avg(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}h`;
}

// ───────────────────────────────────────────────────────────────────────
// Règles individuelles
// ───────────────────────────────────────────────────────────────────────

/**
 * Règle 1 — Hyperglycémie nocturne (23h-6h).
 * ≥3 nuits sur les 5 dernières où la moyenne > 180.
 */
function detectNightHyper(points: ArchivedPoint[], now: number): DetectedPattern | null {
  const fiveDaysAgo = now - 5 * DAY_MS;
  const recent = points.filter((p) => p.t >= fiveDaysAgo);

  // Group by "nuit" : 23h du jour J → 6h du jour J+1
  const nights = new Map<string, number[]>(); // key = startOfNightDate
  for (const p of recent) {
    const d = new Date(p.t);
    const h = d.getHours();
    let nightKey: string;
    if (h >= 23) {
      // appartient à la nuit du jour courant
      nightKey = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
    } else if (h < 6) {
      // appartient à la nuit du jour précédent
      const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1);
      nightKey = prev.toISOString();
    } else {
      continue;
    }
    if (!nights.has(nightKey)) nights.set(nightKey, []);
    nights.get(nightKey)!.push(p.value);
  }

  let hyperNights = 0;
  let totalAvg = 0;
  for (const values of nights.values()) {
    if (values.length < 5) continue; // pas assez de data
    const m = avg(values);
    if (m > 180) {
      hyperNights++;
      totalAvg += m;
    }
  }

  if (hyperNights < 3) return null;
  const meanOfMeans = Math.round(totalAvg / hyperNights);

  return {
    id: `night-hyper-${startOfDayMs(now)}`,
    type: "night-hyper",
    severity: "warning",
    title: "Pattern nocturne détecté",
    message: `Tes ${hyperNights} dernières nuits avaient une glycémie moyenne de ${meanOfMeans} mg/dL (au-dessus de 180). Possibles causes : repas tardif riche en graisses/protéines, basal insuffisant.`,
    occurrences: hyperNights,
    timeWindow: "5 dernières nuits",
    suggestion: "Essaie un split dose si repas riche le soir, ou discute avec ton diabéto d'un ajustement de ta Lantus.",
    detectedAt: new Date(now).toISOString(),
  };
}

/**
 * Règle 2 — Hypos récurrentes même créneau (sur 7 jours).
 * ≥3 épisodes < 70 dans le même créneau de 2h.
 */
function detectRecurringHypo(points: ArchivedPoint[], now: number): DetectedPattern | null {
  const sevenDaysAgo = now - 7 * DAY_MS;
  const recent = points.filter((p) => p.t >= sevenDaysAgo && p.value < 70);

  // 12 créneaux de 2h
  const slots = new Array(12).fill(0).map(() => [] as number[]);
  for (const p of recent) {
    const h = new Date(p.t).getHours();
    slots[Math.floor(h / 2)].push(p.t);
  }

  // Compte les jours uniques par créneau (un événement = au moins 1 point < 70 ce jour-là)
  const slotEpisodes = slots.map((tsList) => {
    const days = new Set(tsList.map((t) => startOfDayMs(t)));
    return { count: days.size, slot: 0 };
  });

  let bestSlot = -1;
  let bestCount = 0;
  for (let i = 0; i < slotEpisodes.length; i++) {
    if (slotEpisodes[i].count > bestCount) {
      bestCount = slotEpisodes[i].count;
      bestSlot = i;
    }
  }

  if (bestSlot === -1 || bestCount < 3) return null;

  const startH = bestSlot * 2;
  const endH = startH + 2;

  // Suggestion dynamique selon le créneau
  let suggestion: string;
  if (startH >= 19 && startH <= 21) {
    suggestion = "Réduis le bolus du goûter de 0,5U les jours où tu fais du sport le soir.";
  } else if (startH >= 0 && startH <= 6) {
    suggestion = "Ton basal nocturne est peut-être trop fort. Parle à ton diabéto.";
  } else if (startH >= 12 && startH <= 14) {
    suggestion = "Ton ratio du midi est peut-être trop agressif.";
  } else {
    suggestion = "Surveille ce créneau et regarde si quelque chose se répète (sport, repas, stress).";
  }

  return {
    id: `recurring-hypo-${bestSlot}-${startOfDayMs(now)}`,
    type: "recurring-hypo",
    severity: "alert",
    title: `Hypos récurrentes (${fmtHour(startH)}-${fmtHour(endH)})`,
    message: `${bestCount} hypos entre ${fmtHour(startH)} et ${fmtHour(endH)} cette semaine.`,
    occurrences: bestCount,
    timeWindow: "7 derniers jours",
    suggestion,
    detectedAt: new Date(now).toISOString(),
  };
}

/**
 * Règle 3 — Pic post-repas excessif.
 * ≥3 bolus du même mealType avec glycémie > 220 dans les 3h post-injection.
 */
function detectPostMealSpike(
  points: ArchivedPoint[],
  injections: InsulinLog[],
  now: number,
): DetectedPattern | null {
  const fourteenDaysAgo = now - 14 * DAY_MS;
  const recentInjections = injections
    .filter((inj) => {
      const ts = new Date(inj.injectedAt).getTime();
      return ts >= fourteenDaysAgo && !inj.isSplitDose && inj.carbsGrams > 0;
    });

  const byMealType = new Map<string, number>(); // mealType → spike count
  for (const inj of recentInjections) {
    const ts = new Date(inj.injectedAt).getTime();
    const windowEnd = ts + 3 * 60 * 60 * 1000;
    let peak = 0;
    for (const p of points) {
      if (p.t >= ts && p.t <= windowEnd) {
        if (p.value > peak) peak = p.value;
      }
    }
    if (peak > 220) {
      byMealType.set(inj.mealType, (byMealType.get(inj.mealType) ?? 0) + 1);
    }
  }

  let bestMeal: string | null = null;
  let bestCount = 0;
  for (const [meal, count] of byMealType.entries()) {
    if (count > bestCount) {
      bestCount = count;
      bestMeal = meal;
    }
  }

  if (!bestMeal || bestCount < 3) return null;

  const mealLabel: Record<string, string> = {
    morning: "petit-déj",
    lunch: "déjeuner",
    snack: "goûter",
    dinner: "dîner",
    other: "repas",
    correction: "correction",
  };
  const label = mealLabel[bestMeal] ?? bestMeal;

  return {
    id: `post-meal-spike-${bestMeal}-${startOfDayMs(now)}`,
    type: "post-meal-spike",
    severity: "warning",
    title: `Pics post-${label} récurrents`,
    message: `Tes ${bestCount} derniers ${label} ont causé un pic > 220 mg/dL dans les 3h.`,
    occurrences: bestCount,
    timeWindow: "14 derniers jours",
    suggestion: "Essaie de pré-doser 15min avant le repas, ou augmente ton ratio de 0,1U/10g.",
    detectedAt: new Date(now).toISOString(),
  };
}

/**
 * Règle 4 — Phénomène de l'aube (5h-8h).
 * ≥3 jours sur 5 où la glycémie 5h-8h > 160 SANS injection nocturne 0h-5h.
 */
function detectDawnPhenomenon(
  points: ArchivedPoint[],
  injections: InsulinLog[],
  now: number,
): DetectedPattern | null {
  const fiveDaysAgo = now - 5 * DAY_MS;
  const recent = points.filter((p) => p.t >= fiveDaysAgo);

  // Group par jour : moyenne 5h-8h
  const dawnByDay = new Map<string, number[]>();
  for (const p of recent) {
    const d = new Date(p.t);
    const h = d.getHours();
    if (h < 5 || h >= 8) continue;
    const key = startOfDayMs(p.t).toString();
    if (!dawnByDay.has(key)) dawnByDay.set(key, []);
    dawnByDay.get(key)!.push(p.value);
  }

  // Set des jours où il y a eu une injection nocturne
  const nocturnalInjectionDays = new Set<string>();
  for (const inj of injections) {
    const t = new Date(inj.injectedAt).getTime();
    if (t < fiveDaysAgo) continue;
    const h = new Date(t).getHours();
    if (h >= 0 && h < 5) {
      nocturnalInjectionDays.add(startOfDayMs(t).toString());
    }
  }

  let highDawnDays = 0;
  let totalAvg = 0;
  for (const [dayKey, values] of dawnByDay.entries()) {
    if (values.length < 4) continue;
    if (nocturnalInjectionDays.has(dayKey)) continue;
    const m = avg(values);
    if (m > 160) {
      highDawnDays++;
      totalAvg += m;
    }
  }

  if (highDawnDays < 3) return null;
  const meanOfMeans = Math.round(totalAvg / highDawnDays);

  return {
    id: `dawn-phenomenon-${startOfDayMs(now)}`,
    type: "dawn-phenomenon",
    severity: "info",
    title: "Phénomène de l'aube actif",
    message: `Ta glycémie monte régulièrement entre 5h et 8h (moyenne ${meanOfMeans} mg/dL sur ${highDawnDays} jours). C'est un phénomène hormonal naturel.`,
    occurrences: highDawnDays,
    timeWindow: "5 derniers jours",
    suggestion: "Discute avec ton diabéto : un ajustement de ta Lantus (heure ou dose) pourrait aider.",
    detectedAt: new Date(now).toISOString(),
  };
}

/**
 * Règle 5 — CV qui se dégrade.
 * CV% de la semaine courante > 36% ET CV% de la semaine précédente ≤ 36%.
 */
function detectCvDegradation(points: ArchivedPoint[], now: number): DetectedPattern | null {
  const oneWeekAgo = now - 7 * DAY_MS;
  const twoWeeksAgo = now - 14 * DAY_MS;

  const current = points.filter((p) => p.t >= oneWeekAgo).map((p) => p.value);
  const previous = points
    .filter((p) => p.t >= twoWeeksAgo && p.t < oneWeekAgo)
    .map((p) => p.value);

  if (current.length < 50 || previous.length < 50) return null; // pas assez de data

  const currentMean = avg(current);
  const previousMean = avg(previous);
  if (currentMean === 0 || previousMean === 0) return null;

  const currentCV = (stdDev(current) / currentMean) * 100;
  const previousCV = (stdDev(previous) / previousMean) * 100;

  if (currentCV <= 36 || previousCV > 36) return null;

  return {
    id: `cv-degradation-${startOfDayMs(now)}`,
    type: "cv-degradation",
    severity: "info",
    title: "Variabilité en hausse",
    message: `Ton CV est passé de ${previousCV.toFixed(0)}% à ${currentCV.toFixed(0)}% cette semaine. Plus de hauts et de bas qu'avant.`,
    occurrences: 1,
    timeWindow: "semaine courante vs précédente",
    suggestion: "Regarde si quelque chose a changé : horaires de repas, sport, stress, sommeil.",
    detectedAt: new Date(now).toISOString(),
  };
}

// ───────────────────────────────────────────────────────────────────────
// API publique
// ───────────────────────────────────────────────────────────────────────

export function detectPatterns(
  points: ArchivedPoint[],
  injections: InsulinLog[],
  _config: DiabetesConfig,
  nowMs: number = Date.now(),
): DetectedPattern[] {
  if (points.length === 0) return [];
  const detected: DetectedPattern[] = [];

  const a = detectNightHyper(points, nowMs);
  if (a) detected.push(a);

  const b = detectRecurringHypo(points, nowMs);
  if (b) detected.push(b);

  const c = detectPostMealSpike(points, injections, nowMs);
  if (c) detected.push(c);

  const d = detectDawnPhenomenon(points, injections, nowMs);
  if (d) detected.push(d);

  const e = detectCvDegradation(points, nowMs);
  if (e) detected.push(e);

  // Tri par sévérité (alert > warning > info)
  const severityRank: Record<PatternSeverity, number> = { alert: 0, warning: 1, info: 2 };
  return detected.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
}

// Re-export type pour les consumers
export type { MealTime };
