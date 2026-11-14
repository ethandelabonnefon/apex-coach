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
  getLastLowSoonAlert,
  setLastLowSoonAlert,
  getMonitorState,
  setMonitorState,
  setLastBackInRange,
  removeSubscription,
  isKvConfigured,
} from "./store";
import { fetchGlucoseSnapshot } from "@/lib/libre-link/client";
import { isLibreLinkConfigured } from "@/lib/libre-link/config";
import { assessLowSoon, readingAgeMinutes, MAX_READING_AGE_MIN } from "./low-prediction";
import { assessMonitor } from "./monitor-outage";

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
  type:
    | "hypo"
    | "hypo-soon"
    | "hyper"
    | "split"
    | "meal-confirm"
    | "post-session"
    | "basal"
    | "sensor"
    | "test";
  title: string;
  body: string;
  value?: number;
  url?: string;
  /** Tag pour deduplication côté SW (ex: "split-<id>"). */
  tag?: string;
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
      urgency: payload.type === "hypo" || payload.type === "hypo-soon" ? "high" : "normal",
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
  action: "none" | "hypo" | "hypo-soon" | "hyper" | "skipped_backoff" | "skipped_stale" | "error";
  reason?: string;
  sentReason?: string;
};

/**
 * Tient le compte des pannes de surveillance et prévient quand elles durent
 * (cf. `monitor-outage.ts`). Ne lève jamais : une erreur ici ne doit pas
 * empêcher le reste du cron de tourner.
 */
async function reportMonitorHealth(
  healthy: boolean,
  now: number,
  observedSinceMs?: number,
  value?: number,
): Promise<void> {
  if (!isKvConfigured()) return;
  try {
    const state = await getMonitorState();
    const { action, next, downMinutes } = assessMonitor(state, healthy, now, observedSinceMs);

    if (action === "notify-down") {
      const res = await sendGlucosePush({
        type: "sensor",
        title: "Surveillance en pause",
        body: `Aucune mesure de glycémie depuis ${Math.round(downMinutes)} min : les alertes d'hypo ne fonctionnent pas. Ouvre LibreLink sur ton téléphone, ou mesure-toi.`,
        url: "/diabete",
        tag: "sensor-outage",
      });
      // Notification non partie → on ne note pas « prévenu », pour réessayer
      // au prochain passage.
      await setMonitorState(res.sent ? next : { downSince: next.downSince, notifiedAt: state.notifiedAt });
      return;
    }
    if (action === "notify-back") {
      await sendGlucosePush({
        type: "sensor",
        title: "Capteur de retour",
        body:
          value !== undefined
            ? `La glycémie remonte de nouveau (${value} mg/dL). Les alertes sont actives.`
            : "La glycémie remonte de nouveau. Les alertes sont actives.",
        url: "/diabete",
        tag: "sensor-outage",
      });
    }
    await setMonitorState(next);
  } catch (err) {
    console.error("[push/alerts] monitor health:", err instanceof Error ? err.message : err);
  }
}

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
    await reportMonitorHealth(false, Date.now());
    return { ok: false, action: "error", reason: `librelink: ${msg}` };
  }

  const value = snapshot.current.value;
  const now = Date.now();

  // Lecture périmée (capteur déconnecté, téléphone hors réseau) : Abbott
  // renvoie alors la DERNIÈRE valeur connue. Alerter dessus ferait sonner
  // « Hypo : 65 » toutes les 20 min pendant des heures sur un chiffre mort.
  const ageMin = readingAgeMinutes(snapshot.current.date, now);
  if (ageMin > MAX_READING_AGE_MIN) {
    await reportMonitorHealth(false, now, new Date(snapshot.current.date).getTime());
    return { ok: true, value, action: "skipped_stale", reason: `reading_${Math.round(ageMin)}min_old` };
  }
  await reportMonitorHealth(true, now, undefined, value);

  const isHypo = value < PUSH_CONFIG.alertThresholds.hypo;
  const isHyper = value > PUSH_CONFIG.alertThresholds.hyper;

  // Si en plage : on marque "back in range" (permet de re-alerter à la prochaine sortie sans attendre le backoff)
  if (!isHypo && !isHyper) {
    await setLastBackInRange(now);

    // Hypo en approche : pas encore sous 70, mais la flèche y mène dans les
    // 20 minutes. Prévenir maintenant, c'est un resucrage léger au lieu
    // d'une vraie hypo.
    const soon = assessLowSoon({ value, trend: snapshot.current.trend, readingAgeMin: ageMin });
    if (soon.warn) {
      const last = await getLastLowSoonAlert();
      const backoffMs = PUSH_CONFIG.lowSoonReAlertMinutes * 60_000;
      if (last && now - last < backoffMs) {
        return { ok: true, value, action: "skipped_backoff", reason: "low_soon_backoff" };
      }
      const res = await sendGlucosePush({
        type: "hypo-soon",
        title: `Hypo en approche : ${value} mg/dL et ça descend`,
        body: `À ce rythme tu passes sous 70 dans une vingtaine de minutes. Prends 10 à 15 g de glucides maintenant.`,
        value,
        url: "/diabete",
      });
      if (res.sent) await setLastLowSoonAlert(now);
      return { ok: true, value, action: "hypo-soon", sentReason: res.reason };
    }

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
