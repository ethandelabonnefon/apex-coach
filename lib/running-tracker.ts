/**
 * Running tracker — helpers GPS pure functions (Phase 11+, mai 2026).
 *
 * Calcule la distance entre 2 points GPS (Haversine), l'allure
 * instantanée et moyenne, et les formate pour l'affichage.
 *
 * ⚠️ Pure functions, testables hors React. Aucun side-effect.
 */

/** Point GPS capturé pendant le tracking. */
export interface GpsPoint {
  /** Latitude en degrés décimaux. */
  lat: number;
  /** Longitude en degrés décimaux. */
  lon: number;
  /** Altitude en mètres (peut être null sur certains devices). */
  altitude: number | null;
  /** Précision en mètres (rayon d'incertitude). */
  accuracy: number;
  /** Timestamp ms (Date.now() au moment de la capture). */
  t: number;
  /** Vitesse instantanée fournie par le GPS (m/s) si disponible. */
  speed?: number | null;
}

/** Rayon moyen de la Terre en mètres (modèle WGS84 simplifié). */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Distance en mètres entre 2 points GPS (formule de Haversine).
 * Précis à ±0,5% sur des distances < 100km, largement suffisant pour
 * un run.
 */
export function haversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Distance totale cumulée d'un tableau de GpsPoint (en mètres).
 * Filtre les points imprécis (accuracy > 30m) ou trop proches du
 * précédent (< 3m, probablement du bruit GPS à l'arrêt).
 */
export function totalDistance(points: GpsPoint[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  let lastLat = points[0].lat;
  let lastLon = points[0].lon;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.accuracy > 30) continue; // point peu fiable
    const d = haversineDistance(lastLat, lastLon, p.lat, p.lon);
    if (d < 3) continue; // bruit GPS à l'arrêt
    total += d;
    lastLat = p.lat;
    lastLon = p.lon;
  }
  return total;
}

/**
 * Allure (pace) en minutes par kilomètre.
 * Retourne `null` si distance ou durée trop faible pour être pertinent.
 */
export function calculatePace(distanceMeters: number, durationSeconds: number): number | null {
  if (distanceMeters < 20 || durationSeconds < 5) return null;
  const kmPerSec = distanceMeters / 1000 / durationSeconds;
  if (kmPerSec === 0) return null;
  return 1 / kmPerSec / 60; // min/km
}

/**
 * Allure instantanée sur les N derniers points (fenêtre glissante).
 * Plus stable que l'allure pure instantanée car le GPS bruite.
 * Default : 5 derniers points (~ 25-50s selon fréquence d'échantillonnage).
 */
export function instantPace(points: GpsPoint[], windowSize: number = 5): number | null {
  if (points.length < 2) return null;
  const window = points.slice(-windowSize);
  if (window.length < 2) return null;
  const dur = (window[window.length - 1].t - window[0].t) / 1000;
  const dist = totalDistance(window);
  return calculatePace(dist, dur);
}

/**
 * Formatage allure "5:23" (min:sec par km). Renvoie "—:—" si null.
 */
export function formatPace(paceMinPerKm: number | null): string {
  if (paceMinPerKm === null || !Number.isFinite(paceMinPerKm) || paceMinPerKm > 30) {
    return "—:—";
  }
  const minutes = Math.floor(paceMinPerKm);
  const seconds = Math.round((paceMinPerKm - minutes) * 60);
  if (seconds === 60) return `${minutes + 1}:00`;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Formatage durée "1:23:45" ou "23:45" si < 1h.
 */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Formatage distance "1,23 km" ou "456 m" si < 1km.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km.toFixed(2).replace(".", ",")} km`;
}

/**
 * Calcule le dénivelé positif cumulé (en mètres).
 * Filtre les variations < 1m (bruit altimétrique GPS).
 */
export function totalElevationGain(points: GpsPoint[]): number {
  if (points.length < 2) return 0;
  let gain = 0;
  let lastAlt: number | null = null;
  for (const p of points) {
    if (p.altitude === null) continue;
    if (lastAlt === null) {
      lastAlt = p.altitude;
      continue;
    }
    const delta = p.altitude - lastAlt;
    if (delta > 1) gain += delta; // filtre bruit altimétrique
    lastAlt = p.altitude;
  }
  return Math.round(gain);
}

/**
 * Profil d'altitude : pour chaque point, distance cumulée + altitude.
 * Utile pour le graphique d'altitude post-séance.
 */
export function buildElevationProfile(points: GpsPoint[]): { distM: number; alt: number }[] {
  if (points.length < 2) return [];
  const profile: { distM: number; alt: number }[] = [];
  let cumDist = 0;
  let lastLat = points[0].lat;
  let lastLon = points[0].lon;
  for (const p of points) {
    if (p.accuracy > 30 || p.altitude === null) continue;
    const d = haversineDistance(lastLat, lastLon, p.lat, p.lon);
    if (d >= 3) {
      cumDist += d;
      lastLat = p.lat;
      lastLon = p.lon;
    }
    profile.push({ distM: cumDist, alt: p.altitude });
  }
  return profile;
}

/**
 * Calcule les splits par kilomètre (ou par unité).
 * Renvoie un tableau de splits avec leur durée + allure.
 */
export interface KmSplit {
  km: number;            // numéro du split (1 = premier km)
  durationSec: number;
  paceMinPerKm: number;
}
export function computeKmSplits(points: GpsPoint[]): KmSplit[] {
  if (points.length < 2) return [];
  const splits: KmSplit[] = [];
  let cumulDist = 0;
  let lastSplitDist = 0;
  let lastSplitTime = points[0].t;
  let kmCounter = 1;
  let lastLat = points[0].lat;
  let lastLon = points[0].lon;

  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (p.accuracy > 30) continue;
    const d = haversineDistance(lastLat, lastLon, p.lat, p.lon);
    if (d < 3) continue;
    cumulDist += d;
    lastLat = p.lat;
    lastLon = p.lon;
    if (cumulDist - lastSplitDist >= 1000) {
      const durationSec = (p.t - lastSplitTime) / 1000;
      const pace = calculatePace(1000, durationSec);
      if (pace !== null) {
        splits.push({ km: kmCounter, durationSec, paceMinPerKm: pace });
      }
      kmCounter += 1;
      lastSplitDist = cumulDist;
      lastSplitTime = p.t;
    }
  }
  return splits;
}
