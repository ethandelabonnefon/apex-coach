/**
 * Validation des doses par créneau — sélection des repas analysables.
 *
 * Ce module ne modélise AUCUNE physiologie. Il compte des événements réels
 * (hypoglycémies) sur des repas dont on a écarté les facteurs de confusion.
 * C'est l'inverse de la démarche du prédicteur : on part des résultats
 * observés pour juger les doses, au lieu de simuler pour les dériver.
 *
 * La sélection (ici) et le verdict (analyzeSlot) sont volontairement
 * séparés : on peut tester les règles d'exclusion sans fabriquer de courbe
 * de glycémie, et le critère sans fabriquer de séances de sport.
 */

import { activeIOB, type ActiveBolus } from "./glucose-prediction";
import { resolveCarbs } from "./insulin-log-values";
import type { InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Constantes — figées par la spec, ne pas ajuster sans décision produit
// ───────────────────────────────────────────────────────────────────────

/** Un point sous ce seuil dans la fenêtre = repas fautif (mg/dL). */
export const HYPO_THRESHOLD = 70;
/** Fenêtre d'observation après le bolus (min). */
export const OBSERVATION_WINDOW_MIN = 300;
/** En dessous, aucun verdict n'est rendu. */
export const MIN_ELIGIBLE_MEALS = 3;
/** IOB au moment du bolus au-delà duquel le repas est écarté (U). */
export const IOB_EXCLUSION_U = 1.0;
/** Une séance dans les N min précédant le repas l'écarte (sensibilité post-exercice). */
export const SPORT_BEFORE_MIN = 240;
/** Plancher de la fenêtre d'analyse (jours). */
export const MIN_WINDOW_DAYS = 7;
/** Plafond de la fenêtre (jours) — rétention de l'archive. */
export const MAX_WINDOW_DAYS = 90;

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface ArchivePoint {
  t: number;
  value: number;
}

/** Séance de sport, muscu ou running confondus. */
export interface SportSession {
  /** ISO du début de séance. */
  date: string;
  durationMin: number;
}

export type ExclusionReason = "sport" | "iob" | "uncertain" | "correction";

export interface EligibleMeal {
  injectionId: string;
  mealType: string;
  injectedAt: number;
  /** Glucides retenus : confirmés si disponibles, sinon estimés. */
  carbsGrams: number;
  units: number;
  confirmed: boolean;
  glucoseBefore: number | null;
  glucoseAfter5h: number | null;
  hadHypo: boolean;
}

export interface DoseValidationInput {
  insulinLogs: InsulinLog[];
  archivePoints: ArchivePoint[];
  workouts: SportSession[];
  ratios: { morning: number; lunch: number; snack: number; dinner: number };
  /** Créneau → ISO du dernier changement de ratio. La fenêtre ne remonte jamais avant. */
  ratioChangedAt: Partial<Record<string, string>>;
  nowMs?: number;
}

export interface SlotSelection {
  meals: EligibleMeal[];
  excluded: Partial<Record<ExclusionReason, number>>;
  /** Profondeur réellement atteinte par la fenêtre (jours). */
  windowDays: number;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function toMs(v: Date | string | number): number {
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/** Point capteur le plus proche de `target`, dans une tolérance de ±15 min. */
function glucoseAt(points: ArchivePoint[], target: number): number | null {
  let best: ArchivePoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const d = Math.abs(p.t - target);
    if (d < bestDelta) {
      bestDelta = d;
      best = p;
    }
  }
  return best !== null && bestDelta <= 15 * MIN_MS ? best.value : null;
}

/** Une séance chevauche-t-elle la zone [repas − 4 h, repas + 5 h] ? */
function hasSportAround(workouts: SportSession[], mealMs: number): boolean {
  const from = mealMs - SPORT_BEFORE_MIN * MIN_MS;
  const to = mealMs + OBSERVATION_WINDOW_MIN * MIN_MS;
  return workouts.some((w) => {
    const start = toMs(w.date);
    if (!Number.isFinite(start)) return false;
    return start >= from && start <= to;
  });
}

/**
 * IOB au moment du bolus, hors le bolus lui-même. Modèle bi-exponentiel,
 * le même que la prédiction et les glucides actifs — pas un 4e modèle.
 */
function iobBefore(logs: InsulinLog[], mealMs: number, selfId: string): number {
  const boluses: ActiveBolus[] = [];
  for (const l of logs) {
    if (l.id === selfId || !(l.units > 0)) continue;
    const minutesAgo = (mealMs - toMs(l.injectedAt)) / MIN_MS;
    if (!Number.isFinite(minutesAgo) || minutesAgo <= 0 || minutesAgo > 360) continue;
    boluses.push({ units: l.units, minutesAgo });
  }
  return activeIOB(boluses);
}

/**
 * Une injection non planifiée (correction, appoint) tombe-t-elle dans la
 * fenêtre ? Le split du repas lui-même n'en est pas une : il fait partie du
 * dosage prévu pour ce repas, et l'exclure viderait le créneau du soir.
 */
function hasInterveningCorrection(
  logs: InsulinLog[],
  mealMs: number,
  mealId: string,
): boolean {
  const to = mealMs + OBSERVATION_WINDOW_MIN * MIN_MS;
  return logs.some((l) => {
    if (l.id === mealId) return false;
    if (!(l.units > 0)) return false;
    if (resolveCarbs(l) > 0) return false;
    if (l.parentInjectionId === mealId) return false;
    const t = toMs(l.injectedAt);
    return Number.isFinite(t) && t > mealMs && t <= to;
  });
}

// ───────────────────────────────────────────────────────────────────────
// Sélection
// ───────────────────────────────────────────────────────────────────────

export function selectEligibleMeals(
  input: DoseValidationInput,
  mealType: string,
): SlotSelection {
  const now = input.nowMs ?? Date.now();
  const changedAt = input.ratioChangedAt?.[mealType];
  const changedMs = changedAt ? toMs(changedAt) : null;
  const floor = Math.max(
    now - MAX_WINDOW_DAYS * DAY_MS,
    Number.isFinite(changedMs as number) && changedMs !== null ? changedMs : -Infinity,
  );

  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const bump = (r: ExclusionReason) => {
    excluded[r] = (excluded[r] ?? 0) + 1;
  };

  const candidates = (input.insulinLogs ?? [])
    .filter((l) => {
      if (!l || l.mealType !== mealType) return false;
      if (l.isSplitDose) return false;
      if (resolveCarbs(l) <= 0) return false;
      const t = toMs(l.injectedAt);
      return Number.isFinite(t) && t >= floor && t <= now;
    })
    .sort((a, b) => toMs(b.injectedAt) - toMs(a.injectedAt));

  const eligible: EligibleMeal[] = [];

  for (const log of candidates) {
    const t = toMs(log.injectedAt);

    // Ordre des exclusions : le premier motif rencontré est celui compté,
    // pour que la somme des motifs égale le nombre de repas écartés.
    if (log.carbsUncertain === true) {
      bump("uncertain");
      continue;
    }
    if (hasSportAround(input.workouts ?? [], t)) {
      bump("sport");
      continue;
    }
    if (iobBefore(input.insulinLogs ?? [], t, log.id) > IOB_EXCLUSION_U) {
      bump("iob");
      continue;
    }
    if (hasInterveningCorrection(input.insulinLogs ?? [], t, log.id)) {
      bump("correction");
      continue;
    }

    const windowEnd = t + OBSERVATION_WINDOW_MIN * MIN_MS;
    const hadHypo = (input.archivePoints ?? []).some(
      (p) => p.t > t && p.t <= windowEnd && p.value < HYPO_THRESHOLD,
    );

    eligible.push({
      injectionId: log.id,
      mealType,
      injectedAt: t,
      carbsGrams: resolveCarbs(log),
      units: log.units,
      confirmed: log.carbsConfirmedAt !== undefined,
      glucoseBefore: glucoseAt(input.archivePoints ?? [], t),
      glucoseAfter5h: glucoseAt(input.archivePoints ?? [], windowEnd),
      hadHypo,
    });
  }

  // Fenêtre : 7 jours si elle suffit, sinon on remonte jusqu'au 3e repas.
  const sevenAgo = now - MIN_WINDOW_DAYS * DAY_MS;
  const inSeven = eligible.filter((m) => m.injectedAt >= sevenAgo);
  if (inSeven.length >= MIN_ELIGIBLE_MEALS) {
    return { meals: inSeven, excluded, windowDays: MIN_WINDOW_DAYS };
  }
  if (eligible.length < MIN_ELIGIBLE_MEALS) {
    const oldest = eligible.length > 0 ? eligible[eligible.length - 1].injectedAt : now;
    const span = Math.ceil((now - oldest) / DAY_MS);
    return {
      meals: eligible,
      excluded,
      windowDays: Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, span)),
    };
  }
  const third = eligible[MIN_ELIGIBLE_MEALS - 1].injectedAt;
  return {
    meals: eligible.filter((m) => m.injectedAt >= third),
    excluded,
    windowDays: Math.min(MAX_WINDOW_DAYS, Math.ceil((now - third) / DAY_MS)),
  };
}
