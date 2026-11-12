/**
 * LibreLink — coordination entre fonctions serveur (nov. 2026).
 *
 * Incident du 12/11/2026 (et, avant lui, des 19/09 et 07/10) : après un
 * déploiement, Abbott a bloqué le compte (HTTP 430) et la glycémie en
 * direct est restée coupée — alertes d'hypo comprises.
 *
 * Cause, lue dans les journaux : le cache de 60 s, la session et le délai
 * d'attente après erreur vivaient dans la MÉMOIRE DE CHAQUE FONCTION. Or
 * `/api/glucose/current`, `/api/glucose/history` et les deux crons tournent
 * dans des fonctions distinctes, démultipliées à chaque montée en charge.
 * Après un déploiement elles repartent toutes de zéro et se connectent à
 * Abbott en même temps ; quand Abbott refuse, chacune compte « échec n° 1 »
 * et réessaie de son côté 2 minutes plus tard. Le délai escaladant, pensé
 * pour laisser Abbott tranquille, ne montait jamais : le système entretenait
 * son propre blocage.
 *
 * Remède : ces trois choses deviennent COMMUNES (stockées dans KV) —
 *   - la dernière lecture (une seule lecture Abbott par minute, tous
 *     appelants confondus) ;
 *   - le compteur d'échecs et l'heure du dernier (un seul délai, partagé) ;
 *   - un verrou (une seule fonction à la fois parle à Abbott).
 *
 * Ce fichier ne contient que les DÉCISIONS, pures et testées. Les lectures
 * et écritures KV sont dans `shared-state.ts`.
 */

export interface SharedEntry<T> {
  snapshot: T;
  /** Instant où Abbott a répondu (ms). */
  fetchedAt: number;
}

export interface SharedError {
  message: string;
  status?: number;
  failedAt: number;
  /** Échecs d'affilée, toutes fonctions confondues. */
  consecutiveFailures: number;
}

/**
 * Âge maximal d'une lecture qu'on accepte de resservir quand Abbott ne
 * répond pas (ms). Au-delà, mieux vaut dire « indisponible » que montrer un
 * chiffre mort : l'écran affiche l'âge de la mesure, mais une glycémie de
 * 40 minutes ne doit pas servir à calculer une dose.
 */
export const MAX_STALE_MS = 15 * 60_000;

export type Decision<T> =
  | { action: "serve"; entry: SharedEntry<T>; stale: boolean }
  | { action: "backoff"; remainingS: number; error: SharedError }
  | { action: "fetch" };

/** La plus récente de deux lectures (locale à la fonction, ou partagée). */
export function newest<T>(
  a: SharedEntry<T> | null | undefined,
  b: SharedEntry<T> | null | undefined,
): SharedEntry<T> | null {
  if (a && b) return a.fetchedAt >= b.fetchedAt ? a : b;
  return a ?? b ?? null;
}

export interface DecideInput<T> {
  now: number;
  /** Dernière lecture connue de CETTE fonction. */
  local: SharedEntry<T> | null;
  /** Dernière lecture partagée (KV). */
  shared: SharedEntry<T> | null;
  /** Dernier échec partagé (KV), ou local si KV est absent. */
  error: SharedError | null;
  ttlMs: number;
  backoffSecondsFor: (consecutiveFailures: number) => number;
  maxStaleMs?: number;
}

/**
 * Que faire d'une demande de lecture ?
 *
 *  1. Une lecture de moins de `ttlMs` existe quelque part → on la sert.
 *  2. Un échec récent impose d'attendre → on ressert une lecture pas trop
 *     vieille, sinon on refuse SANS appeler Abbott.
 *  3. Sinon, on peut aller chercher.
 */
export function decide<T>(input: DecideInput<T>): Decision<T> {
  const { now, error, ttlMs, backoffSecondsFor } = input;
  const maxStaleMs = input.maxStaleMs ?? MAX_STALE_MS;
  const best = newest(input.local, input.shared);

  if (best && now - best.fetchedAt < ttlMs) {
    return { action: "serve", entry: best, stale: false };
  }

  if (error) {
    const waitMs = backoffSecondsFor(error.consecutiveFailures) * 1000;
    const elapsed = now - error.failedAt;
    if (elapsed >= 0 && elapsed < waitMs) {
      if (best && now - best.fetchedAt <= maxStaleMs) {
        return { action: "serve", entry: best, stale: true };
      }
      return {
        action: "backoff",
        remainingS: Math.max(1, Math.round((waitMs - elapsed) / 1000)),
        error,
      };
    }
  }

  return { action: "fetch" };
}

/**
 * L'échec à enregistrer après une tentative ratée. Le compteur repart du
 * dernier échec PARTAGÉ : c'est ce qui fait enfin monter le délai quand
 * plusieurs fonctions échouent à tour de rôle.
 */
export function nextError(
  previous: SharedError | null,
  now: number,
  message: string,
  status?: number,
): SharedError {
  return {
    message,
    status,
    failedAt: now,
    consecutiveFailures: (previous?.consecutiveFailures ?? 0) + 1,
  };
}

/**
 * Après un échec (ou une attente sans résultat) : une lecture encore
 * présentable à resservir, ou `null` s'il vaut mieux dire « indisponible ».
 */
export function staleFallback<T>(
  best: SharedEntry<T> | null,
  now: number,
  maxStaleMs: number = MAX_STALE_MS,
): SharedEntry<T> | null {
  if (!best) return null;
  return now - best.fetchedAt <= maxStaleMs ? best : null;
}
