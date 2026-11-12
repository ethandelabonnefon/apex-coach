/**
 * LibreLink — état partagé entre fonctions serveur (KV).
 *
 * Voir `coordination.ts` pour le pourquoi. Ici : uniquement les lectures et
 * écritures. Tout est « au mieux » — si KV est absent ou en panne, chaque
 * fonction retombe sur sa mémoire locale (comportement d'avant), jamais sur
 * une erreur : la glycémie ne doit pas dépendre de la disponibilité de KV.
 *
 * ⚠️ Server only.
 */

import "server-only";
import { kv } from "@vercel/kv";
import type { SharedEntry, SharedError } from "./coordination";

const K_SNAPSHOT = "libre:snapshot";
const K_ERROR = "libre:error";
const K_LOCK = "libre:lock";

/** La lecture partagée s'efface seule au bout de 30 min. */
const SNAPSHOT_TTL_S = 30 * 60;
/** L'échec partagé s'efface seul : plus long que le plus long délai (30 min). */
const ERROR_TTL_S = 2 * 60 * 60;
/** Le verrou saute seul si la fonction qui le tient meurt en route. */
const LOCK_TTL_S = 25;

export function isSharedStateAvailable(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.KV_URL);
}

export async function readShared<T>(): Promise<{
  entry: SharedEntry<T> | null;
  error: SharedError | null;
}> {
  if (!isSharedStateAvailable()) return { entry: null, error: null };
  try {
    const [entry, error] = await kv.mget<[SharedEntry<T> | null, SharedError | null]>(
      K_SNAPSHOT,
      K_ERROR,
    );
    return {
      entry: entry && typeof entry.fetchedAt === "number" ? entry : null,
      error: error && typeof error.failedAt === "number" ? error : null,
    };
  } catch (err) {
    console.error("[libre-link/shared] lecture KV impossible :", err instanceof Error ? err.message : err);
    return { entry: null, error: null };
  }
}

export async function writeSharedSuccess<T>(entry: SharedEntry<T>): Promise<void> {
  if (!isSharedStateAvailable()) return;
  try {
    await Promise.all([kv.set(K_SNAPSHOT, entry, { ex: SNAPSHOT_TTL_S }), kv.del(K_ERROR)]);
  } catch (err) {
    console.error("[libre-link/shared] écriture KV impossible :", err instanceof Error ? err.message : err);
  }
}

export async function writeSharedError(error: SharedError): Promise<void> {
  if (!isSharedStateAvailable()) return;
  try {
    await kv.set(K_ERROR, error, { ex: ERROR_TTL_S });
  } catch (err) {
    console.error("[libre-link/shared] écriture KV impossible :", err instanceof Error ? err.message : err);
  }
}

/**
 * Prend le verrou « je parle à Abbott ». `true` si obtenu — ou si KV est
 * indisponible : sans KV il n'y a personne avec qui se coordonner, et on ne
 * doit pas bloquer la lecture pour autant.
 */
export async function acquireFetchLock(owner: string): Promise<boolean> {
  if (!isSharedStateAvailable()) return true;
  try {
    const res = await kv.set(K_LOCK, owner, { nx: true, ex: LOCK_TTL_S });
    return res === "OK";
  } catch (err) {
    console.error("[libre-link/shared] verrou KV impossible :", err instanceof Error ? err.message : err);
    return true;
  }
}

/** Rend le verrou, seulement si c'est bien le nôtre. */
export async function releaseFetchLock(owner: string): Promise<void> {
  if (!isSharedStateAvailable()) return;
  try {
    const current = await kv.get<string>(K_LOCK);
    if (current === owner) await kv.del(K_LOCK);
  } catch {
    /* le verrou expirera seul */
  }
}
