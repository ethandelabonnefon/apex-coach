"use client";

/**
 * usePatternDetection — hook React pour la détection client-side de patterns
 * glycémiques (Phase 11 Bloc 3).
 *
 * Stratégie :
 *  - Fetch l'archive 7j depuis `/api/glucose/archive?days=7` au mount
 *  - Combine avec les `insulinLogs` du store Zustand (fournis en input)
 *  - Appelle `detectPatterns()` (pure function)
 *  - Cache le résultat en localStorage avec TTL 6h (évite recalcul à chaque
 *    nav, l'archive ne change pas si vite)
 *  - Si nouveau pattern (id pas dans le cache précédent), tire une push
 *    notification locale via le service worker
 *
 * Le résultat est filtré côté UI par les `dismissedIds` persistés.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { detectPatterns, type DetectedPattern } from "@/lib/glucose-archive/pattern-engine";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import type { DiabetesConfig, InsulinLog } from "@/types";

const CACHE_KEY = "apex-pattern-detection-v1";
const DISMISSED_KEY = "apex-pattern-dismissed-v1";
const TTL_MS = 6 * 60 * 60 * 1000; // 6h

interface CacheEntry {
  detectedAtMs: number;
  patterns: DetectedPattern[];
  /** Set des ids déjà notifiés via push (pour ne pas re-tirer). */
  notifiedIds: string[];
}

function readCache(): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(entry: CacheEntry) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota plein ou autre — silencieux */
  }
}

function readDismissed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function writeDismissed(ids: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* */
  }
}

function tryFireNotification(p: DetectedPattern) {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  navigator.serviceWorker.ready
    .then((reg) => {
      reg.showNotification(p.title, {
        body: p.message,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        tag: `pattern-${p.type}`,
        data: { url: "/diabete", type: "pattern", patternType: p.type },
      });
    })
    .catch(() => {});
}

export interface UsePatternDetectionOptions {
  insulinLogs: InsulinLog[];
  diabetesConfig: DiabetesConfig;
  /** Force le recalcul même si le cache est encore frais (utile pour debug). */
  force?: boolean;
}

export interface UsePatternDetectionResult {
  patterns: DetectedPattern[];
  loading: boolean;
  lastCheckedAt: string | null;
  dismissedIds: Set<string>;
  dismissPattern: (id: string) => void;
  resetDismissed: () => void;
  refetch: () => void;
}

export function usePatternDetection(
  options: UsePatternDetectionOptions,
): UsePatternDetectionResult {
  const { insulinLogs, diabetesConfig, force = false } = options;
  const [patterns, setPatterns] = useState<DetectedPattern[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => readDismissed());

  // Garde un identifiant pour ignorer les fetch obsolètes
  const fetchIdRef = useRef(0);

  // Stringifié des injections pour stable dep array
  const injectionsKey = useMemo(() => {
    return insulinLogs.map((l) => `${l.id}:${l.units}`).join(",");
  }, [insulinLogs]);

  useEffect(() => {
    let cancelled = false;
    const myId = ++fetchIdRef.current;

    async function run() {
      // Cache hit ?
      const cache = force ? null : readCache();
      const now = Date.now();
      if (cache && now - cache.detectedAtMs < TTL_MS) {
        if (!cancelled && myId === fetchIdRef.current) {
          setPatterns(cache.patterns);
          setLastCheckedAt(new Date(cache.detectedAtMs).toISOString());
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/glucose/archive?days=14", { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled && myId === fetchIdRef.current) setLoading(false);
          return;
        }
        const data = (await res.json()) as { points?: ArchivedPoint[] };
        const points = data.points ?? [];

        const detected = detectPatterns(points, insulinLogs, diabetesConfig, now);

        // Compare avec le cache pour identifier les nouveaux patterns
        const previousIds = new Set(cache?.notifiedIds ?? []);
        const newPatterns = detected.filter((p) => !previousIds.has(p.id));
        for (const p of newPatterns) {
          tryFireNotification(p);
        }

        const entry: CacheEntry = {
          detectedAtMs: now,
          patterns: detected,
          notifiedIds: detected.map((p) => p.id),
        };
        writeCache(entry);

        if (!cancelled && myId === fetchIdRef.current) {
          setPatterns(detected);
          setLastCheckedAt(new Date(now).toISOString());
          setLoading(false);
        }
      } catch {
        if (!cancelled && myId === fetchIdRef.current) setLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [injectionsKey, force]);

  const dismissPattern = (id: string) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  };

  const resetDismissed = () => {
    setDismissedIds(() => {
      const empty = new Set<string>();
      writeDismissed(empty);
      return empty;
    });
  };

  const refetch = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem(CACHE_KEY);
      } catch {
        /* */
      }
    }
    fetchIdRef.current++;
    // Trigger re-effect via state bump
    setLoading(true);
    setPatterns([]);
    // L'effect se re-déclenche au prochain tick si les deps changent ;
    // sinon force un mini delay puis ré-exécution manuelle :
    setTimeout(() => {
      const ev = new Event("apex-pattern-refetch");
      window.dispatchEvent(ev);
    }, 0);
  };

  return {
    patterns,
    loading,
    lastCheckedAt,
    dismissedIds,
    dismissPattern,
    resetDismissed,
    refetch,
  };
}
