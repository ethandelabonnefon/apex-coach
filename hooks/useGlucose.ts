"use client";

/**
 * useGlucose — hook React pour la glycémie live FreeStyle Libre 2.
 *
 * Stratégie :
 *  - fetch initial au mount (mode "current" ou "history")
 *  - auto-refresh toutes les `GLUCOSE_REFRESH_INTERVAL_MS`
 *  - refresh au retour de visibilité onglet (visibilitychange)
 *  - expose `refetch()` manuel + états `loading` / `error` / `configured`
 *
 * Retourne toujours une valeur, même si l'API renvoie 503 (non configuré)
 * ou 502 (erreur Abbott) — les consommateurs affichent un fallback discret.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { GLUCOSE_REFRESH_INTERVAL_MS } from "@/lib/libre-link/config";
import type { GlucoseTone, GlucoseTrend } from "@/lib/libre-link/utils";

export type GlucoseCurrent = {
  value: number;
  trend: GlucoseTrend;
  tone: GlucoseTone;
  arrow: string;
  trendLabel: string;
  statusLabel: string;
  date: string;
  isHigh: boolean;
  isLow: boolean;
};

export type GlucoseHistoryPoint = {
  value: number;
  trend: GlucoseTrend;
  isHigh: boolean;
  isLow: boolean;
  date: string;
};

export type UseGlucoseResult = {
  current: GlucoseCurrent | null;
  history: GlucoseHistoryPoint[];
  loading: boolean;
  /** Pas d'erreur mais credentials manquants côté serveur */
  notConfigured: boolean;
  /** Erreur réseau ou côté Abbott */
  error: string | null;
  /** Timestamp (ms) du dernier fetch réussi */
  lastFetchedAt: number | null;
  refetch: () => void;
};

export type UseGlucoseOptions = {
  /**
   * "current" (défaut) : juste la dernière lecture. Plus léger.
   * "history" : last + 8h d'historique chronologique.
   */
  mode?: "current" | "history";
  /** Désactive l'auto-refresh (utile pour tests / debug) */
  paused?: boolean;
  /** Override l'intervalle de refresh en ms */
  refreshMs?: number;
};

export function useGlucose(options: UseGlucoseOptions = {}): UseGlucoseResult {
  const { mode = "current", paused = false, refreshMs = GLUCOSE_REFRESH_INTERVAL_MS } = options;

  const [current, setCurrent] = useState<GlucoseCurrent | null>(null);
  const [history, setHistory] = useState<GlucoseHistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null);

  // Garde l'identifiant du fetch en cours pour éviter les setState
  // sur un composant démonté ou après rapid refresh.
  const fetchIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const myFetchId = ++fetchIdRef.current;
    setLoading(true);

    try {
      const endpoint = mode === "history" ? "/api/glucose/history" : "/api/glucose/current";
      const res = await fetch(endpoint, { cache: "no-store" });

      if (myFetchId !== fetchIdRef.current) return; // fetch plus récent en route

      if (res.status === 503) {
        setNotConfigured(true);
        setError(null);
        setCurrent(null);
        setHistory([]);
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "erreur inconnue" }));
        setError(body?.message || `HTTP ${res.status}`);
        return;
      }

      const data = await res.json();
      setNotConfigured(false);
      setError(null);
      setLastFetchedAt(Date.now());

      if (mode === "history") {
        setCurrent(data.current as GlucoseCurrent);
        setHistory((data.history as GlucoseHistoryPoint[]) || []);
      } else {
        setCurrent(data as GlucoseCurrent);
      }
    } catch (err) {
      if (myFetchId !== fetchIdRef.current) return;
      setError(err instanceof Error ? err.message : "erreur réseau");
    } finally {
      if (myFetchId === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [mode]);

  // Fetch initial + intervalle
  useEffect(() => {
    if (paused) return;

    fetchData();
    const id = setInterval(fetchData, refreshMs);
    return () => clearInterval(id);
  }, [fetchData, paused, refreshMs]);

  // Refresh au retour de visibilité
  useEffect(() => {
    if (paused) return;
    const onVis = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchData, paused]);

  return {
    current,
    history,
    loading,
    notConfigured,
    error,
    lastFetchedAt,
    refetch: fetchData,
  };
}
