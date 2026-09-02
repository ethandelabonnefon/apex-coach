/**
 * Glucides actifs (COB) et couverture insuline — septembre 2026.
 *
 * Répond à une seule question : « qu'est-ce qu'il me reste à digérer, et
 * est-ce couvert par l'insuline encore active ? »
 *
 * ─── Décisions d'architecture ────────────────────────────────────────
 *  • Aucun nouveau modèle physiologique. On réutilise les primitives
 *    d'absorption de glucose-prediction.ts (`carbRemainingFraction`,
 *    `activeIOB`, facteur FPU 6). La tuile de l'écran et le plan de la
 *    nuit ne peuvent donc pas se contredire.
 *  • Le ratio est conservé SOURCE PAR SOURCE. Un repas du matin
 *    (1,5 U/10 g) et un repas du soir (1 U/10 g) simultanément actifs ne
 *    se moyennent pas — la moyenne sous-estimerait le besoin du matin.
 *  • Un repas « incertain » garde ses glucides dans le calcul. Les mettre
 *    à zéro ferait voir de l'insuline sans glucides en face, donc un faux
 *    « trop d'insuline, mange des glucides » : l'inverse exact du besoin.
 *    L'incertitude bloque la proposition de DOSE (cf. suggestTopUp), pas
 *    le calcul.
 */

import {
  activeIOB,
  carbRemainingFraction,
  FPU_GLUCOSE_FACTOR,
  FPU_WINDOW_HOURS,
  type ActiveBolus,
} from "./glucose-prediction";
import {
  EVENT_ACTIVE_WINDOW_MIN,
  ratioForMeal,
  type MealRatios,
} from "./prediction-inputs";
import type { CarbEntry, InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Seuils
// ───────────────────────────────────────────────────────────────────────

/** En dessous, on considère qu'il n'y a plus rien à digérer (g). */
export const IDLE_CARBS_G = 5;
/** En dessous, on considère qu'il n'y a plus d'insuline active (U). */
export const IDLE_INSULIN_U = 0.5;
/**
 * Écart minimal pour qualifier un déficit ou un excès (U).
 * Le stylo d'Ethan ne fait pas de demi-unités : sous 1 U, aucune action
 * n'est possible, donc aucun message.
 */
export const BALANCE_THRESHOLD_U = 1.0;
/** Au-delà de ce reliquat de glucides, on ne parle pas d'excès d'insuline (g). */
export const EXCESS_MAX_CARBS_G = 15;

// ───────────────────────────────────────────────────────────────────────
// Résolution estimé ↔ confirmé
// ───────────────────────────────────────────────────────────────────────

/** Glucides retenus pour une injection : le confirmé prime sur l'estimation. */
export function resolveCarbs(log: InsulinLog): number {
  return log.carbsConfirmedGrams ?? log.carbsGrams ?? 0;
}

/** Lipides retenus : le confirmé prime sur l'estimation. */
export function resolveFat(log: InsulinLog): number {
  return log.fatConfirmedGrams ?? log.fatGrams ?? 0;
}

/** Protéines retenues : le confirmé prime sur l'estimation. */
export function resolveProtein(log: InsulinLog): number {
  return log.proteinConfirmedGrams ?? log.proteinGrams ?? 0;
}

/**
 * Une injection peut-elle nourrir l'apprentissage (stats par type de repas,
 * backtest nuit, contexte du Docteur) ?
 *
 * Prédicat unique : un seul endroit à modifier si la règle évolue.
 */
export function isLearnable(log: InsulinLog): boolean {
  return log.carbsUncertain !== true;
}

// ───────────────────────────────────────────────────────────────────────
// Fractions restantes
// ───────────────────────────────────────────────────────────────────────

/**
 * Fraction de FPU encore à absorber. Décroissance linéaire sur la fenêtre,
 * cohérente avec le débit horaire constant de `fpuGlucoseRise()`.
 */
export function fpuRemainingFraction(
  minutesAgo: number,
  windowHours: number = FPU_WINDOW_HOURS,
): number {
  if (minutesAgo <= 0) return 1;
  const hoursAgo = minutesAgo / 60;
  if (hoursAgo >= windowHours) return 0;
  return 1 - hoursAgo / windowHours;
}

// ───────────────────────────────────────────────────────────────────────
// Sources actives
// ───────────────────────────────────────────────────────────────────────

export interface ActiveCarbSource {
  id: string;
  /** mealTag ("pates") ou label de CarbEntry ("Compote"). */
  label?: string;
  carbsGrams: number;
  fatGrams: number;
  proteinGrams: number;
  /** Bolus associé (U). 0 pour des glucides sans insuline. */
  insulinUnits: number;
  /** Ratio du créneau au moment du repas (g par U). */
  gramsPerU: number;
  minutesAgo: number;
  uncertain: boolean;
  confirmed: boolean;
  /** Glucides bruts encore à absorber (g). */
  carbsRemainingG: number;
  /** Équivalent-glucides FPU encore à absorber (g). */
  fpuRemainingG: number;
}

export interface BuildCarbSourcesOptions {
  insulinLogs: InsulinLog[];
  carbEntries?: CarbEntry[];
  ratios?: MealRatios;
  nowMs?: number;
  windowMin?: number;
}

/** Convertit un timestamp (Date | ISO | number) en ms. */
function toMs(v: Date | string | number): number {
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/**
 * Construit les sources de glucides encore actives à partir du store.
 * Même filtrage temporel que `buildPredictionEvents` — les deux vues
 * partent exactement des mêmes événements.
 */
export function buildCarbSources(
  opts: BuildCarbSourcesOptions,
): ActiveCarbSource[] {
  const now = opts.nowMs ?? Date.now();
  const windowMin = opts.windowMin ?? EVENT_ACTIVE_WINDOW_MIN;
  const sources: ActiveCarbSource[] = [];

  const push = (s: Omit<ActiveCarbSource, "carbsRemainingG" | "fpuRemainingG">) => {
    const fpu = (s.fatGrams * 9 + s.proteinGrams * 4) / 100;
    const fpuTotalG = fpu >= 1 ? fpu * FPU_GLUCOSE_FACTOR : 0;
    sources.push({
      ...s,
      carbsRemainingG: s.carbsGrams * carbRemainingFraction(s.minutesAgo),
      fpuRemainingG: fpuTotalG * fpuRemainingFraction(s.minutesAgo),
    });
  };

  for (const log of opts.insulinLogs ?? []) {
    if (!log) continue;
    const minutesAgo = (now - toMs(log.injectedAt)) / 60_000;
    if (!Number.isFinite(minutesAgo) || minutesAgo < -5 || minutesAgo > windowMin) continue;
    const carbs = resolveCarbs(log);
    const fat = resolveFat(log);
    const prot = resolveProtein(log);
    if (carbs <= 0 && fat <= 0 && prot <= 0) continue;
    push({
      id: log.id,
      label: log.mealTag,
      carbsGrams: carbs,
      fatGrams: fat,
      proteinGrams: prot,
      insulinUnits: log.units > 0 ? log.units : 0,
      gramsPerU: ratioForMeal(opts.ratios, log.mealType),
      minutesAgo: Math.max(0, minutesAgo),
      uncertain: log.carbsUncertain === true,
      confirmed: log.carbsConfirmedAt !== undefined,
    });
  }

  for (const c of opts.carbEntries ?? []) {
    if (!c || typeof c.carbsGrams !== "number") continue;
    const minutesAgo = (now - toMs(c.eatenAt)) / 60_000;
    if (!Number.isFinite(minutesAgo) || minutesAgo < -5 || minutesAgo > windowMin) continue;
    push({
      id: c.id,
      label: c.label,
      carbsGrams: c.carbsGrams,
      fatGrams: c.fatGrams ?? 0,
      proteinGrams: c.proteinGrams ?? 0,
      insulinUnits: c.insulinUnits ?? 0,
      // Glucides sans bolus précis → ratio midi générique, comme
      // buildPredictionEvents.
      gramsPerU: ratioForMeal(opts.ratios, "lunch"),
      minutesAgo: Math.max(0, minutesAgo),
      uncertain: false,
      confirmed: true,
    });
  }

  return sources;
}

// ───────────────────────────────────────────────────────────────────────
// Assemblage
// ───────────────────────────────────────────────────────────────────────

export type CobStatus = "idle" | "covered" | "deficit" | "excess";

export interface CarbsOnBoard {
  carbsRemainingG: number;
  fpuRemainingG: number;
  totalRemainingG: number;
  /** Insuline requise pour ce qui reste à absorber (U). */
  insulinNeededU: number;
  /** IOB bi-exponentiel (U). */
  insulinActiveU: number;
  /** insulinActiveU − insulinNeededU. Négatif = il manque de l'insuline. */
  balanceU: number;
  status: CobStatus;
  /** Au moins une source à quantité incertaine. */
  uncertain: boolean;
  sources: ActiveCarbSource[];
}

export interface ComputeCarbsOnBoardOptions extends BuildCarbSourcesOptions {
  isf: number;
}

/** Arrondi à 1 décimale (évite les 3,0000000000004 dans l'UI). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeCarbsOnBoard(
  opts: ComputeCarbsOnBoardOptions,
): CarbsOnBoard {
  const now = opts.nowMs ?? Date.now();
  const windowMin = opts.windowMin ?? EVENT_ACTIVE_WINDOW_MIN;
  const sources = buildCarbSources(opts);

  let carbsRemainingG = 0;
  let fpuRemainingG = 0;
  let insulinNeededU = 0;
  let uncertain = false;

  for (const s of sources) {
    carbsRemainingG += s.carbsRemainingG;
    fpuRemainingG += s.fpuRemainingG;
    // Ratio conservé source par source — pas de moyenne.
    if (s.gramsPerU > 0) {
      insulinNeededU += (s.carbsRemainingG + s.fpuRemainingG) / s.gramsPerU;
    }
    if (s.uncertain) uncertain = true;
  }

  const boluses: ActiveBolus[] = (opts.insulinLogs ?? [])
    .map((log) => ({
      units: log.units,
      minutesAgo: (now - toMs(log.injectedAt)) / 60_000,
    }))
    .filter(
      (b) =>
        b.units > 0 &&
        Number.isFinite(b.minutesAgo) &&
        b.minutesAgo >= 0 &&
        b.minutesAgo <= windowMin,
    );
  const insulinActiveU = activeIOB(boluses);

  const totalRemainingG = carbsRemainingG + fpuRemainingG;
  const balanceU = insulinActiveU - insulinNeededU;

  let status: CobStatus;
  if (totalRemainingG < IDLE_CARBS_G && insulinActiveU < IDLE_INSULIN_U) {
    status = "idle";
  } else if (balanceU <= -BALANCE_THRESHOLD_U) {
    status = "deficit";
  } else if (
    balanceU >= BALANCE_THRESHOLD_U &&
    totalRemainingG < EXCESS_MAX_CARBS_G
  ) {
    status = "excess";
  } else {
    status = "covered";
  }

  return {
    carbsRemainingG: round1(carbsRemainingG),
    fpuRemainingG: round1(fpuRemainingG),
    totalRemainingG: round1(totalRemainingG),
    insulinNeededU: round1(insulinNeededU),
    insulinActiveU: round1(insulinActiveU),
    balanceU: round1(balanceU),
    status,
    uncertain,
    sources,
  };
}
