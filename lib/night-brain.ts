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
}

export type NightStepKind =
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
/** Cible d'atterrissage au réveil pour une correction du soir (buffer anti-hypo). */
const EVENING_TARGET = 120;

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
  const minPred = Math.min(...predictions.map((p) => p.glucose));
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
    if (status === "deficit" && !uncertain) {
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

  // ── ÉTAPE C — Correction / attente (jamais si on est déjà bas) ───────
  if (!liveLow) {
    if (
      advice.recommendation.type === "correction-bolus" &&
      advice.recommendation.action
    ) {
      // Dose recalculée pour atterrir vraiment à ~120 au réveil, arrondie EN
      // DESSOUS (0,5U près) — la nuit on préfère finir un peu haut qu'en hypo.
      // Plafonnée 2U (garde-fou nocturne).
      const isf = input.isfMgPerU || 100;
      const rawU = (wakeup.glucose - EVENING_TARGET) / isf;
      const units = clamp(Math.floor(rawU * 2) / 2, 0.5, 2);
      const landing = Math.round(wakeup.glucose - units * isf);
      steps.push({
        id: "correction",
        order: order++,
        kind: "correction",
        tone: "error",
        headline: `Pour viser ~${EVENING_TARGET} au réveil : fais ${fmt(units)}U`,
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
  if (steps.length === 0 && !coverageStep) {
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
  if (coverageStep) {
    steps.unshift(coverageStep);
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
