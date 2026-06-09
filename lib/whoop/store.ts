/**
 * Whoop OAuth tokens — stockage persistant Vercel KV (Phase F2).
 *
 * App single-user : un seul jeu de tokens Whoop actif à la fois.
 * Les tokens Whoop ont une durée de vie courte (~1h pour access_token,
 * plus long pour refresh_token) → on les rafraîchit à la volée.
 *
 * ⚠️ Server only — jamais importer côté client (sinon les tokens
 * fuitent dans le bundle JS).
 */

import "server-only";
import { kv } from "@vercel/kv";

const K_TOKENS = "whoop:tokens";

export interface WhoopTokens {
  accessToken: string;
  refreshToken: string;
  /** Timestamp ms de l'expiration de l'access token. */
  expiresAt: number;
  /** Scopes accordés au moment du grant initial. */
  scope: string;
  /** Date de connexion initiale (ISO). */
  connectedAt: string;
}

/** Cached snapshot Whoop pour réduire les appels API (TTL 5min). */
export interface WhoopSnapshot {
  /** Strain du cycle courant (0-21). */
  cycleStrain: number | null;
  /** Recovery score du jour (0-100). */
  recoveryScore: number | null;
  /** HRV en ms (RMSSD). */
  hrvMs: number | null;
  /** RHR (resting heart rate) en bpm. */
  rhrBpm: number | null;
  /** Durée sommeil dernière nuit en minutes. */
  sleepDurationMin: number | null;
  /** Score sleep performance (0-100). */
  sleepPerformance: number | null;
  /** Dernier workout détecté (strain + timestamp). */
  lastWorkout: {
    id: string;
    strain: number;
    startedAt: string;
    endedAt: string;
    sport: string | null;
  } | null;
  /** Timestamp de ce snapshot. */
  fetchedAt: number;
}

const K_SNAPSHOT = "whoop:snapshot";
const SNAPSHOT_TTL_SEC = 5 * 60; // 5min

// Mutex pour empêcher les refresh parallèles (race condition Whoop)
const K_REFRESH_LOCK = "whoop:refresh-lock";
const REFRESH_LOCK_TTL_SEC = 10; // auto-release après 10s (safety)

// Compteur de fails consécutifs avant de clear (anti-clear-too-aggressive)
const K_REFRESH_FAILS = "whoop:refresh-fails";
const REFRESH_FAILS_TTL_SEC = 600; // 10min — si pas re-fail pendant 10min, reset

export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.KV_URL);
}

export async function saveTokens(tokens: WhoopTokens): Promise<void> {
  await kv.set(K_TOKENS, tokens);
}

export async function getTokens(): Promise<WhoopTokens | null> {
  return (await kv.get<WhoopTokens>(K_TOKENS)) ?? null;
}

export async function clearTokens(): Promise<void> {
  await kv.del(K_TOKENS);
  await kv.del(K_SNAPSHOT);
}

export async function saveSnapshot(snapshot: WhoopSnapshot): Promise<void> {
  await kv.set(K_SNAPSHOT, snapshot, { ex: SNAPSHOT_TTL_SEC });
}

export async function getSnapshot(): Promise<WhoopSnapshot | null> {
  return (await kv.get<WhoopSnapshot>(K_SNAPSHOT)) ?? null;
}

// ───────────────────────────────────────────────────────────────────────
// Mutex anti-race-condition pour les refresh_token
// ───────────────────────────────────────────────────────────────────────

/**
 * Tente d'acquérir le lock de refresh. Retourne true si on a le lock,
 * false si quelqu'un d'autre l'a (et il faut attendre + re-lire le token).
 *
 * Utilise `set NX` (atomic set-if-not-exists) avec TTL court pour
 * éviter qu'un crash ne bloque le lock à vie.
 */
export async function acquireRefreshLock(): Promise<boolean> {
  try {
    const result = await kv.set(K_REFRESH_LOCK, Date.now(), {
      nx: true,
      ex: REFRESH_LOCK_TTL_SEC,
    });
    return result === "OK";
  } catch (err) {
    console.error("[whoop/store] acquireRefreshLock error:", err);
    // En cas de fail KV, on autorise le refresh (mieux que de bloquer)
    return true;
  }
}

export async function releaseRefreshLock(): Promise<void> {
  try {
    await kv.del(K_REFRESH_LOCK);
  } catch {}
}

// ───────────────────────────────────────────────────────────────────────
// Compteur de fails consécutifs (anti-clearTokens-trop-rapide)
// ───────────────────────────────────────────────────────────────────────

export async function incrementRefreshFails(): Promise<number> {
  try {
    const count = (await kv.get<number>(K_REFRESH_FAILS)) ?? 0;
    const next = count + 1;
    await kv.set(K_REFRESH_FAILS, next, { ex: REFRESH_FAILS_TTL_SEC });
    return next;
  } catch (err) {
    console.error("[whoop/store] incrementRefreshFails error:", err);
    return 0;
  }
}

export async function resetRefreshFails(): Promise<void> {
  try {
    await kv.del(K_REFRESH_FAILS);
  } catch {}
}
