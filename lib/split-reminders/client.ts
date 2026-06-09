/**
 * Split-reminders — helpers client (fire-and-forget).
 *
 * Appelés depuis app/diabete/page.tsx pour synchroniser les reminders
 * avec le KV serveur. Le push réel est envoyé par /api/cron/split-check.
 *
 * Tous les appels sont silencieux (try/catch) pour ne pas casser l'UX
 * si le réseau est down — le store Zustand local reste source de vérité
 * côté client.
 */

import type { SplitDoseReminder } from "@/types";

export async function scheduleSplitOnServer(
  reminder: SplitDoseReminder,
): Promise<boolean> {
  try {
    const res = await fetch("/api/split/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: reminder.id,
        parentInjectionId: reminder.parentInjectionId,
        units: reminder.units,
        triggerAt: reminder.triggerAt,
        createdAt: reminder.createdAt,
        mealLabel: reminder.mealLabel,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[split/client] schedule failed (silent):", err);
    return false;
  }
}

export async function cancelSplitOnServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/split/cancel?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return res.ok;
  } catch (err) {
    console.warn("[split/client] cancel failed (silent):", err);
    return false;
  }
}
