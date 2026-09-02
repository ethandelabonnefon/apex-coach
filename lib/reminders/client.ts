/**
 * Rappels serveur — helpers client (fire-and-forget).
 *
 * Synchronisent les rappels avec le KV serveur pour que le cron puisse
 * tirer le push même app fermée. Tous les appels sont silencieux pour ne
 * pas casser l'UX si le réseau est down.
 */

import type { Reminder } from "@/types";

export async function scheduleReminderOnServer(
  reminder: Reminder,
): Promise<boolean> {
  try {
    const res = await fetch("/api/reminders/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: reminder.id,
        kind: reminder.kind ?? "split",
        parentInjectionId: reminder.parentInjectionId,
        units: reminder.units,
        triggerAt: reminder.triggerAt,
        createdAt: reminder.createdAt,
        mealLabel: reminder.mealLabel,
        carbsEstimated: reminder.carbsEstimated,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[reminders/client] schedule failed (silent):", err);
    return false;
  }
}

export async function cancelReminderOnServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/reminders/cancel?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return res.ok;
  } catch (err) {
    console.warn("[reminders/client] cancel failed (silent):", err);
    return false;
  }
}
