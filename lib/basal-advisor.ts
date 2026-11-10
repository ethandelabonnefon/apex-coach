/**
 * Analyse de la lente (basale) — version test fable-5.2, novembre 2026.
 *
 * Le trou que ce module comble : l'app voyait les hypos mais ne concluait
 * jamais « baisse ta lente ». Le détecteur d'hypos récurrentes exigeait
 * 3 hypos dans le MÊME créneau de 2 h ; pendant une semaine de grosse
 * activité (30 000 pas par jour), les hypos tombent à toute heure et aucun
 * créneau n'atteint le seuil. Quant à la dérive nocturne mesurée par
 * `estimateNightDrift`, elle n'était affichée nulle part.
 *
 * Même démarche que la validation des doses par créneau : on ne modélise
 * AUCUNE physiologie, on part des résultats observés.
 *
 *  - Une hypo SANS insuline rapide dans les 4 h précédentes ne peut pas
 *    venir d'un bolus : elle vient du fond (lente, ou sensibilité accrue
 *    par l'activité — même remède).
 *  - Des hypos à toute heure de la journée n'accusent pas un repas en
 *    particulier : le facteur commun est le fond.
 *  - Une glycémie qui monte chaque nuit entre 3 h et 7 h, sans aucune hypo
 *    de la semaine, signale l'inverse.
 *
 * Deux sens, volontairement (leçon de la validation des doses : un
 * détecteur à sens unique finit toujours par dériver dans ce sens-là).
 * La hausse est beaucoup plus difficile à déclencher que la baisse, et
 * plafonnée à 1 U : c'est la seule conclusion qui ajoute de l'insuline.
 *
 * Rien n'est jamais appliqué automatiquement : le module propose, l'écran
 * affiche « Actuel → Proposé » avec un bouton Valider.
 *
 * Pur : aucun import serveur, aucun accès au store.
 */

import { activeIOB } from "./glucose-prediction";
import { localParts } from "./local-time";

export { localParts };

// ───────────────────────────────────────────────────────────────────────
// Constantes
// ───────────────────────────────────────────────────────────────────────

/** Sous ce seuil, un point compte comme hypoglycémie (mg/dL). */
export const BASAL_HYPO_THRESHOLD = 70;
/** Sous ce seuil, l'hypo est dite sévère (mg/dL). */
export const BASAL_SEVERE_THRESHOLD = 54;
/**
 * Un point isolé sous 70 n'est retenu que s'il descend sous ce seuil.
 * Un seul point à 68 peut être du bruit capteur (ou un appui sur le
 * capteur en dormant) ; deux points consécutifs, ou un point franchement
 * bas, ne le sont pas.
 */
export const SINGLE_POINT_MIN_DEPTH = 60;
/** Deux points bas séparés de moins que ça appartiennent au même épisode. */
export const EPISODE_MERGE_GAP_MIN = 60;
/**
 * Aucune insuline rapide dans les N minutes précédentes → l'hypo est
 * « à jeun d'insuline rapide ». 240 min > durée d'action configurée (195).
 */
export const FASTING_BOLUS_FREE_MIN = 240;
/** Insuline active résiduelle tolérée pour qu'une hypo reste « à jeun » (U). */
export const FASTING_MAX_IOB_U = 0.3;
/**
 * Une hypo n'est dite « à jeun » que si une injection a bien été notée dans
 * les N heures précédentes. Sans ce garde-fou, quelqu'un qui cesse de noter
 * ses injections verrait TOUTES ses hypos classées « sans insuline rapide »,
 * et l'app lui ferait baisser sa lente à cause d'un trou de saisie.
 */
export const LOGGING_ACTIVE_WINDOW_H = 30;

/** Fenêtre courte (jours) : ce qui se passe MAINTENANT. */
export const RECENT_WINDOW_DAYS = 3;
/** Fenêtre longue (jours). */
export const LONG_WINDOW_DAYS = 7;
/** Après un changement de lente, on attend avant de conclure (heures). */
export const OBSERVATION_AFTER_CHANGE_H = 48;
/** Après un changement de lente, on attend avant de proposer une HAUSSE (jours). */
export const INCREASE_AFTER_CHANGE_DAYS = 5;
/** Couverture capteur minimale sur la fenêtre courte. */
export const MIN_SENSOR_COVERAGE = 0.5;
/** Cadence nominale de l'archive (minutes entre deux points). */
const ARCHIVE_CADENCE_MIN = 15;

/** Pas standard de baisse (fraction de la dose). */
export const REDUCE_STEP = 0.1;
/** Pas renforcé (hypos sévères ou très fréquentes). */
export const REDUCE_STEP_STRONG = 0.2;
/** Plafond absolu d'une baisse proposée en une fois (U). */
export const REDUCE_MAX_UNITS = 4;
/** Une hausse proposée ne dépasse jamais 1 U. */
export const INCREASE_UNITS = 1;

/** Nuits propres minimales pour juger la pente 3 h → 7 h. */
export const MIN_CLEAN_NIGHTS = 4;
/** Montée médiane 3 h → 7 h à partir de laquelle la lente est jugée faible (mg/dL). */
export const NIGHT_RISE_THRESHOLD = 30;
/** Glycémie médiane au réveil exigée pour proposer une hausse (mg/dL). */
export const WAKE_HIGH_THRESHOLD = 150;
/** Descente médiane 3 h → 7 h qui déclenche la surveillance (mg/dL). */
export const NIGHT_DROP_THRESHOLD = -30;

const MIN_MS = 60_000;
const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface BasalPoint {
  t: number;
  value: number;
}

export interface BasalBolus {
  atMs: number;
  units: number;
}

export interface DailyStrain {
  /** Jour local, `YYYY-MM-DD`. */
  day: string;
  /** Strain Whoop de la journée (0-21). */
  strain: number;
}

export interface BasalAdvisorInput {
  /** Points capteur archivés (idéalement 7 jours ou plus). */
  points: BasalPoint[];
  /** Toutes les injections de rapide (repas, corrections, 2ᵉ injections). */
  boluses: BasalBolus[];
  /** Horodatages des glucides pris sans insuline (collation, resucrage). */
  carbEntriesMs?: number[];
  /** Dose actuelle de lente (U). */
  basalDose: number;
  /** Dernier changement de dose de lente (ms). */
  basalChangedAtMs?: number;
  nowMs: number;
  /**
   * Fuseau à utiliser pour les heures locales. Absent côté navigateur (le
   * fuseau de l'appareil est le bon) ; obligatoire côté serveur, qui tourne
   * en UTC — sans lui, « la nuit » serait décalée d'une ou deux heures.
   */
  timeZone?: string;
  /** Charge d'activité quotidienne (Whoop), si connecté. */
  dailyStrain?: DailyStrain[];
}

export type DayBlock = "night" | "morning" | "afternoon" | "evening";

export interface HypoEpisode {
  startMs: number;
  endMs: number;
  minValue: number;
  pointCount: number;
  /** Aucune insuline rapide active : l'hypo vient du fond. */
  fasting: boolean;
  severe: boolean;
  block: DayBlock;
  /** Jour local `YYYY-MM-DD` du début de l'épisode. */
  day: string;
}

export interface CleanNight {
  /** Jour local du matin (`YYYY-MM-DD`). */
  day: string;
  glucoseAt3h: number;
  glucoseAt7h: number;
  /** glucoseAt7h − glucoseAt3h. */
  delta: number;
}

export interface ActivityLoad {
  /** Moyenne des 3 derniers jours complets. */
  recentAvg: number;
  /** Moyenne des jours précédents (référence). */
  baselineAvg: number;
  /** La charge récente est nettement au-dessus de l'habitude. */
  elevated: boolean;
}

export type BasalStatus =
  | "reduce"
  | "increase"
  | "watch"
  | "ok"
  | "observing"
  | "insufficient";

export interface BasalAdvice {
  status: BasalStatus;
  currentDose: number;
  /** Dose proposée — uniquement pour `reduce` et `increase`. */
  proposedDose: number | null;
  /** Titre court, lisible seul. */
  headline: string;
  /** Faits observés qui justifient le verdict, une phrase chacun. */
  reasons: string[];
  /** Ce qu'il faut surveiller après avoir appliqué (ou en attendant). */
  followUp: string | null;
  evidence: {
    /** Épisodes d'hypo sur la fenêtre courte. */
    recentEpisodes: number;
    /** Dont à jeun d'insuline rapide. */
    recentFasting: number;
    /** Épisodes à jeun sur la fenêtre longue. */
    longFasting: number;
    /** Épisodes sévères (< 54) à jeun sur la fenêtre courte. */
    recentSevereFasting: number;
    cleanNights: number;
    /** Variation médiane 3 h → 7 h sur les nuits propres (mg/dL). */
    medianNightDelta: number | null;
    medianWakeGlucose: number | null;
    /** Part des points capteur attendus réellement présents (0-1). */
    coverage: number;
  };
  activity: ActivityLoad | null;
}

function blockOf(hour: number): DayBlock {
  if (hour < 6) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// ───────────────────────────────────────────────────────────────────────
// Épisodes d'hypoglycémie
// ───────────────────────────────────────────────────────────────────────

/** Insuline rapide encore active à l'instant `atMs` (U). */
function iobAt(boluses: BasalBolus[], atMs: number): number {
  const active = [];
  for (const b of boluses) {
    if (!(b.units > 0)) continue;
    const minutesAgo = (atMs - b.atMs) / MIN_MS;
    if (!Number.isFinite(minutesAgo) || minutesAgo < 0 || minutesAgo > 360) continue;
    active.push({ units: b.units, minutesAgo });
  }
  return activeIOB(active);
}

function hasBolusBefore(boluses: BasalBolus[], atMs: number, withinMin: number): boolean {
  const from = atMs - withinMin * MIN_MS;
  return boluses.some((b) => b.units > 0 && b.atMs >= from && b.atMs <= atMs);
}

/**
 * Regroupe les points sous 70 en épisodes et dit, pour chacun, si de
 * l'insuline rapide pouvait en être la cause.
 */
export function detectHypoEpisodes(
  points: BasalPoint[],
  boluses: BasalBolus[],
  timeZone?: string,
): HypoEpisode[] {
  const lows = points
    .filter((p) => Number.isFinite(p.value) && p.value < BASAL_HYPO_THRESHOLD)
    .sort((a, b) => a.t - b.t);

  const groups: BasalPoint[][] = [];
  for (const p of lows) {
    const last = groups[groups.length - 1];
    if (last && p.t - last[last.length - 1].t <= EPISODE_MERGE_GAP_MIN * MIN_MS) {
      last.push(p);
    } else {
      groups.push([p]);
    }
  }

  const episodes: HypoEpisode[] = [];
  for (const g of groups) {
    const minValue = Math.min(...g.map((p) => p.value));
    if (g.length < 2 && minValue >= SINGLE_POINT_MIN_DEPTH) continue;
    const startMs = g[0].t;
    const { hour, day } = localParts(startMs, timeZone);
    const fasting =
      hasBolusBefore(boluses, startMs, LOGGING_ACTIVE_WINDOW_H * 60) &&
      !hasBolusBefore(boluses, startMs, FASTING_BOLUS_FREE_MIN) &&
      iobAt(boluses, startMs) <= FASTING_MAX_IOB_U;
    episodes.push({
      startMs,
      endMs: g[g.length - 1].t,
      minValue,
      pointCount: g.length,
      fasting,
      severe: minValue < BASAL_SEVERE_THRESHOLD,
      block: blockOf(hour),
      day,
    });
  }
  return episodes;
}

// ───────────────────────────────────────────────────────────────────────
// Nuits propres : variation 3 h → 7 h
// ───────────────────────────────────────────────────────────────────────

/** Point le plus proche de `target`, dans une tolérance en minutes. */
function nearest(points: BasalPoint[], target: number, toleranceMin: number): BasalPoint | null {
  let best: BasalPoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const d = Math.abs(p.t - target);
    if (d < bestDelta) {
      bestDelta = d;
      best = p;
    }
  }
  return best && bestDelta <= toleranceMin * MIN_MS ? best : null;
}

/**
 * Nuits « propres » : aucune insuline rapide ni glucide entre 22 h 30 la
 * veille et 7 h. La fenêtre 3 h → 7 h est celle où plus rien d'autre que la
 * lente (et le phénomène de l'aube) n'agit : le dîner de 19 h 30 a fini
 * d'être digéré, le bolus du dîner a fini d'agir.
 */
export function findCleanNights(
  points: BasalPoint[],
  boluses: BasalBolus[],
  carbEntriesMs: number[],
  fromMs: number,
  nowMs: number,
  timeZone?: string,
): CleanNight[] {
  // Un repère « 3 h locale » par jour présent dans les points.
  const threeAmByDay = new Map<string, number>();
  for (const p of points) {
    if (p.t < fromMs || p.t > nowMs) continue;
    const { hour, minute, day } = localParts(p.t, timeZone);
    if (hour !== 3) continue;
    const anchor = p.t - minute * MIN_MS;
    const known = threeAmByDay.get(day);
    if (known === undefined || anchor < known) threeAmByDay.set(day, anchor);
  }

  const nights: CleanNight[] = [];
  for (const [day, threeAm] of threeAmByDay) {
    const sevenAm = threeAm + 4 * HOUR_MS;
    if (sevenAm > nowMs) continue;
    const quietFrom = threeAm - 4.5 * HOUR_MS; // 22 h 30 la veille
    const disturbed =
      boluses.some((b) => b.units > 0 && b.atMs >= quietFrom && b.atMs <= sevenAm) ||
      carbEntriesMs.some((t) => t >= quietFrom && t <= sevenAm);
    if (disturbed) continue;
    const at3 = nearest(points, threeAm, 30);
    const at7 = nearest(points, sevenAm, 30);
    if (!at3 || !at7) continue;
    nights.push({
      day,
      glucoseAt3h: at3.value,
      glucoseAt7h: at7.value,
      delta: at7.value - at3.value,
    });
  }
  return nights.sort((a, b) => a.day.localeCompare(b.day));
}

// ───────────────────────────────────────────────────────────────────────
// Charge d'activité
// ───────────────────────────────────────────────────────────────────────

/**
 * Compare la charge des 3 derniers jours COMPLETS à celle des jours
 * précédents. Le jour en cours est écarté : son strain n'est pas fini.
 */
export function assessActivityLoad(
  dailyStrain: DailyStrain[] | undefined,
  today: string,
): ActivityLoad | null {
  if (!dailyStrain || dailyStrain.length === 0) return null;
  const complete = dailyStrain
    .filter((d) => d.day < today && Number.isFinite(d.strain))
    .sort((a, b) => a.day.localeCompare(b.day));
  if (complete.length < 6) return null;
  const recent = complete.slice(-3);
  const baseline = complete.slice(0, -3);
  const avg = (xs: DailyStrain[]) => xs.reduce((s, d) => s + d.strain, 0) / xs.length;
  const recentAvg = Math.round(avg(recent) * 10) / 10;
  const baselineAvg = Math.round(avg(baseline) * 10) / 10;
  return {
    recentAvg,
    baselineAvg,
    elevated: recentAvg >= 12 && recentAvg - baselineAvg >= 2,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Entrées depuis le store
// ───────────────────────────────────────────────────────────────────────

interface StoreInsulinLog {
  units: number;
  injectedAt: Date | string | number;
}

interface StoreCarbEntry {
  eatenAt: string;
  insulinUnits?: number;
}

/**
 * Traduit les journaux du store en entrées de l'analyse. Mapper unique,
 * utilisé par l'écran ET par la vérification serveur : les deux doivent
 * classer une hypo de la même façon.
 *
 * Un `CarbEntry` avec de l'insuline compte comme un bolus ; sans insuline,
 * c'est une prise de glucides qui écarte la nuit du calcul de pente.
 */
export function buildBasalInputs(
  insulinLogs: StoreInsulinLog[] | undefined,
  carbEntries: StoreCarbEntry[] | undefined,
): { boluses: BasalBolus[]; carbEntriesMs: number[] } {
  const boluses: BasalBolus[] = [];
  for (const log of insulinLogs ?? []) {
    const atMs = new Date(log.injectedAt).getTime();
    if (Number.isFinite(atMs) && log.units > 0) boluses.push({ atMs, units: log.units });
  }
  const carbEntriesMs: number[] = [];
  for (const entry of carbEntries ?? []) {
    const atMs = new Date(entry.eatenAt).getTime();
    if (!Number.isFinite(atMs)) continue;
    if ((entry.insulinUnits ?? 0) > 0) {
      boluses.push({ atMs, units: entry.insulinUnits as number });
    } else {
      carbEntriesMs.push(atMs);
    }
  }
  return { boluses, carbEntriesMs };
}

// ───────────────────────────────────────────────────────────────────────
// Verdict
// ───────────────────────────────────────────────────────────────────────

function distinctDays(episodes: HypoEpisode[]): number {
  return new Set(episodes.map((e) => e.day)).size;
}

function fr(n: number): string {
  return String(n).replace(".", ",");
}

function plural(n: number, singular: string, pluralForm: string): string {
  return `${n} ${n > 1 ? pluralForm : singular}`;
}

/** Baisse proposée (U entières), bornée. */
export function reductionUnits(dose: number, strong: boolean): number {
  const step = strong ? REDUCE_STEP_STRONG : REDUCE_STEP;
  const raw = Math.round(dose * step);
  return Math.max(1, Math.min(REDUCE_MAX_UNITS, raw));
}

export function analyzeBasal(input: BasalAdvisorInput): BasalAdvice {
  const { nowMs, timeZone } = input;
  const dose = input.basalDose;
  const boluses = input.boluses.filter((b) => Number.isFinite(b.atMs) && b.units > 0);
  const carbEntriesMs = (input.carbEntriesMs ?? []).filter((t) => Number.isFinite(t));
  const changedAt =
    input.basalChangedAtMs !== undefined && Number.isFinite(input.basalChangedAtMs)
      ? input.basalChangedAtMs
      : undefined;

  // La fenêtre ne remonte jamais avant le dernier changement de lente : ce
  // qui s'est passé sous l'ancienne dose ne dit rien de la nouvelle.
  const longFrom = Math.max(nowMs - LONG_WINDOW_DAYS * DAY_MS, changedAt ?? 0);
  const recentFrom = Math.max(nowMs - RECENT_WINDOW_DAYS * DAY_MS, changedAt ?? 0);

  const points = input.points
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value) && p.t <= nowMs)
    .sort((a, b) => a.t - b.t);
  const longPoints = points.filter((p) => p.t >= longFrom);
  const recentPoints = longPoints.filter((p) => p.t >= recentFrom);

  const expectedRecent = Math.max(1, (nowMs - recentFrom) / (ARCHIVE_CADENCE_MIN * MIN_MS));
  const coverage = Math.min(1, recentPoints.length / expectedRecent);

  const episodes = detectHypoEpisodes(longPoints, boluses, timeZone);
  const recent = episodes.filter((e) => e.startMs >= recentFrom);
  const recentFasting = recent.filter((e) => e.fasting);
  const longFasting = episodes.filter((e) => e.fasting);
  const recentSevereFasting = recentFasting.filter((e) => e.severe);

  const nights = findCleanNights(longPoints, boluses, carbEntriesMs, longFrom, nowMs, timeZone);
  const medianNightDelta = median(nights.map((n) => n.delta));
  const medianWakeGlucose = median(nights.map((n) => n.glucoseAt7h));

  const today = localParts(nowMs, timeZone).day;
  const activity = assessActivityLoad(input.dailyStrain, today);

  const evidence: BasalAdvice["evidence"] = {
    recentEpisodes: recent.length,
    recentFasting: recentFasting.length,
    longFasting: longFasting.length,
    recentSevereFasting: recentSevereFasting.length,
    cleanNights: nights.length,
    medianNightDelta: medianNightDelta === null ? null : Math.round(medianNightDelta),
    medianWakeGlucose: medianWakeGlucose === null ? null : Math.round(medianWakeGlucose),
    coverage: Math.round(coverage * 100) / 100,
  };

  const base = { currentDose: dose, evidence, activity };

  if (!(dose > 0)) {
    return {
      ...base,
      status: "insufficient",
      proposedDose: null,
      headline: "Dose de lente non renseignée",
      reasons: ["Renseigne ta dose de lente dans Paramètres pour activer l'analyse."],
      followUp: null,
    };
  }

  // ── Changement récent : on observe, on ne conclut pas ──────────────────
  if (changedAt !== undefined && nowMs - changedAt < OBSERVATION_AFTER_CHANGE_H * HOUR_MS) {
    const hours = Math.round((nowMs - changedAt) / HOUR_MS);
    const since = hours < 1 ? "il y a moins d'une heure" : `il y a ${hours} h`;
    const reasons = [
      `Tu as changé ta lente ${since}. Une lente met environ 2 jours à donner son plein effet : je ne conclus rien avant.`,
    ];
    if (recent.length > 0) {
      reasons.push(
        `Depuis le changement : ${plural(recent.length, "hypo", "hypos")}, dont ${recentFasting.length} sans insuline rapide active.`,
      );
    }
    return {
      ...base,
      status: "observing",
      proposedDose: null,
      headline: "Lente modifiée récemment — observation en cours",
      reasons,
      followUp: null,
    };
  }

  if (coverage < MIN_SENSOR_COVERAGE) {
    return {
      ...base,
      status: "insufficient",
      proposedDose: null,
      headline: "Pas assez de données capteur",
      reasons: [
        `Seulement ${Math.round(coverage * 100)} % des mesures attendues sur les 3 derniers jours. Impossible de juger la lente sans courbe.`,
      ],
      followUp: null,
    };
  }

  // ── Baisse ─────────────────────────────────────────────────────────────
  const blocks = new Set(recent.map((e) => e.block));
  const ruleFastingRecent = recentFasting.length >= 2 && distinctDays(recentFasting) >= 2;
  const ruleFastingLong = longFasting.length >= 3 && distinctDays(longFasting) >= 3;
  const ruleDiffuse = recent.length >= 4 && distinctDays(recent) >= 2 && blocks.size >= 3;

  if (ruleFastingRecent || ruleFastingLong || ruleDiffuse) {
    const strong = recentSevereFasting.length >= 1 || recentFasting.length >= 4;
    const units = reductionUnits(dose, strong);
    const proposed = Math.max(0, dose - units);
    const reasons: string[] = [];

    if (ruleFastingRecent || ruleFastingLong) {
      const list = ruleFastingRecent ? recentFasting : longFasting;
      const span = ruleFastingRecent ? "3 derniers jours" : "7 derniers jours";
      reasons.push(
        `${plural(list.length, "hypo", "hypos")} sur les ${span} sans insuline rapide active (aucun bolus dans les 4 h avant). Ces hypos-là ne peuvent pas venir d'un repas : elles viennent de la lente.`,
      );
    }
    if (ruleDiffuse) {
      reasons.push(
        `${recent.length} hypos en 3 jours, à des moments différents de la journée. Quand ça tombe à toute heure, ce n'est pas un repas en particulier qui est trop dosé : c'est le fond.`,
      );
    }
    if (recentSevereFasting.length > 0) {
      const lowest = Math.min(...recentSevereFasting.map((e) => e.minValue));
      reasons.push(`Dont ${plural(recentSevereFasting.length, "hypo sévère", "hypos sévères")} (jusqu'à ${lowest} mg/dL).`);
    }
    if (medianNightDelta !== null && nights.length >= 2 && medianNightDelta <= NIGHT_DROP_THRESHOLD) {
      reasons.push(
        `Tes nuits sans repas ni correction descendent de ${Math.abs(Math.round(medianNightDelta))} mg/dL entre 3 h et 7 h.`,
      );
    }
    if (activity?.elevated) {
      reasons.push(
        `Ta charge d'activité est haute ces 3 jours (strain ${fr(activity.recentAvg)} contre ${fr(activity.baselineAvg)} d'habitude) : c'est la cause la plus probable. L'activité rend l'insuline plus efficace pendant 24 à 48 h.`,
      );
    }
    return {
      ...base,
      status: "reduce",
      proposedDose: proposed,
      headline: `Baisse ta lente de ${units} U (${dose} → ${proposed} U)`,
      reasons,
      followUp: activity?.elevated
        ? "Quand ton activité redescend, tes glycémies du matin vont remonter : je te proposerai de revenir à ta dose habituelle."
        : "Je refais le point 2 jours après le changement. Si tes matins montent au-dessus de 150 sans hypo, je te proposerai de remonter.",
    };
  }

  // ── Hausse (strict : la seule conclusion qui ajoute de l'insuline) ─────
  const noLowAtAll = !longPoints.some((p) => p.value < BASAL_HYPO_THRESHOLD);
  const changeOldEnough =
    changedAt === undefined || nowMs - changedAt >= INCREASE_AFTER_CHANGE_DAYS * DAY_MS;
  const fullWeek = nowMs - longFrom >= (LONG_WINDOW_DAYS - 1) * DAY_MS;
  const risingNights = nights.filter((n) => n.delta > 0).length;

  if (
    noLowAtAll &&
    changeOldEnough &&
    fullWeek &&
    nights.length >= MIN_CLEAN_NIGHTS &&
    medianNightDelta !== null &&
    medianWakeGlucose !== null &&
    medianNightDelta >= NIGHT_RISE_THRESHOLD &&
    medianWakeGlucose >= WAKE_HIGH_THRESHOLD &&
    risingNights / nights.length >= 0.75
  ) {
    const proposed = dose + INCREASE_UNITS;
    return {
      ...base,
      status: "increase",
      proposedDose: proposed,
      headline: `Monte ta lente de ${INCREASE_UNITS} U (${dose} → ${proposed} U)`,
      reasons: [
        `Sur ${nights.length} nuits sans repas ni correction, ta glycémie monte de ${Math.round(medianNightDelta)} mg/dL entre 3 h et 7 h et tu te réveilles vers ${Math.round(medianWakeGlucose)} mg/dL.`,
        "Aucune hypo sur les 7 derniers jours : il y a de la marge.",
        ...(activity && !activity.elevated && activity.recentAvg < activity.baselineAvg - 2
          ? [
              `Ton activité a baissé (strain ${fr(activity.recentAvg)} contre ${fr(activity.baselineAvg)}) : tu as besoin de plus d'insuline de fond.`,
            ]
          : []),
      ],
      followUp:
        "Une unité à la fois. Je refais le point 5 jours après, et à la première hypo sans insuline rapide je te propose de redescendre.",
    };
  }

  // ── Surveillance ───────────────────────────────────────────────────────
  if (longFasting.length >= 1) {
    const lowest = Math.min(...longFasting.map((e) => e.minValue));
    return {
      ...base,
      status: "watch",
      proposedDose: null,
      headline: "Hypo sans insuline rapide — je surveille",
      reasons: [
        `${plural(longFasting.length, "hypo", "hypos")} (jusqu'à ${lowest} mg/dL) sans bolus dans les 4 h avant, sur ${plural(distinctDays(longFasting), "jour", "jours")}. Pas encore assez pour conclure ; une de plus un autre jour et je te proposerai de baisser la lente.`,
        ...(activity?.elevated
          ? [`Ta charge d'activité est haute (strain ${fr(activity.recentAvg)} contre ${fr(activity.baselineAvg)}) : reste attentif.`]
          : []),
      ],
      followUp: null,
    };
  }
  if (
    nights.length >= 3 &&
    medianNightDelta !== null &&
    medianNightDelta <= NIGHT_DROP_THRESHOLD
  ) {
    return {
      ...base,
      status: "watch",
      proposedDose: null,
      headline: "Tes nuits descendent — je surveille",
      reasons: [
        `Sur ${nights.length} nuits sans repas ni correction, ta glycémie descend de ${Math.abs(Math.round(medianNightDelta))} mg/dL entre 3 h et 7 h. Pas encore d'hypo, mais c'est le signe d'une lente un peu forte.`,
      ],
      followUp: "Couche-toi un peu plus haut (au-dessus de 120) tant que ça dure.",
    };
  }
  if (activity?.elevated && recent.length >= 1) {
    return {
      ...base,
      status: "watch",
      proposedDose: null,
      headline: "Activité élevée — je surveille tes hypos",
      reasons: [
        `Charge d'activité haute ces 3 jours (strain ${fr(activity.recentAvg)} contre ${fr(activity.baselineAvg)}) et déjà ${plural(recent.length, "hypo", "hypos")}. Si ça continue, je te proposerai de baisser la lente.`,
      ],
      followUp: null,
    };
  }

  // ── Rien à signaler ────────────────────────────────────────────────────
  const reasons: string[] = [];
  if (longFasting.length === 0) {
    reasons.push("Aucune hypo sans insuline rapide active sur les 7 derniers jours.");
  }
  if (nights.length >= 2 && medianNightDelta !== null) {
    const d = Math.round(medianNightDelta);
    reasons.push(
      `Entre 3 h et 7 h, ta glycémie ${d >= 0 ? "monte" : "descend"} de ${Math.abs(d)} mg/dL (${nights.length} nuits sans repas ni correction).`,
    );
  } else {
    reasons.push(
      "Pas assez de nuits sans repas ni correction tardive pour mesurer la pente de fin de nuit.",
    );
  }
  if (recent.length > recentFasting.length) {
    reasons.push(
      `${plural(recent.length - recentFasting.length, "hypo", "hypos")} avec de l'insuline rapide encore active : ça regarde les ratios des repas, pas la lente.`,
    );
  }
  return {
    ...base,
    status: "ok",
    proposedDose: null,
    headline: "Ta lente tient la route",
    reasons,
    followUp: null,
  };
}
