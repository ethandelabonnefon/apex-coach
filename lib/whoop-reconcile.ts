/**
 * Réconciliation Whoop — Task 6 (sept. 2026).
 *
 * Le briefing pré-sport crée une `DeclaredSportSession` avec une durée
 * APPROXIMATIVE (Ethan tape « environ 90 minutes » avant de partir). Le
 * bracelet Whoop remonte ensuite la séance réelle avec ses heures exactes
 * (`hooks/useWhoop.ts`, champ `lastWorkout`). Une mesure vaut mieux qu'une
 * estimation : dès que Whoop retrouve la séance, on complète la durée réelle
 * et on marque la séance comme confirmée (`whoopWorkoutId`).
 *
 * Trois règles non négociables (cf. discriminance du plan) :
 *
 *  1. IDEMPOTENCE — une séance qui porte déjà `whoopWorkoutId` n'est plus
 *     jamais candidate au rapprochement. Le snapshot Whoop est refetché
 *     toutes les 5min (et à chaque retour d'onglet) ; sans cette garde, le
 *     `useEffect` qui applique le résultat réécrirait le store en boucle à
 *     chaque refresh — écritures localStorage en rafale sur une PWA.
 *
 *  2. NE JAMAIS SUPPRIMER — cette fonction ne renvoie jamais d'action de
 *     suppression. Une séance que Whoop ne retrouve pas (padel sans
 *     bracelet, sync en retard…) reste dans le store telle quelle ;
 *     `unconfirmedSessions` se contente de la SIGNALER pour qu'Ethan décide.
 *
 *  3. TOLÉRANCE SERRÉE — un mauvais rapprochement écraserait une durée
 *     correcte par une fausse, ce qui est pire que ne rien rapprocher. Le
 *     début Whoop doit tomber à moins de `RECONCILE_TOLERANCE_MIN` minutes
 *     du début déclaré ; au-delà, on ne rapproche rien plutôt que de
 *     deviner.
 *
 * ⚠️ Pure function. Aucun import serveur, aucun import React.
 */

import type { DeclaredSportSession } from "@/types";

/** Fenêtre de tolérance (min) autour du début déclaré pour rapprocher une
 * séance Whoop. Assez serré pour ne jamais capter la mauvaise séance d'une
 * même soirée (ex : padel puis footing 2h plus tard). */
export const RECONCILE_TOLERANCE_MIN = 45;

/** Une séance non confirmée depuis plus de ce délai (après sa fin, prévue ou
 * réelle) est signalée à l'utilisateur — Whoop a eu largement le temps de
 * syncer. */
export const UNCONFIRMED_AFTER_MIN = 180;

/**
 * Sous-ensemble du `lastWorkout` exposé par `hooks/useWhoop.ts`
 * (`WhoopSnapshot.lastWorkout`). Redéclaré ici (plutôt qu'importé du hook)
 * pour que ce module reste pur — aucun import "use client".
 *
 * ⚠️ Écart avec le plan d'implémentation : le plan supposait des champs
 * `id`/`start`/`end`. La forme réelle produite par `lib/whoop/client.ts` et
 * exposée par `useWhoop` est `id`/`startedAt`/`endedAt`/`strain`/`sport` —
 * cohérente avec `LastWhoopWorkout` déjà utilisé par
 * `lib/exercise-insulin-adjustment.ts`. On suit le code, pas le plan.
 */
export interface WhoopWorkoutSummary {
  id: string;
  /** ISO. */
  startedAt: string;
  /** ISO. */
  endedAt: string;
}

export interface ReconcileUpdate {
  actualDurationMin: number;
  endedAt: string;
  whoopWorkoutId: string;
}

export interface ReconcileResult {
  sessionId: string;
  updates: ReconcileUpdate;
}

/**
 * Cherche, parmi les séances déclarées, celle que la séance Whoop fournie
 * vient confirmer. Renvoie `null` si :
 *  - pas de séance Whoop fournie (pas connecté, ou pas de workout récent) ;
 *  - dates Whoop invalides ou incohérentes (fin avant début) ;
 *  - aucune séance déclarée ne tombe dans la fenêtre de tolérance ;
 *  - la seule candidate dans la fenêtre est annulée ou déjà réconciliée.
 *
 * Ne modifie rien : le retour décrit l'action à appliquer, laissée à
 * l'appelant (le `useEffect` de la page, via `updateDeclaredSportSession`).
 */
export function reconcileWithWhoop(
  sessions: DeclaredSportSession[],
  whoopWorkout: WhoopWorkoutSummary | null | undefined,
  nowMs: number = Date.now(),
): ReconcileResult | null {
  if (!whoopWorkout) return null;

  const whoopStartMs = new Date(whoopWorkout.startedAt).getTime();
  const whoopEndMs = new Date(whoopWorkout.endedAt).getTime();
  if (!Number.isFinite(whoopStartMs) || !Number.isFinite(whoopEndMs)) return null;
  if (whoopEndMs < whoopStartMs) return null;
  // Garde-fou défensif : un workout dont la fin serait dans le futur (skew
  // d'horloge, sync anormale) n'est pas exploité — mieux vaut attendre le
  // prochain refresh que rapprocher sur une donnée douteuse.
  if (whoopEndMs > nowMs) return null;

  let best: DeclaredSportSession | null = null;
  let bestDiffMin = Infinity;

  for (const session of sessions) {
    // Règle 2 (jamais sur une séance annulée) et règle 1 (idempotence).
    if (session.cancelledAt) continue;
    if (session.whoopWorkoutId) continue;

    const declaredStartMs = new Date(session.startAt).getTime();
    if (!Number.isFinite(declaredStartMs)) continue;

    const diffMin = Math.abs(whoopStartMs - declaredStartMs) / 60_000;
    if (diffMin > RECONCILE_TOLERANCE_MIN) continue;
    if (diffMin < bestDiffMin) {
      bestDiffMin = diffMin;
      best = session;
    }
  }

  if (!best) return null;

  const actualDurationMin = Math.round((whoopEndMs - whoopStartMs) / 60_000);

  return {
    sessionId: best.id,
    updates: {
      actualDurationMin,
      endedAt: whoopWorkout.endedAt,
      whoopWorkoutId: whoopWorkout.id,
    },
  };
}

/**
 * Séances déclarées, non annulées, terminées depuis plus de
 * `UNCONFIRMED_AFTER_MIN` minutes, que Whoop n'a jamais confirmées
 * (`whoopWorkoutId` absent) — alors que Whoop EST connecté (sinon la
 * confirmation n'a simplement jamais pu être tentée, ce n'est pas une
 * anomalie à signaler).
 *
 * Ne renvoie que la liste : ne supprime ni ne modifie rien. Ethan garde la
 * main sur l'annulation.
 */
export function unconfirmedSessions(
  sessions: DeclaredSportSession[],
  whoopConnected: boolean,
  nowMs: number = Date.now(),
): DeclaredSportSession[] {
  if (!whoopConnected) return [];

  return sessions.filter((session) => {
    if (session.cancelledAt) return false;
    if (session.whoopWorkoutId) return false;

    const startMs = new Date(session.startAt).getTime();
    if (!Number.isFinite(startMs)) return false;

    const durationMin = session.actualDurationMin ?? session.plannedDurationMin;
    const endMs = startMs + durationMin * 60_000;
    const minutesSinceEnd = (nowMs - endMs) / 60_000;
    return minutesSinceEnd >= UNCONFIRMED_AFTER_MIN;
  });
}
