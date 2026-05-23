/**
 * Helpers pour lancer des apps externes depuis la PWA — Phase 11 (mai 2026).
 *
 * Stratégie deep link : on tente le URL scheme custom (`yazio://` etc.)
 * et on fallback sur l'App Store / Play Store si l'app n'est pas
 * installée. Détection via `document.hidden` après un court délai :
 * si l'app s'est ouverte, le navigateur passe en background → `hidden`
 * devient `true`.
 *
 * NB : sur iOS Safari moderne, lancer un URL scheme inexistant ne déclenche
 * plus de popup d'erreur. Le navigateur reste juste sur la page. C'est
 * silencieux et safe.
 */

/**
 * Plateforme détectée à partir de l'user-agent.
 * "unknown" si pas de match (ex: PWA standalone iOS sans UA spécifique).
 */
export function detectPlatform(): "ios" | "android" | "unknown" {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  if (/android/.test(ua)) return "android";
  return "unknown";
}

interface ExternalAppConfig {
  /** URL scheme custom (ex: "yazio://"). */
  urlScheme: string;
  /** URL App Store iOS (avec ID app). */
  iosAppStoreUrl: string;
  /** URL Play Store Android (avec package name). */
  androidPlayStoreUrl: string;
  /** Fallback web ouvert si pas d'app détectée et pas de mobile. */
  webFallbackUrl: string;
}

const YAZIO_CONFIG: ExternalAppConfig = {
  urlScheme: "yazio://",
  iosAppStoreUrl: "https://apps.apple.com/app/id946099227",
  androidPlayStoreUrl: "https://play.google.com/store/apps/details?id=com.yazio.android",
  webFallbackUrl: "https://www.yazio.com",
};

/**
 * Tente d'ouvrir l'app externe via deep link, fallback sur store/web
 * si l'app n'est pas installée.
 *
 * @param config Configuration de l'app à ouvrir
 * @param fallbackDelayMs Délai avant de déclencher le fallback (default 1500ms)
 */
export function openExternalApp(
  config: ExternalAppConfig,
  fallbackDelayMs: number = 1500,
): void {
  if (typeof window === "undefined") return;
  const platform = detectPlatform();

  // Sur desktop / unknown → directement le site web
  if (platform === "unknown") {
    window.open(config.webFallbackUrl, "_blank", "noopener");
    return;
  }

  // Mobile : tente le URL scheme, fallback store si rien ne se passe
  const startedAt = Date.now();
  let appOpened = false;

  // Détecte si l'app s'est ouverte (la page passe en background)
  const onVisibilityChange = () => {
    if (document.hidden) {
      appOpened = true;
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  // Tente le deep link
  window.location.href = config.urlScheme;

  // Si rien ne s'est passé après `fallbackDelayMs`, on fallback
  setTimeout(() => {
    document.removeEventListener("visibilitychange", onVisibilityChange);
    const elapsed = Date.now() - startedAt;
    // Si la page est toujours visible et qu'on est dans la fenêtre normale
    // (pas figée par un alert iOS), on assume que l'app n'est pas installée
    if (!appOpened && !document.hidden && elapsed < fallbackDelayMs + 500) {
      const storeUrl =
        platform === "ios" ? config.iosAppStoreUrl : config.androidPlayStoreUrl;
      window.location.href = storeUrl;
    }
  }, fallbackDelayMs);
}

/** Helper spécifique Yazio. */
export function openYazio(): void {
  openExternalApp(YAZIO_CONFIG);
}
