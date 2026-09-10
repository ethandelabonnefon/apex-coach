/**
 * Construction du payload push selon la nature du rappel.
 *
 * Pur et sans I/O (pas de "server-only") pour rester testable en node.
 */

import type { Reminder } from "@/types";

export interface ReminderPush {
  type: "split" | "meal-confirm" | "post-session";
  title: string;
  body: string;
  value?: number;
  url: string;
  tag: string;
}

export function buildReminderPush(reminder: Reminder): ReminderPush {
  // Rappels créés avant septembre 2026 : pas de kind → ce sont des splits.
  const kind = reminder.kind ?? "split";

  const minutesLate = Math.round(
    (Date.now() - new Date(reminder.triggerAt).getTime()) / 60_000,
  );
  const lateHint =
    minutesLate > 5 ? ` — programmé il y a ${minutesLate} min` : "";
  const mealHint = reminder.mealLabel ? ` (${reminder.mealLabel})` : "";

  if (kind === "meal-confirm") {
    const carbsHint =
      reminder.carbsEstimated !== undefined
        ? ` Tu avais estimé ${reminder.carbsEstimated} g.`
        : "";
    return {
      type: "meal-confirm",
      title: "Tu as mangé combien finalement ?",
      body: `Confirme les glucides de ton repas${mealHint} pour ajuster le suivi.${carbsHint}${lateHint}`,
      value: reminder.carbsEstimated,
      url: "/diabete",
      tag: `meal-confirm-${reminder.id}`,
    };
  }

  if (kind === "post-session") {
    // `mealLabel` porte ici le nom du sport ("course à pied").
    const sportHint = reminder.mealLabel ? ` ta ${reminder.mealLabel}` : " ta séance";
    return {
      type: "post-session",
      title: "Appoint post-séance",
      body: `Les glucides pris pour${sportHint} finissent d'être absorbés : ${reminder.units}U proposées. Vérifie ta glycémie dans l'app avant d'injecter.${lateHint}`,
      value: reminder.units,
      url: "/diabete",
      tag: `post-session-${reminder.id}`,
    };
  }

  return {
    type: "split",
    title: "Rappel split dose",
    body: `Il est temps de faire ${reminder.units}U pour couvrir les graisses/protéines${mealHint}.${lateHint}`,
    value: reminder.units,
    url: "/diabete",
    tag: `split-${reminder.id}`,
  };
}
