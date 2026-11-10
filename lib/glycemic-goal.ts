/**
 * Objectif d'HbA1c — où j'en suis, et ce qui me freine (fable-5.2, nov. 2026).
 *
 * Les chiffres existaient déjà sur la page Historique (GMI, temps en cible,
 * temps sous 70…) mais restaient des chiffres : aucun n'aboutissait à une
 * décision. Ce module les range dans l'ordre où un diabétologue les lit :
 *
 *   1. Trop d'hypos ?  → on ne vise PAS plus bas tant que ce n'est pas réglé.
 *      Une HbA1c à 6,0 obtenue à coups d'hypos n'est pas un bon équilibre,
 *      c'est une moyenne qui cache des extrêmes.
 *   2. Sinon, où part le temps au-dessus de la cible ? → le créneau de la
 *      journée qui coûte le plus cher en moyenne.
 *   3. Sinon, objectif tenu.
 *
 * Repères (consensus international sur la mesure continue, Battelino 2019) :
 * temps sous 70 < 4 %, temps sous 54 < 1 %, temps 70-180 > 70 %.
 * HbA1c estimée (GMI, Bergenstal 2018) = 3,31 + 0,02392 × moyenne (mg/dL).
 *
 * Pur : aucun import serveur.
 */

import { localParts } from "./local-time";

export const DEFAULT_A1C_GOAL = 6.0;
/** Temps maximal acceptable sous 70 mg/dL (%). */
export const MAX_TIME_BELOW_70 = 4;
/** Temps maximal acceptable sous 54 mg/dL (%). */
export const MAX_TIME_BELOW_54 = 1;
/** En dessous de ce nombre de points, aucune lecture n'est rendue. */
export const MIN_POINTS = 14 * 24; // ≈ 3,5 jours à 96 points/jour

const DAY_MS = 86_400_000;

export interface GoalPoint {
  t: number;
  value: number;
}

export interface DaySlot {
  /** Heure de début du créneau (0, 3, 6…). */
  startHour: number;
  label: string;
  avg: number;
  /** Part des points du créneau sous 70 (%). */
  below70Pct: number;
  count: number;
}

export type GoalPriority = "hypos-first" | "lower-mean" | "on-target" | "insufficient";

export interface GoalAssessment {
  priority: GoalPriority;
  goal: number;
  /** HbA1c estimée sur la fenêtre (%), 1 décimale. */
  estimatedA1c: number | null;
  /** Glycémie moyenne (mg/dL). */
  mean: number | null;
  /** Moyenne à atteindre pour l'objectif (mg/dL). */
  meanForGoal: number;
  timeInRangePct: number | null;
  timeBelow70Pct: number | null;
  timeBelow54Pct: number | null;
  timeAbove180Pct: number | null;
  /** Coefficient de variation (%). */
  cv: number | null;
  days: number;
  headline: string;
  detail: string;
  /** Créneau de 3 h le plus haut en moyenne (pour « lower-mean »). */
  worstHighSlot: DaySlot | null;
  /** Créneau de 3 h avec le plus de temps sous 70 (pour « hypos-first »). */
  worstLowSlot: DaySlot | null;
}

/** GMI (Bergenstal 2018). */
export function estimatedA1c(meanMgDl: number): number {
  return 3.31 + 0.02392 * meanMgDl;
}

/** Moyenne glycémique correspondant à une HbA1c estimée donnée. */
export function meanForA1c(a1c: number): number {
  return (a1c - 3.31) / 0.02392;
}

function fr(n: number, digits = 1): string {
  return n.toFixed(digits).replace(".", ",");
}

function slotLabel(startHour: number): string {
  return `${startHour} h-${startHour + 3} h`;
}

export interface AssessGoalInput {
  points: GoalPoint[];
  nowMs: number;
  /** Profondeur de la fenêtre (jours). Défaut 14. */
  days?: number;
  goal?: number;
  timeZone?: string;
}

export function assessGoal(input: AssessGoalInput): GoalAssessment {
  const days = input.days ?? 14;
  const goal = input.goal ?? DEFAULT_A1C_GOAL;
  const from = input.nowMs - days * DAY_MS;
  const pts = input.points.filter(
    (p) => Number.isFinite(p.value) && p.t >= from && p.t <= input.nowMs,
  );
  const targetMean = Math.round(meanForA1c(goal));

  const empty: GoalAssessment = {
    priority: "insufficient",
    goal,
    estimatedA1c: null,
    mean: null,
    meanForGoal: targetMean,
    timeInRangePct: null,
    timeBelow70Pct: null,
    timeBelow54Pct: null,
    timeAbove180Pct: null,
    cv: null,
    days,
    headline: "Pas assez de données capteur",
    detail: `Il faut au moins 4 jours de courbe sur les ${days} derniers pour estimer ton HbA1c.`,
    worstHighSlot: null,
    worstLowSlot: null,
  };
  if (pts.length < MIN_POINTS) return empty;

  const n = pts.length;
  const mean = pts.reduce((s, p) => s + p.value, 0) / n;
  const variance = pts.reduce((s, p) => s + (p.value - mean) ** 2, 0) / n;
  const cv = (Math.sqrt(variance) / mean) * 100;
  const pct = (pred: (v: number) => boolean) =>
    (pts.filter((p) => pred(p.value)).length / n) * 100;

  const below70 = pct((v) => v < 70);
  const below54 = pct((v) => v < 54);
  const above180 = pct((v) => v > 180);
  const inRange = 100 - below70 - above180;
  const a1c = estimatedA1c(mean);

  // Créneaux de 3 h.
  const buckets = new Map<number, number[]>();
  for (const p of pts) {
    const start = Math.floor(localParts(p.t, input.timeZone).hour / 3) * 3;
    if (!buckets.has(start)) buckets.set(start, []);
    buckets.get(start)!.push(p.value);
  }
  const slots: DaySlot[] = [];
  for (const [startHour, values] of buckets) {
    if (values.length < 12) continue;
    slots.push({
      startHour,
      label: slotLabel(startHour),
      avg: Math.round(values.reduce((s, v) => s + v, 0) / values.length),
      below70Pct: Math.round((values.filter((v) => v < 70).length / values.length) * 1000) / 10,
      count: values.length,
    });
  }
  const worstHighSlot = slots.length
    ? slots.reduce((a, b) => (b.avg > a.avg ? b : a))
    : null;
  const lowCandidates = slots.filter((s) => s.below70Pct > 0);
  const worstLowSlot = lowCandidates.length
    ? lowCandidates.reduce((a, b) => (b.below70Pct > a.below70Pct ? b : a))
    : null;

  const common = {
    goal,
    estimatedA1c: Math.round(a1c * 10) / 10,
    mean: Math.round(mean),
    meanForGoal: targetMean,
    timeInRangePct: Math.round(inRange),
    timeBelow70Pct: Math.round(below70 * 10) / 10,
    timeBelow54Pct: Math.round(below54 * 10) / 10,
    timeAbove180Pct: Math.round(above180),
    cv: Math.round(cv),
    days,
    worstHighSlot,
    worstLowSlot,
  };

  // 1. Les hypos d'abord.
  if (below70 >= MAX_TIME_BELOW_70 || below54 >= MAX_TIME_BELOW_54) {
    const minutesPerDay = Math.round((below70 / 100) * 24 * 60);
    return {
      ...common,
      priority: "hypos-first",
      headline: "Priorité : moins d'hypos",
      detail:
        `Tu passes ${fr(below70)} % du temps sous 70 mg/dL (environ ${minutesPerDay} min par jour ; le maximum conseillé est ${MAX_TIME_BELOW_70} %). ` +
        `Tant que c'est le cas, chercher à baisser ta moyenne ajouterait des hypos.` +
        (worstLowSlot
          ? ` Le créneau le plus touché : ${worstLowSlot.label} (${fr(worstLowSlot.below70Pct)} % du temps sous 70).`
          : ""),
    };
  }

  // 2. Objectif tenu ?
  if (a1c <= goal + 0.05) {
    return {
      ...common,
      priority: "on-target",
      headline: `Objectif tenu : HbA1c estimée ${fr(a1c)} %`,
      detail: `Moyenne ${Math.round(mean)} mg/dL, ${Math.round(inRange)} % du temps entre 70 et 180, ${fr(below70)} % sous 70. Rien à changer.`,
    };
  }

  // 3. Baisser la moyenne, là où elle coûte le plus.
  const gap = Math.round(mean - targetMean);
  return {
    ...common,
    priority: "lower-mean",
    headline: `HbA1c estimée ${fr(a1c)} % — il reste ${fr(a1c - goal)} point`,
    detail:
      `Ta moyenne est à ${Math.round(mean)} mg/dL ; pour ${fr(goal)} % il faut environ ${targetMean} (${gap} mg/dL de moins). ` +
      `Tes hypos sont sous contrôle (${fr(below70)} % du temps sous 70), donc tu peux y aller.` +
      (worstHighSlot
        ? ` Le plus gros gain est entre ${worstHighSlot.label}, où ta moyenne est à ${worstHighSlot.avg} mg/dL.`
        : ""),
  };
}
