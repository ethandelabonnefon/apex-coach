/**
 * Veille de la lente côté serveur (fable-5.2, nov. 2026).
 *
 * Pourquoi côté serveur : l'analyse de l'écran ne tourne que quand l'app est
 * ouverte. Or le moment où il faut dire « baisse ta lente » est précisément
 * celui où l'on n'ouvre pas l'app — une semaine chargée, des hypos traitées
 * à la volée. Le serveur a tout ce qu'il faut : la courbe (archive KV) et
 * les injections (sauvegarde du store, synchronisée en continu).
 *
 * Greffée sur le cron `glucose-check` (toutes les 5 min, plan Hobby = un
 * seul cron disponible) avec deux freins :
 *   - une analyse toutes les 3 h au plus ;
 *   - une notification par conclusion : la même proposition (même sens,
 *     même dose) n'est renvoyée qu'après 24 h, et jamais la nuit.
 *
 * Le serveur ne modifie RIEN. Il prévient ; la dose ne change que si le
 * bouton Valider est pressé dans l'app.
 *
 * ⚠️ Server only.
 */

import "server-only";
import { kv } from "@vercel/kv";
import { analyzeBasal, buildBasalInputs, type BasalAdvice } from "@/lib/basal-advisor";
import { isValidTimeZone, localParts } from "@/lib/local-time";
import { isKvConfigured, readPoints } from "@/lib/glucose-archive/store";
import { getLatestBackup } from "@/lib/store-backup/store";
import { sendGlucosePush } from "@/lib/push/alerts";
import { loadDailyStrain } from "@/lib/whoop/strain-history";
import { shouldNotify, type WatchState } from "./decide";

const K_STATE = "basal-watch:state";
const DAY_MS = 86_400_000;

/** Au-delà, la sauvegarde du store est trop vieille pour qu'on s'y fie (h). */
const MAX_BACKUP_AGE_H = 36;
/** Intervalle minimal entre deux analyses (h). */
const MIN_RUN_INTERVAL_H = 3;

export type BasalWatchResult = {
  ok: boolean;
  action: "skipped" | "analyzed" | "notified" | "error";
  reason?: string;
  status?: BasalAdvice["status"];
};

export async function checkBasalAndAlert(nowMs: number = Date.now()): Promise<BasalWatchResult> {
  if (!isKvConfigured()) return { ok: false, action: "skipped", reason: "kv_not_configured" };

  const state = (await kv.get<WatchState>(K_STATE)) ?? {};
  if (state.lastRunAt && nowMs - state.lastRunAt < MIN_RUN_INTERVAL_H * 3_600_000) {
    return { ok: true, action: "skipped", reason: "recent_run" };
  }

  const backup = await getLatestBackup();
  if (!backup) return { ok: true, action: "skipped", reason: "no_backup" };
  const backupAgeH = (nowMs - new Date(backup.savedAt).getTime()) / 3_600_000;
  if (!Number.isFinite(backupAgeH) || backupAgeH > MAX_BACKUP_AGE_H) {
    // Injections pas à jour → on ne saurait plus distinguer une hypo due à
    // un bolus d'une hypo due à la lente. Mieux vaut se taire.
    await kv.set(K_STATE, { ...state, lastRunAt: nowMs });
    return { ok: true, action: "skipped", reason: "backup_stale" };
  }

  // Le serveur tourne en UTC : sans le fuseau de l'appareil (envoyé avec la
  // sauvegarde depuis fable-5.2) on ne sait ni où tombe la nuit, ni à
  // quelle heure il est acceptable de notifier. On attend la prochaine
  // synchro plutôt que de supposer un fuseau.
  if (!isValidTimeZone(backup.timeZone)) {
    await kv.set(K_STATE, { ...state, lastRunAt: nowMs });
    return { ok: true, action: "skipped", reason: "no_time_zone" };
  }
  const timeZone = backup.timeZone;

  const s = backup.state as {
    insulinLogs?: { units: number; injectedAt: string }[];
    carbEntries?: { eatenAt: string; insulinUnits?: number }[];
    profile?: { basalDose?: number; basalDoseChangedAt?: string };
  };
  const basalDose = Number(s.profile?.basalDose);
  if (!(basalDose > 0)) {
    await kv.set(K_STATE, { ...state, lastRunAt: nowMs });
    return { ok: true, action: "skipped", reason: "no_basal_dose" };
  }

  const [points, dailyStrain] = await Promise.all([
    readPoints(nowMs - 8 * DAY_MS, nowMs),
    loadDailyStrain(timeZone),
  ]);
  const { boluses, carbEntriesMs } = buildBasalInputs(s.insulinLogs, s.carbEntries);
  const changedAt = s.profile?.basalDoseChangedAt
    ? new Date(s.profile.basalDoseChangedAt).getTime()
    : undefined;

  const advice = analyzeBasal({
    points,
    boluses,
    carbEntriesMs,
    basalDose,
    basalChangedAtMs: changedAt,
    nowMs,
    timeZone,
    dailyStrain: dailyStrain ?? undefined,
  });

  const localHour = localParts(nowMs, timeZone).hour;
  const decision = shouldNotify(advice, state, nowMs, localHour);
  const next: WatchState = { ...state, lastRunAt: nowMs };

  if (!decision.notify) {
    await kv.set(K_STATE, next);
    return { ok: true, action: "analyzed", status: advice.status, reason: decision.reason };
  }

  const res = await sendGlucosePush({
    type: "basal",
    title: advice.status === "reduce" ? "Lente à baisser" : "Lente à remonter",
    body: `${advice.headline}. ${advice.reasons[0] ?? ""}`.slice(0, 220),
    url: "/diabete",
    tag: "basal-advice",
  });
  if (res.sent) {
    next.lastNotifiedAt = nowMs;
    next.lastSignature = decision.signature;
  }
  await kv.set(K_STATE, next);
  return {
    ok: true,
    action: res.sent ? "notified" : "analyzed",
    status: advice.status,
    reason: res.reason,
  };
}
