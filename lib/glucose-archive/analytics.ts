/**
 * Glucose Analytics — moteur stats déterministe (Phase 10b).
 *
 * Construit un rapport hebdomadaire structuré à partir de l'archive 90j.
 * Pas d'IA ici : tout est calcul pur et reproductible. L'IA (Phase 10c)
 * lit ce rapport pour générer le bilan en langage naturel.
 *
 * Sections produites :
 *  - overall : TIR, moyenne, SD, CV, hypo/hyper count
 *  - byTimeBucket : 8 créneaux de 3h (00-03h, 03-06h, …, 21-00h)
 *  - byHour : 24 buckets (heure du jour) — alimente la viz pattern
 *  - postMeal : pour chaque mealType, courbe glycémique 0/1/2/3h post-injection
 *  - hypoEvents / hyperEvents : top épisodes (regroupés en runs continus)
 *  - byProfile : stats par profil ratio actif au moment de chaque injection
 *
 * ⚠️ Pure function. Aucun import serveur (kv, server-only). Testable en standalone.
 */

import { GLUCOSE_THRESHOLDS } from "@/lib/libre-link/config";
import { resolveCarbs } from "@/lib/insulin-log-values";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import type { InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Types output
// ───────────────────────────────────────────────────────────────────────

export interface GlucoseStatsSummary {
  count: number;
  avg: number;
  sd: number;
  cv: number;
  tirPct: number;
  hypoPct: number;
  lowPct: number;
  highPct: number;
  hyperPct: number;
  hypoCount: number;
  hyperCount: number;
  /** Phase 11 Bloc 4 — Glucose Management Indicator (≈ HbA1c %).
   *  Formule : 3.31 + 0.02392 × meanGlucose_mg_dL. Référence ADA 2018. */
  gmi: number;
  /** Glycemia Risk Index (Klonoff et al.) — score composite 0-100.
   *  Pondère vlow/low/vhigh/high. Plus c'est haut, plus c'est risqué. */
  gri: number;
  /** % temps < 54 mg/dL (vlow, hypo sévère). */
  vLowPct: number;
  /** % temps > 250 mg/dL (vhigh, hyper sévère). */
  vHighPct: number;
}

export interface TimeBucketStats {
  /** Label "00-03h", "03-06h", … */
  label: string;
  startHour: number;
  endHour: number;
  count: number;
  avg: number;
  sd: number;
  tirPct: number;
  hypoPct: number;
  highPct: number;
  hyperPct: number;
}

export interface HourBucket {
  hour: number;
  hourLabel: string;
  count: number;
  avg: number | null;
  min: number | null;
  max: number | null;
}

export interface PostMealResponse {
  mealType: string;          // 'morning' | 'lunch' | 'snack' | 'dinner' | 'correction' | …
  injectionsCount: number;   // nb d'injections analysées
  avgCarbs: number;          // glucides moyens injectés
  avgUnits: number;          // unités moyennes
  /** Glycémie moyenne au moment T (0min / +60 / +120 / +180 min). */
  curve: {
    tMinutes: number;
    avgGlucose: number | null;
    sampleCount: number;
  }[];
  /** Pic moyen post-injection (max sur la fenêtre 3h). */
  avgPeak: number | null;
  /** Delta moyen (peak - T0). */
  avgDelta: number | null;
  /** Nb d'injections où la glycémie est repassée < 80 dans les 3h (hypo post-bolus). */
  hypoFollowupCount: number;
}

export interface GlucoseEvent {
  startMs: number;
  endMs: number;
  durationMin: number;
  minValue: number;          // pour hypos : creux
  maxValue: number;          // pour hypers : pic
  pointCount: number;
}

export interface ProfileSegmentStats {
  profileId: string;
  profileName?: string;
  injectionsCount: number;
  /** Stats sur la fenêtre 3h post-injection pour ce profil. */
  avgPeak: number | null;
  avgDelta: number | null;
  hypoFollowupCount: number;
}

export interface WeeklyReport {
  /** Période analysée. */
  range: { fromMs: number; toMs: number; days: number };
  /** Nb total de points dans la fenêtre. */
  pointsCount: number;
  /** Nb d'injections dans la fenêtre. */
  injectionsCount: number;

  overall: GlucoseStatsSummary;
  byTimeBucket: TimeBucketStats[];
  byHour: HourBucket[];
  postMeal: PostMealResponse[];
  /** Top 5 épisodes hypos / hypers. */
  hypoEvents: GlucoseEvent[];
  hyperEvents: GlucoseEvent[];
  /** Stats par profil ratio (Phase 10a). */
  byProfile: ProfileSegmentStats[];

  /** Heures du jour les + à risque (top 3 par glycémie moyenne). */
  riskyHours: HourBucket[];
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
const MIN_MS = 60 * 1000;

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 1000) / 10; // 1 décimale
}

function round(v: number, d = 0): number {
  const f = 10 ** d;
  return Math.round(v * f) / f;
}

// Seuil sévère pour GRI (vlow/vhigh distinct des bornes targetRange standards)
const VLOW_THRESHOLD = 54;
const VHIGH_THRESHOLD = 250;

function statsForValues(values: number[]): GlucoseStatsSummary {
  if (values.length === 0) {
    return {
      count: 0,
      avg: 0,
      sd: 0,
      cv: 0,
      tirPct: 0,
      hypoPct: 0,
      lowPct: 0,
      highPct: 0,
      hyperPct: 0,
      hypoCount: 0,
      hyperCount: 0,
      gmi: 0,
      gri: 0,
      vLowPct: 0,
      vHighPct: 0,
    };
  }
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  const cv = avg > 0 ? (sd / avg) * 100 : 0;

  let hypo = 0,
    low = 0,
    target = 0,
    high = 0,
    hyper = 0,
    vLow = 0,
    vHigh = 0;
  for (const v of values) {
    if (v < VLOW_THRESHOLD) vLow++;
    if (v < GLUCOSE_THRESHOLDS.hypo) hypo++;
    else if (v < GLUCOSE_THRESHOLDS.low) low++;
    else if (v <= GLUCOSE_THRESHOLDS.high) target++;
    else if (v <= GLUCOSE_THRESHOLDS.hyper) high++;
    else hyper++;
    if (v > VHIGH_THRESHOLD) vHigh++;
  }

  const total = values.length;
  const vLowPct = pct(vLow, total);
  const lowPct = pct(low, total);
  const highPct = pct(high, total);
  const vHighPct = pct(vHigh, total);

  // GMI ≈ HbA1c (formule Bergenstal et al. 2018)
  const gmi = round(3.31 + 0.02392 * avg, 2);

  // GRI (Klonoff et al. 2022)
  // GRI = 3.0×vLow + 2.4×low + 1.6×vHigh + 0.8×high (capé à 100)
  const griRaw = 3.0 * vLowPct + 2.4 * lowPct + 1.6 * vHighPct + 0.8 * highPct;
  const gri = Math.max(0, Math.min(100, round(griRaw, 1)));

  return {
    count: total,
    avg: round(avg),
    sd: round(sd),
    cv: round(cv),
    tirPct: pct(target, total),
    hypoPct: pct(hypo, total),
    lowPct,
    highPct,
    hyperPct: pct(hyper, total),
    hypoCount: hypo,
    hyperCount: hyper,
    gmi,
    gri,
    vLowPct,
    vHighPct,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Time buckets (8 × 3h)
// ───────────────────────────────────────────────────────────────────────

const TIME_BUCKETS: { startHour: number; endHour: number; label: string }[] = [
  { startHour: 0, endHour: 3, label: "00-03h" },
  { startHour: 3, endHour: 6, label: "03-06h" },
  { startHour: 6, endHour: 9, label: "06-09h" },
  { startHour: 9, endHour: 12, label: "09-12h" },
  { startHour: 12, endHour: 15, label: "12-15h" },
  { startHour: 15, endHour: 18, label: "15-18h" },
  { startHour: 18, endHour: 21, label: "18-21h" },
  { startHour: 21, endHour: 24, label: "21-00h" },
];

function aggregateByTimeBucket(points: ArchivedPoint[]): TimeBucketStats[] {
  return TIME_BUCKETS.map((bucket) => {
    const inBucket = points.filter((p) => {
      const h = new Date(p.t).getHours();
      return h >= bucket.startHour && h < bucket.endHour;
    });
    const stats = statsForValues(inBucket.map((p) => p.value));
    return {
      label: bucket.label,
      startHour: bucket.startHour,
      endHour: bucket.endHour,
      count: stats.count,
      avg: stats.avg,
      sd: stats.sd,
      tirPct: stats.tirPct,
      hypoPct: stats.hypoPct,
      highPct: stats.highPct,
      hyperPct: stats.hyperPct,
    };
  });
}

// ───────────────────────────────────────────────────────────────────────
// Hour buckets (24 × 1h)
// ───────────────────────────────────────────────────────────────────────

function aggregateByHour(points: ArchivedPoint[]): HourBucket[] {
  const buckets = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    hourLabel: `${String(h).padStart(2, "0")}h`,
    sum: 0,
    count: 0,
    min: Infinity,
    max: -Infinity,
  }));

  for (const p of points) {
    const h = new Date(p.t).getHours();
    const b = buckets[h];
    b.sum += p.value;
    b.count += 1;
    if (p.value < b.min) b.min = p.value;
    if (p.value > b.max) b.max = p.value;
  }

  return buckets.map((b) => ({
    hour: b.hour,
    hourLabel: b.hourLabel,
    count: b.count,
    avg: b.count > 0 ? round(b.sum / b.count) : null,
    min: b.count > 0 ? b.min : null,
    max: b.count > 0 ? b.max : null,
  }));
}

// ───────────────────────────────────────────────────────────────────────
// Hypo / Hyper events (runs continus de points hors plage)
// ───────────────────────────────────────────────────────────────────────

/** Détecte des "runs" continus de points en zone donnée (gap max 30 min). */
function detectEvents(
  sortedPoints: ArchivedPoint[],
  predicate: (v: number) => boolean,
  maxGapMin = 30,
): GlucoseEvent[] {
  const events: GlucoseEvent[] = [];
  const maxGapMs = maxGapMin * MIN_MS;

  let current: GlucoseEvent | null = null;

  for (const p of sortedPoints) {
    if (predicate(p.value)) {
      if (!current) {
        current = {
          startMs: p.t,
          endMs: p.t,
          durationMin: 0,
          minValue: p.value,
          maxValue: p.value,
          pointCount: 1,
        };
      } else if (p.t - current.endMs <= maxGapMs) {
        current.endMs = p.t;
        if (p.value < current.minValue) current.minValue = p.value;
        if (p.value > current.maxValue) current.maxValue = p.value;
        current.pointCount += 1;
      } else {
        // Gap trop large → flush et redémarre
        current.durationMin = round((current.endMs - current.startMs) / MIN_MS);
        events.push(current);
        current = {
          startMs: p.t,
          endMs: p.t,
          durationMin: 0,
          minValue: p.value,
          maxValue: p.value,
          pointCount: 1,
        };
      }
    } else if (current) {
      current.durationMin = round((current.endMs - current.startMs) / MIN_MS);
      events.push(current);
      current = null;
    }
  }
  if (current) {
    current.durationMin = round((current.endMs - current.startMs) / MIN_MS);
    events.push(current);
  }

  return events;
}

// ───────────────────────────────────────────────────────────────────────
// Post-meal response
// ───────────────────────────────────────────────────────────────────────

const POST_MEAL_OFFSETS_MIN = [0, 60, 120, 180]; // T+0, +1h, +2h, +3h
const POST_MEAL_TOLERANCE_MIN = 15; // ±15 min autour de chaque offset

function findGlucoseAt(
  points: ArchivedPoint[],
  targetMs: number,
  toleranceMs = POST_MEAL_TOLERANCE_MIN * MIN_MS,
): number | null {
  // Recherche le point le plus proche dans la tolérance
  let best: ArchivedPoint | null = null;
  let bestDist = Infinity;
  for (const p of points) {
    const d = Math.abs(p.t - targetMs);
    if (d <= toleranceMs && d < bestDist) {
      best = p;
      bestDist = d;
    }
  }
  return best ? best.value : null;
}

function aggregatePostMeal(
  points: ArchivedPoint[],
  injections: { t: number; mealType: string; carbs: number; units: number }[],
): PostMealResponse[] {
  // Group injections by mealType
  const byMeal = new Map<string, typeof injections>();
  for (const inj of injections) {
    const list = byMeal.get(inj.mealType) ?? [];
    list.push(inj);
    byMeal.set(inj.mealType, list);
  }

  const result: PostMealResponse[] = [];

  for (const [mealType, list] of byMeal.entries()) {
    if (list.length === 0) continue;

    const curve = POST_MEAL_OFFSETS_MIN.map((off) => {
      const samples: number[] = [];
      for (const inj of list) {
        const target = inj.t + off * MIN_MS;
        const v = findGlucoseAt(points, target);
        if (v !== null) samples.push(v);
      }
      const avg = samples.length > 0 ? round(samples.reduce((s, v) => s + v, 0) / samples.length) : null;
      return { tMinutes: off, avgGlucose: avg, sampleCount: samples.length };
    });

    // Pour chaque injection, on cherche le pic dans 0-3h
    let peakSum = 0;
    let peakCount = 0;
    let deltaSum = 0;
    let deltaCount = 0;
    let hypoFollowup = 0;

    for (const inj of list) {
      const windowEnd = inj.t + 180 * MIN_MS;
      const windowPoints = points.filter((p) => p.t >= inj.t && p.t <= windowEnd);
      if (windowPoints.length === 0) continue;

      const peak = Math.max(...windowPoints.map((p) => p.value));
      peakSum += peak;
      peakCount += 1;

      const t0 = findGlucoseAt(points, inj.t);
      if (t0 !== null) {
        deltaSum += peak - t0;
        deltaCount += 1;
      }

      const hasHypoFollowup = windowPoints.some(
        (p) => p.value < GLUCOSE_THRESHOLDS.low,
      );
      if (hasHypoFollowup) hypoFollowup += 1;
    }

    const avgCarbs =
      list.reduce((s, i) => s + i.carbs, 0) / list.length;
    const avgUnits =
      list.reduce((s, i) => s + i.units, 0) / list.length;

    result.push({
      mealType,
      injectionsCount: list.length,
      avgCarbs: round(avgCarbs, 1),
      avgUnits: round(avgUnits, 2),
      curve,
      avgPeak: peakCount > 0 ? round(peakSum / peakCount) : null,
      avgDelta: deltaCount > 0 ? round(deltaSum / deltaCount) : null,
      hypoFollowupCount: hypoFollowup,
    });
  }

  // Order: morning, lunch, snack, dinner, correction, other, autres inconnus
  const order = ["morning", "lunch", "snack", "dinner", "correction", "other"];
  result.sort((a, b) => {
    const ai = order.indexOf(a.mealType);
    const bi = order.indexOf(b.mealType);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  return result;
}

// ───────────────────────────────────────────────────────────────────────
// Stats par profil ratio (Phase 10a)
// ───────────────────────────────────────────────────────────────────────

function aggregateByProfile(
  points: ArchivedPoint[],
  injections: { t: number; profileId?: string; units: number }[],
  profileNameById: Map<string, string>,
): ProfileSegmentStats[] {
  const byProfile = new Map<string, typeof injections>();
  for (const inj of injections) {
    if (!inj.profileId) continue;
    const list = byProfile.get(inj.profileId) ?? [];
    list.push(inj);
    byProfile.set(inj.profileId, list);
  }

  const result: ProfileSegmentStats[] = [];
  for (const [profileId, list] of byProfile.entries()) {
    let peakSum = 0,
      peakCount = 0,
      deltaSum = 0,
      deltaCount = 0,
      hypoFollowup = 0;

    for (const inj of list) {
      const windowEnd = inj.t + 180 * MIN_MS;
      const windowPoints = points.filter((p) => p.t >= inj.t && p.t <= windowEnd);
      if (windowPoints.length === 0) continue;

      const peak = Math.max(...windowPoints.map((p) => p.value));
      peakSum += peak;
      peakCount += 1;

      const t0 = findGlucoseAt(points, inj.t);
      if (t0 !== null) {
        deltaSum += peak - t0;
        deltaCount += 1;
      }

      if (windowPoints.some((p) => p.value < GLUCOSE_THRESHOLDS.low)) {
        hypoFollowup += 1;
      }
    }

    result.push({
      profileId,
      profileName: profileNameById.get(profileId),
      injectionsCount: list.length,
      avgPeak: peakCount > 0 ? round(peakSum / peakCount) : null,
      avgDelta: deltaCount > 0 ? round(deltaSum / deltaCount) : null,
      hypoFollowupCount: hypoFollowup,
    });
  }

  return result;
}

// ───────────────────────────────────────────────────────────────────────
// Build le rapport complet
// ───────────────────────────────────────────────────────────────────────

export interface BuildReportInput {
  points: ArchivedPoint[];
  injections: (Pick<
    InsulinLog,
    "units" | "mealType" | "carbsGrams" | "carbsConfirmedGrams" | "profileId"
  > & {
    /** timestamp ms (converti depuis injectedAt). */
    t: number;
  })[];
  range: { fromMs: number; toMs: number; days: number };
  /** Map id → name pour annoter byProfile. */
  profileNameById?: Map<string, string>;
}

export function buildWeeklyReport(input: BuildReportInput): WeeklyReport {
  const { points, injections, range } = input;
  const profileNameById = input.profileNameById ?? new Map<string, string>();

  // Sort once
  const sortedPoints = [...points].sort((a, b) => a.t - b.t);

  // Overall
  const overall = statsForValues(sortedPoints.map((p) => p.value));

  // Time buckets
  const byTimeBucket = aggregateByTimeBucket(sortedPoints);

  // Hour buckets
  const byHour = aggregateByHour(sortedPoints);

  // Risky hours (top 3 par moyenne descendante, count >= 2)
  const riskyHours = [...byHour]
    .filter((h) => h.avg !== null && h.count >= 2)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
    .slice(0, 3);

  // Post-meal
  const injectionsForMeal = injections.map((i) => ({
    t: i.t,
    mealType: i.mealType,
    // Confirmé ?? estimé — sinon les courbes post-repas du bilan et du
    // Docteur raisonnent sur une estimation que le patient a corrigée.
    carbs: resolveCarbs(i),
    units: i.units,
  }));
  const postMeal = aggregatePostMeal(sortedPoints, injectionsForMeal);

  // Events hypos / hypers
  const hypoEvents = detectEvents(sortedPoints, (v) => v < GLUCOSE_THRESHOLDS.hypo, 30)
    .sort((a, b) => b.durationMin - a.durationMin)
    .slice(0, 5);

  const hyperEvents = detectEvents(sortedPoints, (v) => v > GLUCOSE_THRESHOLDS.hyper, 30)
    .sort((a, b) => b.durationMin - a.durationMin)
    .slice(0, 5);

  // Stats par profil
  const byProfile = aggregateByProfile(
    sortedPoints,
    injections.map((i) => ({ t: i.t, profileId: i.profileId, units: i.units })),
    profileNameById,
  );

  return {
    range,
    pointsCount: sortedPoints.length,
    injectionsCount: injections.length,
    overall,
    byTimeBucket,
    byHour,
    postMeal,
    hypoEvents,
    hyperEvents,
    byProfile,
    riskyHours,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Phase 11 Bloc 4 — Score quotidien + AGP simplifié
// ───────────────────────────────────────────────────────────────────────

export interface DailyScore {
  /** ISO date "YYYY-MM-DD" (jour calendaire local). */
  date: string;
  /** Timestamp ms du début de jour (00:00 local). */
  startMs: number;
  count: number;
  avg: number | null;
  cv: number | null;
  tirPct: number;
  hypoCount: number;
  /** Score composite 0-100. Null si data insuffisante (count < 24 = moins de 6h). */
  score: number | null;
}

/**
 * Score quotidien :
 *   score = 0.6×TIR + 0.2×(100−CV) + 0.2×hypoFreeBonus
 *   hypoFreeBonus = 100 si 0 hypo, 50 si 1, 0 si 2+
 * Renvoie un Map<dateISO, DailyScore>. Les jours absents de l'archive ne
 * figurent pas dans le résultat (le composant Calendar décide quoi afficher).
 */
export function buildDailyScores(points: ArchivedPoint[]): DailyScore[] {
  if (points.length === 0) return [];
  // Group par jour calendaire local (YYYY-MM-DD)
  const byDay = new Map<string, ArchivedPoint[]>();
  for (const p of points) {
    const d = new Date(p.t);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(p);
  }

  const result: DailyScore[] = [];
  for (const [dateKey, dayPoints] of byDay.entries()) {
    const [yyyy, mm, dd] = dateKey.split("-").map(Number);
    const startMs = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0).getTime();

    if (dayPoints.length < 24) {
      result.push({
        date: dateKey,
        startMs,
        count: dayPoints.length,
        avg: null,
        cv: null,
        tirPct: 0,
        hypoCount: 0,
        score: null,
      });
      continue;
    }

    const stats = statsForValues(dayPoints.map((p) => p.value));
    const hypoFreeBonus = stats.hypoCount === 0 ? 100 : stats.hypoCount === 1 ? 50 : 0;
    const score = round(
      0.6 * stats.tirPct + 0.2 * Math.max(0, 100 - stats.cv) + 0.2 * hypoFreeBonus,
      0,
    );
    result.push({
      date: dateKey,
      startMs,
      count: stats.count,
      avg: stats.avg,
      cv: stats.cv,
      tirPct: stats.tirPct,
      hypoCount: stats.hypoCount,
      score,
    });
  }

  return result.sort((a, b) => a.startMs - b.startMs);
}

export interface AgpSlot {
  /** Minute du jour (0-1439, par tranche de 30min — 48 valeurs). */
  minuteOfDay: number;
  /** "00:00", "00:30", … */
  label: string;
  count: number;
  /** Valeurs triées en ordre croissant pour calculer percentiles. */
  median: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
}

function quantile(sortedAsc: number[], q: number): number | null {
  if (sortedAsc.length === 0) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const pos = (sortedAsc.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/**
 * AGP simplifié (Ambulatory Glucose Profile) sur 14j (configurable).
 * 48 tranches de 30min (00:00, 00:30, … 23:30) avec médiane + P10/P25/P75/P90.
 * Standard : J. Bergenstal et al. — visualisation "modal day" pour
 * détecter les patterns récurrents (dawn, mid-day, post-meal…).
 */
export function buildAgpProfile(points: ArchivedPoint[]): AgpSlot[] {
  // 48 buckets de 30min
  const buckets: number[][] = Array.from({ length: 48 }, () => []);
  for (const p of points) {
    const d = new Date(p.t);
    const slotIdx = Math.floor((d.getHours() * 60 + d.getMinutes()) / 30);
    if (slotIdx >= 0 && slotIdx < 48) buckets[slotIdx].push(p.value);
  }

  return buckets.map((vals, idx) => {
    const sorted = [...vals].sort((a, b) => a - b);
    const startMin = idx * 30;
    const hh = Math.floor(startMin / 60);
    const mm = startMin % 60;
    const label = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    return {
      minuteOfDay: startMin,
      label,
      count: sorted.length,
      median: sorted.length === 0 ? null : round(quantile(sorted, 0.5)!),
      p10: sorted.length === 0 ? null : round(quantile(sorted, 0.1)!),
      p25: sorted.length === 0 ? null : round(quantile(sorted, 0.25)!),
      p75: sorted.length === 0 ? null : round(quantile(sorted, 0.75)!),
      p90: sorted.length === 0 ? null : round(quantile(sorted, 0.9)!),
    };
  });
}
