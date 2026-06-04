"use client";

/**
 * useHypoTracker — Phase H (juin 2026).
 *
 * Auto-enrichit les hypoEvents en cours avec les checkpoints glycémie
 * +15/+30/+45/+60 min. Tick toutes les 60s et regarde la glycémie live
 * actuelle (depuis useGlucose).
 *
 * Quand T+30 atteint → calcule l'assessment final via analyzeHypoEvent
 * et marque l'event comme évalué.
 *
 * Workflow :
 *  1. HypoLogger crée un HypoEvent (status: pending)
 *  2. Ce hook poll toutes les 60s
 *  3. Si glycémie live disponible ET event a un checkpoint manquant
 *     dont le timing est dépassé → update le checkpoint
 *  4. Recalcule peakGlucose à chaque update
 *  5. À T+30 → assessment via analyzeHypoEvent
 *  6. À T+60 → marquage comme "terminé" (assessment final)
 */

import { useEffect, useRef } from "react";
import { useStore } from "@/lib/store";
import { useGlucose } from "@/hooks/useGlucose";
import { analyzeHypoEvent, findPeak } from "@/lib/hypo-resucrage";
import type { HypoEvent } from "@/types";

const TICK_MS = 60_000; // 1 min

export function useHypoTracker(): void {
  const hypoEvents = useStore((s) => s.hypoEvents);
  const updateHypoEvent = useStore((s) => s.updateHypoEvent);
  const { current: live } = useGlucose({ mode: "current" });

  // Ref pour éviter recalcul à chaque render
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    function tick() {
      const now = Date.now();
      lastTickRef.current = now;

      // Pour chaque hypo récente (< 90 min), enrichir les checkpoints
      for (const event of hypoEvents) {
        const consumedAtMs = new Date(event.consumedAt).getTime();
        const minutesSince = (now - consumedAtMs) / 60_000;
        if (minutesSince < 0 || minutesSince > 90) continue;
        if (!live?.value) continue;
        if (event.assessment !== "pending") continue;

        const updates: Partial<HypoEvent> = {};

        // Remplir les checkpoints manquants si timing dépassé
        if (event.glucoseAt15min === null && minutesSince >= 15) {
          updates.glucoseAt15min = live.value;
        }
        if (event.glucoseAt30min === null && minutesSince >= 30) {
          updates.glucoseAt30min = live.value;
        }
        if (event.glucoseAt45min === null && minutesSince >= 45) {
          updates.glucoseAt45min = live.value;
        }
        if (event.glucoseAt60min === null && minutesSince >= 60) {
          updates.glucoseAt60min = live.value;
        }

        // Recalculer peak (pic atteint)
        const updatedEvent = { ...event, ...updates };
        const newPeak = findPeak(updatedEvent);
        if (newPeak !== null && (event.peakGlucose === null || newPeak > event.peakGlucose)) {
          updates.peakGlucose = newPeak;
        }
        // Aussi : la glycémie live actuelle si elle dépasse le peak connu
        if (live.value && (updates.peakGlucose ?? event.peakGlucose ?? 0) < live.value) {
          updates.peakGlucose = live.value;
        }

        // À T+30 → assessment
        if (minutesSince >= 30 && (updates.glucoseAt30min || event.glucoseAt30min !== null)) {
          const finalEvent = { ...updatedEvent, ...updates };
          const assessment = analyzeHypoEvent(finalEvent);
          if (assessment !== "pending") {
            updates.assessment = assessment;
          }
        }

        if (Object.keys(updates).length > 0) {
          updateHypoEvent(event.id, updates);
        }
      }
    }

    // Tick initial puis interval
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [hypoEvents, live, updateHypoEvent]);
}
