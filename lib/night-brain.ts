/**
 * Night Brain — couche nuit unifiée (juin 2026).
 *
 * UN SEUL moteur qui remplace l'empilement de cartes du soir (HypoLogger +
 * rappel split + BedtimeAdvisor + correction). Il prend TOUT le contexte de
 * fin de journée et produit **un plan ordonné et cohérent** — la « tête
 * pensante » : « mange 12g lents MAINTENANT, ET fais quand même ton split de
 * 2U, re-check à 23h40 ».
 *
 * Il s'appuie sur le modèle physiologique existant (`computeBedtimeAdvice`)
 * pour les prédictions, mais réconcilie les recommandations entre elles au
 * lieu de les afficher en silos contradictoires.
 *
 * Corrige l'incident terrain : être bas au coucher → le système conseillait
 * « 30g » (cible 110, plafond 30) sans savoir que le dîner digérait encore et
 * qu'un split était en attente → hyper toute la nuit. Ici :
 *  - la cible d'une hypo du soir est ~95 (sortir de l'hypo, pas viser haut —
 *    le repas en cours porte le reste)
 *  - on utilise le GRG perso, pas une constante
 *  - le plafond est abaissé le soir, et encore plus si le repas monte encore
 *  - le split est PRÉSENTÉ DANS LE MÊME PLAN, avec le lien explicite
 */

import type { CobStatus } from "./carbs-on-board";
import {
  computeBedtimeAdvice,
  type BedtimeAdvisorInput,
  type BedtimeAdvice,
  type BedtimePrediction,
} from "./bedtime-advisor";
import {
  findBedtimeDose,
  summarizeCurve,
  NIGHT_CEILING,
  NIGHT_FLOOR,
  type CurveSummary,
} from "./bedtime-dose";

// ───────────────────────────────────────────────────────────────────────

export interface NightBrainInput extends BedtimeAdvisorInput {
  /**
   * GRG perso appris (mg/dL par gramme). Si absent → défaut 4. Permet une
   * suggestion de glucides cohérente avec le HypoLogger (une seule source).
   */
  personalGrg?: {
    value: number;
    confidence: "low" | "medium" | "high";
    isDefault: boolean;
  };

  /**
   * Couverture du repas en cours, calculée par le moteur COB
   * (lib/carbs-on-board.ts). Night Brain ne recalcule rien, ne re-seuille
   * rien : il PRÉSENTE le statut qu'on lui donne.
   */
  mealCoverage?: {
    /** Glucides encore à absorber (g). */
    carbsRemainingG: number;
    /** Balance insuline active − besoin (U). Négatif = sous-dosé. */
    balanceU: number;
    /** Statut calculé par `resolveCobStatus` (seuil du soir). */
    status: CobStatus;
    /**
     * Au moins une source à quantité incertaine. Neutralise la branche
     * déficit (aucun conseil de dose à la hausse sur une quantité
     * inconnue) — mais JAMAIS la branche excès, qui est une alerte hypo.
     */
    uncertain: boolean;
  };

  /**
   * Glucides du repas encore à digérer, LUS sur la courbe (bilan de masse,
   * lib/observed-carbs.ts). Présent → étape « à digérer » à la place de
   * l'alerte déficit de `mealCoverage` (la courbe a déjà tranché).
   */
  observedCarbs?: { remainingG: number; enteredG: number; uncertain: boolean };

  /**
   * Âge (min) de la lecture `currentGlucose`. Absent ou > 15 → aucune dose
   * proposée : on ne dose jamais sur une valeur par défaut de champ.
   */
  glucoseAgeMin?: number;
}

export type NightStepKind =
  | "digesting"
  | "coverage"
  | "eat-now"
  | "split-keep"
  | "split-reduce"
  | "split-skip"
  | "correction"
  | "wait"
  | "recheck"
  | "all-good";

export interface NightStepAction {
  kind: "log-carbs" | "log-correction" | "confirm-split" | "adjust-split";
  label: string;
  /** Grammes ou unités selon `unit`. 0 pour un skip. */
  quantity: number;
  unit: "g" | "U" | "";
}

export interface NightStep {
  id: string;
  /** Position dans la séquence (1, 2, 3…). */
  order: number;
  kind: NightStepKind;
  tone: "success" | "warning" | "error" | "info";
  headline: string;
  detail: string;
  /** Mise en garde affichée au-dessus du titre (ex. quantité incertaine). */
  warning?: string;
  action?: NightStepAction;
}

export interface NightPlan {
  title: string;
  subtitle: string;
  steps: NightStep[];
  predictions: BedtimePrediction[];
  breakdown: BedtimeAdvice["breakdown"];
  risk: BedtimeAdvice["risk"];
  unreliableTooFresh: boolean;
  recheckAt?: { hourLabel: string; minutesFromNow: number };
}

// ───────────────────────────────────────────────────────────────────────

/** Cible d'une hypo du soir : juste sortir de la zone basse en sécurité. */
const EVENING_HYPO_TARGET = 95;
/** Cible d'une collation préventive (hypo prédite, pas encore arrivée). */
const PREVENTIVE_TARGET = 100;
/** Cible d'atterrissage au réveil — mode legacy (sans `events`) uniquement. */
const LEGACY_EVENING_TARGET = 120;
/** Âge max (min) d'une lecture pour proposer une dose. */
const MAX_GLUCOSE_AGE_FOR_DOSE_MIN = 15;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function fmt(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

function hourLabel(ms: number): string {
  return new Date(ms).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ───────────────────────────────────────────────────────────────────────

export function computeNightPlan(input: NightBrainInput): NightPlan {
  const advice = computeBedtimeAdvice(input);
  const nowMs = input.nowMs ?? Date.now();
  const grg = input.personalGrg ?? {
    value: 4,
    confidence: "low" as const,
    isDefault: true,
  };
  const grgVal = grg.value > 0 ? grg.value : 4;

  const predictions = advice.predictions;
  // Fix re-revue (maille anti-hypo trop large) : `predictions` n'échantillonne
  // que 3 instants (+2h, +4h, réveil) alors que la courbe sous-jacente est
  // calculée à pas de 15 min (`advice.curve`, mode unifié — cf.
  // bedtime-advisor.ts). Un creux transitoire entre deux échantillons (ex:
  // 85 mg/dL à T+1h30 qui remonte à 95 à T+2h) ne déclenchait ni l'étape
  // « mange maintenant » ni l'alerte d'excès — exactement la signature d'un
  // excès d'insuline avec des glucides encore en cours d'absorption. On porte
  // donc le minimum sur la courbe COMPLÈTE quand elle est disponible, bornée
  // à la fenêtre nocturne pertinente (jamais au-delà du réveil — un rebond
  // dawn après le réveil n'a rien à faire dans « le pire creux de la nuit »).
  // Fallback sur les 3 échantillons en mode legacy (pas d'`events` fourni →
  // pas de courbe continue à ce niveau, cf. commentaire sur `BedtimeAdvice.curve`).
  const hoursUntilWakeup = input.hoursUntilWakeup ?? 7;
  const wakeupMinute = hoursUntilWakeup * 60;
  const curvePoints = advice.curve?.filter((p) => p.minute > 0 && p.minute <= wakeupMinute);
  const minPred =
    curvePoints && curvePoints.length > 0
      ? Math.min(...curvePoints.map((p) => p.value))
      : Math.min(...predictions.map((p) => p.glucose));
  const wakeup = predictions[predictions.length - 1];
  // Repas très récent → on donne quand même un plan (best-effort) mais on le
  // signale ; on ne refuse plus avec un simple "reviens plus tard".
  const freshCaveat = advice.unreliableTooFresh ? " · repas récent, dose prudente" : "";
  const subtitle = `${input.currentGlucose} mg/dL · réveil prévu ~${wakeup.glucose} à ${wakeup.hourLabel}${freshCaveat}`;

  const steps: NightStep[] = [];
  let order = 1;

  // ── Couverture du repas déclaré à la main (trop mangé / trop d'insuline) ──
  let coverageStep: NightStep | undefined;
  if (input.mealCoverage) {
    const { carbsRemainingG, balanceU, status, uncertain } = input.mealCoverage;
    const grams = Math.round(carbsRemainingG);
    // Quantité incertaine → muet sur la dose (pas de branche déficit),
    // jamais silencieux sur l'hypo (la branche excès reste émise).
    // Glucides observés sur la courbe → l'étape « à digérer » remplace
    // l'alerte déficit (même sujet, chiffre plus fiable).
    if (status === "deficit" && !uncertain && !input.observedCarbs) {
      coverageStep = {
        id: "coverage",
        order: 0,
        kind: "coverage",
        tone: "warning",
        headline: `Attention, tu as peut-être trop mangé pour ton insuline`,
        detail: `Il reste ~${grams}g de glucides à digérer et il manque ~${(-balanceU).toFixed(1).replace(".", ",")}U pour les couvrir → ça va te faire monter (vois le réveil prédit ci-dessous). Surveille, une correction sera peut-être conseillée plus bas.`,
      };
    } else if (status === "excess") {
      coverageStep = {
        id: "coverage",
        order: 0,
        kind: "coverage",
        tone: "info",
        headline: `Tu as plus d'insuline active que nécessaire`,
        detail: `Surplus ~${balanceU.toFixed(1).replace(".", ",")}U pour les ~${grams}g qu'il te reste à digérer → risque de baisse. Garde du sucre à portée et surveille.`,
      };
    }
  }

  // ── Glucides du repas lus sur la courbe ──────────────────────────────
  const baseSummary: CurveSummary | undefined =
    advice.curve && advice.curve.length > 1 ? summarizeCurve(advice.curve, nowMs) : undefined;
  let digestingStep: NightStep | undefined;
  if (input.observedCarbs && input.observedCarbs.remainingG > 0) {
    const g = Math.round(input.observedCarbs.remainingG);
    const peak = baseSummary
      ? { value: baseSummary.max, atMs: baseSummary.maxAtMs }
      : (() => {
          const p = predictions.reduce((a, b) => (b.glucose > a.glucose ? b : a));
          return { value: p.glucose, atMs: nowMs + p.offsetHours * 3600_000 };
        })();
    digestingStep = {
      id: "digesting",
      order: 0,
      kind: "digesting",
      tone: "info",
      headline: `Il reste ~${g} g de ton repas à digérer`,
      detail: `Ça va monter jusqu'à ~${Math.round(peak.value)} mg/dL vers ${hourLabel(peak.atMs)} si tu ne fais rien.`,
    };
  }

  const liveLow = input.currentGlucose < 80;
  const mealRisingSoon =
    (input.lastMealCarbs ?? 0) > 0 && (input.lastMealHoursAgo ?? 99) < 2;
  const hasPendingSplit = !!input.pendingSplitUnits && input.pendingSplitUnits > 0;
  const splitAdj = advice.recommendation.splitAdjustment;
  const splitKept =
    hasPendingSplit && !!splitAdj && splitAdj.type !== "skip";

  // ── ÉTAPE A — Glucides maintenant (hypo réelle ou prédite) ──────────
  let carbsNow = 0;
  let acute = false;
  if (liveLow) {
    acute = true;
    const gap = Math.max(0, EVENING_HYPO_TARGET - input.currentGlucose);
    carbsNow = clamp(Math.ceil(gap / grgVal), 8, mealRisingSoon ? 15 : 20);
  } else if (minPred < 70) {
    const gap = Math.max(0, PREVENTIVE_TARGET - minPred);
    carbsNow = clamp(Math.ceil(gap / grgVal), 10, 20);
  } else if (minPred < 90) {
    carbsNow = 10;
  }

  if (carbsNow > 0) {
    const grgNote = grg.isDefault
      ? `1g ≈ ${fmt(grgVal)} mg/dL (estimation standard)`
      : `d'après tes hypos, 1g te remonte de ~${fmt(grgVal)} mg/dL`;
    // Le lien explicite avec le split — le cœur du fix terrain.
    const splitNote = splitKept
      ? " Et fais quand même ton split (étape suivante) : il couvre la digestion lente de ton dîner. Le sauter = hyper au réveil."
      : "";
    steps.push({
      id: "eat-now",
      order: order++,
      kind: "eat-now",
      tone: acute ? "error" : "warning",
      headline: acute
        ? `Mange ${carbsNow}g maintenant (tu es à ${input.currentGlucose})`
        : `Mange ${carbsNow}g avant de te coucher`,
      detail: acute
        ? `Objectif : sortir de l'hypo en sécurité (~${EVENING_HYPO_TARGET} mg/dL), pas viser haut${
            mealRisingSoon ? " — ton dîner qui digère encore te portera le reste" : ""
          }. Privilégie des glucides lents (biscotte, pain) plutôt que du sucre rapide pour éviter le rebond nocturne. ${grgNote}.${splitNote}`
        : `Sans ça, ta glycémie tomberait à ~${minPred} mg/dL dans la nuit. Une petite collation lente sécurise sans risquer l'hyper. ${grgNote}.${splitNote}`,
      action: { kind: "log-carbs", label: `${carbsNow}g`, quantity: carbsNow, unit: "g" },
    });
  }

  // ── ÉTAPE B — Décision sur le split en attente ──────────────────────
  if (hasPendingSplit && splitAdj) {
    if (splitAdj.type === "skip") {
      steps.push({
        id: "split",
        order: order++,
        kind: "split-skip",
        tone: "error",
        headline: `Saute ton split de ${splitAdj.originalUnits}U`,
        detail: splitAdj.detail,
        action: { kind: "adjust-split", label: "Annuler le split", quantity: 0, unit: "" },
      });
    } else if (splitAdj.type === "reduce") {
      steps.push({
        id: "split",
        order: order++,
        kind: "split-reduce",
        tone: "warning",
        headline: `Réduis ton split à ${splitAdj.suggestedUnits}U (au lieu de ${splitAdj.originalUnits}U)`,
        detail: splitAdj.detail,
        action: {
          kind: "adjust-split",
          label: `Réduire à ${splitAdj.suggestedUnits}U`,
          quantity: splitAdj.suggestedUnits,
          unit: "U",
        },
      });
    } else {
      steps.push({
        id: "split",
        order: order++,
        kind: "split-keep",
        tone: "info",
        headline: `Fais ton split de ${splitAdj.originalUnits}U`,
        detail: splitAdj.detail,
        action: {
          kind: "confirm-split",
          label: `Logger ${splitAdj.originalUnits}U`,
          quantity: splitAdj.originalUnits,
          unit: "U",
        },
      });
    }
  }

  // ── ÉTAPE C — Dose du coucher / attente (jamais si on est déjà bas) ──
  let doseStepEmitted = false;
  let doseActionEmitted = false;
  /** La recherche a conclu que 0 U tient déjà la nuit (pic ≤ 130, bas ≥ 80). */
  let doseNone = false;
  if (input.events && baseSummary) {
    // Mode events : dose entière « pic ≤ 130 à partir de T+2h, plancher 80 »
    // sur la courbe simulée (lib/bedtime-dose.ts). Pas d'arrondi 0,5 U ni
    // de plafond 2 U : c'est la courbe qui borne la dose.
    const glucoseFresh =
      input.glucoseAgeMin !== undefined && input.glucoseAgeMin <= MAX_GLUCOSE_AGE_FOR_DOSE_MIN;
    const canDose =
      !liveLow &&
      input.trendArrow !== 1 &&
      glucoseFresh &&
      // Repas frais + IOB élevé : la courbe n'est pas fiable, on ne dose pas
      // dessus (anti-stacking du dîner) — l'étape d'attente prend le relais.
      !advice.unreliableTooFresh &&
      baseSummary.min >= NIGHT_FLOOR;
    if (canDose) {
      const events = input.events;
      const simulate = (u: number): CurveSummary =>
        u === 0
          ? baseSummary
          : summarizeCurve(
              computeBedtimeAdvice({ ...input, events: [...events, { units: u, minutesAgo: 0 }] })
                .curve ?? [],
              nowMs,
            );
      const dose = findBedtimeDose(simulate);
      doseNone = dose.kind === "none";
      const warning = input.observedCarbs?.uncertain
        ? `Quantité incertaine : cette dose part des ${Math.round(input.observedCarbs.enteredG)} g que tu as saisis. Si tu as moins mangé, elle peut te faire descendre.`
        : undefined;
      const r = Math.round;
      if (dose.kind === "fits") {
        const u = dose.units;
        steps.push({
          id: "correction",
          order: order++,
          kind: "correction",
          tone: "error",
          headline: `Fais ${u}U pour rester sous ${NIGHT_CEILING} cette nuit`,
          detail: `Sans rien, pic prévu ~${r(dose.base.max)} mg/dL vers ${hourLabel(dose.base.maxAtMs)}. Avec ${u}U : pic ~${r(dose.withDose.max)}, point bas ~${r(dose.withDose.min)}.`,
          warning,
          action: { kind: "log-correction", label: `${u}U`, quantity: u, unit: "U" },
        });
        doseStepEmitted = true;
        doseActionEmitted = true;
      } else if (dose.kind === "compromise" && dose.units >= 1) {
        const u = dose.units;
        steps.push({
          id: "correction",
          order: order++,
          kind: "correction",
          tone: "error",
          headline: `Fais ${u}U : impossible de rester sous ${NIGHT_CEILING} sans risque d'hypo`,
          detail: `Avec ${u}U tu montes à ~${r(dose.withDose.max)} ; ${u + 1}U te ferait descendre à ~${r(dose.nextUp.min)} vers ${hourLabel(dose.nextUp.minAtMs)}.`,
          warning,
          action: { kind: "log-correction", label: `${u}U`, quantity: u, unit: "U" },
        });
        doseStepEmitted = true;
        doseActionEmitted = true;
      } else if (dose.kind === "compromise") {
        steps.push({
          id: "correction",
          order: order++,
          kind: "correction",
          tone: "info",
          headline: "Pas de correction possible sans risque d'hypo",
          detail: `Pic prévu ~${r(dose.base.max)} vers ${hourLabel(dose.base.maxAtMs)} ; 1U te ferait descendre à ~${r(dose.nextUp.min)} vers ${hourLabel(dose.nextUp.minAtMs)}.`,
        });
        doseStepEmitted = true;
      }
    }
    // « Attends » seulement si aucune étape de dose n'a été produite : IOB à
    // laisser agir (wait-iob) ou repas trop récent pour prédire (monitor).
    const waitReco =
      advice.recommendation.type === "wait-iob" ||
      (advice.unreliableTooFresh && advice.recommendation.type === "monitor");
    if (!doseStepEmitted && !liveLow && waitReco) {
      steps.push({
        id: "wait",
        order: order++,
        kind: "wait",
        tone: "info",
        headline: advice.recommendation.headline,
        detail: advice.recommendation.detail,
      });
    }
  } else if (!liveLow) {
    // Mode legacy (sans `events`) : étape C historique, inchangée.
    if (
      advice.recommendation.type === "correction-bolus" &&
      advice.recommendation.action
    ) {
      // Dose recalculée pour atterrir vraiment à ~120 au réveil, arrondie EN
      // DESSOUS (0,5U près) — la nuit on préfère finir un peu haut qu'en hypo.
      // Plafonnée 2U (garde-fou nocturne).
      const isf = input.isfMgPerU || 100;
      const rawU = (wakeup.glucose - LEGACY_EVENING_TARGET) / isf;
      const units = clamp(Math.floor(rawU * 2) / 2, 0.5, 2);
      const landing = Math.round(wakeup.glucose - units * isf);
      steps.push({
        id: "correction",
        order: order++,
        kind: "correction",
        tone: "error",
        headline: `Pour viser ~${LEGACY_EVENING_TARGET} au réveil : fais ${fmt(units)}U`,
        detail: `Sans rien, réveil prévu ~${wakeup.glucose} mg/dL. ${fmt(units)}U te ramènent vers ~${landing} mg/dL (arrondi prudent, plafonné 2U la nuit).${freshCaveat ? " Repas récent : reste prudent." : ""}`,
        action: {
          kind: "log-correction",
          label: `${fmt(units)}U`,
          quantity: units,
          unit: "U",
        },
      });
    } else if (advice.recommendation.type === "wait-iob") {
      steps.push({
        id: "wait",
        order: order++,
        kind: "wait",
        tone: "info",
        headline: advice.recommendation.headline,
        detail: advice.recommendation.detail,
      });
    }
  }

  // Une dose proposée garde déjà la courbe ≥ 80 (simulation) : la collation
  // PRÉVENTIVE (hypo prédite sans la dose) la contredirait → on la retire.
  // L'hypo réelle (liveLow) bloque la dose, elle n'est jamais concernée.
  if (doseActionEmitted && !acute) {
    const i = steps.findIndex((s) => s.kind === "eat-now");
    if (i >= 0) {
      steps.splice(i, 1);
      steps.forEach((s, j) => (s.order = j + 1));
      order = steps.length + 1;
    }
  }

  // ── Re-check (timing) ───────────────────────────────────────────────
  // On ne garde le re-check QUE pour une vraie hypo en cours (sécurité) —
  // plus de "re-check à 23h14" systématique après une correction : le plan
  // donne une décision, pas un renvoi.
  let recheckAt: NightPlan["recheckAt"];
  if (acute) {
    const mins = 20;
    const t = nowMs + mins * 60_000;
    recheckAt = { hourLabel: hourLabel(t), minutesFromNow: mins };
    steps.push({
      id: "recheck",
      order: order++,
      kind: "recheck",
      tone: "info",
      headline: `Re-check ta glycémie à ${recheckAt.hourLabel}`,
      detail: "Confirme que tu es bien remonté avant de dormir.",
    });
  }

  // ── Rien à faire ────────────────────────────────────────────────────
  // L'étape « à digérer » n'est qu'un contexte : si la recherche de dose a
  // conclu que 0 U tient la nuit, il faut quand même la ligne de décision.
  if (steps.length === 0 && !coverageStep && (!digestingStep || doseNone)) {
    steps.push({
      id: "all-good",
      order: order++,
      kind: "all-good",
      tone: "success",
      headline: "Va te coucher, rien à ajuster",
      detail: `Prédictions : ${predictions
        .map((p) => `${p.label} ${p.glucose}`)
        .join(" · ")} mg/dL. Cible nocturne (90-160) respectée toute la nuit.`,
    });
  }

  // L'alerte couverture passe en tête (contexte avant les actions).
  const contextSteps = [digestingStep, coverageStep].filter((s): s is NightStep => !!s);
  if (contextSteps.length > 0) {
    steps.unshift(...contextSteps);
    steps.forEach((s, i) => (s.order = i + 1));
  }

  return {
    title: "Ton plan pour la nuit",
    subtitle,
    steps,
    predictions,
    breakdown: advice.breakdown,
    risk: advice.risk,
    unreliableTooFresh: false,
    recheckAt,
  };
}
