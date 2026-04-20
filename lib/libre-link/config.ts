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
  // `4.9.0` est la dernière connue stable pour la lib `@diakem/libre-link-up-api-client`.
  clientVersion: process.env.LIBRELINK_CLIENT_VERSION || "4.9.0",

  // Cache côté serveur : on évite de hammerer l'API Abbott
  // (lecture capteur rafraîchie toutes les 60s max côté FreeStyle Libre 2).
  cacheTtlSeconds: 60,
} as const;

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
