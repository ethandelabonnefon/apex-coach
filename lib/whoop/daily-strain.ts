/**
 * Cycles Whoop → strain par jour local. Partie pure de l'historique de
 * charge, séparée du module serveur pour être testée sans KV ni réseau.
 */

import { localParts } from "@/lib/local-time";
import type { DailyStrain } from "@/lib/basal-advisor";

const HALF_DAY_MS = 12 * 3_600_000;

export function cyclesToDailyStrain(
  cycles: { start: string; strain: number }[],
  timeZone: string,
): DailyStrain[] {
  const byDay = new Map<string, number>();
  for (const c of cycles) {
    const startMs = new Date(c.start).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(c.strain)) continue;
    const day = localParts(startMs + HALF_DAY_MS, timeZone).day;
    byDay.set(day, Math.max(byDay.get(day) ?? 0, Math.round(c.strain * 10) / 10));
  }
  return [...byDay.entries()]
    .map(([day, strain]) => ({ day, strain }))
    .sort((a, b) => a.day.localeCompare(b.day));
}
