"use client";

import { useState, useEffect } from "react";
import { Card, SectionTitle, InfoBox } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { MuscleData } from "@/lib/body-analysis/muscle-config";
import { analyzeFromMeasurements } from "@/lib/body-analysis/analyze-measurements";
import { analyzeFromStrength } from "@/lib/body-analysis/analyze-strength";
import { combineAnalyses, applyUserWeakPoints } from "@/lib/body-analysis/combine-analyses";
import BodyMap from "./BodyMap";
import BodyMapLegend from "./BodyMapLegend";
import MuscleDetailModal from "./MuscleDetailModal";

export default function BodyAnalysisSection() {
  const { profile, diagnosticHistory } = useStore();
  const [muscleData, setMuscleData] = useState<MuscleData[]>([]);
  const [selectedMuscle, setSelectedMuscle] = useState<MuscleData | null>(null);
  const [loading, setLoading] = useState(true);

  const lastEntry = diagnosticHistory[0] || null;

  useEffect(() => {
    if (!lastEntry) {
      setLoading(false);
      return;
    }

    const height = profile.height || 180;
    const weight = profile.weight || 80;

    // 1. Analyze from measurements
    const measurementResults = analyzeFromMeasurements(
      lastEntry.mensurations as Record<string, string>,
      height,
      weight
    );

    // 2. Analyze from strength
    const strengthResults = analyzeFromStrength(
      lastEntry.historique as Record<string, string>,
      weight
    );

    // 3. Combine
    let combined = combineAnalyses(measurementResults, strengthResults);

    // 4. Apply user weak points
    if (lastEntry.weakPoints && lastEntry.weakPoints.length > 0) {
      combined = applyUserWeakPoints(combined, lastEntry.weakPoints);
    }

    setMuscleData(combined);
    setLoading(false);
  }, [lastEntry, profile.height, profile.weight]);

  if (!lastEntry) return null;

  if (loading) {
    return (
      <Card>
        <div className="flex items-center gap-3 py-8 justify-center">
          <div className="w-5 h-5 border-2 border-[#00ff94] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-white/50">Analyse du corps en cours...</p>
        </div>
      </Card>
    );
  }

  const weakMuscles = muscleData.filter((m) => m.status === "weak");
  const improveMuscles = muscleData.filter((m) => m.status === "improve");
  const strongMuscles = muscleData.filter((m) => m.status === "strong");

  return (
    <div className="space-y-6">
      <SectionTitle>Analyse de ton corps</SectionTitle>
      <p className="text-xs text-white/40 -mt-4">
        Clique sur un muscle pour voir les détails et recommandations
      </p>

      {/* Body Map */}
      <Card>
        <BodyMap
          muscles={muscleData}
          onMuscleClick={setSelectedMuscle}
          view="both"
        />
      </Card>

      {/* Legend */}
      <Card>
        <BodyMapLegend
          muscles={muscleData}
          onMuscleSelect={setSelectedMuscle}
        />
      </Card>

      {/* Training priorities */}
      {(weakMuscles.length > 0 || improveMuscles.length > 0) && (
        <Card>
          <SectionTitle>Priorités d'entraînement</SectionTitle>
          <div className="space-y-2">
            {[...weakMuscles, ...improveMuscles].slice(0, 5).map((muscle, i) => (
              <button
                key={muscle.id}
                onClick={() => setSelectedMuscle(muscle)}
                className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors text-left"
              >
                <span className="text-[#00ff94] font-bold text-sm w-5">{i + 1}.</span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: muscle.status === "weak" ? "#ef4444" : "#f97316" }}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium text-white/80">{muscle.name}</p>
                  <p className="text-[10px] text-white/30">
                    {muscle.recommendedVolume ? `${muscle.recommendedVolume} séries/sem recommandées` : ""}
                    {muscle.priorityExercises?.[0] ? ` · ${muscle.priorityExercises[0]}` : ""}
                  </p>
                </div>
                <svg className="w-4 h-4 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-red-500/5 border border-red-500/10 text-center">
          <p className="text-xl font-bold text-red-400">{weakMuscles.length}</p>
          <p className="text-[10px] text-white/30 mt-0.5">Points faibles</p>
        </div>
        <div className="p-3 rounded-xl bg-orange-500/5 border border-orange-500/10 text-center">
          <p className="text-xl font-bold text-orange-400">{improveMuscles.length}</p>
          <p className="text-[10px] text-white/30 mt-0.5">À améliorer</p>
        </div>
        <div className="p-3 rounded-xl bg-green-500/5 border border-green-500/10 text-center">
          <p className="text-xl font-bold text-green-400">{strongMuscles.length}</p>
          <p className="text-[10px] text-white/30 mt-0.5">Points forts</p>
        </div>
      </div>

      {/* Modal */}
      {selectedMuscle && (
        <MuscleDetailModal
          muscle={selectedMuscle}
          onClose={() => setSelectedMuscle(null)}
        />
      )}
    </div>
  );
}
