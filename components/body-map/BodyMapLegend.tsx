"use client";

import type { MuscleData, MuscleStatus } from "@/lib/body-analysis/muscle-config";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/body-analysis/muscle-config";

interface BodyMapLegendProps {
  muscles: MuscleData[];
  onMuscleSelect?: (muscle: MuscleData) => void;
}

const STATUS_ORDER: MuscleStatus[] = ["weak", "improve", "normal", "strong"];

const STATUS_ICONS: Record<MuscleStatus, string> = {
  weak: "Priorité haute",
  improve: "À travailler",
  normal: "Équilibré",
  strong: "Continue comme ça",
  unknown: "",
};

export default function BodyMapLegend({ muscles, onMuscleSelect }: BodyMapLegendProps) {
  const grouped = STATUS_ORDER.reduce(
    (acc, status) => {
      acc[status] = muscles.filter((m) => m.status === status);
      return acc;
    },
    {} as Record<MuscleStatus, MuscleData[]>
  );

  return (
    <div className="space-y-4 mt-6">
      {STATUS_ORDER.map((status) => {
        const group = grouped[status];
        if (!group || group.length === 0) return null;

        return (
          <div key={status}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: STATUS_COLORS[status] }}
              />
              <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[status] }}>
                {STATUS_LABELS[status]}
              </span>
              <span className="text-[10px] text-white/25">— {STATUS_ICONS[status]}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {group.map((muscle) => (
                <button
                  key={muscle.id}
                  onClick={() => onMuscleSelect?.(muscle)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium border transition-all hover:brightness-125"
                  style={{
                    backgroundColor: `${STATUS_COLORS[status]}15`,
                    borderColor: `${STATUS_COLORS[status]}30`,
                    color: STATUS_COLORS[status],
                  }}
                >
                  {muscle.name}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {/* Unknown muscles */}
      {muscles.filter((m) => m.status === "unknown").length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
            <span className="text-xs text-white/30">Non évalués</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {muscles
              .filter((m) => m.status === "unknown")
              .map((muscle) => (
                <span key={muscle.id} className="px-2.5 py-1 rounded-lg text-xs text-white/25 bg-white/[0.03] border border-white/[0.06]">
                  {muscle.name}
                </span>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
