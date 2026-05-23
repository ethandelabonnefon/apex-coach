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

export type TrackerStatus = "idle" | "tracking" | "paused" | "finished";

export interface TrackerState {
  status: TrackerStatus;
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

  // refs pour les ressources qui ne déclenchent pas de re-render
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const tickIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const statusRef = useRef<TrackerStatus>("idle");
  const startMsRef = useRef<number | null>(null);
  const pausedAccumSecRef = useRef<number>(0);
  const pauseStartMsRef = useRef<number | null>(null);

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
    pausedAccumSecRef.current = 0;
    pauseStartMsRef.current = null;
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

    // Tick chrono toutes les 1s
    if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    tickIntervalRef.current = setInterval(() => {
      if (statusRef.current !== "tracking") return;
      const start = startMsRef.current;
      if (start === null) return;
      const elapsed = (Date.now() - start) / 1000 - pausedAccumSecRef.current;
      setDurationSec(Math.max(0, Math.floor(elapsed)));
    }, 1000);

    setStatus("tracking");
  }, [handleGeoSuccess, handleGeoError, requestWakeLock]);

  const pause = useCallback(() => {
    if (statusRef.current !== "tracking") return;
    pauseStartMsRef.current = Date.now();
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (statusRef.current !== "paused") return;
    if (pauseStartMsRef.current !== null) {
      pausedAccumSecRef.current += (Date.now() - pauseStartMsRef.current) / 1000;
      pauseStartMsRef.current = null;
    }
    setStatus("tracking");
  }, []);

  const stop = useCallback((): TrackerSummary => {
    // Arrête le watch GPS
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    // Arrête le tick
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
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
    };
    setStatus("finished");
    return summary;
  }, [points, durationSec, startedAt, releaseWakeLock]);

  const reset = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (tickIntervalRef.current) {
      clearInterval(tickIntervalRef.current);
      tickIntervalRef.current = null;
    }
    releaseWakeLock();
    setStatus("idle");
    setPoints([]);
    setDurationSec(0);
    setStartedAt(null);
    setGpsError(null);
    startMsRef.current = null;
    pausedAccumSecRef.current = 0;
    pauseStartMsRef.current = null;
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
    points,
    distanceMeters,
    durationSec,
    paceLive,
    paceAvg,
    splits,
    startedAt,
    highAccuracy: GEO_OPTIONS.enableHighAccuracy === true,
    gpsError,
    start,
    pause,
    resume,
    stop,
    reset,
  };
}
