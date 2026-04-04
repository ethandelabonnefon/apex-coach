"use client";

import type { MuscleData } from "@/lib/body-analysis/muscle-config";
import { STATUS_COLORS, STATUS_LABELS } from "@/lib/body-analysis/muscle-config";

interface MuscleTooltipProps {
  muscle: MuscleData;
}

export default function MuscleTooltip({ muscle }: MuscleTooltipProps) {
  return (
    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full mt-2 z-20 pointer-events-none">
      <div className="bg-[#12121a] border border-white/10 rounded-xl px-3 py-2 shadow-xl min-w-[160px]">
        <div className="flex items-center gap-2 mb-1">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: STATUS_COLORS[muscle.status] }}
          />
          <span className="text-sm font-medium text-white">{muscle.name}</span>
        </div>
        <p className="text-[10px] font-medium" style={{ color: STATUS_COLORS[muscle.status] }}>
          {STATUS_LABELS[muscle.status]}
        </p>
        {muscle.measurement && (
          <p className="text-[10px] text-white/40 mt-0.5">
            {muscle.measurement} {muscle.measurementUnit || "cm"}
          </p>
        )}
      </div>
    </div>
  );
}
