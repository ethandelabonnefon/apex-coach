/**
 * Surveillance en panne — faut-il prévenir ? (nov. 2026)
 *
 * Incident du 12/11/2026 : pendant que le compte Abbott était bloqué, le
 * cron ne lisait plus rien, donc n'envoyait plus aucune alerte d'hypo — et
 * rien ne le disait. Le silence d'une app de surveillance se lit comme
 * « tout va bien ». C'est le pire mode de panne.
 *
 * Règle : quand aucune mesure fraîche n'arrive depuis 30 minutes (Abbott
 * injoignable, capteur déconnecté, téléphone hors réseau), UNE notification
 * le dit. Elle est répétée toutes les 3 heures tant que ça dure, et une
 * notification annonce le retour — seulement si la panne avait été
 * annoncée.
 *
 * Pur : l'état est lu et écrit par l'appelant (KV).
 */

export interface MonitorState {
  /** Début de la panne en cours (ms), absent quand tout va bien. */
  downSince?: number;
  /** Dernière notification « surveillance en pause » pour cette panne (ms). */
  notifiedAt?: number;
}

/** Durée sans mesure fraîche avant de prévenir (min). */
export const OUTAGE_NOTIFY_AFTER_MIN = 30;
/** Rappel tant que la panne dure (min). */
export const OUTAGE_REMIND_EVERY_MIN = 180;

export type MonitorAction = "none" | "notify-down" | "notify-back";

/**
 * @param observedSinceMs instant de la dernière mesure connue, quand la
 *        panne est une mesure qui vieillit : la panne a commencé LÀ, pas au
 *        moment où le cron s'en aperçoit.
 */
export function assessMonitor(
  state: MonitorState,
  healthy: boolean,
  nowMs: number,
  observedSinceMs?: number,
): { action: MonitorAction; next: MonitorState; downMinutes: number } {
  if (healthy) {
    const wasAnnounced = state.notifiedAt !== undefined;
    return { action: wasAnnounced ? "notify-back" : "none", next: {}, downMinutes: 0 };
  }

  const observed =
    observedSinceMs !== undefined && Number.isFinite(observedSinceMs) && observedSinceMs <= nowMs
      ? observedSinceMs
      : undefined;
  const downSince = state.downSince ?? observed ?? nowMs;
  const downMinutes = Math.max(0, (nowMs - downSince) / 60_000);
  const next: MonitorState = { downSince, notifiedAt: state.notifiedAt };

  const neverNotified = state.notifiedAt === undefined;
  const reminderDue =
    state.notifiedAt !== undefined &&
    (nowMs - state.notifiedAt) / 60_000 >= OUTAGE_REMIND_EVERY_MIN;

  if (downMinutes >= OUTAGE_NOTIFY_AFTER_MIN && (neverNotified || reminderDue)) {
    return { action: "notify-down", next: { downSince, notifiedAt: nowMs }, downMinutes };
  }
  return { action: "none", next, downMinutes };
}
