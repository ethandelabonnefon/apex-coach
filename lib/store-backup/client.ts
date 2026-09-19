"use client";

/**
 * Client de la sauvegarde serveur (sept. 2026) — côté navigateur.
 *
 * - `syncBackupNow(force?)` : construit le payload depuis le store et le
 *   POSTe si l'empreinte a changé (ou si `force`). Silencieux en échec :
 *   la sauvegarde ne doit jamais gêner l'usage de l'app.
 * - `fetchBackupMeta()` / `fetchBackupFull(day?)` : lecture.
 * - `restoreFromBackup(payload)` : fusionne dans le store (les clés
 *   protégées de la sauvegarde priment), ce qui déclenche la persistance
 *   localStorage normale.
 *
 * L'état de la dernière synchro est mémorisé sous `apex-backup-meta`
 * (localStorage) pour l'affichage dans Paramètres.
 */

import { useStore } from "@/lib/store";
import {
  backupFingerprint,
  buildBackupPayload,
  mergeRestoredState,
  type BackupPayload,
  type BackupSummary,
} from "./payload";

const STORE_VERSION = 3;
const META_KEY = "apex-backup-meta";

export interface BackupMetaLocal {
  lastSyncAt: string | null;
  lastFingerprint: string | null;
  lastError: string | null;
}

export interface ServerBackupList {
  latest: { savedAt: string; storeVersion: number; summary: BackupSummary } | null;
  days: { day: string; savedAt: string; storeVersion: number; summary: BackupSummary }[];
}

export function readLocalMeta(): BackupMetaLocal {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (raw) return JSON.parse(raw) as BackupMetaLocal;
  } catch {
    /* stockage indisponible : on repart de zéro */
  }
  return { lastSyncAt: null, lastFingerprint: null, lastError: null };
}

function writeLocalMeta(meta: BackupMetaLocal) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* ignore */
  }
}

let inFlight: Promise<boolean> | null = null;

/**
 * Renvoie `true` si une sauvegarde a été envoyée et acceptée, `false`
 * sinon (rien à envoyer, KV absent, refus serveur, réseau).
 */
export function syncBackupNow(force = false): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const meta = readLocalMeta();
    const payload = buildBackupPayload(useStore.getState() as unknown as Record<string, unknown>, STORE_VERSION);
    const fp = backupFingerprint(payload);
    if (!force && meta.lastFingerprint === fp) return false;
    try {
      const res = await fetch("/api/store-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 503) return false; // KV absent (dev)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        writeLocalMeta({ ...meta, lastError: `${body.error ?? res.status}${body.detail ? ` — ${body.detail}` : ""}` });
        return false;
      }
      writeLocalMeta({ lastSyncAt: payload.savedAt, lastFingerprint: fp, lastError: null });
      return true;
    } catch (err) {
      writeLocalMeta({ ...meta, lastError: err instanceof Error ? err.message : "réseau" });
      return false;
    }
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export async function fetchBackupMeta(): Promise<ServerBackupList | null> {
  try {
    const res = await fetch("/api/store-backup", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ServerBackupList;
  } catch {
    return null;
  }
}

export async function fetchBackupFull(day?: string): Promise<BackupPayload | null> {
  try {
    const res = await fetch(day ? `/api/store-backup?day=${day}` : "/api/store-backup?full=1", { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as BackupPayload;
  } catch {
    return null;
  }
}

/** Applique une sauvegarde au store. L'appelant confirme AVANT. */
export function restoreFromBackup(payload: BackupPayload): void {
  const current = useStore.getState() as unknown as Record<string, unknown>;
  const merged = mergeRestoredState(current, payload.state);
  useStore.setState(merged as unknown as Parameters<typeof useStore.setState>[0], true);
  // La prochaine synchro repart de cet état.
  writeLocalMeta({ lastSyncAt: null, lastFingerprint: null, lastError: null });
}
