/**
 * Split dose reminder checker — appelé par /api/cron/split-check.
 *
 * Pour chaque reminder dont triggerAt ≤ now et status === pending :
 *   1. Envoie un push VAPID via sendGlucosePush (réutilise infra existante)
 *   2. Marque le reminder comme "fired" en KV
 *
 * Race tolérée : si l'utilisateur a confirmé sa dose dans l'app pile au
 * moment du cron, on peut envoyer une notif "fantôme". C'est jugé
 * acceptable (mieux 1 notif de trop qu'aucune pour une question de santé).
 *
 * ⚠️ Server only.
 */

import "server-only";
import { sendGlucosePush } from "@/lib/push/alerts";
import {
  getDueReminders,
  isKvConfigured,
  markFired,
} from "./store";

export type SplitCheckResult = {
  ok: boolean;
  checked: number;
  fired: number;
  errors: string[];
};

export async function checkSplitsAndAlert(): Promise<SplitCheckResult> {
  if (!isKvConfigured()) {
    return {
      ok: false,
      checked: 0,
      fired: 0,
      errors: ["kv_not_configured"],
    };
  }

  const due = await getDueReminders();
  if (due.length === 0) {
    return { ok: true, checked: 0, fired: 0, errors: [] };
  }

  let fired = 0;
  const errors: string[] = [];

  for (const reminder of due) {
    const minutesLate = Math.round(
      (Date.now() - new Date(reminder.triggerAt).getTime()) / 60_000,
    );
    const mealHint = reminder.mealLabel
      ? ` (${reminder.mealLabel})`
      : "";
    const lateHint = minutesLate > 5 ? ` — programmé il y a ${minutesLate} min` : "";

    const res = await sendGlucosePush({
      type: "split",
      title: "Rappel split dose",
      body: `Il est temps de faire ${reminder.units}U pour couvrir les graisses/protéines${mealHint}.${lateHint}`,
      value: reminder.units,
      url: "/diabete",
      tag: `split-${reminder.id}`,
    });

    if (res.sent) {
      await markFired(reminder.id);
      fired++;
    } else {
      errors.push(`reminder ${reminder.id}: ${res.reason ?? "unknown"}`);
      // Si la subscription est gone, on marque quand même fired pour ne pas
      // retenter en boucle (l'utilisateur devra re-souscrire pour les futurs).
      if (res.reason === "subscription_gone") {
        await markFired(reminder.id);
      }
    }
  }

  return {
    ok: errors.length === 0,
    checked: due.length,
    fired,
    errors,
  };
}
