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
  getTokens,
  saveTokens,
  type WhoopTokens,
} from "./store";

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
  return (
    process.env.WHOOP_REDIRECT_URI ||
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}/api/whoop/callback`
      : "http://localhost:3000/api/whoop/callback")
  );
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
 */
export async function getValidAccessToken(): Promise<string | null> {
  let tokens = await getTokens();
  if (!tokens) return null;
  if (Date.now() >= tokens.expiresAt) {
    // Token expiré → refresh
    tokens = await refreshAccessToken(tokens.refreshToken);
    await saveTokens(tokens);
  }
  return tokens.accessToken;
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
