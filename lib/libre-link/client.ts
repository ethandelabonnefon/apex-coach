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
import {
  decide,
  newest,
  nextError,
  staleFallback,
  type SharedEntry,
  type SharedError,
} from "./coordination";
import {
  acquireFetchLock,
  readShared,
  releaseFetchLock,
  writeSharedError,
  writeSharedSuccess,
} from "./shared-state";

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

type CacheEntry = SharedEntry<GlucoseSnapshot>;

/**
 * Une erreur qui laisse le client dans un état inutilisable ?
 *
 * Le reset ne portait que sur 401/403. Or un 429 (ou toute réponse sans
 * ticket d'auth) remonte en `TypeError` sans code HTTP : le client restait
 * alors en cache avec une session morte. On traite donc aussi la signature
 * de cette erreur.
 */
function isAuthShapedFailure(status: number | undefined, message: string): boolean {
  if (status === 401 || status === 403 || status === 429 || status === 430) return true;
  return /reading 'token'|authTicket|Cannot read properties of undefined/i.test(message);
}

// ─── Singletons (module-scope, vivent tant que le serveur tourne) ────────
let clientInstance: ReturnType<typeof LibreLinkUpClient> | null = null;
let cache: CacheEntry | null = null;
/** Dernier échec vu par CETTE fonction — repli quand KV est absent. */
let lastError: SharedError | null = null;
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
 * Extrait le code HTTP d'une erreur axios (si présent).
 */
function extractStatus(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const maybe = err as { response?: { status?: number }; status?: number };
  return maybe.response?.status ?? maybe.status;
}

/** Combien de temps une fonction attend la lecture d'une autre (ms). */
const WAIT_FOR_PEER_MS = 6_000;
const WAIT_STEP_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffError(remainingS: number, error: SharedError): Error {
  const err = new Error(
    `LibreLink backoff actif (${remainingS}s restants) — dernière erreur : ${error.message}`,
  );
  (err as Error & { status?: number }).status = error.status;
  return err;
}

/** Un seul appel à Abbott : lecture + mise en forme. */
async function readFromAbbott(): Promise<GlucoseSnapshot> {
  const client = getClient();
  const { current, history } = await client.read();
  return {
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
}

/**
 * Récupère la dernière lecture + l'historique (~8h de points à 15min).
 *
 * Depuis nov. 2026, la lecture, le compteur d'échecs et le droit de parler
 * à Abbott sont PARTAGÉS entre toutes les fonctions serveur (KV) — voir
 * `coordination.ts` pour l'incident qui l'a imposé. Ordre :
 *
 *  1. Une lecture de moins de 60 s existe (ici ou chez une autre fonction)
 *     → on la sert, sans appeler Abbott.
 *  2. Un échec récent impose d'attendre → on ressert une lecture de moins
 *     de 15 min, sinon on refuse sans appeler Abbott.
 *  3. Sinon on prend le verrou et on lit. Si une autre fonction le tient,
 *     on attend SA lecture au lieu d'ouvrir une deuxième session.
 *
 * `forceRefresh` ne court-circuite ni le délai d'attente ni le verrou
 * (7 oct. 2026) : forcer un rafraîchissement ne peut pas être un moyen de
 * contourner une protection contre soi-même. Il ignore seulement le cache
 * de 60 s.
 */
export async function fetchGlucoseSnapshot(options: {
  forceRefresh?: boolean;
} = {}): Promise<GlucoseSnapshot> {
  // Plusieurs appels dans la MÊME fonction partagent la même promesse.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      return await coordinatedFetch(options.forceRefresh === true);
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

async function coordinatedFetch(forceRefresh: boolean): Promise<GlucoseSnapshot> {
  const ttlMs = forceRefresh ? 0 : LIBRE_LINK_CONFIG.cacheTtlSeconds * 1000;

  // Raccourci : cache local encore chaud → pas même un aller-retour KV.
  if (cache && Date.now() - cache.fetchedAt < ttlMs) return cache.snapshot;

  const shared = await readShared<GlucoseSnapshot>();
  // Sans KV (dev local), l'échec connu est celui de cette fonction.
  const knownError = shared.error ?? lastError;
  const now = Date.now();
  const decision = decide({
    now,
    local: cache,
    shared: shared.entry,
    error: knownError,
    ttlMs,
    backoffSecondsFor,
  });

  if (decision.action === "serve") {
    cache = decision.entry;
    return decision.entry.snapshot;
  }
  if (decision.action === "backoff") {
    throw backoffError(decision.remainingS, decision.error);
  }

  // ── Aller chercher : une seule fonction à la fois ─────────────────────
  const owner = `${process.pid}-${now}-${Math.random().toString(36).slice(2, 8)}`;
  const gotLock = await acquireFetchLock(owner);

  if (!gotLock) {
    // Une autre fonction lit en ce moment : on attend son résultat.
    const deadline = now + WAIT_FOR_PEER_MS;
    while (Date.now() < deadline) {
      await sleep(WAIT_STEP_MS);
      const peer = await readShared<GlucoseSnapshot>();
      if (peer.entry && peer.entry.fetchedAt >= now - LIBRE_LINK_CONFIG.cacheTtlSeconds * 1000) {
        cache = peer.entry;
        return peer.entry.snapshot;
      }
      if (peer.error && peer.error.failedAt >= now) {
        // L'autre fonction vient d'échouer : inutile d'attendre davantage.
        const stale = staleFallback(newest(cache, peer.entry), Date.now());
        if (stale) return stale.snapshot;
        throw backoffError(backoffSecondsFor(peer.error.consecutiveFailures), peer.error);
      }
    }
    const stale = staleFallback(newest(cache, shared.entry), Date.now());
    if (stale) return stale.snapshot;
    const busy = new Error(
      "LibreLink : une lecture est déjà en cours sur le serveur, nouvelle tentative automatique dans un instant.",
    );
    (busy as Error & { status?: number }).status = 503;
    throw busy;
  }

  try {
    const snapshot = await readFromAbbott();
    const entry = { snapshot, fetchedAt: Date.now() };
    cache = entry;
    lastError = null;
    await writeSharedSuccess(entry);
    return snapshot;
  } catch (err) {
    const status = extractStatus(err);
    const message = err instanceof Error ? err.message : "erreur inconnue";
    const failure = nextError(knownError, Date.now(), message, status);
    lastError = failure;
    await writeSharedError(failure);
    console.error(
      `[libre-link] Abbott API error status=${status ?? "?"} échec #${failure.consecutiveFailures} ` +
        `prochain essai dans ${backoffSecondsFor(failure.consecutiveFailures)}s msg=${message}`,
    );

    // Session morte (401/403), rate-limit (429/430) ou réponse sans ticket
    // d'auth → on réinitialise le client pour forcer un relogin propre au
    // prochain tour (après le délai d'attente).
    if (isAuthShapedFailure(status, message)) {
      clientInstance = null;
    }

    // Une lecture récente vaut mieux qu'une erreur à l'écran.
    const stale = staleFallback(newest(cache, shared.entry), Date.now());
    if (stale) return stale.snapshot;
    throw err;
  } finally {
    await releaseFetchLock(owner);
  }
}
