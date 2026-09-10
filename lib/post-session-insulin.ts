/**
 * Appoint post-séance — couvrir les glucides du sport une fois l'effort
 * fini (sept. 2026).
 *
 * Le 10 septembre, le briefing pré-sport a conseillé 66 g de glucides avant
 * une course. Ethan les a pris, puis 10 g de plus à la 30ᵉ minute parce
 * qu'il était à 69 mg/dL. **Trente minutes après la fin, il était à 210.**
 * Il a fait 3 U, insuffisantes.
 *
 * Pendant l'effort, le muscle capte le glucose SANS insuline
 * (translocation de GLUT4 par la contraction). Cette captation s'effondre à
 * l'arrêt, et les glucides encore en digestion arrivent alors sans rien en
 * face. C'est le mécanisme documenté par PMC4032262, où 75 % des patients
 * partent en hyperglycémie quand la dose est réduite après l'effort.
 *
 * Ce que l'app faisait de travers : les glucides pré-sport portent un
 * `sportSessionId` et sont volontairement exclus de la couverture insuline
 * — sinon la tuile réclamerait de l'insuline pour des glucides pris contre
 * une hypo. Mais cette exemption ne s'arrêtait jamais (cf. le correctif
 * jumeau dans `carbs-on-board.ts`). Après la course, les 43 g encore en
 * absorption étaient invisibles, et la seule suggestion disponible — la
 * correction sur glycémie — proposait 1 U pour 210 mg/dL : elle corrigeait
 * l'instant et ignorait les grammes en route derrière.
 *
 * ⚠️ Pure module. Aucun import serveur, aucune écriture.
 */

import { carbRemainingFraction } from "./glucose-prediction";
import { sportSessionEndMs } from "./sports";
import type { CarbEntry, DeclaredSportSession } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Constantes
// ───────────────────────────────────────────────────────────────────────

/**
 * Décalage du rappel après la fin de séance (min).
 *
 * L'appoint n'est JAMAIS proposé pour tout de suite : à la fin de sa
 * course, Ethan était à 68 mg/dL, l'heure où le risque d'hypoglycémie
 * tardive est le plus élevé (la captation GLUT4 reste élevée plusieurs
 * heures après l'effort). Sur son cas, le rappel serait tombé vers 16 h 30,
 * quand sa courbe passait 103 mg/dL en pleine montée.
 */
export const POST_SESSION_DELAY_MIN = 30;

/** Sous une unité, pas de rappel : le stylo ne descend pas plus bas. */
export const POST_SESSION_MIN_UNITS = 1;

/**
 * Garde-fou contre une saisie de glucides erronée (un 300 tapé au lieu
 * d'un 30), pas une limite clinique.
 */
export const POST_SESSION_MAX_UNITS = 6;

/**
 * Sous cette glycémie, le bouton d'enregistrement n'est pas offert au
 * moment du rappel. Le risque symétrique — injecter sur quelqu'un qui
 * redescend — prime sur la correction d'une hyperglycémie.
 */
export const POST_SESSION_MIN_GLUCOSE = 90;

/**
 * Retard au-delà duquel l'appoint n'est plus programmé du tout (min).
 *
 * L'app peut rester fermée des heures après une séance. Rouvrir à 21 h en
 * proposant 4 U pour une course finie à 16 h, c'est ordonner une injection
 * sur un calcul dont plus rien ne tient : les glucides sont digérés depuis
 * longtemps et la glycémie a bougé. Passé ce délai, la séance est
 * simplement marquée traitée, en silence.
 */
export const POST_SESSION_MAX_LATE_MIN = 45;

/**
 * Délai laissé à Whoop pour corriger l'heure de fin avant de figer la dose
 * (min).
 *
 * Flux réel d'Ethan : il termine l'activité sur sa Watch, Whoop remonte en
 * moins d'une minute, Whoop pousse vers Apex. Une séance déjà confirmée ne
 * l'attend pas ; sans bracelet, la durée déclarée finit par faire foi. Le
 * rappel étant à fin + 30 min, cette attente laisse encore 25 min de marge.
 */
export const POST_SESSION_WHOOP_GRACE_MIN = 5;

/**
 * L'appoint peut-il être enregistré, vu la glycémie relue au moment du
 * rappel ?
 *
 * `true` = le bouton d'enregistrement N'EST PAS offert. Deux motifs :
 *  - glycémie sous `POST_SESSION_MIN_GLUCOSE` : à la fin de sa course du
 *    10 septembre Ethan était à 68 mg/dL, l'heure du risque d'hypoglycémie
 *    tardive maximal. Injecter sur quelqu'un qui redescend est un risque
 *    plus grave que de laisser une hyperglycémie non corrigée.
 *  - glycémie inconnue (capteur en panne, LibreLink indisponible) : on ne
 *    valide pas une dose à l'aveugle. Même garde-fou que
 *    `glucoseUnknown` dans la tuile des glucides actifs — l'absence de
 *    mesure n'est pas une mesure rassurante.
 *
 * Un rappel pas encore dû n'est jamais bloqué : la glycémie qui compte est
 * celle de l'heure du rappel, pas celle d'avant.
 */
export function isAppointBlockedByGlucose(
  glucose: number | null | undefined,
  isDue: boolean,
): boolean {
  if (!isDue) return false;
  if (glucose === null || glucose === undefined || !Number.isFinite(glucose)) return true;
  return glucose < POST_SESSION_MIN_GLUCOSE;
}

/** L'appoint dû à `dueAtMs` a-t-il encore un sens à `nowMs` ? */
export function isAppointStillRelevant(dueAtMs: number, nowMs: number): boolean {
  if (!Number.isFinite(dueAtMs)) return false;
  return dueAtMs > nowMs - POST_SESSION_MAX_LATE_MIN * 60_000;
}

export type PostSessionSkipReason =
  | "no-session-end"
  | "no-carbs"
  | "covered-by-iob"
  | "below-minimum";

export interface PostSessionAppoint {
  /** Unités proposées. 0 = rien à proposer, voir `skipReason`. */
  units: number;
  /** Grammes encore en absorption à la FIN de la séance. */
  remainingCarbsG: number;
  /** Unités avant soustraction de l'IOB et réduction — transparence UI. */
  rawUnits: number;
  /** Réduction post-effort appliquée (0-50). */
  reductionPct: number;
  /** Insuline active retranchée (U). */
  iobUnits: number;
  /** Instant de fin de séance (ms). `NaN` si la séance est illisible. */
  sessionEndMs: number;
  /** Instant du rappel (ms) = fin + `POST_SESSION_DELAY_MIN`. */
  dueAtMs: number;
  /** Le plafond de sécurité a-t-il mordu ? */
  capped: boolean;
  /** Motif quand `units === 0`. */
  skipReason?: PostSessionSkipReason;
}

/**
 * Calcule l'appoint dû à la fin d'une séance.
 *
 *   appoint = (glucides encore en absorption / ratio − insuline active)
 *             × (1 − réduction post-effort)
 *
 * Les trois entrées sont celles qu'Ethan a lui-même identifiées : « il
 * aurait dû voir ces cinquante ou soixante glucides encore actifs, plus
 * d'insuline, le strain ». La réduction vient de `computeExerciseAdjustment`
 * — une grosse séance augmente davantage la sensibilité, donc appelle moins
 * d'insuline.
 *
 * ⚠️ Les glucides sont évalués à l'instant de FIN de séance, jamais à
 * « maintenant ». Ces grammes seront absorbés de toute façon : les
 * réévaluer au moment du rappel ferait fondre la dose de ce qui a été
 * digéré pendant l'attente, alors que c'est précisément ce qui a fait
 * monter la glycémie. `iobUnits`, lui, est fourni par l'appelant et doit
 * être l'insuline active à l'instant du calcul — d'où un appoint qui se
 * réduit tout seul si Ethan bolusse entre la fin de séance et le rappel.
 *
 * Seuls les `CarbEntry` portant le `sportSessionId` de CETTE séance sont
 * comptés : un repas ordinaire pris avant le sport a son propre bolus.
 */
export function computePostSessionAppoint(input: {
  session: DeclaredSportSession;
  carbEntries: CarbEntry[];
  /** Insuline active (U) à l'instant du calcul. */
  iobUnits: number;
  /** Ratio du créneau, en grammes par unité. */
  ratioGramsPerU: number;
  /** Réduction post-effort (0-50), de `computeExerciseAdjustment`. */
  reductionPct: number;
}): PostSessionAppoint {
  const endMs = sportSessionEndMs(input.session);
  const dueAtMs = endMs + POST_SESSION_DELAY_MIN * 60_000;
  const iobUnits = Number.isFinite(input.iobUnits) ? Math.max(0, input.iobUnits) : 0;
  const reductionPct = Number.isFinite(input.reductionPct)
    ? Math.min(100, Math.max(0, input.reductionPct))
    : 0;

  const base = {
    units: 0,
    remainingCarbsG: 0,
    rawUnits: 0,
    reductionPct,
    iobUnits,
    sessionEndMs: endMs,
    dueAtMs,
    capped: false,
  };

  if (!Number.isFinite(endMs)) {
    return { ...base, skipReason: "no-session-end" };
  }

  // Reste à absorber, sur la MÊME courbe que partout ailleurs dans l'app
  // (tuile des glucides actifs, prédiction 8 h, plan de nuit) — pas une
  // deuxième modélisation de l'absorption.
  let remainingCarbsG = 0;
  for (const c of input.carbEntries) {
    if (!c || c.sportSessionId !== input.session.id) continue;
    // `Number.isFinite` et pas seulement `> 0` : un Infinity passerait le
    // test de signe et ressortirait plafonné à 6 U — une dose inventée à
    // partir d'une donnée corrompue, pas un refus.
    if (!Number.isFinite(c.carbsGrams) || c.carbsGrams <= 0) continue;
    const eatenMs = new Date(c.eatenAt).getTime();
    if (!Number.isFinite(eatenMs)) continue;
    const minutesToEnd = (endMs - eatenMs) / 60_000;
    // Glucides pris APRÈS la fin déclarée (Whoop a raccourci la séance) :
    // ils sont intégralement devant nous, fraction = 1.
    remainingCarbsG += c.carbsGrams * carbRemainingFraction(Math.max(0, minutesToEnd));
  }

  if (remainingCarbsG <= 0) {
    return { ...base, skipReason: "no-carbs" };
  }

  const ratio =
    Number.isFinite(input.ratioGramsPerU) && input.ratioGramsPerU > 0
      ? input.ratioGramsPerU
      : 10;
  const rawUnits = remainingCarbsG / ratio;
  const withState = { ...base, remainingCarbsG, rawUnits };

  const afterIob = rawUnits - iobUnits;
  if (afterIob <= 0) {
    return { ...withState, skipReason: "covered-by-iob" };
  }

  const adjusted = afterIob * (1 - reductionPct / 100);
  // Le seuil s'applique AVANT l'arrondi : 0,6 U arrondi donnerait 1 U, soit
  // deux tiers de trop pour quelqu'un qui vient de courir.
  if (adjusted < POST_SESSION_MIN_UNITS) {
    return { ...withState, skipReason: "below-minimum" };
  }

  const rounded = Math.round(adjusted);
  return {
    ...withState,
    units: Math.min(rounded, POST_SESSION_MAX_UNITS),
    capped: rounded > POST_SESSION_MAX_UNITS,
  };
}
