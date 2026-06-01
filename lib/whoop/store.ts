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
