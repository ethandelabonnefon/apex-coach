/**
 * Push notifications — configuration VAPID.
 *
 * VAPID (Voluntary Application Server Identification) : signature
 * cryptographique des pushs pour que le browser vérifie que c'est
 * bien TON serveur qui envoie, pas quelqu'un d'autre qui a volé
 * la subscription.
 *
 * Les clés sont générées une fois via `npx web-push generate-vapid-keys`
 * et stockées dans les env vars Vercel :
 *   - NEXT_PUBLIC_VAPID_PUBLIC_KEY : exposée au client pour subscribe()
 *   - VAPID_PRIVATE_KEY            : serveur uniquement, pour signer les pushs
 *   - VAPID_SUBJECT                : mailto ou URL de contact (requis par la spec)
 *
 * Le CRON_SECRET protège l'endpoint /api/cron/glucose-check d'être
 * appelé par n'importe qui sur internet.
 */

export const PUSH_CONFIG = {
  vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || "",
  vapidSubject: process.env.VAPID_SUBJECT || "mailto:ethandelabonnefon@gmail.com",
  cronSecret: process.env.CRON_SECRET || "",

  /** Ne pas re-alerter hypo avant ces minutes (spam guard) */
  hypoReAlertMinutes: 20,
  /** Ne pas re-alerter hyper avant ces minutes */
  hyperReAlertMinutes: 30,

  /** Seuils d'alerte (peuvent diverger des seuils UI : on alerte uniquement en zones vraiment critiques) */
  alertThresholds: {
    hypo: 70, // < → push rouge "Hypo"
    hyper: 250, // > → push rouge "Hyper"
  },
} as const;

export function isPushConfigured(): boolean {
  return Boolean(
    PUSH_CONFIG.vapidPublicKey &&
      PUSH_CONFIG.vapidPrivateKey &&
      PUSH_CONFIG.vapidSubject,
  );
}
