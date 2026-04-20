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

type ErrorEntry = {
  message: string;
  /** Code HTTP Abbott si l'erreur vient d'axios, sinon undefined */
  status?: number;
  /** Timestamp ms du dernier fail */
  failedAt: number;
};

// ─── Singletons (module-scope, vivent tant que le serveur tourne) ────────
let clientInstance: ReturnType<typeof LibreLinkUpClient> | null = null;
let cache: CacheEntry | null = null;
let lastError: ErrorEntry | null = null;
/** Promise en vol : plusieurs appels concurrents partagent le même fetch */
let inFlight: Promise<GlucoseSnapshot> | null = null;

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
  lastError = null;
}

/**
 * Extrait le code HTTP d'une erreur axios (si présent).
 */
function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const maybe = err as { response?: { status?: number }; status?: number };
  return maybe.response?.status ?? maybe.status;
}

/**
 * Récupère la dernière lecture + l'historique (~8h de points à 15min).
 *
 * Stratégie de cache en cascade :
 *  1. Si on a une erreur récente (< errorBackoffSeconds) et qu'on a un
 *     snapshot précédent → on renvoie le snapshot stale plutôt que de
 *     retaper l'API et s'aggraver un rate-limit 429.
 *  2. Si on a une erreur récente ET aucun snapshot → on rejoue l'erreur.
 *  3. Sinon cache 60s normal, puis fetch Abbott.
 */
export async function fetchGlucoseSnapshot(options: {
  forceRefresh?: boolean;
} = {}): Promise<GlucoseSnapshot> {
  const now = Date.now();
  const ttlMs = LIBRE_LINK_CONFIG.cacheTtlSeconds * 1000;
  const errorBackoffMs = LIBRE_LINK_CONFIG.errorBackoffSeconds * 1000;

  // Cache OK chaud → renvoie direct
  if (
    !options.forceRefresh &&
    cache &&
    now - cache.fetchedAt < ttlMs
  ) {
    return cache.snapshot;
  }

  // Erreur récente → on ne réessaye pas tout de suite, on protège Abbott
  if (
    !options.forceRefresh &&
    lastError &&
    now - lastError.failedAt < errorBackoffMs
  ) {
    if (cache) {
      // On a un snapshot précédent : le renvoyer stale plutôt que bombarder.
      return cache.snapshot;
    }
    // Pas de snapshot du tout : on rejoue l'erreur sans taper Abbott.
    const err = new Error(
      `LibreLink backoff actif (${Math.round(
        (errorBackoffMs - (now - lastError.failedAt)) / 1000,
      )}s restants) — dernière erreur : ${lastError.message}`,
    );
    (err as Error & { status?: number }).status = lastError.status;
    throw err;
  }

  // Requête déjà en vol → on partage la même promise (dédupe concurrent)
  if (inFlight) return inFlight;

  inFlight = (async () => {
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

      cache = { snapshot, fetchedAt: Date.now() };
      lastError = null;
      return snapshot;
    } catch (err) {
      const status = extractStatus(err);
      const message = err instanceof Error ? err.message : "erreur inconnue";
      lastError = { message, status, failedAt: Date.now() };
      console.error(
        `[libre-link] Abbott API error status=${status ?? "?"} msg=${message}`,
      );

      // Si session expirée (401) ou rejet auth (403) → on réinitialise
      // le client pour forcer un relogin au prochain tour (après backoff).
      if (status === 401 || status === 403) {
        clientInstance = null;
      }
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
