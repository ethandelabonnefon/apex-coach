/**
 * LibreLink Up — wrapper client serveur
 *
 * Encapsule la lib `@diakem/libre-link-up-api-client` pour :
 * - singleton : évite de recréer un client + relogin à chaque requête
 * - cache 60s : évite de spammer l'API Abbott
 * - typage strict : expose uniquement ce dont l'app a besoin
 *
 * ⚠️ Serveur uniquement — ne jamais importer depuis du code client.
 */

import "server-only";
import { LibreLinkUpClient } from "@diakem/libre-link-up-api-client";
import { LIBRE_LINK_CONFIG, isLibreLinkConfigured } from "./config";

export type GlucoseReading = {
  value: number; // mg/dL
  isHigh: boolean;
  isLow: boolean;
  trend:
    | "SingleDown"
    | "FortyFiveDown"
    | "Flat"
    | "FortyFiveUp"
    | "SingleUp"
    | "NotComputable";
  date: string; // ISO 8601
};

export type GlucoseSnapshot = {
  current: GlucoseReading;
  history: GlucoseReading[];
};

type CacheEntry = {
  snapshot: GlucoseSnapshot;
  fetchedAt: number;
};

// ─── Singletons (module-scope, vivent tant que le serveur tourne) ────────
let clientInstance: ReturnType<typeof LibreLinkUpClient> | null = null;
let cache: CacheEntry | null = null;

function getClient() {
  if (!isLibreLinkConfigured()) {
    throw new Error(
      "LibreLink Up non configuré : définis LIBRELINK_EMAIL et LIBRELINK_PASSWORD dans .env.local",
    );
  }
  if (!clientInstance) {
    clientInstance = LibreLinkUpClient({
      username: LIBRE_LINK_CONFIG.email,
      password: LIBRE_LINK_CONFIG.password,
      clientVersion: LIBRE_LINK_CONFIG.clientVersion,
    });
  }
  return clientInstance;
}

/**
 * Remet à zéro le client (utile si on reçoit une 401 — session expirée).
 */
export function resetLibreLinkClient() {
  clientInstance = null;
  cache = null;
}

/**
 * Récupère la dernière lecture + l'historique (~8h de points à 15min).
 * Cache module-level de 60s pour éviter de spammer Abbott.
 */
export async function fetchGlucoseSnapshot(options: {
  forceRefresh?: boolean;
} = {}): Promise<GlucoseSnapshot> {
  const now = Date.now();
  const ttlMs = LIBRE_LINK_CONFIG.cacheTtlSeconds * 1000;

  if (
    !options.forceRefresh &&
    cache &&
    now - cache.fetchedAt < ttlMs
  ) {
    return cache.snapshot;
  }

  try {
    const client = getClient();
    const { current, history } = await client.read();

    const snapshot: GlucoseSnapshot = {
      current: {
        value: current.value,
        isHigh: current.isHigh,
        isLow: current.isLow,
        trend: current.trend,
        date: current.date.toISOString(),
      },
      history: history.map((h) => ({
        value: h.value,
        isHigh: h.isHigh,
        isLow: h.isLow,
        trend: h.trend,
        date: h.date.toISOString(),
      })),
    };

    cache = { snapshot, fetchedAt: now };
    return snapshot;
  } catch (err) {
    // Session peut-être expirée — on réinitialise pour forcer un relogin.
    resetLibreLinkClient();
    throw err;
  }
}
