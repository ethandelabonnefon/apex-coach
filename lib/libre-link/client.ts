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
import { LIBRE_LINK_CONFIG, backoffSecondsFor, isLibreLinkConfigured } from "./config";

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
  /** Échecs consécutifs — pilote l'escalade du backoff (cf. config). */
  consecutiveFailures: number;
};

/**
 * Une erreur qui laisse le client dans un état inutilisable ?
 *
 * Le reset ne portait que sur 401/403. Or un 429 (ou toute réponse sans
 * ticket d'auth) remonte en `TypeError` sans code HTTP : le client restait
 * alors en cache avec une session morte. On traite donc aussi la signature
 * de cette erreur.
 */
function isAuthShapedFailure(status: number | undefined, message: string): boolean {
  if (status === 401 || status === 403 || status === 429) return true;
  return /reading 'token'|authTicket|Cannot read properties of undefined/i.test(message);
}

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
  // Escalade : plus on enchaîne les échecs, plus on laisse Abbott tranquille.
  const errorBackoffMs =
    backoffSecondsFor(lastError?.consecutiveFailures ?? 1) * 1000;

  // Cache OK chaud → renvoie direct
  if (
    !options.forceRefresh &&
    cache &&
    now - cache.fetchedAt < ttlMs
  ) {
    return cache.snapshot;
  }

  // Erreur récente → on ne réessaye pas tout de suite, on protège Abbott.
  //
  // ⚠️ `forceRefresh` ne court-circuite PLUS le backoff (7 oct. 2026) : le
  // bouton « Rafraîchir » du briefing et le re-fetch au retour d'onglet
  // passaient outre, et chaque tap relançait une tentative de login sur un
  // compte déjà rate-limité. Forcer un rafraîchissement ne peut pas être
  // un moyen de contourner une protection contre soi-même.
  if (lastError && now - lastError.failedAt < errorBackoffMs) {
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
      const consecutiveFailures = (lastError?.consecutiveFailures ?? 0) + 1;
      lastError = { message, status, failedAt: Date.now(), consecutiveFailures };
      console.error(
        `[libre-link] Abbott API error status=${status ?? "?"} échec #${consecutiveFailures} ` +
          `prochain essai dans ${backoffSecondsFor(consecutiveFailures)}s msg=${message}`,
      );

      // Session morte (401/403), rate-limit (429) ou réponse sans ticket
      // d'auth → on réinitialise le client pour forcer un relogin propre au
      // prochain tour (après backoff). Avant, seuls 401/403 étaient traités
      // et un client coincé le restait.
      if (isAuthShapedFailure(status, message)) {
        clientInstance = null;
      }
      throw err;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
