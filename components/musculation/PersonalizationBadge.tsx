"use client";

import type { ActiveProgram } from "@/lib/store";

interface PersonalizationBadgeProps {
  program: ActiveProgram;
  onShowReasoning?: () => void;
}

export default function PersonalizationBadge({ program, onShowReasoning }: PersonalizationBadgeProps) {
  const weakMuscles = Object.entries(program.volumeDistribution)
    .filter(([, data]) => data.status === "weak" || data.status === "improve")
    .map(([muscle]) => muscle);

  return (
    <div className="bg-gradient-to-r from-[var(--accent-2)]/10 to-[var(--running)]/10 rounded-2xl p-4 border border-[var(--accent-2)]/15">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🎯</span>
        <span className="text-sm font-semibold text-text-primary">Programme personnalisé pour toi</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[var(--success)] text-xs">✓</span>
          <span className="text-xs text-text-secondary">Adapté à {program.daysPerWeek} jours/semaine — Split {program.splitType.replace(/_/g, " ")}</span>
        </div>

        {weakMuscles.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[var(--success)] text-xs">✓</span>
            <span className="text-xs text-text-secondary">
              Focus sur {weakMuscles.slice(0, 3).join(", ")}{weakMuscles.length > 3 ? ` +${weakMuscles.length - 3}` : ""} (points faibles)
            </span>
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-[var(--success)] text-xs">✓</span>
          <span className="text-xs text-text-secondary">Exercices choisis pour ta morphologie</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[var(--success)] text-xs">✓</span>
          <span className="text-xs text-text-secondary">Notes T1D incluses par séance</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border-subtle flex items-center justify-between">
        <span className="text-[10px] text-text-disabled">
          Généré le {new Date(program.createdAt).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })} · v{program.version}
        </span>
        {onShowReasoning && (
          <button onClick={onShowReasoning} className="text-[10px] text-[var(--success)] hover:text-[var(--success)]/80 transition-colors">
            Voir le raisonnement
          </button>
        )}
      </div>
    </div>
  );
}
