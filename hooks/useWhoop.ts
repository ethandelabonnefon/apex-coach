"use client";

/**
 * useWhoop — hook client qui appelle /api/whoop/sync pour récupérer
 * le snapshot Whoop (strain, recovery, sleep, last workout).
 *
 * Refresh auto toutes les 5min côté client. Le serveur cache 5min aussi
 * en KV → en pratique 1 appel API Whoop toutes les 5min max.
 */

import { useCallback, useEffect, useState } from "react";

export interface WhoopSnapshot {
  cycleStrain: number | null;
  recoveryScore: number | null;
  hrvMs: number | null;
  rhrBpm: number | null;
  sleepDurationMin: number | null;
  sleepPerformance: number | null;
  lastWorkout: {
    id: string;
    strain: number;
    startedAt: string;
    endedAt: string;
    sport: string | null;
  } | null;
  fetchedAt: number;
}

export interface UseWhoopResult {
  connected: boolean;
  snapshot: WhoopSnapshot | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const REFRESH_MS = 5 * 60 * 1000;

export function useWhoop(): UseWhoopResult {
  const [connected, setConnected] = useState(false);
  const [snapshot, setSnapshot] = useState<WhoopSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whoop/sync", { cache: "no-store" });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        setConnected(false);
        return;
      }
      const data = await res.json();
      setConnected(!!data.connected);
      setSnapshot(data.snapshot ?? null);
      setError(data.error ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "fetch failed");
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Refresh au retour de visibilité (si > REFRESH_MS depuis le dernier fetch)
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState !== "visible" || !snapshot) return;
      if (Date.now() - snapshot.fetchedAt > REFRESH_MS) fetchData();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [snapshot, fetchData]);

  return { connected, snapshot, loading, error, refetch: fetchData };
}
