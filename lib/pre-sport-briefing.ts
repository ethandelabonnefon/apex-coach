/**
 * Briefing pré-sport sur la courbe prédite (19 sept. 2026).
 *
 * Remplace `computePreSportBriefing` (lib/insulin-calculator.ts, mai 2026)
 * pour la section « Briefing pré-sport » — celle qu'Ethan ouvre ~30 min
 * avant de partir, sans dose en attente. Trois défauts mesurés sur
 * l'ancien moteur (130 mg/dL stable, 30 min de course dans 30 min) :
 *
 *  1. 45 g/h même sans insuline active → 23 g conseillés là où le
 *     consensus Riddell 2017 dit « départ entre 126 et 180 : pars, vois à
 *     30 min » ;
 *  2. un « −60 mg/dL » forfaitaire pour toute course, qui faisait passer
 *     « pendant » sous 80 presque à chaque fois → « Mange » ;
 *  3. un débit horaire calé sur l'insuline de MAINTENANT, pas sur celle
 *     qui resterait au départ → 50 g à « dans 90 min » contre 33 g à
 *     « dans 30 min ». La sensation d'Ethan : « le délai ne compte pas ».
 *
 * Ici, même moteur que le calculateur : `buildPredictionEvents` +
 * `predictGlucoseCurve` avec `upcomingExercise`, puis
 * `computeBolusSportPlan` LIT la courbe. Une courbe, deux lectures. Les
 * recommandations qui ne sont pas des grammages (split, cétones,
 * intermittent, fenêtre trop longue) sont portées telles quelles.
 *
 * ⚠️ Pure module. Aucun import serveur.
 */

import { computeBolusSportPlan, type BolusSportPlan } from "./bolus-sport-plan";
import type { ExerciseSource, RecentExercise } from "./exercise-insulin-adjustment";
import {
  activeIOB,
  exerciseIobFactor,
  predictGlucoseCurve,
  upcomingExerciseImpactMgDl,
  type PredictionPoint,
} from "./glucose-prediction";
import { curveValueAt, curveMinBetween } from "./bolus-sport-plan";
import { buildPredictionEvents, type MealRatios } from "./prediction-inputs";
import { TOPUP_MAX_GLUCOSE_AGE_MIN } from "./carbs-on-board";
import type { CarbEntry, InsulinLog } from "@/types";

/** Au-delà, la prédiction perd sa valeur : on ne chiffre plus rien. */
export const BRIEFING_MAX_WINDOW_MIN = 120;
/** Au-dessus au départ, on vérifie les cétones avant un effort aérobie/mixte. */
export const KETONE_CHECK_GLUCOSE = 250;

export type PreSportRecoType =
  | "eat-carbs"
  | "reduce-split"
  | "delay-split"
  | "delay-workout"
  | "check-glucose"
  | "safe";

export interface PreSportRecommendation {
  type: PreSportRecoType;
  headline: string;
  detail: string;
  /** Quantité numérique associée si pertinent (g ou U). */
  quantity?: number;
}

export type PreSportBriefingStatus =
  | "ok"
  | "no-glucose"
  | "stale-glucose"
  | "window-too-long";

export interface PreSportBriefingOnCurve {
  status: PreSportBriefingStatus;
  /** Lus sur la courbe. `null` tant que `status !== "ok"`. */
  predictedAtStart: number | null;
  predictedDuringMin: number | null;
  predictedAtEnd: number | null;
  /** Insuline active AU DÉPART de l'effort (U). */
  iobAtStartU: number;
  /** Effet total de l'effort injecté dans la courbe (mg/dL, négatif = baisse). */
  exerciseImpactMgDl: number;
  /** Facteur k appliqué au prélèvement (0,3 … 1). */
  iobFactor: number;
  plan: BolusSportPlan | null;
  curve: PredictionPoint[] | null;
  risk: "safe" | "caution" | "risk";
  recommendations: PreSportRecommendation[];
}

export interface PreSportBriefingInput {
  /** Lecture CAPTEUR uniquement — jamais le champ du calculateur. */
  currentGlucose: number | null | undefined;
  /** Âge de la lecture (min). `null` = inconnu → on ne refuse pas. */
  glucoseAgeMin: number | null | undefined;
  trendArrow?: number;
  insulinLogs: InsulinLog[];
  carbEntries: CarbEntry[];
  isf: number;
  ratios: MealRatios;
  dia: number;
  family: ExerciseSource;
  minutesUntilWorkout: number;
  durationMin: number;
  pendingSplit?: { units: number; minutesUntil: number };
  /** Séance PASSÉE (sensibilité ↑), pas celle qu'on prépare. */
  sport?: RecentExercise;
  nowMs: number;
}

export function computePreSportBriefingOnCurve(
  input: PreSportBriefingInput,
): PreSportBriefingOnCurve {
  const family = input.family;
  const minutesUntil = Number.isFinite(input.minutesUntilWorkout)
    ? Math.max(0, input.minutesUntilWorkout)
    : 0;
  const durationMin = Number.isFinite(input.durationMin) ? Math.max(0, input.durationMin) : 0;
  const isAerobic = family === "running" || family === "cardio-other";

  const recos: PreSportRecommendation[] = [];
  let risk: PreSportBriefingOnCurve["risk"] = "safe";

  // Avertissement décalé pour l'intermittent — info clinique, pas un
  // chiffre : reste visible quel que soit le statut.
  if (family === "intermittent") {
    recos.push({
      type: "check-glucose",
      headline: "Re-vérifie ta glycémie à la fin",
      detail:
        "Au foot, au padel ou en CrossFit, la glycémie tient pendant l'effort puis chute après : l'adrénaline la soutient tant que tu joues. Le risque d'hypo est décalé, pas absent.",
    });
  }

  // Insuline active au départ — la seule qui compte pour l'effort. Lue sur
  // les mêmes événements que la courbe.
  const events = buildPredictionEvents({
    insulinLogs: input.insulinLogs,
    carbEntries: input.carbEntries,
    isf: input.isf,
    ratios: input.ratios,
    nowMs: input.nowMs,
  });
  const iobAtStartU = activeIOB(
    events
      .filter((e) => e.units && e.units > 0)
      .map((e) => ({ units: e.units as number, minutesAgo: e.minutesAgo + minutesUntil })),
    input.dia,
  );
  const iobFactor = exerciseIobFactor(iobAtStartU);
  const exerciseImpactMgDl = upcomingExerciseImpactMgDl(family, durationMin, iobAtStartU);

  const base = {
    iobAtStartU,
    exerciseImpactMgDl,
    iobFactor,
    plan: null,
    curve: null,
    predictedAtStart: null,
    predictedDuringMin: null,
    predictedAtEnd: null,
  };

  // ─── Glycémie de référence : capteur, fraîche, ou rien ──────────────
  const glucose = input.currentGlucose;
  if (typeof glucose !== "number" || !Number.isFinite(glucose)) {
    recos.push({
      type: "check-glucose",
      headline: "Pas de mesure capteur — rafraîchis avant de partir",
      detail:
        "Sans lecture de glycémie, aucun chiffre ne serait honnête. Ouvre ta lecture Libre ou rafraîchis ici.",
    });
    return { ...base, status: "no-glucose", risk: "caution", recommendations: recos };
  }
  const age = input.glucoseAgeMin;
  if (typeof age === "number" && Number.isFinite(age) && age > TOPUP_MAX_GLUCOSE_AGE_MIN) {
    recos.push({
      type: "check-glucose",
      headline: `Lecture périmée (${Math.round(age)} min) — rafraîchis avant de partir`,
      detail:
        "Une lecture ancienne peut être restée haute pendant que la vraie glycémie descend. On ne chiffre rien dessus.",
    });
    return { ...base, status: "stale-glucose", risk: "caution", recommendations: recos };
  }

  // ─── Fenêtre trop longue : aucun grammage, jamais ────────────────────
  if (minutesUntil > BRIEFING_MAX_WINDOW_MIN) {
    recos.push({
      type: "check-glucose",
      headline: "Re-vérifie ta glycémie 30 min avant le sport",
      detail: `À ${minutesUntil} min d'écart, beaucoup de choses peuvent évoluer (digestion en cours, contre-régulation). Reviens ici à 30-60 min du sport pour une prédiction fiable.`,
    });
    return { ...base, status: "window-too-long", risk: "caution", recommendations: recos };
  }

  // ─── La courbe ────────────────────────────────────────────────────────
  const horizon = Math.max(240, minutesUntil + durationMin + 60);
  const prediction = predictGlucoseCurve({
    currentGlucose: glucose,
    trendArrow: input.trendArrow,
    events,
    isf: input.isf,
    dia: input.dia,
    sport: input.sport,
    upcomingExercise: { startMinute: minutesUntil, durationMin, impactMgDl: exerciseImpactMgDl },
    pendingSplit: input.pendingSplit,
    horizonMinutes: horizon,
    stepMinutes: 5,
    nowMs: input.nowMs,
  });
  const curve = prediction.curve;
  const predictedAtStart = curveValueAt(curve, minutesUntil);
  const predictedDuringMin = curveMinBetween(curve, minutesUntil, minutesUntil + durationMin);
  const predictedAtEnd = curveValueAt(curve, minutesUntil + durationMin);

  const plan = computeBolusSportPlan({
    family,
    minutesUntilWorkout: minutesUntil,
    durationMin,
    curveWithReducedDose: curve,
    iobAfterDoseU: iobAtStartU,
  });

  // ─── Glucides ────────────────────────────────────────────────────────
  if (plan.carbsG > 0) {
    const deep = predictedDuringMin !== null && predictedDuringMin < 70;
    risk = deep ? "risk" : "caution";
    const why =
      plan.carbsReason === "start" || plan.carbsReason === "start+during"
        ? `Glycémie prédite ${predictedAtStart} mg/dL au départ — sous la cible de ${plan.startTarget}.`
        : plan.carbsReason === "no-curve"
        ? `Sur ${durationMin} min d'effort, la règle de durée du consensus s'applique.`
        : `Glycémie prédite jusqu'à ${predictedDuringMin} mg/dL pendant l'effort — trop bas pour finir sans apport.`;
    recos.push({
      type: "eat-carbs",
      headline: deep
        ? `Mange ${plan.carbsG}g de glucides rapides avant le sport`
        : `Prends ${plan.carbsG}g de glucides avant le sport`,
      detail: why,
      quantity: plan.carbsG,
    });
  }

  // ─── Split qui tombe avant / pendant ─────────────────────────────────
  const split = input.pendingSplit;
  if (split && split.units > 0 && split.minutesUntil < minutesUntil + durationMin) {
    const threshold = isAerobic ? 120 : 100;
    if (predictedDuringMin !== null && predictedDuringMin < threshold) {
      const reduced = Math.max(0, Math.ceil(split.units / 2));
      risk = risk === "risk" ? "risk" : "caution";
      recos.push({
        type: "reduce-split",
        headline: `Réduis ta 2e dose à ${reduced}U au lieu de ${split.units}U`,
        detail: `Le split dose tombe avant ou pendant ton sport. Avec l'effet ${isAerobic ? "hypoglycémiant de l'effort" : "de l'insuline active"}, ${split.units}U risque d'être trop.`,
        quantity: reduced,
      });
      recos.push({
        type: "delay-split",
        headline: "Ou décale ta 2e dose à après le sport",
        detail: "Reporte le split dose 30 min après ta séance — la couverture lipides sera moins risquée à ce moment.",
      });
    }
  }

  // ─── Hyper au départ ─────────────────────────────────────────────────
  if (predictedAtStart !== null && predictedAtStart > KETONE_CHECK_GLUCOSE) {
    risk = risk === "risk" ? "risk" : "caution";
    const ketoneRisk = family !== "muscu";
    recos.push({
      type: ketoneRisk ? "check-glucose" : "delay-workout",
      headline: ketoneRisk ? "Vérifie tes cétones avant de commencer" : "Glycémie trop haute, attends 30min",
      detail: `Glycémie prédite ${predictedAtStart} mg/dL au début du sport — risque de cétoacidose en aérobie/mixte ou faible perf en muscu.`,
    });
  }

  // ─── Rien à signaler ─────────────────────────────────────────────────
  if (recos.length === 0) {
    recos.push({
      type: "safe",
      headline: "Tu peux y aller, rien à ajuster",
      detail:
        family === "muscu"
          ? `Glycémie prédite ${predictedAtStart} au départ → ~${predictedAtEnd} en fin de séance (la muscu fait plutôt monter).`
          : `Glycémie prédite ${predictedAtStart} au départ, ~${predictedDuringMin} au plus bas pendant. Garde du sucre sur toi au cas où.`,
    });
  }

  return {
    status: "ok",
    predictedAtStart,
    predictedDuringMin,
    predictedAtEnd,
    iobAtStartU,
    exerciseImpactMgDl,
    iobFactor,
    plan,
    curve,
    risk,
    recommendations: recos,
  };
}
