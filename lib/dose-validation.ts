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
import { isLearnable, resolveCarbs } from "./insulin-log-values";
import type { InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Constantes — figées par la spec, ne pas ajuster sans décision produit
// ───────────────────────────────────────────────────────────────────────

/** Un point sous ce seuil dans la fenêtre = repas fautif (mg/dL). */
export const HYPO_THRESHOLD = 70;
/** Fenêtre d'observation après le bolus (min), avant troncature. */
export const OBSERVATION_WINDOW_MIN = 300;
/** En dessous, aucun verdict n'est rendu. */
export const MIN_ELIGIBLE_MEALS = 5;
/** IOB au moment du bolus au-delà duquel le repas est écarté (U). */
export const IOB_EXCLUSION_U = 1.0;
/** Une séance dans les N min précédant le repas l'écarte (sensibilité post-exercice). */
export const SPORT_BEFORE_MIN = 240;
/** Plancher de la fenêtre d'analyse (jours). */
export const MIN_WINDOW_DAYS = 7;
/** Plafond de la fenêtre (jours) — rétention de l'archive. */
export const MAX_WINDOW_DAYS = 90;

/**
 * Durée au-delà de laquelle une séance de MUSCULATION écarte un repas (min).
 *
 * Décision produit (spec § 2) : la muscu ne fait pas chuter la glycémie —
 * le calculateur de bolus de l'app n'applique déjà aucune réduction avant
 * une muscu, au motif documenté qu'elle la fait MONTER (+45 mg/dL). Une
 * hypo après un dîner suivi de muscu est donc bien imputable au bolus :
 * l'écarter jetterait de la donnée valide. Seule la séance longue, dont la
 * composante cardio devient non négligeable, exclut encore. Seuil repris de
 * `getSportFactor` (lib/exercise-insulin-adjustment.ts), qui passe le
 * coefficient muscu de 0,25 à 0,5 au-delà de 75 min.
 */
export const MUSCU_EXCLUSION_MIN_DURATION = 75;

/**
 * Fenêtre tronquée minimale (min) : en dessous, le repas est écarté plutôt
 * que jugé sur trop peu d'observation (motif `short-window`).
 */
export const MIN_TRUNCATED_WINDOW_MIN = 120;

/** Cadence nominale de l'archive glycémique (min entre deux points). */
export const ARCHIVE_CADENCE_MIN = 15;

/**
 * Fraction minimale des points attendus dans la fenêtre pour qu'un repas
 * soit jugeable. Un repas qu'on n'a pas mesuré ne prouve rien, ni dans un
 * sens ni dans l'autre : sans ce garde-fou, une archive vide produit
 * « 0 hypo » donc « correct » sur les quatre créneaux.
 */
export const MIN_COVERAGE_RATIO = 0.6;

/**
 * Latence minimale entre le bolus et une hypo qu'on lui impute (min).
 *
 * Un bolus rapide ne peut pas causer d'hypo à H+15 : si le patient mange à
 * 78 mg/dL en descente, le premier point sous 70 est un état antérieur, pas
 * un effet de la dose.
 */
export const HYPO_LATENCY_MIN = 45;

/**
 * Glycémie avant repas en dessous de laquelle le repas est écarté (mg/dL).
 * C'est aussi la seule façon d'écarter un repas pris POUR traiter une hypo.
 */
export const LOW_AT_MEAL_THRESHOLD = 80;

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

/** Créneaux analysés, dans l'ordre d'affichage. */
export const MEAL_SLOTS = ["morning", "lunch", "snack", "dinner"] as const;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface ArchivePoint {
  t: number;
  value: number;
}

/** Séance de sport. Le type conditionne l'exclusion (cf. MUSCU_EXCLUSION_MIN_DURATION). */
export interface SportSession {
  /** ISO du début de séance. */
  date: string;
  durationMin: number;
  type: "muscu" | "running";
}

export type ExclusionReason =
  | "sport"
  | "iob"
  | "uncertain"
  | "correction"
  | "short-window"
  | "no-coverage"
  | "low-at-meal";

export interface EligibleMeal {
  injectionId: string;
  mealType: string;
  injectedAt: number;
  /** Glucides retenus : confirmés si disponibles, sinon estimés. */
  carbsGrams: number;
  units: number;
  confirmed: boolean;
  glucoseBefore: number | null;
  /**
   * Glycémie en fin de fenêtre d'observation. Cette fenêtre est tronquée au
   * prochain bolus repas, donc pas nécessairement à T+5 h — d'où le nom.
   */
  glucoseAtWindowEnd: number | null;
  /** Durée réelle de la fenêtre d'observation de ce repas (min). */
  windowMin: number;
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
// Tampons de changement de ratio
// ───────────────────────────────────────────────────────────────────────

export type SlotRatios = Partial<Record<string, number>>;
export type RatioStamps = Partial<Record<string, string>>;

/**
 * Tampons `ratioChangedAt` à écrire après une mise à jour de ratios.
 *
 * Un ratio modifié invalide les repas antérieurs du créneau : les mélanger
 * reviendrait à mesurer deux réglages différents dans le même échantillon.
 * Cette fonction est le point unique appelé par les TROIS setters du store
 * qui touchent réellement un ratio (`updateRatioProfile`,
 * `updateDiabetesConfig`, `setActiveRatioProfile`) — sans quoi une baisse
 * validée dans Le Docteur ou dans Paramètres ne remettrait pas le compteur
 * à zéro, et l'analyse reverrait les mêmes hypos (double baisse), ou
 * validerait « correct » un créneau que le patient vient de renforcer.
 *
 * @param prev     ratios AVANT mise à jour (la comparaison porte toujours
 *                 sur la valeur d'avant)
 * @param next     ratios APRÈS mise à jour
 * @param nowIso   horodatage à poser sur les créneaux modifiés
 * @param existing tampons déjà posés — préservés tels quels pour les
 *                 créneaux non modifiés (changer le ratio du midi ne doit
 *                 jamais effacer le tampon du soir)
 * @returns la carte complète des tampons à écrire ; identique à `existing`
 *          (donc `{}` s'il n'y en avait pas) quand aucun créneau ne change
 */
export function computeRatioStamps(
  prev: SlotRatios | undefined,
  next: SlotRatios | undefined,
  nowIso: string,
  existing?: RatioStamps,
): RatioStamps {
  const stamps: RatioStamps = { ...(existing ?? {}) };
  if (!next) return stamps;
  for (const slot of MEAL_SLOTS) {
    const after = next[slot];
    if (after === undefined) continue;
    const before = prev?.[slot];
    if (after !== before) stamps[slot] = nowIso;
  }
  return stamps;
}

/** `true` si `computeRatioStamps` a réellement posé un nouveau tampon. */
export function hasNewRatioStamps(
  prev: SlotRatios | undefined,
  next: SlotRatios | undefined,
): boolean {
  if (!next) return false;
  return MEAL_SLOTS.some(
    (slot) => next[slot] !== undefined && next[slot] !== prev?.[slot],
  );
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

/**
 * Une séance de ce type et de cette durée écarte-t-elle un repas ?
 * Running et cardio : toujours. Muscu : seulement au-delà de 75 min.
 */
function sessionExcludes(w: SportSession): boolean {
  if (w.type !== "muscu") return true;
  const dur = Number.isFinite(w.durationMin) ? w.durationMin : 0;
  return dur > MUSCU_EXCLUSION_MIN_DURATION;
}

/**
 * L'intervalle [début, début + durée] de la séance chevauche-t-il la zone
 * sensible [repas − 4 h, fin de la fenêtre d'observation] ?
 *
 * On raisonne sur l'intervalle et pas sur le seul instant de début : une
 * séance commencée 4 h 20 avant le repas mais longue d'une heure déborde
 * dans les 4 h précédentes.
 *
 * La borne AVANT reste calée sur SPORT_BEFORE_MIN plein (240 min), jamais
 * sur la fenêtre tronquée : une séance antérieure agit par la sensibilité
 * post-effort, qui ne dépend pas de la troncature. La borne APRÈS, elle,
 * est calée sur `windowEnd` (déjà tronqué au prochain bolus repas) et non
 * sur OBSERVATION_WINDOW_MIN plein : un événement tombant après la fin de
 * la fenêtre jugée n'a pas pu influencer les hypos qu'on impute à CE repas
 * — l'inclure écarterait un repas sans hypo pour un motif sans effet
 * possible sur le taux du créneau.
 */
function hasSportAround(
  workouts: SportSession[],
  mealMs: number,
  windowEnd: number,
): boolean {
  const from = mealMs - SPORT_BEFORE_MIN * MIN_MS;
  return workouts.some((w) => {
    if (!w || !sessionExcludes(w)) return false;
    const start = toMs(w.date);
    if (!Number.isFinite(start)) return false;
    const dur = Number.isFinite(w.durationMin) && w.durationMin > 0 ? w.durationMin : 0;
    const end = start + dur * MIN_MS;
    return end >= from && start <= windowEnd;
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
 * fenêtre ?
 *
 * Le SPLIT du repas lui-même n'en est pas une : il fait partie du dosage
 * prévu pour ce repas, et l'exclure viderait le créneau du soir. Mais
 * l'APPOINT porte lui aussi `parentInjectionId`, sans `isSplitDose` : c'est
 * littéralement la correction intercalée que la règle veut écarter — une
 * dose supplémentaire décidée après coup, donc le candidat le plus probable
 * pour causer l'hypo. D'où le prédicat sur `isSplitDose === true`.
 *
 * Bornée sur `windowEnd` (déjà tronqué au prochain bolus repas), pas sur
 * OBSERVATION_WINDOW_MIN plein : une correction tombée après la fin de la
 * fenêtre jugée n'a pas pu influencer les hypos mesurées pour CE repas.
 */
function hasInterveningCorrection(
  logs: InsulinLog[],
  mealMs: number,
  mealId: string,
  windowEnd: number,
): boolean {
  return logs.some((l) => {
    if (l.id === mealId) return false;
    if (!(l.units > 0)) return false;
    if (resolveCarbs(l) > 0) return false;
    if (l.isSplitDose === true && l.parentInjectionId === mealId) return false;
    const t = toMs(l.injectedAt);
    return Number.isFinite(t) && t > mealMs && t <= windowEnd;
  });
}

/**
 * Instant du prochain bolus portant des glucides après `mealMs`, ou `null`.
 *
 * Sert à tronquer la fenêtre d'observation : sur la routine du patient
 * (goûter 17h30, dîner 19h), 3 h 30 des 5 h de la fenêtre du goûter sont
 * post-bolus du dîner. Une hypo à 21h30 y était comptée contre le ratio du
 * goûter, alors que le vrai coupable est le dîner.
 */
function nextMealBolusAfter(
  logs: InsulinLog[],
  mealMs: number,
  mealId: string,
): number | null {
  let best: number | null = null;
  for (const l of logs) {
    if (!l || l.id === mealId) continue;
    if (!(l.units > 0)) continue;
    if (resolveCarbs(l) <= 0) continue;
    const t = toMs(l.injectedAt);
    if (!Number.isFinite(t) || t <= mealMs) continue;
    if (best === null || t < best) best = t;
  }
  return best;
}

/** Nombre de points capteur dans ]from, to]. */
function countPointsIn(points: ArchivePoint[], from: number, to: number): number {
  let n = 0;
  for (const p of points) {
    if (p.t > from && p.t <= to) n++;
  }
  return n;
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

  const logs = input.insulinLogs ?? [];
  const points = input.archivePoints ?? [];

  // Exclusions horodatées : elles ne seront comptées que sur la fenêtre
  // finalement retenue, pour ne pas afficher « 0 repas sur 7 jours — 90
  // écartés » (les 90 étant les candidats des 90 jours explorés).
  const excludedEvents: { reason: ExclusionReason; t: number }[] = [];
  const bump = (reason: ExclusionReason, t: number) => {
    excludedEvents.push({ reason, t });
  };

  const candidates = logs
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

    // Fenêtre d'observation tronquée au prochain bolus repas — calculée
    // AVANT les prédicats d'exclusion qui regardent devant le repas (sport,
    // correction), pour qu'ils ne cherchent jamais au-delà de ce qui a pu
    // influencer les hypos réellement mesurées pour ce repas.
    const nextMeal = nextMealBolusAfter(logs, t, log.id);
    const windowEnd = Math.min(
      t + OBSERVATION_WINDOW_MIN * MIN_MS,
      nextMeal ?? Number.POSITIVE_INFINITY,
    );

    // Ordre des exclusions : le premier motif rencontré est celui compté,
    // pour que la somme des motifs égale le nombre de repas écartés.
    if (!isLearnable(log)) {
      bump("uncertain", t);
      continue;
    }
    if (hasSportAround(input.workouts ?? [], t, windowEnd)) {
      bump("sport", t);
      continue;
    }
    if (iobBefore(logs, t, log.id) > IOB_EXCLUSION_U) {
      bump("iob", t);
      continue;
    }
    if (hasInterveningCorrection(logs, t, log.id, windowEnd)) {
      bump("correction", t);
      continue;
    }

    const windowMin = (windowEnd - t) / MIN_MS;
    if (windowMin < MIN_TRUNCATED_WINDOW_MIN) {
      // Un goûter muet est honnête ; un goûter jugé sur l'insuline du dîner
      // ne l'est pas.
      bump("short-window", t);
      continue;
    }

    // Couverture capteur : sans mesure, un repas ne prouve rien — surtout
    // pas « pas d'hypo, donc ratio correct ».
    const glucoseBefore = glucoseAt(points, t);
    const expectedPoints = windowMin / ARCHIVE_CADENCE_MIN;
    const actualPoints = countPointsIn(points, t, windowEnd);
    if (glucoseBefore === null || actualPoints < MIN_COVERAGE_RATIO * expectedPoints) {
      bump("no-coverage", t);
      continue;
    }

    if (glucoseBefore < LOW_AT_MEAL_THRESHOLD) {
      bump("low-at-meal", t);
      continue;
    }

    // L'hypo n'est imputée au bolus qu'après HYPO_LATENCY_MIN.
    const hypoFrom = t + HYPO_LATENCY_MIN * MIN_MS;
    const hadHypo = points.some(
      (p) => p.t >= hypoFrom && p.t <= windowEnd && p.value < HYPO_THRESHOLD,
    );

    eligible.push({
      injectionId: log.id,
      mealType,
      injectedAt: t,
      carbsGrams: resolveCarbs(log),
      units: log.units,
      confirmed: log.carbsConfirmedAt !== undefined,
      glucoseBefore,
      glucoseAtWindowEnd: glucoseAt(points, windowEnd),
      windowMin: Math.round(windowMin),
      hadHypo,
    });
  }

  // Fenêtre : 7 jours si elle suffit, sinon on remonte jusqu'au Nième repas.
  const sevenAgo = now - MIN_WINDOW_DAYS * DAY_MS;
  const inSeven = eligible.filter((m) => m.injectedAt >= sevenAgo);

  let windowDays: number;
  if (inSeven.length >= MIN_ELIGIBLE_MEALS) {
    windowDays = MIN_WINDOW_DAYS;
  } else if (eligible.length < MIN_ELIGIBLE_MEALS) {
    const oldest = eligible.length > 0 ? eligible[eligible.length - 1].injectedAt : now;
    const span = Math.ceil((now - oldest) / DAY_MS);
    windowDays = Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, span));
  } else {
    const nth = eligible[MIN_ELIGIBLE_MEALS - 1].injectedAt;
    windowDays = Math.min(MAX_WINDOW_DAYS, Math.ceil((now - nth) / DAY_MS));
  }

  const windowStart = now - windowDays * DAY_MS;
  const excluded: Partial<Record<ExclusionReason, number>> = {};
  for (const e of excludedEvents) {
    if (e.t < windowStart) continue;
    excluded[e.reason] = (excluded[e.reason] ?? 0) + 1;
  }

  return {
    meals: eligible.filter((m) => m.injectedAt >= windowStart),
    excluded,
    windowDays,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Verdict
// ───────────────────────────────────────────────────────────────────────

/** Nombre minimal de repas avec hypo pour parler de sur-dosage. */
export const OVER_BOLUS_MIN_HYPOS = 2;
/** Taux minimal de repas avec hypo pour parler de sur-dosage. */
export const OVER_BOLUS_MIN_RATE = 0.25;
/** Pas de correction : −10 % sur l'insuline par gramme. */
export const RATIO_STEP = 0.1;

export type SlotVerdict = "insufficient-data" | "ok" | "over-bolus";
export type SlotConfidence = "provisoire" | "confirmé";

export interface SlotAnalysis {
  mealType: string;
  verdict: SlotVerdict;
  eligibleCount: number;
  hypoCount: number;
  hypoRate: number;
  confidence: SlotConfidence;
  windowDays: number;
  excluded: Partial<Record<ExclusionReason, number>>;
  /** Écart moyen glycémie en fin de fenêtre − glycémie avant repas (mg/dL). */
  avgLandingDelta: number | null;
  /** Durée moyenne des fenêtres d'observation retenues (min), `null` si vide. */
  avgWindowMin: number | null;
  /** Ratios en g par U. `null` hors verdict `over-bolus`. */
  proposedRatio: { current: number; proposed: number } | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Ratio interne (g par U) → format naturel « 1 U / 10 g ».
 *
 * Vit ici (et pas dans le composant d'affichage) parce que c'est le module
 * qui produit les ratios, et parce qu'un idiome de formatage de dosage doit
 * être testable par `npm test` sans passer par le rendu React.
 */
export function formatRatio(gPerU: number): string {
  const value = Number.isInteger(gPerU)
    ? String(gPerU)
    : gPerU.toFixed(1).replace(".", ",");
  return `1 U / ${value} g`;
}

export function analyzeSlot(
  selection: SlotSelection,
  currentRatio: number,
  mealType: string,
): SlotAnalysis {
  const meals = selection.meals;
  const eligibleCount = meals.length;
  const hypoCount = meals.filter((m) => m.hadHypo).length;
  const hypoRate = eligibleCount > 0 ? hypoCount / eligibleCount : 0;

  const confirmedCount = meals.filter((m) => m.confirmed).length;
  const confidence: SlotConfidence =
    eligibleCount > 0 && confirmedCount / eligibleCount >= 0.5 ? "confirmé" : "provisoire";

  const landings = meals
    .filter((m) => m.glucoseBefore !== null && m.glucoseAtWindowEnd !== null)
    .map((m) => (m.glucoseAtWindowEnd as number) - (m.glucoseBefore as number));
  const avgLandingDelta =
    landings.length > 0
      ? Math.round(landings.reduce((s, v) => s + v, 0) / landings.length)
      : null;

  const avgWindowMin =
    eligibleCount > 0
      ? Math.round(meals.reduce((s, m) => s + m.windowMin, 0) / eligibleCount)
      : null;

  let verdict: SlotVerdict;
  if (eligibleCount < MIN_ELIGIBLE_MEALS) {
    verdict = "insufficient-data";
  } else if (hypoCount >= OVER_BOLUS_MIN_HYPOS && hypoRate >= OVER_BOLUS_MIN_RATE) {
    verdict = "over-bolus";
  } else {
    verdict = "ok";
  }

  // Le ratio est stocké en grammes par unité. Retirer 10 % d'insuline par
  // gramme revient à AUGMENTER les grammes par unité : 10 g/U → 11,1 g/U.
  const proposedRatio =
    verdict === "over-bolus" && currentRatio > 0
      ? { current: currentRatio, proposed: round1(currentRatio / (1 - RATIO_STEP)) }
      : null;

  return {
    mealType,
    verdict,
    eligibleCount,
    hypoCount,
    hypoRate: round1(hypoRate * 100) / 100,
    confidence,
    windowDays: selection.windowDays,
    excluded: selection.excluded,
    avgLandingDelta,
    avgWindowMin,
    proposedRatio,
  };
}

export function analyzeAllSlots(input: DoseValidationInput): SlotAnalysis[] {
  return MEAL_SLOTS.map((slot) =>
    analyzeSlot(selectEligibleMeals(input, slot), input.ratios[slot], slot),
  );
}
