/**
 * Faut-il notifier la conclusion de l'analyse de la lente ? Partie pure de
 * la veille serveur, isolée pour être testée sans KV ni push.
 */

import type { BasalAdvice } from "@/lib/basal-advisor";

export interface WatchState {
  lastRunAt?: number;
  lastNotifiedAt?: number;
  /** Conclusion déjà notifiée : sens + dose actuelle + dose proposée. */
  lastSignature?: string;
}

/** Une même conclusion n'est pas renvoyée avant ce délai (h). */
export const SAME_ADVICE_RENOTIFY_H = 24;
/** Heures locales entre lesquelles on notifie (pas de réveil pour ça). */
export const NOTIFY_FROM_HOUR = 7;
export const NOTIFY_UNTIL_HOUR = 22;

export function adviceSignature(advice: BasalAdvice): string {
  return `${advice.status}:${advice.currentDose}:${advice.proposedDose ?? ""}`;
}

export function shouldNotify(
  advice: BasalAdvice,
  state: WatchState,
  nowMs: number,
  localHour: number,
): { notify: boolean; reason: string; signature: string } {
  const signature = adviceSignature(advice);
  if (advice.status !== "reduce" && advice.status !== "increase") {
    return { notify: false, reason: "nothing_actionable", signature };
  }
  if (localHour < NOTIFY_FROM_HOUR || localHour >= NOTIFY_UNTIL_HOUR) {
    return { notify: false, reason: "quiet_hours", signature };
  }
  if (
    state.lastSignature === signature &&
    state.lastNotifiedAt !== undefined &&
    nowMs - state.lastNotifiedAt < SAME_ADVICE_RENOTIFY_H * 3_600_000
  ) {
    return { notify: false, reason: "already_notified", signature };
  }
  return { notify: true, reason: "new_advice", signature };
}
