/**
 * Glucose archive — stockage long terme (90 jours) des lectures CGM.
 *
 * Stratégie :
 *  - Vercel KV (Redis) — déjà configuré pour les push notifs
 *  - Un sorted set unique `glucose:archive` avec score = timestamp ms et
 *    value = JSON-stringified `ArchivedPoint`. Les timestamps sont uniques
 *    côté Abbott (précis à la seconde) donc pas de collision.
 *  - Dédupe à l'insert : on ne réécrit pas un point déjà présent (score
 *    existant). Le `zadd` de ioredis gère ça nativement via le flag NX.
 *  - Purge : on supprime tout ce qui est plus vieux que RETENTION_DAYS
 *    à chaque archivage pour éviter que le set grossisse indéfiniment.
 *
 * Volumétrie attendue :
 *  90j × 96 points/j = 8640 points × ~120 bytes JSON = ~1 MB total.
 *  Vercel KV Hobby = 256 MB, aucun souci.
 *
 * ⚠️ Serveur uniquement — jamais importer côté client.
 */

import "server-only";
import { kv } from "@vercel/kv";

const KEY = "glucose:archive";

export const RETENTION_DAYS = 90;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

/** Point archivé : identique à un GlucoseReading Libre mais avec timestamp ms. */
export interface ArchivedPoint {
  t: number;          // timestamp ms (clé)
  value: number;      // mg/dL
  trend: string;      // SingleDown, Flat, SingleUp, …
  isHigh: boolean;
  isLow: boolean;
}

/** Check si KV est configuré (évite les crashes en dev local sans KV). */
export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.KV_URL);
}

/**
 * Archive une liste de points. Dédupe sur le timestamp ms.
 * Retourne { inserted, skipped } pour observabilité.
 */
export async function archivePoints(points: ArchivedPoint[]): Promise<{
  inserted: number;
  skipped: number;
}> {
  if (!isKvConfigured() || points.length === 0) {
    return { inserted: 0, skipped: points.length };
  }

  // On récupère les timestamps déjà présents dans la fenêtre visée pour dédupe
  const minT = Math.min(...points.map((p) => p.t));
  const maxT = Math.max(...points.map((p) => p.t));
  const existingRaw = await kv.zrange<string[]>(KEY, minT, maxT, {
    byScore: true,
  });
  const existingTs = new Set<number>();
  for (const raw of existingRaw ?? []) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed.t === "number") existingTs.add(parsed.t);
    } catch {
      // ignore malformed
    }
  }

  const toInsert = points.filter((p) => !existingTs.has(p.t));
  const skipped = points.length - toInsert.length;

  if (toInsert.length > 0) {
    const members = toInsert.map((p) => ({
      score: p.t,
      member: JSON.stringify(p),
    }));
    // @vercel/kv typing : zadd(key, firstMember, ...restMembers)
    const [first, ...rest] = members;
    await kv.zadd(KEY, first, ...rest);
  }

  return { inserted: toInsert.length, skipped };
}

/**
 * Purge les points plus vieux que RETENTION_DAYS.
 * Retourne le nombre de points purgés.
 */
export async function purgeOldPoints(): Promise<number> {
  if (!isKvConfigured()) return 0;
  const cutoff = Date.now() - RETENTION_MS;
  const removed = await kv.zremrangebyscore(KEY, 0, cutoff);
  return removed ?? 0;
}

/**
 * Lit les points dans une fenêtre temporelle donnée (ms).
 * Retourne triés par timestamp croissant.
 */
export async function readPoints(
  fromMs: number,
  toMs: number,
): Promise<ArchivedPoint[]> {
  if (!isKvConfigured()) return [];
  const raw = await kv.zrange<string[]>(KEY, fromMs, toMs, {
    byScore: true,
  });
  const out: ArchivedPoint[] = [];
  for (const item of raw ?? []) {
    try {
      const parsed = typeof item === "string" ? JSON.parse(item) : item;
      if (
        parsed &&
        typeof parsed.t === "number" &&
        typeof parsed.value === "number"
      ) {
        out.push(parsed as ArchivedPoint);
      }
    } catch {
      // ignore
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Métadonnées : dernier point archivé + total dans l'archive. */
export async function getArchiveMeta(): Promise<{
  total: number;
  latestTs: number | null;
  oldestTs: number | null;
}> {
  if (!isKvConfigured()) {
    return { total: 0, latestTs: null, oldestTs: null };
  }
  const total = (await kv.zcard(KEY)) ?? 0;
  const [oldestRaw] = (await kv.zrange<string[]>(KEY, 0, 0)) ?? [];
  const [latestRaw] = (await kv.zrange<string[]>(KEY, -1, -1)) ?? [];
  const parse = (raw?: string): number | null => {
    if (!raw) return null;
    try {
      const p = typeof raw === "string" ? JSON.parse(raw) : raw;
      return typeof p?.t === "number" ? p.t : null;
    } catch {
      return null;
    }
  };
  return {
    total,
    oldestTs: parse(oldestRaw),
    latestTs: parse(latestRaw),
  };
}
