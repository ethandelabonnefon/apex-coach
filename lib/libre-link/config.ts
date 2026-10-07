/**
 * LibreLink Up — configuration globale
 *
 * Credentials lus depuis les variables d'environnement serveur uniquement.
 * Ne JAMAIS importer ce fichier depuis du code client — `LIBRELINK_PASSWORD`
 * n'est pas préfixé NEXT_PUBLIC et ne doit pas fuiter côté navigateur.
 */

export const LIBRE_LINK_CONFIG = {
  // Credentials (serveur uniquement)
  email: process.env.LIBRELINK_EMAIL || "",
  password: process.env.LIBRELINK_PASSWORD || "",

  // Version du client LibreLinkUp — imposée côté Abbott pour certaines régions.
  // Abbott refuse (403 / 430) les versions trop vieilles. `4.16.0` est testée
  // et acceptée en avril 2026 ; override via `LIBRELINK_CLIENT_VERSION` si
  // Abbott monte encore le minimum accepté.
  clientVersion: process.env.LIBRELINK_CLIENT_VERSION || "4.16.0",

  // Cache côté serveur : on évite de hammerer l'API Abbott
  // (lecture capteur rafraîchie toutes les 60s max côté FreeStyle Libre 2).
  cacheTtlSeconds: 60,

  // Backoff sur erreur, ESCALADANT (incident du 7 oct. 2026).
  //
  // Un palier unique de 120 s était plus court que le cron glucose-check
  // (5 min) : chaque passage du cron dépassait le backoff et retentait un
  // login chez Abbott. Après le blocage « AcceptDocument » du 7 octobre,
  // ces tentatives répétées ont déclenché un **429 Abbott** que le système
  // entretenait tout seul — une tentative toutes les 5 min, le rate-limit
  // ne pouvait jamais expirer. Ethan est resté sans glycémie live.
  //
  // L'escalade résout ça sans avoir à identifier le 429 : la librairie
  // `@diakem/libre-link-up-api-client` lit `authTicket.token` sur la
  // réponse d'erreur et lève un `TypeError` — le code HTTP d'Abbott n'est
  // jamais visible côté appelant (cf. `extractStatus`). On ne peut donc
  // pas réagir AU 429 ; on réagit à la RÉPÉTITION, ce qui couvre aussi
  // bien le rate-limit que les pannes durables.
  //
  // Le dernier palier (30 min) dépasse largement le cron : à partir de la
  // 4ᵉ erreur consécutive, Abbott n'est plus sollicité que 2 fois par
  // heure, de quoi laisser un rate-limit retomber.
  errorBackoffLadderSeconds: [120, 300, 900, 1800],
} as const;

/**
 * Délai avant la prochaine tentative (s), selon le nombre d'échecs
 * CONSÉCUTIFS. Fonction pure, exportée pour être testée seule.
 *
 * Pourquoi une escalade plutôt qu'une réaction au code 429 : la librairie
 * Abbott lit `authTicket.token` sur la réponse d'erreur et lève un
 * `TypeError` avant qu'on puisse voir le code HTTP (incident du 7 oct.
 * 2026 — « Cannot read properties of undefined (reading 'token') » pour un
 * 429). On réagit donc à la répétition, qui est observable.
 */
export function backoffSecondsFor(consecutiveFailures: number): number {
  const ladder = LIBRE_LINK_CONFIG.errorBackoffLadderSeconds;
  if (!Number.isFinite(consecutiveFailures) || consecutiveFailures < 1) return ladder[0];
  return ladder[Math.min(consecutiveFailures, ladder.length) - 1];
}

/**
 * Seuils glycémiques (mg/dL) — alignés sur la logique T1D d'Ethan.
 * - hypo    : urgence — 15-20g glucides rapides
 * - low     : attention — collation
 * - target  : plage optimale (80-180)
 * - high    : surveillance — possible correction
 * - hyper   : correction + check cétones
 */
export const GLUCOSE_THRESHOLDS = {
  hypo: 70,
  low: 80,
  targetLow: 90,
  targetHigh: 140,
  high: 180,
  hyper: 250,
} as const;

/**
 * Intervalle de rafraîchissement côté client (ms).
 * FreeStyle Libre 2 met à jour toutes les ~60s, mais on tape à 5 min
 * pour éviter de saturer l'API Abbott.
 */
export const GLUCOSE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Vérifie que les credentials sont configurés côté serveur.
 */
export function isLibreLinkConfigured(): boolean {
  return Boolean(LIBRE_LINK_CONFIG.email && LIBRE_LINK_CONFIG.password);
}

/**
 * Traduit une erreur LibreLink en consigne actionnable pour l'écran.
 *
 * Incident du 7 oct. 2026 : Abbott renvoyait « Additional action required
 * for your account: AcceptDocument » — le message dit EXACTEMENT quoi
 * faire, et la tuile glycémie affichait « Aucune lecture disponible ».
 * Ethan n'avait aucun moyen de savoir qu'il devait ouvrir LibreLink Up ;
 * il a dû demander. Un cul-de-sac sur la donnée la plus critique de l'app.
 *
 * `null` quand l'erreur n'a pas de geste associé — on n'invente pas une
 * consigne qu'on ne sait pas donner.
 */
export function libreLinkActionHint(message: string | null | undefined): string | null {
  if (!message) return null;
  const m = message.toLowerCase();
  if (m.includes("acceptdocument") || m.includes("additional action required")) {
    return "Ouvre LibreLink Up et accepte le document qu'Abbott demande — la glycémie revient ensuite toute seule.";
  }
  if (m.includes("backoff actif")) {
    return "Nouvelle tentative automatique en cours. Inutile de rafraîchir : chaque essai rallonge l'attente.";
  }
  if (m.includes("token") || m.includes("429") || m.includes("too many")) {
    return "Abbott limite temporairement les connexions. L'app réessaiera seule, laisse-la tranquille quelques minutes.";
  }
  if (m.includes("not_configured") || m.includes("manquants")) {
    return "LibreLink n'est pas configuré côté serveur.";
  }
  return null;
}
