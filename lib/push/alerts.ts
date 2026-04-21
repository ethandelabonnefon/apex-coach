/**
 * Push — logique d'alerte glycémique.
 *
 * Appelée par le cron `/api/cron/glucose-check` toutes les 5 min.
 * Lit la glycémie live Abbott, décide si une notif doit partir, et
 * envoie le push avec un throttle anti-spam.
 *
 * Règles :
 *  - hypo (< 70) → alerte rouge urgente, pas de re-alerte avant 20 min
 *  - hyper (> 250) → alerte rouge, pas de re-alerte avant 30 min
 *  - retour en plage → reset les timestamps pour re-alerter à la prochaine sortie
 */

import "server-only";
import webpush from "web-push";
import { PUSH_CONFIG, isPushConfigured } from "./config";
import {
  getSubscription,
  getLastHypoAlert,
  setLastHypoAlert,
  getLastHyperAlert,
  setLastHyperAlert,
  setLastBackInRange,
  removeSubscription,
  isKvConfigured,
} from "./store";
import { fetchGlucoseSnapshot } from "@/lib/libre-link/client";
import { isLibreLinkConfigured } from "@/lib/libre-link/config";

// Init VAPID une fois par cold-start
let vapidInitialized = false;
function initVapid() {
  if (vapidInitialized) return;
  if (!isPushConfigured()) return;
  webpush.setVapidDetails(
    PUSH_CONFIG.vapidSubject,
    PUSH_CONFIG.vapidPublicKey,
    PUSH_CONFIG.vapidPrivateKey,
  );
  vapidInitialized = true;
}

export type GlucoseAlertPayload = {
  type: "hypo" | "hyper" | "test";
  title: string;
  body: string;
  value?: number;
  url?: string;
};

/**
 * Envoie un push à la subscription active (s'il y en a une).
 * Gère les 410 Gone (subscription expirée) en la supprimant.
 */
export async function sendGlucosePush(
  payload: GlucoseAlertPayload,
): Promise<{ sent: boolean; reason?: string }> {
  if (!isPushConfigured()) {
    return { sent: false, reason: "push_not_configured" };
  }
  if (!isKvConfigured()) {
    return { sent: false, reason: "kv_not_configured" };
  }

  initVapid();

  const sub = await getSubscription();
  if (!sub) return { sent: false, reason: "no_subscription" };

  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), {
      urgency: payload.type === "hypo" ? "high" : "normal",
      TTL: 60 * 10, // 10 min — si le device est offline > 10 min, on abandonne
    });
    return { sent: true };
  } catch (err: unknown) {
    const status =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : undefined;
    if (status === 404 || status === 410) {
      // Subscription expirée / révoquée → on clean
      await removeSubscription();
      return { sent: false, reason: "subscription_gone" };
    }
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[push/alerts] send error:", status, msg);
    return { sent: false, reason: `push_error_${status ?? "?"}` };
  }
}

export type CheckResult = {
  ok: boolean;
  value?: number;
  action: "none" | "hypo" | "hyper" | "skipped_backoff" | "error";
  reason?: string;
  sentReason?: string;
};

/**
 * Routine principale du cron : lit la glycémie, décide si on alerte, envoie.
 */
export async function checkGlucoseAndAlert(): Promise<CheckResult> {
  if (!isLibreLinkConfigured()) {
    return { ok: false, action: "error", reason: "librelink_not_configured" };
  }

  let snapshot;
  try {
    snapshot = await fetchGlucoseSnapshot();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return { ok: false, action: "error", reason: `librelink: ${msg}` };
  }

  const value = snapshot.current.value;
  const now = Date.now();
  const isHypo = value < PUSH_CONFIG.alertThresholds.hypo;
  const isHyper = value > PUSH_CONFIG.alertThresholds.hyper;

  // Si en plage : on marque "back in range" (permet de re-alerter à la prochaine sortie sans attendre le backoff)
  if (!isHypo && !isHyper) {
    await setLastBackInRange(now);
    return { ok: true, value, action: "none" };
  }

  // Hors plage → on check le backoff (anti-spam)
  if (isHypo) {
    const last = await getLastHypoAlert();
    const backoffMs = PUSH_CONFIG.hypoReAlertMinutes * 60_000;
    if (last && now - last < backoffMs) {
      return { ok: true, value, action: "skipped_backoff", reason: "hypo_backoff" };
    }

    const res = await sendGlucosePush({
      type: "hypo",
      title: `⚠️ Hypo : ${value} mg/dL`,
      body: `Glycémie basse. Prends 15-20g de glucides rapides (jus, sucre, Dextro).`,
      value,
      url: "/diabete",
    });
    if (res.sent) await setLastHypoAlert(now);
    return { ok: true, value, action: "hypo", sentReason: res.reason };
  }

  if (isHyper) {
    const last = await getLastHyperAlert();
    const backoffMs = PUSH_CONFIG.hyperReAlertMinutes * 60_000;
    if (last && now - last < backoffMs) {
      return { ok: true, value, action: "skipped_backoff", reason: "hyper_backoff" };
    }

    const res = await sendGlucosePush({
      type: "hyper",
      title: `⚠️ Hyper : ${value} mg/dL`,
      body: `Glycémie trop haute. Ouvre l'app pour voir la correction suggérée. Vérifie les cétones si >300.`,
      value,
      url: "/diabete",
    });
    if (res.sent) await setLastHyperAlert(now);
    return { ok: true, value, action: "hyper", sentReason: res.reason };
  }

  return { ok: true, value, action: "none" };
}
