/**
 * Sauvegarde serveur du store — stockage KV (sept. 2026).
 *
 * Schéma KV :
 *   "store:backup:latest"          → BackupPayload (écrasé à chaque synchro)
 *   "store:backup:day:YYYY-MM-DD"  → BackupPayload (première synchro du jour
 *                                    gardée telle quelle 30 j : point de
 *                                    retour si la « latest » est déjà vide)
 *
 * Deux garde-fous serveur, indépendants du client :
 *  - une sauvegarde VIDE (aucune injection) ne remplace jamais une
 *    « latest » qui en contient plusieurs — c'est exactement le scénario
 *    du 19/09 : un client fraîchement vidé qui synchronise son néant ;
 *  - taille plafonnée (KV refuse les grosses valeurs, et une sauvegarde
 *    qui échoue en silence ne vaut rien).
 *
 * ⚠️ Server only.
 */

import "server-only";
import { kv } from "@vercel/kv";
import { WIPE_GUARD_MIN_LOGS, type BackupPayload, type BackupSummary } from "./payload";

const K_LATEST = "store:backup:latest";
const K_DAY_PREFIX = "store:backup:day:";
const DAY_TTL_SECONDS = 30 * 86_400;
/** Taille max (octets, JSON) acceptée pour une sauvegarde. */
export const MAX_BACKUP_BYTES = 900_000;

export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.KV_URL);
}

export interface BackupMeta {
  savedAt: string;
  storeVersion: number;
  summary: BackupSummary;
}

function metaOf(p: BackupPayload): BackupMeta {
  return { savedAt: p.savedAt, storeVersion: p.storeVersion, summary: p.summary };
}

function dayKey(iso: string): string {
  return K_DAY_PREFIX + iso.slice(0, 10);
}

export async function getLatestBackup(): Promise<BackupPayload | null> {
  try {
    return (await kv.get<BackupPayload>(K_LATEST)) ?? null;
  } catch (err) {
    console.error("[store-backup] get latest error:", err);
    return null;
  }
}

export async function getDayBackup(day: string): Promise<BackupPayload | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  try {
    return (await kv.get<BackupPayload>(K_DAY_PREFIX + day)) ?? null;
  } catch (err) {
    console.error("[store-backup] get day error:", err);
    return null;
  }
}

/** Métadonnées de la « latest » + des instantanés quotidiens disponibles (14 derniers jours). */
export async function listBackups(now: Date = new Date()): Promise<{
  latest: BackupMeta | null;
  days: (BackupMeta & { day: string })[];
}> {
  const latest = await getLatestBackup();
  const days: (BackupMeta & { day: string })[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    const p = await getDayBackup(d);
    if (p) days.push({ day: d, ...metaOf(p) });
  }
  return { latest: latest ? metaOf(latest) : null, days };
}

export type SaveResult =
  | { ok: true; savedAt: string; daySnapshotWritten: boolean }
  | { ok: false; reason: "too-large" | "would-wipe" | "kv-error"; detail?: string };

export async function saveBackup(payload: BackupPayload): Promise<SaveResult> {
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  if (bytes > MAX_BACKUP_BYTES) {
    return { ok: false, reason: "too-large", detail: `${bytes} octets > ${MAX_BACKUP_BYTES}` };
  }

  const latest = await getLatestBackup();
  if (
    latest &&
    payload.summary.insulinLogs === 0 &&
    latest.summary.insulinLogs >= WIPE_GUARD_MIN_LOGS
  ) {
    return {
      ok: false,
      reason: "would-wipe",
      detail: `la sauvegarde du ${latest.savedAt} contient ${latest.summary.insulinLogs} injections`,
    };
  }

  try {
    await kv.set(K_LATEST, payload);
    // Instantané du jour : on garde le PREMIER de la journée (état du matin),
    // les suivants ne l'écrasent pas — c'est lui le point de retour.
    const dk = dayKey(payload.savedAt);
    const existingDay = await kv.get<BackupPayload>(dk);
    let daySnapshotWritten = false;
    if (!existingDay) {
      await kv.set(dk, payload, { ex: DAY_TTL_SECONDS });
      daySnapshotWritten = true;
    }
    return { ok: true, savedAt: payload.savedAt, daySnapshotWritten };
  } catch (err) {
    console.error("[store-backup] save error:", err);
    return { ok: false, reason: "kv-error", detail: err instanceof Error ? err.message : String(err) };
  }
}
