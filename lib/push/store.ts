/**
 * Push — stockage persistant des subscriptions + timestamps anti-spam.
 *
 * Utilise Vercel KV (Redis) qui survit aux cold-starts serverless.
 * App single-user : une seule subscription active à la fois (celle du
 * dernier device qui s'est enregistré). Si tu veux multi-device plus
 * tard, passe sur une liste (`kv.sadd` au lieu de `kv.set`).
 */

import "server-only";
import { kv } from "@vercel/kv";
import type { PushSubscription as WebPushSubscription } from "web-push";

const K_SUBSCRIPTION = "push:subscription";
const K_LAST_HYPO = "push:last-hypo-alert";
const K_LAST_HYPER = "push:last-hyper-alert";
const K_LAST_BACK_IN_RANGE = "push:last-back-in-range";

/** Check si Vercel KV est configuré (env var KV_REST_API_URL présente). */
export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.KV_URL);
}

export async function saveSubscription(
  subscription: WebPushSubscription,
): Promise<void> {
  await kv.set(K_SUBSCRIPTION, subscription);
}

export async function getSubscription(): Promise<WebPushSubscription | null> {
  try {
    const sub = await kv.get<WebPushSubscription>(K_SUBSCRIPTION);
    return sub ?? null;
  } catch (err) {
    console.error("[push/store] getSubscription error:", err);
    return null;
  }
}

export async function removeSubscription(): Promise<void> {
  await kv.del(K_SUBSCRIPTION);
}

export async function getLastHypoAlert(): Promise<number | null> {
  return (await kv.get<number>(K_LAST_HYPO)) ?? null;
}

export async function setLastHypoAlert(ts: number): Promise<void> {
  await kv.set(K_LAST_HYPO, ts);
}

export async function getLastHyperAlert(): Promise<number | null> {
  return (await kv.get<number>(K_LAST_HYPER)) ?? null;
}

export async function setLastHyperAlert(ts: number): Promise<void> {
  await kv.set(K_LAST_HYPER, ts);
}

const K_LAST_LOW_SOON = "push:last-low-soon-alert";

export async function getLastLowSoonAlert(): Promise<number | null> {
  return (await kv.get<number>(K_LAST_LOW_SOON)) ?? null;
}

export async function setLastLowSoonAlert(ts: number): Promise<void> {
  await kv.set(K_LAST_LOW_SOON, ts);
}

const K_MONITOR_STATE = "push:monitor-state";

/** État de la panne de surveillance en cours (cf. lib/push/monitor-outage.ts). */
export async function getMonitorState(): Promise<{ downSince?: number; notifiedAt?: number }> {
  return (await kv.get<{ downSince?: number; notifiedAt?: number }>(K_MONITOR_STATE)) ?? {};
}

export async function setMonitorState(state: { downSince?: number; notifiedAt?: number }): Promise<void> {
  if (state.downSince === undefined && state.notifiedAt === undefined) {
    await kv.del(K_MONITOR_STATE);
  } else {
    await kv.set(K_MONITOR_STATE, state);
  }
}

/** Trace du dernier "retour en plage" — sert à reset les alertes */
export async function getLastBackInRange(): Promise<number | null> {
  return (await kv.get<number>(K_LAST_BACK_IN_RANGE)) ?? null;
}

export async function setLastBackInRange(ts: number): Promise<void> {
  await kv.set(K_LAST_BACK_IN_RANGE, ts);
}
