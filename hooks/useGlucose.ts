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
 *
 * Déduplication client (sept. 2026) : `/diabete` monte cinq consommateurs
 * de ce hook, qui tiraient cinq `/api/glucose/current` en parallèle. Sur
 * Vercel chaque appel peut tomber sur une lambda différente, dont le cache
 * LibreLink (mémoire de module) et le backoff 429 ne sont pas partagés :
 * une lambda répondait 200, la suivante 502 « backoff actif », et la carte
 * Glycémie live affichait « — » pendant que l'Overview affichait la valeur.
 * Un seul fetch en vol par endpoint, réutilisé 30 s par tous les
 * composants ; un mode « current » se sert d'un « history » frais (il
 * contient déjà la dernière lecture). Le serveur, lui, n'est pas touché.
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
  /** Force un passage au serveur (ignore le cache partagé 30 s). Renvoie la promesse du fetch. */
  refetch: () => void | Promise<void>;
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

// ─── Fetch partagé entre tous les composants montés ──────────────────────
type SharedResult = { ok: boolean; status: number; data: unknown; message?: string };
type SharedEntry = { promise: Promise<SharedResult> | null; res: SharedResult | null; at: number };

/** Durée pendant laquelle un résultat réussi sert tous les nouveaux montages. */
const SHARE_TTL_MS = 30_000;

const shared: Record<"current" | "history", SharedEntry> = {
  current: { promise: null, res: null, at: 0 },
  history: { promise: null, res: null, at: 0 },
};

async function rawFetch(mode: "current" | "history"): Promise<SharedResult> {
  const endpoint = mode === "history" ? "/api/glucose/history" : "/api/glucose/current";
  const res = await fetch(endpoint, { cache: "no-store" });
  if (res.status === 503) return { ok: false, status: 503, data: null };
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: "erreur inconnue" }));
    return { ok: false, status: res.status, data: null, message: body?.message || `HTTP ${res.status}` };
  }
  return { ok: true, status: res.status, data: await res.json() };
}

/** Un « history » frais contient `current` : on le reconditionne en résultat « current ». */
function currentFromHistory(r: SharedResult): SharedResult {
  const data = r.data as { current?: unknown } | null;
  return { ok: true, status: 200, data: data?.current ?? null };
}

function sharedFetch(mode: "current" | "history", force = false): Promise<SharedResult> {
  const now = Date.now();
  const entry = shared[mode];

  if (!force) {
    if (entry.res?.ok && now - entry.at < SHARE_TTL_MS) return Promise.resolve(entry.res);
    if (mode === "current") {
      const h = shared.history;
      if (h.res?.ok && now - h.at < SHARE_TTL_MS) return Promise.resolve(currentFromHistory(h.res));
      if (h.promise) return h.promise.then((r) => (r.ok ? currentFromHistory(r) : r));
    }
  }
  if (entry.promise) return entry.promise;

  entry.promise = rawFetch(mode)
    .then((r) => {
      // Un échec ne remplace jamais un dernier succès : les consommateurs
      // gardent la dernière lecture connue plutôt qu'un tiret.
      if (r.ok) {
        entry.res = r;
        entry.at = Date.now();
      }
      return r;
    })
    .finally(() => {
      entry.promise = null;
    });
  return entry.promise;
}

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

  const fetchData = useCallback(async (force = false) => {
    const myFetchId = ++fetchIdRef.current;
    setLoading(true);

    try {
      const res = await sharedFetch(mode, force);

      if (myFetchId !== fetchIdRef.current) return; // fetch plus récent en route

      if (res.status === 503) {
        setNotConfigured(true);
        setError(null);
        setCurrent(null);
        setHistory([]);
        return;
      }

      if (!res.ok) {
        setError(res.message || `HTTP ${res.status}`);
        return;
      }

      const data = res.data as Record<string, unknown>;
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

  // Fetch initial + intervalle (l'intervalle force le passage au serveur :
  // le cache partagé de 30 s ne sert qu'à absorber les montages simultanés).
  useEffect(() => {
    if (paused) return;

    fetchData();
    const id = setInterval(() => fetchData(true), refreshMs);
    return () => clearInterval(id);
  }, [fetchData, paused, refreshMs]);

  // Refresh au retour de visibilité — MAIS seulement si on a du succès récent
  // (évite de rebombarder l'API quand on est déjà en erreur / rate-limit)
  const lastFetchedRef = useRef<number | null>(null);
  useEffect(() => {
    lastFetchedRef.current = lastFetchedAt;
  }, [lastFetchedAt]);

  useEffect(() => {
    if (paused) return;
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const last = lastFetchedRef.current;
      // Déjà OK récemment (< refreshMs) → pas besoin de retap
      if (last && Date.now() - last < refreshMs) return;
      fetchData();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchData, paused, refreshMs]);

  return {
    current,
    history,
    loading,
    notConfigured,
    error,
    lastFetchedAt,
    refetch: () => fetchData(true),
  };
}
