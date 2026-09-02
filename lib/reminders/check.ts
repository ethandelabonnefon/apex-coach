/**
 * Checker de rappels — appelé par le cron (piggyback sur glucose-check).
 *
 * Pour chaque rappel dont triggerAt ≤ now et status === pending :
 *   1. Construit le payload selon sa nature (split / meal-confirm)
 *   2. Envoie un push VAPID
 *   3. Marque le rappel comme "fired" en KV
 *
 * Race tolérée : si l'utilisateur a agi dans l'app pile au moment du cron,
 * on peut envoyer une notif « fantôme ». Jugé acceptable (mieux 1 notif de
 * trop qu'aucune pour une question de santé).
 *
 * ⚠️ Server only.
 */

import "server-only";
import { sendGlucosePush } from "@/lib/push/alerts";
import { buildReminderPush } from "./push-payload";
import { getDueReminders, isKvConfigured, markFired } from "./store";

export type ReminderCheckResult = {
  ok: boolean;
  checked: number;
  fired: number;
  errors: string[];
};

export async function checkRemindersAndAlert(): Promise<ReminderCheckResult> {
  if (!isKvConfigured()) {
    return { ok: false, checked: 0, fired: 0, errors: ["kv_not_configured"] };
  }

  const due = await getDueReminders();
  if (due.length === 0) {
    return { ok: true, checked: 0, fired: 0, errors: [] };
  }

  let fired = 0;
  const errors: string[] = [];

  for (const reminder of due) {
    const res = await sendGlucosePush(buildReminderPush(reminder));

    if (res.sent) {
      await markFired(reminder.id);
      fired++;
    } else {
      errors.push(`reminder ${reminder.id}: ${res.reason ?? "unknown"}`);
      // Subscription expirée : on marque fired pour ne pas retenter en boucle.
      if (res.reason === "subscription_gone") {
        await markFired(reminder.id);
      }
    }
  }

  return { ok: errors.length === 0, checked: due.length, fired, errors };
}
