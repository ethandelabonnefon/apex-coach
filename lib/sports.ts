/**
 * Catalogue des sports du briefing pré-sport (sept. 2026).
 *
 * Un sport n'est qu'un nom affiché à l'utilisateur ; ce qui compte pour le
 * calcul (glucides, réduction d'insuline post-exercice) c'est sa `family`
 * (`ExerciseSource`). Ce fichier ne fait AUCUN calcul — pure donnée +
 * lookup, consommé par le briefing (UI) et par la déclaration de séance.
 *
 * ⚠️ Pure module. Aucun import serveur.
 */

import type { ExerciseSource } from "./exercise-insulin-adjustment";
import type { DeclaredSportSession } from "@/types";

export interface SportDefinition {
  key: string;
  label: string;
  family: ExerciseSource;
  /** Durée typique (min), pré-remplie dans le briefing, modifiable. */
  defaultDurationMin: number;
}

/**
 * Les familles viennent du consensus Riddell et al. (Lancet Diabetes &
 * Endocrinology, 2017) : l'aérobie fait baisser la glycémie, l'anaérobie la
 * fait monter, le mixte la laisse stable pendant l'effort puis elle chute
 * après. Le nom du sport ne sert qu'à choisir sa famille.
 */
export const SPORTS: SportDefinition[] = [
  // Aérobie continu — baisse pendant l'effort
  { key: "course", label: "Course à pied", family: "running", defaultDurationMin: 45 },
  { key: "velo", label: "Vélo", family: "cardio-other", defaultDurationMin: 60 },
  { key: "natation", label: "Natation", family: "cardio-other", defaultDurationMin: 45 },
  { key: "rameur", label: "Rameur", family: "cardio-other", defaultDurationMin: 30 },
  { key: "randonnee", label: "Randonnée", family: "cardio-other", defaultDurationMin: 120 },
  // Intermittent — stable pendant, chute après
  { key: "football", label: "Football", family: "intermittent", defaultDurationMin: 90 },
  { key: "padel", label: "Padel", family: "intermittent", defaultDurationMin: 90 },
  { key: "tennis", label: "Tennis", family: "intermittent", defaultDurationMin: 90 },
  { key: "basket", label: "Basket", family: "intermittent", defaultDurationMin: 90 },
  { key: "crossfit", label: "CrossFit", family: "intermittent", defaultDurationMin: 60 },
  // Résistance — neutre ou en hausse
  { key: "musculation", label: "Musculation", family: "muscu", defaultDurationMin: 60 },
  { key: "sprint", label: "Sprint", family: "muscu", defaultDurationMin: 30 },
];

export const SPORT_KEYS = SPORTS.map((s) => s.key);

export function getSport(key: string | null | undefined): SportDefinition | null {
  if (!key) return null;
  return SPORTS.find((s) => s.key === key) ?? null;
}

/**
 * Instant de FIN d'une séance déclarée (ms), définition UNIQUE.
 *
 * L'heure de fin mesurée par Whoop (`endedAt`, écrite par la
 * réconciliation) prime sur la fin déduite du départ déclaré : recalculer
 * depuis `startAt` ignorerait qu'Ethan est parti plus tôt ou plus tard que
 * prévu. À défaut, la durée réelle (`actualDurationMin`) prime sur la durée
 * annoncée dans le briefing, qui n'est qu'une approximation.
 *
 * Quatre modules avaient chacun leur copie de ce calcul (candidat
 * post-exercice, carte de séance, fenêtre d'annulation, exemption des
 * glucides sport) et deux d'entre elles ignoraient `endedAt` — la cause
 * récurrente de presque tous les défauts de ce module reste la même
 * grandeur calculée à plusieurs endroits.
 *
 * Renvoie `NaN` si `startAt` est illisible — les appelants doivent tester.
 */
export function sportSessionEndMs(session: {
  startAt: string;
  plannedDurationMin: number;
  actualDurationMin?: number;
  endedAt?: string;
}): number {
  if (session.endedAt) {
    const measured = new Date(session.endedAt).getTime();
    if (Number.isFinite(measured)) return measured;
  }
  const startMs = new Date(session.startAt).getTime();
  if (!Number.isFinite(startMs)) return NaN;
  const durationMin = session.actualDurationMin ?? session.plannedDurationMin;
  const safeMin = Number.isFinite(durationMin) && durationMin > 0 ? durationMin : 0;
  return startMs + safeMin * 60_000;
}

/**
 * Durée pendant laquelle la carte d'une séance reste affichée après sa
 * fin (ms) : la fenêtre maximale pendant laquelle une séance pèse encore
 * sur le bolus (bracket 24 h de `computeExerciseAdjustment`). Tant que la
 * réduction d'insuline est active, l'annulation doit rester trouvable —
 * un padel déclaré puis annulé dans sa tête réduirait le dîner sans
 * qu'Ethan puisse rien y faire.
 */
export const BRIEFING_CARD_WINDOW_MS = 24 * 3_600_000;

export interface BriefingSessionState {
  /** Séance à montrer dans la carte (annulation ou info), ou `null`. */
  shown: DeclaredSportSession | null;
  /** Le formulaire de déclaration peut-il être offert ? */
  canDeclare: boolean;
}

/**
 * Quelle séance afficher dans le briefing, et peut-on en déclarer une
 * nouvelle — deux questions DISTINCTES (bug du 14 sept. 2026).
 *
 * Avant, la carte et le formulaire étaient les deux branches d'un même
 * ternaire, et la carte s'affichait pendant les 24 h de la fenêtre
 * d'ajustement. Le formulaire était donc inaccessible 24 h après CHAQUE
 * séance : impossible de déclarer une 2ᵉ séance le même jour, ni celle du
 * lendemain la veille au soir. Depuis que la carte d'une séance confirmée
 * par Whoop ne propose plus rien (« Rien à faire »), c'était un cul-de-sac.
 *
 * Règle : la carte reste pendant toute la fenêtre (pour annuler ou
 * informer) ; le formulaire est disponible dès que la séance affichée est
 * TERMINÉE. Une séance en cours ou à venir bloque encore la déclaration —
 * on ne déclare pas deux séances qui se chevauchent, on annule la première.
 *
 * `sessions` est lu dans l'ordre du store (plus récente en tête) : avec
 * deux séances dans la fenêtre, c'est la plus récente qui est montrée.
 */
export function resolveBriefingSessionState(
  sessions: readonly DeclaredSportSession[],
  nowMs: number,
  windowMs: number = BRIEFING_CARD_WINDOW_MS,
): BriefingSessionState {
  for (const s of sessions) {
    if (s.cancelledAt) continue;
    const endMs = sportSessionEndMs(s);
    if (!Number.isFinite(endMs)) continue;
    if (nowMs < endMs + windowMs) {
      return { shown: s, canDeclare: nowMs >= endMs };
    }
  }
  return { shown: null, canDeclare: true };
}
