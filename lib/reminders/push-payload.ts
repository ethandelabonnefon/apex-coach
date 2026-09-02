/**
 * Construction du payload push selon la nature du rappel.
 *
 * Pur et sans I/O (pas de "server-only") pour rester testable en node.
 */

import type { Reminder } from "@/types";

export interface ReminderPush {
  type: "split" | "meal-confirm";
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

  return {
    type: "split",
    title: "Rappel split dose",
    body: `Il est temps de faire ${reminder.units}U pour couvrir les graisses/protéines${mealHint}.${lateHint}`,
    value: reminder.units,
    url: "/diabete",
    tag: `split-${reminder.id}`,
  };
}
