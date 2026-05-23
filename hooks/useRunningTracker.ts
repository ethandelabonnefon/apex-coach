"use client";

/**
 * useRunningTracker — Phase 11+ (mai 2026).
 *
 * Hook React qui gère le state d'une séance de running tracking GPS
 * en temps réel. Pas de carte ici (Phase B) — juste les données.
 *
 * Features Phase A :
 *  - GPS watch live (navigator.geolocation.watchPosition)
 *  - Wake Lock pour garder l'écran allumé pendant la séance
 *  - Calcul live de la distance, durée, allure instantanée + moyenne
 *  - Pause / Resume (le chrono s'arrête, GPS continue mais points
 *    "pause" sont ignorés dans le calcul)
 *  - Splits par km calculés à la volée
 *  - Stop → renvoie un summary complet
 *
 * Précision GPS attendue : ±5-10m en conditions normales (extérieur,
 * sans obstacle dense). La Geolocation API iOS retourne `accuracy`
 * en mètres ; on rejette les points > 30m d'accuracy.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type GpsPoint,
  totalDistance,
  calculatePace,
  instantPace,
  computeKmSplits,
} from "@/lib/running-tracker";
import type { SessionGlucoseCheckpoint } from "@/types";

/** Map trend Libre string → numérique (1..5) pour stockage. */
function libreTrendToNumber(trend: string | undefined | null): number | undefined {
  switch (trend) {
    case "SingleDown": return 1;
    case "FortyFiveDown": return 2;
    case "Flat": return 3;
    case "FortyFiveUp": return 4;
    case "SingleUp": return 5;
    default: return undefined;
  }
}

export type TrackerStatus = "idle" | "tracking" | "paused" | "finished";

export interface TrackerState {
  status: TrackerStatus;
  /** True quand la pause a été déclenchée automatiquement (immobilité). */
  autoPaused: boolean;
  /** Points GPS bruts capturés (incluant pauses). */
  points: GpsPoint[];
  /** Distance cumulée en mètres (recalculée à chaque tick). */
  distanceMeters: number;
  /** Durée écoulée en secondes (chrono actif, pas en pause). */
  durationSec: number;
  /** Allure instantanée min/km (sur les ~5 derniers points). */
  paceLive: number | null;
  /** Allure moyenne min/km depuis le début. */
  paceAvg: number | null;
  /** Splits par km depuis le début. */
  splits: ReturnType<typeof computeKmSplits>;
  /** Date ISO du démarrage. */
  startedAt: string | null;
  /** Mode haute précision activé (consomme plus de batterie). */
  highAccuracy: boolean;
  /** Erreur GPS courante (permission refusée, signal perdu…). */
  gpsError: string | null;
  /** Phase C — checkpoints glycémie capturés pendant la séance. */
  glucoseCheckpoints: SessionGlucoseCheckpoint[];
  /** Dernière glycémie connue (pour affichage overlay live). */
  liveGlucose: number | null;
  /** Trend de la dernière glycémie (numérique 1..5). */
  liveGlucoseTrend: number | undefined;
}

export interface UseRunningTrackerReturn extends TrackerState {
  start: () => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => TrackerSummary;
  reset: () => void;
}

export interface TrackerSummary {
  startedAt: string;
  endedAt: string;
  durationSec: number;
  distanceMeters: number;
  paceAvg: number | null;
  points: GpsPoint[];
  splits: ReturnType<typeof computeKmSplits>;
  /** Phase C — checkpoints glycémie capturés pendant la séance. */
  glucoseCheckpoints: SessionGlucoseCheckpoint[];
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,        // pas de cache, on veut du frais
  timeout: 15_000,       // 15s avant de considérer le signal perdu
};

export function useRunningTracker(): UseRunningTrackerReturn {
  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [points, setPoints] = useState<GpsPoint[]>([]);
  const [durationSec, setDurationSec] = useState(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Phase C — checkpoints glycémie + alerte hypo
  const [glucoseCheckpoints, setGlucoseCheckpoints] = useState<SessionGlucoseCheckpoint[]>([]);
  const [liveGlucose, setLiveGlucose] = useState<number | null>(null);
  const [liveGlucoseTrend, setLiveGlucoseTrend] = useState<number | undefined>(undefined);

  // Phase D — auto-pause si l'utilisateur s'arrête (allure très basse)
  const [autoPaused, setAutoPaused] = useState(false);
  // Refs pour la détection : timestamp du début de l'immobilité actuelle
  const stillSinceRef = useRef<number | null>(null);
  const movingSinceRef = useRef<number | null>(null);
  // Ref miroir de autoPaused pour usage dans les callbacks (évite stale state)
  const autoPauseFlagRef = useRef(false);
  useEffect(() => { autoPauseFlagRef.current = autoPaused; }, [autoPaused]);

  // refs pour les ressources qui ne déclenchent pas de re-render
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const glucoseIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<TrackerStatus>("idle");
  const startMsRef = useRef<number | null>(null);
  const pausedAccumSecRef = useRef<number>(0);
  const pauseStartMsRef = useRef<number | null>(null);
  // Phase C — état pour anti-spam hypo + tracking km franchis
  const lastHypoAlertRef = useRef<number>(0);
  const lastKmCheckpointRef = useRef<number>(0); // dernier km franchi qui a déclenché un checkpoint
  const pointsRef = useRef<GpsPoint[]>([]);
  useEffect(() => { pointsRef.current = points; }, [points]);

  // Synchronise le ref de status pour pouvoir le lire dans les callbacks
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // ─── Wake Lock helpers ─────────────────────────
  const requestWakeLock = useCallback(async () => {
    if (typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      const lock = await (navigator as Navigator & { wakeLock: { request: (type: "screen") => Promise<WakeLockSentinel> } }).wakeLock.request("screen");
      wakeLockRef.current = lock;
    } catch {
      // Permission refusée, batterie low, etc. → on continue sans
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch {
        // ignore
      }
      wakeLockRef.current = null;
    }
  }, []);

  // Re-acquire le Wake Lock quand on revient au premier plan
  // (iOS peut le libérer en background)
  useEffect(() => {
    const onVisChange = () => {
      if (
        document.visibilityState === "visible" &&
        (statusRef.current === "tracking" || statusRef.current === "paused") &&
        !wakeLockRef.current
      ) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisChange);
    return () => document.removeEventListener("visibilitychange", onVisChange);
  }, [requestWakeLock]);

  // ─── Phase C — Auto-tag glycémie + alerte hypo ─────────
  /**
   * Fetch /api/glucose/current et stocke un checkpoint si on a une lecture.
   * `label` peut être "T+0", "Km 1", "T+5min", "T+0 final"…
   * `forceLowAlert = true` pour court-circuiter le backoff (utilisé au stop).
   */
  const fetchAndStoreGlucose = useCallback(async (label: string) => {
    try {
      const res = await fetch("/api/glucose/current", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data?.value !== "number") return;
      const value: number = data.value;
      const trend = libreTrendToNumber(data?.trend);
      const now = Date.now();
      const offsetSec = startMsRef.current
        ? Math.max(0, Math.floor((now - startMsRef.current) / 1000 - pausedAccumSecRef.current))
        : 0;
      const distanceM = totalDistance(pointsRef.current);
      setLiveGlucose(value);
      setLiveGlucoseTrend(trend);
      setGlucoseCheckpoints((prev) => [
        ...prev,
        { label, offsetSec, value, timestamp: now, distanceMeters: distanceM, trend },
      ]);

      // ─── Alerte hypo pendant la séance ────────────
      // Backoff 10min anti-spam. Notif locale via service worker si dispo.
      if (value < 80 && now - lastHypoAlertRef.current > 10 * 60_000) {
        lastHypoAlertRef.current = now;
        if (typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window) {
          if (Notification.permission === "granted") {
            navigator.serviceWorker.ready
              .then((reg) => {
                reg.showNotification("⚠️ Hypo en course !", {
                  body: `Glycémie ${value} mg/dL — mange 15g de glucides rapides`,
                  icon: "/icons/icon-192.png",
                  badge: "/icons/icon-192.png",
                  tag: "running-hypo",
                  data: { url: "/running", type: "running-hypo" },
                });
              })
              .catch(() => {});
          }
        }
      }
    } catch {
      // silencieux : pas de glycémie dispo ne doit pas casser le tracker
    }
  }, []);

  // ─── GPS watch ─────────────────────────────────
  const handleGeoSuccess = useCallback((pos: GeolocationPosition) => {
    // Si on est en pause, on ignore les points pour ne pas polluer le tracé
    if (statusRef.current !== "tracking") return;
    const p: GpsPoint = {
      lat: pos.coords.latitude,
      lon: pos.coords.longitude,
      altitude: pos.coords.altitude,
      accuracy: pos.coords.accuracy,
      t: pos.timestamp || Date.now(),
      speed: pos.coords.speed ?? null,
    };
    setPoints((prev) => [...prev, p]);
    setGpsError(null);
  }, []);

  const handleGeoError = useCallback((err: GeolocationPositionError) => {
    const msg =
      err.code === err.PERMISSION_DENIED
        ? "Autorise la géolocalisation dans les réglages iOS"
        : err.code === err.TIMEOUT
        ? "Signal GPS perdu — vérifie que tu es à l'extérieur"
        : "Erreur GPS";
    setGpsError(msg);
  }, []);

  // ─── Actions ────────────────────────────────────
  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGpsError("Géolocalisation non disponible sur cet appareil");
      return;
    }
    setPoints([]);
    setDurationSec(0);
    setGpsError(null);
    setGlucoseCheckpoints([]);
    setLiveGlucose(null);
    setLiveGlucoseTrend(undefined);
    pausedAccumSecRef.current = 0;
    pauseStartMsRef.current = null;
    lastHypoAlertRef.current = 0;
    lastKmCheckpointRef.current = 0;
    startMsRef.current = Date.now();
    setStartedAt(new Date(startMsRef.current).toISOString());

    // Demande Wake Lock (asynchrone, pas bloquant)
    requestWakeLock();

    // Lance le watch GPS
    const id = navigator.geolocation.watchPosition(
      handleGeoSuccess,
      handleGeoError,
      GEO_OPTIONS,
    );
    watchIdRef.current = id;

    // Phase C — checkpoint glycémie T+0 (initial)
    fetchAndStoreGlucose("T+0");

    // Tick chrono toutes les 1s + check km franchis + auto-pause/resume
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = setInterval(() => {
      if (statusRef.current === "idle" || statusRef.current === "finished") return;
      const start = startMsRef.current;
      if (start === null) return;

      // Pendant une pause auto, on traite quand même la reprise auto
      // si le mouvement reprend → donc on n'early-return pas ici.
      if (statusRef.current === "tracking") {
        const elapsed = (Date.now() - start) / 1000 - pausedAccumSecRef.current;
        setDurationSec(Math.max(0, Math.floor(elapsed)));

        // Phase C — vérifie si un nouveau km a été franchi → checkpoint
        const distM = totalDistance(pointsRef.current);
        const kmFranchi = Math.floor(distM / 1000);
        if (kmFranchi > lastKmCheckpointRef.current) {
          lastKmCheckpointRef.current = kmFranchi;
          fetchAndStoreGlucose(`Km ${kmFranchi}`);
        }
      }

      // ─── Phase D — Auto-pause / auto-resume ──────────────
      // Allure instantanée sur les 5 derniers points. Si < 0.5 m/s
      // (~ 8min/km, donc à l'arrêt ou très lent) pendant 10s → pause auto.
      // Si > 1 m/s (3.6 km/h) pendant 3s → reprise auto.
      const recentPoints = pointsRef.current.slice(-5);
      const now = Date.now();
      // Calcul de la vitesse moyenne sur les 5 derniers pts
      let speedMs: number | null = null;
      if (recentPoints.length >= 2) {
        const first = recentPoints[0];
        const last = recentPoints[recentPoints.length - 1];
        const dt = (last.t - first.t) / 1000;
        if (dt > 0) {
          let d = 0;
          for (let i = 1; i < recentPoints.length; i++) {
            const prev = recentPoints[i - 1];
            const cur = recentPoints[i];
            d += Math.sqrt(
              Math.pow((cur.lat - prev.lat) * 111_000, 2) +
              Math.pow((cur.lon - prev.lon) * 111_000 * Math.cos((cur.lat * Math.PI) / 180), 2),
            );
          }
          speedMs = d / dt;
        }
      }

      if (statusRef.current === "tracking" && speedMs !== null) {
        if (speedMs < 0.5) {
          // Démarre le timer d'immobilité
          if (stillSinceRef.current === null) stillSinceRef.current = now;
          // 10s d'immobilité → auto-pause
          if (now - stillSinceRef.current >= 10_000) {
            stillSinceRef.current = null;
            movingSinceRef.current = null;
            pauseStartMsRef.current = now;
            setStatus("paused");
            setAutoPaused(true);
          }
        } else {
          stillSinceRef.current = null;
        }
      } else if (statusRef.current === "paused" && autoPauseFlagRef.current && speedMs !== null) {
        // Auto-resume si le mouvement reprend (>1 m/s pendant 3s)
        if (speedMs > 1) {
          if (movingSinceRef.current === null) movingSinceRef.current = now;
          if (now - movingSinceRef.current >= 3_000) {
            movingSinceRef.current = null;
            if (pauseStartMsRef.current !== null) {
              pausedAccumSecRef.current += (now - pauseStartMsRef.current) / 1000;
              pauseStartMsRef.current = null;
            }
            setStatus("tracking");
            setAutoPaused(false);
          }
        } else {
          movingSinceRef.current = null;
        }
      }
    }, 1000);

    // Phase C — checkpoint glycémie périodique toutes les 5 min
    if (glucoseIntervalRef.current) clearInterval(glucoseIntervalRef.current);
    glucoseIntervalRef.current = setInterval(() => {
      if (statusRef.current !== "tracking") return;
      const elapsed = startMsRef.current
        ? (Date.now() - startMsRef.current) / 1000 - pausedAccumSecRef.current
        : 0;
      const minutes = Math.round(elapsed / 60);
      fetchAndStoreGlucose(`T+${minutes}min`);
    }, 5 * 60_000);

    setStatus("tracking");
  }, [handleGeoSuccess, handleGeoError, requestWakeLock, fetchAndStoreGlucose]);

  const pause = useCallback(() => {
    if (statusRef.current !== "tracking") return;
    pauseStartMsRef.current = Date.now();
    stillSinceRef.current = null;
    movingSinceRef.current = null;
    setStatus("paused");
    setAutoPaused(false); // pause manuelle override auto-paused
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    if (pauseStartMsRef.current !== null) {
      pausedAccumSecRef.current += (Date.now() - pauseStartMsRef.current) / 1000;
      pauseStartMsRef.current = null;
    }
    stillSinceRef.current = null;
    movingSinceRef.current = null;
    setStatus("tracking");
    setAutoPaused(false);
  }, []);

  const stop = useCallback((): TrackerSummary => {
    // Phase C — checkpoint glycémie final (fire-and-forget, le summary
    // sera retourné avant la réponse fetch mais le state se mettra à jour)
    fetchAndStoreGlucose("T+0 final");

    // Arrête le watch GPS
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    // Arrête le tick + l'interval glucose
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (glucoseIntervalRef.current) {
      clearInterval(glucoseIntervalRef.current);
      glucoseIntervalRef.current = null;
    }
    // Release wake lock
    releaseWakeLock();

    // Si on était en pause, finalise l'accumulateur
    if (pauseStartMsRef.current !== null) {
      pausedAccumSecRef.current += (Date.now() - pauseStartMsRef.current) / 1000;
      pauseStartMsRef.current = null;
    }

    const finalDistance = totalDistance(points);
    const finalDuration = durationSec;
    const finalPace = calculatePace(finalDistance, finalDuration);
    const finalSplits = computeKmSplits(points);
    const summary: TrackerSummary = {
      startedAt: startedAt ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationSec: finalDuration,
      distanceMeters: finalDistance,
      paceAvg: finalPace,
      points,
      splits: finalSplits,
      glucoseCheckpoints,
    };
    setStatus("finished");
    return summary;
  }, [points, durationSec, startedAt, glucoseCheckpoints, releaseWakeLock, fetchAndStoreGlucose]);

  const reset = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    if (glucoseIntervalRef.current) {
      clearInterval(glucoseIntervalRef.current);
      glucoseIntervalRef.current = null;
    }
    releaseWakeLock();
    setStatus("idle");
    setPoints([]);
    setDurationSec(0);
    setStartedAt(null);
    setGpsError(null);
    setGlucoseCheckpoints([]);
    setLiveGlucose(null);
    setLiveGlucoseTrend(undefined);
    setAutoPaused(false);
    startMsRef.current = null;
    pausedAccumSecRef.current = 0;
    pauseStartMsRef.current = null;
    lastHypoAlertRef.current = 0;
    lastKmCheckpointRef.current = 0;
    stillSinceRef.current = null;
    movingSinceRef.current = null;
  }, [releaseWakeLock]);

  // Cleanup au unmount (sécurité si l'utilisateur quitte la page sans stop)
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
      if (glucoseIntervalRef.current) {
        clearInterval(glucoseIntervalRef.current);
      }
      releaseWakeLock();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Calculs dérivés ────────────────────────────
  const distanceMeters = totalDistance(points);
  const paceAvg = calculatePace(distanceMeters, durationSec);
  const paceLive = instantPace(points, 5);
  const splits = computeKmSplits(points);

  return {
    status,
    autoPaused,
    points,
    distanceMeters,
    durationSec,
    paceLive,
    paceAvg,
    splits,
    startedAt,
    highAccuracy: GEO_OPTIONS.enableHighAccuracy === true,
    gpsError,
    glucoseCheckpoints,
    liveGlucose,
    liveGlucoseTrend,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
