"use client";

import type { MuscleData } from "@/lib/body-analysis/muscle-config";
import { STATUS_COLORS, STATUS_LABELS, STATUS_BG } from "@/lib/body-analysis/muscle-config";
import { Card, Button, SectionTitle } from "@/components/ui";

interface MuscleDetailModalProps {
  muscle: MuscleData;
  onClose: () => void;
}

export default function MuscleDetailModal({ muscle, onClose }: MuscleDetailModalProps) {
  const sourceLabels: Record<string, string> = {
    measurement: "Mensurations",
    photo: "Analyse photo IA",
    strength: "Ratios de force",
    user_input: "Signalé par l'utilisateur",
    combined: "Analyse combinée",
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#0f0f18] border border-white/10 rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: STATUS_COLORS[muscle.status] }} />
            <h2 className="text-lg font-bold text-white">{muscle.name}</h2>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors text-lg">
            ✕
          </button>
        </div>

        {/* Status badge */}
        <div className={`inline-flex px-3 py-1.5 rounded-lg border text-sm font-medium mb-4 ${STATUS_BG[muscle.status]}`}>
          {STATUS_LABELS[muscle.status]}
          {muscle.score && <span className="ml-2 text-white/40">({muscle.score}/4)</span>}
        </div>

        {/* Measurement */}
        {muscle.measurement && (
          <div className="bg-white/[0.04] rounded-xl p-4 mb-4">
            <p className="text-[10px] text-white/35 uppercase tracking-wider">Mensuration actuelle</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-white">
                {muscle.measurement} <span className="text-sm text-white/30 font-normal">{muscle.measurementUnit || "cm"}</span>
              </span>
              {muscle.previousMeasurement && (
                <span className={`text-sm font-medium ${muscle.measurement > muscle.previousMeasurement ? "text-green-400" : "text-red-400"}`}>
                  {muscle.measurement > muscle.previousMeasurement ? "↗" : "↘"}{" "}
                  {Math.abs(muscle.measurement - muscle.previousMeasurement).toFixed(1)} cm
                </span>
              )}
            </div>
          </div>
        )}

        {/* Reasoning */}
        {muscle.reasoning && (
          <div className="mb-4">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Pourquoi ce status ?</p>
            <p className="text-sm text-white/70 leading-relaxed">{muscle.reasoning}</p>
            {muscle.analysisSource && (
              <p className="text-[10px] text-white/20 mt-1.5">
                Source : {sourceLabels[muscle.analysisSource] || muscle.analysisSource}
              </p>
            )}
          </div>
        )}

        {/* Volume recommendations */}
        {(muscle.weeklyVolume || muscle.recommendedVolume) && (
          <div className="bg-white/[0.04] rounded-xl p-4 mb-4">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-3">Volume hebdomadaire</p>
            <div className="flex items-center gap-4">
              {muscle.weeklyVolume && (
                <div>
                  <p className="text-[10px] text-white/30">Actuel</p>
                  <p className="text-lg font-bold text-white">{muscle.weeklyVolume} <span className="text-xs text-white/30 font-normal">séries</span></p>
                </div>
              )}
              <div className="text-xl text-white/20">→</div>
              {muscle.recommendedVolume && (
                <div>
                  <p className="text-[10px] text-white/30">Recommandé</p>
                  <p className="text-lg font-bold text-[#00ff94]">{muscle.recommendedVolume} <span className="text-xs text-[#00ff94]/50 font-normal">séries</span></p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Priority exercises */}
        {muscle.priorityExercises && muscle.priorityExercises.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Exercices prioritaires</p>
            <div className="space-y-1.5">
              {muscle.priorityExercises.map((exercise, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-[#00ff94] text-xs">•</span>
                  <span className="text-white/70">{exercise}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Close button */}
        <Button onClick={onClose} className="w-full mt-2">
          Compris
        </Button>
      </div>
    </div>
  );
}
