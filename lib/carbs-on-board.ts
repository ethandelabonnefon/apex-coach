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

  // Même fenêtre ET même clamp que buildCarbSources : un bolus horodaté
  // jusqu'à 5 min dans le futur (dérive d'horloge client) doit être vu par
  // les DEUX moitiés du calcul, sinon ses glucides comptent dans
  // insulinNeededU pendant que ses unités sont écartées de insulinActiveU —
  // ce qui fabrique un déficit fantôme juste après le log.
  const boluses: ActiveBolus[] = [];
  for (const log of opts.insulinLogs ?? []) {
    if (!log || typeof log.units !== "number" || log.units <= 0) continue;
    const minutesAgo = (now - toMs(log.injectedAt)) / 60_000;
    if (!Number.isFinite(minutesAgo) || minutesAgo < -5 || minutesAgo > windowMin) continue;
    boluses.push({ units: log.units, minutesAgo: Math.max(0, minutesAgo) });
  }
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

// ───────────────────────────────────────────────────────────────────────
// Proposition d'appoint
// ───────────────────────────────────────────────────────────────────────

/** Déficit minimal pour proposer un appoint (U). */
export const TOPUP_MIN_DEFICIT_U = BALANCE_THRESHOLD_U;
/** Plafond dur d'un appoint (U). */
export const TOPUP_MAX_UNITS = 4;
/** En dessous de cette glycémie, aucun appoint n'est proposé (mg/dL). */
export const TOPUP_MIN_GLUCOSE = 90;
/**
 * Au-delà de cet âge, une lecture de glycémie est considérée comme absente
 * (min). Un garde-fou anti-hypo évalué sur une valeur périmée ne protège
 * de rien : la glycémie a pu chuter depuis.
 */
export const TOPUP_MAX_GLUCOSE_AGE_MIN = 15;

export interface TopUpContext {
  /**
   * Glycémie courante (mg/dL) — UNIQUEMENT une lecture réelle du capteur.
   * `null` / `undefined` = pas de lecture : aucun appoint n'est proposé.
   * Ne jamais y passer la valeur du champ du calculateur (initialisée à
   * 120), sinon le garde-fou anti-hypo s'évalue sur un chiffre inventé.
   */
  currentGlucose: number | null | undefined;
  /**
   * Âge de cette lecture (min). Absent ou > TOPUP_MAX_GLUCOSE_AGE_MIN →
   * la lecture est traitée comme absente. On ne dose pas sur une glycémie
   * dont on ignore la fraîcheur.
   */
  glucoseAgeMin?: number | null;
  /** Trend Libre numérique Abbott (1 = ↓↓ … 5 = ↑↑). */
  trendArrow?: number;
  /**
   * Déficit (valeur absolue, U) au moment de la dernière proposition.
   * Empêche de re-proposer en boucle tant que la situation n'a pas
   * matériellement empiré.
   */
  lastOfferedDeficitU?: number;
}

/**
 * Écart de glucides d'une injection confirmée : ce que le patient a
 * réellement mangé, moins ce pour quoi il s'est injecté.
 */
export interface CarbDelta {
  /** Injection concernée (pour la traçabilité de l'appoint). */
  injectionId: string;
  /** Grammes confirmés − grammes estimés. Positif = sous-dosé. */
  extraCarbsG: number;
  /** Ratio du créneau de ce repas (g par U). */
  gramsPerU: number;
  /** Le repas est-il marqué à quantité incertaine ? */
  uncertain: boolean;
}

export interface TopUpSuggestion {
  /** Injection à l'origine de l'appoint (traçabilité `parentInjectionId`). */
  injectionId: string;
  /** Dose proposée (U entières — le stylo ne fait pas de demi-unités). */
  units: number;
  /** Déficit brut ayant motivé la proposition (U, valeur absolue). */
  deficitU: number;
  /** True si la dose a été rabotée par le plafond. */
  capped: boolean;
  /** Phrase prête à afficher. */
  reason: string;
}

// ───────────────────────────────────────────────────────────────────────
// Filtrage du backtest nocturne
// ───────────────────────────────────────────────────────────────────────

/** Fenêtre avant une nuit pendant laquelle un repas peut la polluer (ms). */
const NIGHT_MEAL_WINDOW_MS = 6 * 3_600_000;

/**
 * Écarte du backtest nocturne les nuits précédées d'un repas à quantité
 * incertaine : leur erreur de prédiction ne mesure pas la qualité du
 * modèle, mais l'imprécision de la saisie.
 *
 * ⚠️ Ne PAS confondre avec la liste d'injections passée à
 * `estimateNightDrift` : celle-ci sert à repérer les fenêtres SANS
 * insuline. Y masquer une injection réelle ferait croire à une fenêtre à
 * jeun et fausserait la dérive basale. L'insuline injectée est réelle et
 * ne sort jamais des calculs.
 */
export function filterLearnableNightLogs<T extends { createdAt: string }>(
  nightLogs: T[],
  insulinLogs: InsulinLog[],
): T[] {
  const uncertainTimes = insulinLogs
    .filter((l) => !isLearnable(l))
    .map((l) => toMs(l.injectedAt))
    .filter((t) => Number.isFinite(t));
  if (uncertainTimes.length === 0) return nightLogs;

  return nightLogs.filter((log) => {
    const nightMs = new Date(log.createdAt).getTime();
    if (!Number.isFinite(nightMs)) return true;
    return !uncertainTimes.some(
      (t) => t <= nightMs && nightMs - t <= NIGHT_MEAL_WINDOW_MS,
    );
  });
}

/**
 * Propose un appoint d'insuline pour l'écart de glucides d'une injection
 * confirmée. Ce n'est pas du stacking : c'est le complément du bolus repas
 * (pratique MDI standard quand on a mangé plus que prévu).
 *
 * ⚠️ Ne PAS confondre avec le verdict de couverture de la tuile
 * (`CarbsOnBoard.balanceU`). Celui-ci est un modèle de couverture ABSOLUE :
 * il inclut les FPU, que `calculateBolus` diffère volontairement dans le
 * split (décision de mai 2026, prise après une hypo terrain). Prescrire
 * dessus reviendrait à réinjecter maintenant l'insuline que le moteur de
 * dose a délibérément repoussée à T+2 h — exactement le mécanisme des
 * hypoglycémies de 12h-14h. La tuile AFFICHE la couverture ; l'appoint
 * PRESCRIT sur le seul delta glucides confirmés − estimés.
 *
 * Renvoie null dès qu'un garde-fou s'oppose. Aucune application
 * automatique : l'appelant DOIT afficher la proposition et attendre un
 * clic explicite de l'utilisateur.
 */
export function suggestTopUp(
  delta: CarbDelta | null,
  ctx: TopUpContext,
): TopUpSuggestion | null {
  if (!delta) return null;

  // Quantité de glucides non fiable → on ne dose pas sur du vent.
  if (delta.uncertain) return null;

  // Sans ratio valide, `extraCarbsG / gramsPerU` vaut ±Infinity ou NaN et
  // traverse TOUS les seuils numériques ci-dessous (une comparaison avec
  // NaN est toujours fausse) → une dose de 4 U sortirait de nulle part.
  // Un delta ≤ 0 (confirmé ≤ estimé) est, lui, arrêté par le seuil de 1 U.
  if (!Number.isFinite(delta.gramsPerU) || delta.gramsPerU <= 0) return null;
  if (!Number.isFinite(delta.extraCarbsG)) return null;

  // Garde-fous anti-hypo. Sans lecture capteur réelle ET fraîche, on ne
  // peut pas les évaluer → on ne propose rien.
  const glucose = ctx.currentGlucose;
  if (typeof glucose !== "number" || !Number.isFinite(glucose)) return null;
  const ageMin = ctx.glucoseAgeMin;
  if (typeof ageMin !== "number" || !Number.isFinite(ageMin)) return null;
  if (ageMin > TOPUP_MAX_GLUCOSE_AGE_MIN) return null;
  if (glucose < TOPUP_MIN_GLUCOSE) return null;
  if (ctx.trendArrow === 1) return null;

  const deficitU = delta.extraCarbsG / delta.gramsPerU;
  if (deficitU < TOPUP_MIN_DEFICIT_U) return null;

  // Ne re-parle que si le déficit s'est creusé d'au moins 1 U de plus.
  if (
    ctx.lastOfferedDeficitU !== undefined &&
    deficitU < ctx.lastOfferedDeficitU + TOPUP_MIN_DEFICIT_U
  ) {
    return null;
  }

  // `raw >= 1` est garanti par le seuil ci-dessus (TOPUP_MIN_DEFICIT_U = 1,0
  // et raw = floor(deficitU)) : pas de second test « units < 1 », qui serait
  // du code mort qu'aucun test ne pourrait distinguer du seuil.
  const raw = Math.floor(deficitU);
  const units = Math.min(raw, TOPUP_MAX_UNITS);
  const capped = raw > TOPUP_MAX_UNITS;
  const extra = Math.round(delta.extraCarbsG);
  const reason = capped
    ? `Tu as confirmé ${extra} g de plus que ce pour quoi tu t'es injecté. Il manque environ ${deficitU.toFixed(1).replace(".", ",")} U — proposition plafonnée à ${units} U par sécurité, re-vérifie ta glycémie dans 1 h.`
    : `Tu as confirmé ${extra} g de plus que ce pour quoi tu t'es injecté. Il manque environ ${units} U pour couvrir la différence.`;

  return {
    injectionId: delta.injectionId,
    units,
    deficitU: round1(deficitU),
    capped,
    reason,
  };
}
