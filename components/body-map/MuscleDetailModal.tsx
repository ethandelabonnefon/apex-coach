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
        className="bg-bg-elevated border border-border-default rounded-2xl p-6 max-w-md w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: STATUS_COLORS[muscle.status] }} />
            <h2 className="text-lg font-bold text-text-primary">{muscle.name}</h2>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors text-lg">
            ✕
          </button>
        </div>

        {/* Status badge */}
        <div className={`inline-flex px-3 py-1.5 rounded-lg border text-sm font-medium mb-4 ${STATUS_BG[muscle.status]}`}>
          {STATUS_LABELS[muscle.status]}
          {muscle.score && <span className="ml-2 text-text-tertiary">({muscle.score}/4)</span>}
        </div>

        {/* Measurement */}
        {muscle.measurement && (
          <div className="bg-bg-hover rounded-xl p-4 mb-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider">Mensuration actuelle</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-text-primary">
                {muscle.measurement} <span className="text-sm text-text-tertiary font-normal">{muscle.measurementUnit || "cm"}</span>
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
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1">Pourquoi ce status ?</p>
            <p className="text-sm text-text-secondary leading-relaxed">{muscle.reasoning}</p>
            {muscle.analysisSource && (
              <p className="text-[10px] text-text-disabled mt-1.5">
                Source : {sourceLabels[muscle.analysisSource] || muscle.analysisSource}
              </p>
            )}
          </div>
        )}

        {/* Volume recommendations */}
        {(muscle.weeklyVolume || muscle.recommendedVolume) && (
          <div className="bg-bg-hover rounded-xl p-4 mb-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-3">Volume hebdomadaire</p>
            <div className="flex items-center gap-4">
              {muscle.weeklyVolume && (
                <div>
                  <p className="text-[10px] text-text-tertiary">Actuel</p>
                  <p className="text-lg font-bold text-text-primary">{muscle.weeklyVolume} <span className="text-xs text-text-tertiary font-normal">séries</span></p>
                </div>
              )}
              <div className="text-xl text-text-disabled">→</div>
              {muscle.recommendedVolume && (
                <div>
                  <p className="text-[10px] text-text-tertiary">Recommandé</p>
                  <p className="text-lg font-bold text-[var(--success)]">{muscle.recommendedVolume} <span className="text-xs text-[var(--success)]/50 font-normal">séries</span></p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Priority exercises */}
        {muscle.priorityExercises && muscle.priorityExercises.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-2">Exercices prioritaires</p>
            <div className="space-y-1.5">
              {muscle.priorityExercises.map((exercise, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="text-[var(--success)] text-xs">•</span>
                  <span className="text-text-secondary">{exercise}</span>
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
