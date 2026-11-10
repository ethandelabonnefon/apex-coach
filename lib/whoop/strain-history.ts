/**
 * Charge d'activité quotidienne depuis Whoop (fable-5.2, nov. 2026).
 *
 * Un cycle Whoop court d'un endormissement au suivant. On le rattache au
 * jour local où il se déroule (début + 12 h), pas au jour où il commence :
 * un cycle qui démarre à 23 h 30 le lundi est la journée du mardi.
 *
 * « Local » = le fuseau de la personne, fourni par l'appelant. Le cache
 * garde les cycles bruts (instants UTC) et la conversion en jours se fait
 * à la lecture : un changement de fuseau ne laisse aucun jour mal rangé.
 *
 * ⚠️ Server only.
 */

import "server-only";
import { fetchRecentCycles, isWhoopConfigured } from "./client";
import {
  getCycleStrainCache,
  getTokens,
  isKvConfigured,
  saveCycleStrainCache,
  type WhoopCycleStrain,
} from "./store";
import { cyclesToDailyStrain } from "./daily-strain";
import type { DailyStrain } from "@/lib/basal-advisor";

/**
 * Historique de strain (14 jours) rangé par jour local, ou `null` si Whoop
 * n'est pas branché. Ne lève jamais : l'analyse de la lente fonctionne
 * sans, la charge d'activité n'est qu'un éclairage.
 */
export async function loadDailyStrain(timeZone: string): Promise<DailyStrain[] | null> {
  if (!isWhoopConfigured() || !isKvConfigured()) return null;
  try {
    const tokens = await getTokens();
    if (!tokens) return null;
    let cycles: WhoopCycleStrain[] | null = await getCycleStrainCache();
    if (!cycles) {
      const fresh = await fetchRecentCycles(14);
      cycles = fresh
        .filter((c) => typeof c.score?.strain === "number")
        .map((c) => ({ start: c.start, strain: c.score!.strain }));
      if (cycles.length > 0) await saveCycleStrainCache(cycles);
    }
    return cyclesToDailyStrain(cycles, timeZone);
  } catch (err) {
    console.error("[whoop/strain-history]", err instanceof Error ? err.message : err);
    return null;
  }
}
