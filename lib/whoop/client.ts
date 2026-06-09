/**
 * Whoop API client — OAuth 2.0 + fetch endpoints (Phase F2).
 *
 * Endpoints utilisés :
 *   GET /v2/cycle          — strain quotidien (charge totale)
 *   GET /v2/recovery       — recovery score + HRV + RHR du matin
 *   GET /v2/activity/sleep — durée + qualité dernière nuit
 *   GET /v2/activity/workout — liste des séances avec strain
 *
 * Doc : https://developer.whoop.com/api/
 *
 * ⚠️ Server only.
 */

import "server-only";
import {
  acquireRefreshLock,
  getTokens,
  releaseRefreshLock,
  resetRefreshFails,
  saveTokens,
  type WhoopTokens,
} from "./store";

// Marge de sécurité : on considère expiré 60s avant la vraie expiration
// pour éviter les calls "à la frontière".
const EXPIRY_SAFETY_MS = 60_000;

// Attente entre 2 polls quand on attend que l'autre process finisse son
// refresh (cas mutex pris).
const POLL_INTERVAL_MS = 200;
const MAX_POLL_WAIT_MS = 8_000; // jamais > 8s d'attente

const WHOOP_AUTH_BASE = "https://api.prod.whoop.com/oauth/oauth2";
const WHOOP_API_BASE = "https://api.prod.whoop.com/developer";

export const WHOOP_SCOPES = [
  "read:profile",
  "read:cycles",
  "read:recovery",
  "read:sleep",
  "read:workout",
  "offline", // pour refresh_token
].join(" ");

export function whoopClientId(): string | undefined {
  return process.env.WHOOP_CLIENT_ID;
}

export function whoopClientSecret(): string | undefined {
  return process.env.WHOOP_CLIENT_SECRET;
}

export function whoopRedirectUri(): string {
  // Priorité 1 : env var explicite (override complet)
  if (process.env.WHOOP_REDIRECT_URI) return process.env.WHOOP_REDIRECT_URI;

  // Priorité 2 : prod Vercel → URL alias stable
  // (VERCEL_URL retourne l'URL DU DÉPLOIEMENT SPÉCIFIQUE, ex:
  // apex-coach-hytajk7g8-...vercel.app, qui change à chaque deploy
  // → ne match jamais le redirect URI enregistré chez Whoop.
  // On hardcode donc l'alias stable de production.)
  if (process.env.VERCEL_ENV === "production") {
    return "https://apex-coach-dusky.vercel.app/api/whoop/callback";
  }

  // Priorité 3 : preview Vercel (URL dynamique acceptable car preview)
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/whoop/callback`;
  }

  // Local dev
  return "http://localhost:3000/api/whoop/callback";
}

export function isWhoopConfigured(): boolean {
  return Boolean(whoopClientId() && whoopClientSecret());
}

/**
 * Construit l'URL d'autorisation Whoop.
 */
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: whoopClientId() ?? "",
    redirect_uri: whoopRedirectUri(),
    response_type: "code",
    scope: WHOOP_SCOPES,
    state,
  });
  return `${WHOOP_AUTH_BASE}/auth?${params.toString()}`;
}

/**
 * Échange un code OAuth contre access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<WhoopTokens> {
  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: whoopClientId() ?? "",
    client_secret: whoopClientSecret() ?? "",
    redirect_uri: whoopRedirectUri(),
  });
  const res = await fetch(`${WHOOP_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whoop token exchange failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // -60s pour safety
    scope: data.scope ?? WHOOP_SCOPES,
    connectedAt: new Date().toISOString(),
  };
}

/**
 * Rafraîchit l'access token avec le refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<WhoopTokens> {
  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: whoopClientId() ?? "",
    client_secret: whoopClientSecret() ?? "",
    scope: WHOOP_SCOPES,
  });
  const res = await fetch(`${WHOOP_AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Whoop refresh failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken, // Whoop peut ne pas renvoyer un nouveau refresh
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    scope: data.scope ?? WHOOP_SCOPES,
    connectedAt: new Date().toISOString(),
  };
}

/**
 * Récupère un access token valide. Si expiré, le rafraîchit auto.
 * Renvoie null si pas de tokens (pas connecté).
 *
 * ⚡ Race condition Whoop (juin 2026) :
 *   /api/whoop/sync fait 4 fetch en parallèle (cycle/recovery/sleep/workout).
 *   Si access_token expiré → 4 refresh en parallèle → Whoop fait de la
 *   rotation des refresh_token → le 1er invalide tout, les 3 autres
 *   reçoivent 401 invalid_grant → cascade de fails.
 *
 * Solution mise en place :
 *   1. Re-read les tokens depuis KV avant de décider de refresher (un autre
 *      process a peut-être déjà refresh)
 *   2. Mutex KV (set NX) : un seul refresh actif. Les autres polling le KV
 *      jusqu'à ce que le nouveau token apparaisse (max 8s).
 *   3. Marge de sécurité 60s sur l'expiration (évite les refresh "border").
 */
export async function getValidAccessToken(): Promise<string | null> {
  let tokens = await getTokens();
  if (!tokens) return null;

  const isExpired = (t: WhoopTokens) =>
    Date.now() >= t.expiresAt - EXPIRY_SAFETY_MS;

  // Pas expiré → on retourne tel quel
  if (!isExpired(tokens)) return tokens.accessToken;

  // Tentative d'acquérir le lock pour refresh
  const gotLock = await acquireRefreshLock();

  if (!gotLock) {
    // Un autre process refresh déjà → on attend et on re-lit
    const start = Date.now();
    while (Date.now() - start < MAX_POLL_WAIT_MS) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const refreshed = await getTokens();
      if (refreshed && !isExpired(refreshed)) {
        return refreshed.accessToken;
      }
    }
    // Timeout → le process qui avait le lock a peut-être crash. On le force.
    console.warn("[whoop] refresh lock poll timeout, forcing refresh");
  }

  try {
    // Double-check après lock : un autre process a peut-être finit pendant
    // qu'on attendait notre tour
    const reread = await getTokens();
    if (reread && !isExpired(reread)) {
      return reread.accessToken;
    }
    if (!reread) return null;

    // OK on est le seul à refresh, go
    const newTokens = await refreshAccessToken(reread.refreshToken);
    await saveTokens(newTokens);
    await resetRefreshFails(); // succès → on reset le compteur de fails
    return newTokens.accessToken;
  } finally {
    await releaseRefreshLock();
  }
}

/**
 * Helper GET sur l'API Whoop avec token auto.
 */
async function whoopGet<T>(path: string, params?: Record<string, string>): Promise<T | null> {
  const token = await getValidAccessToken();
  if (!token) return null;
  const url = new URL(`${WHOOP_API_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    console.error(`[whoop] GET ${path} → ${res.status}`);
    return null;
  }
  return (await res.json()) as T;
}

// ───────────────────────────────────────────────────────────────────────
// Endpoints typés
// ───────────────────────────────────────────────────────────────────────

interface WhoopCycle {
  id: number;
  start: string;
  end: string | null;
  score: {
    strain: number;
    kilojoule: number;
    average_heart_rate: number;
    max_heart_rate: number;
  } | null;
}

interface WhoopRecovery {
  cycle_id: number;
  sleep_id: number;
  user_id: number;
  score: {
    user_calibrating: boolean;
    recovery_score: number;
    resting_heart_rate: number;
    hrv_rmssd_milli: number;
  } | null;
}

interface WhoopSleep {
  id: number;
  start: string;
  end: string;
  score: {
    stage_summary: {
      total_in_bed_time_milli: number;
      total_awake_time_milli: number;
      total_light_sleep_time_milli: number;
      total_slow_wave_sleep_time_milli: number;
      total_rem_sleep_time_milli: number;
    };
    sleep_performance_percentage: number;
  } | null;
}

interface WhoopWorkout {
  id: number;
  start: string;
  end: string;
  sport_id: number | null;
  sport_name?: string;
  score: {
    strain: number;
    average_heart_rate: number;
    max_heart_rate: number;
    kilojoule: number;
  } | null;
}

interface WhoopPaginated<T> {
  records: T[];
  next_token?: string;
}

export async function fetchLatestCycle(): Promise<WhoopCycle | null> {
  const data = await whoopGet<WhoopPaginated<WhoopCycle>>("/v2/cycle", { limit: "1" });
  return data?.records?.[0] ?? null;
}

export async function fetchLatestRecovery(): Promise<WhoopRecovery | null> {
  const data = await whoopGet<WhoopPaginated<WhoopRecovery>>("/v2/recovery", { limit: "1" });
  return data?.records?.[0] ?? null;
}

export async function fetchLatestSleep(): Promise<WhoopSleep | null> {
  const data = await whoopGet<WhoopPaginated<WhoopSleep>>("/v2/activity/sleep", { limit: "1" });
  return data?.records?.[0] ?? null;
}

export async function fetchLatestWorkout(): Promise<WhoopWorkout | null> {
  const data = await whoopGet<WhoopPaginated<WhoopWorkout>>("/v2/activity/workout", { limit: "1" });
  return data?.records?.[0] ?? null;
}
