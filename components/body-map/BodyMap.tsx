"use client";

import { useState } from "react";
import type { MuscleData } from "@/lib/body-analysis/muscle-config";
import { STATUS_COLORS } from "@/lib/body-analysis/muscle-config";
import MuscleTooltip from "./MuscleTooltip";

interface BodyMapProps {
  muscles: MuscleData[];
  onMuscleClick?: (muscle: MuscleData) => void;
  view?: "front" | "back" | "both";
}

export default function BodyMap({ muscles, onMuscleClick, view = "both" }: BodyMapProps) {
  const [hoveredMuscle, setHoveredMuscle] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const getColor = (id: string) => {
    const m = muscles.find((m) => m.id === id);
    return m ? STATUS_COLORS[m.status] : STATUS_COLORS.unknown;
  };

  const getOpacity = (id: string) => {
    const m = muscles.find((m) => m.id === id);
    return m?.status === "unknown" ? 0.3 : 0.7;
  };

  const handleHover = (id: string, e: React.MouseEvent) => {
    setHoveredMuscle(id);
    const rect = (e.target as SVGElement).closest("svg")?.getBoundingClientRect();
    if (rect) {
      setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top - 10 });
    }
  };

  const handleClick = (id: string) => {
    const m = muscles.find((m) => m.id === id);
    if (m && onMuscleClick) onMuscleClick(m);
  };

  const muscleProps = (id: string) => ({
    fill: getColor(id),
    fillOpacity: getOpacity(id),
    className: "cursor-pointer transition-all duration-200 hover:brightness-125 hover:fill-opacity-100",
    onMouseEnter: (e: React.MouseEvent) => handleHover(id, e),
    onMouseLeave: () => setHoveredMuscle(null),
    onClick: () => handleClick(id),
    stroke: hoveredMuscle === id ? "#fff" : "transparent",
    strokeWidth: hoveredMuscle === id ? 1.5 : 0,
  });

  const hoveredData = hoveredMuscle ? muscles.find((m) => m.id === hoveredMuscle) : null;

  return (
    <div className="relative">
      <div className="flex gap-4 sm:gap-8 justify-center items-start">
        {/* FRONT VIEW */}
        {(view === "front" || view === "both") && (
          <div className="relative">
            <p className="text-center text-[10px] text-white/30 uppercase tracking-wider mb-2">Face</p>
            <svg viewBox="0 0 200 420" className="w-36 sm:w-44 h-auto">
              {/* Body outline */}
              <ellipse cx="100" cy="30" rx="22" ry="25" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="1" />
              <rect x="88" y="53" width="24" height="14" rx="4" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="0.5" />

              {/* Trapèzes */}
              <path d="M 62 68 L 88 68 L 88 88 L 52 98 Z" {...muscleProps("traps")} />
              <path d="M 138 68 L 112 68 L 112 88 L 148 98 Z" {...muscleProps("traps")} />

              {/* Épaules */}
              <ellipse cx="45" cy="93" rx="16" ry="20" {...muscleProps("shoulders")} />
              <ellipse cx="155" cy="93" rx="16" ry="20" {...muscleProps("shoulders")} />

              {/* Pectoraux */}
              <path d="M 62 88 Q 82 83 100 88 Q 82 126 62 112 Z" {...muscleProps("chest")} />
              <path d="M 138 88 Q 118 83 100 88 Q 118 126 138 112 Z" {...muscleProps("chest")} />

              {/* Biceps */}
              <ellipse cx="35" cy="138" rx="10" ry="27" {...muscleProps("biceps")} />
              <ellipse cx="165" cy="138" rx="10" ry="27" {...muscleProps("biceps")} />

              {/* Avant-bras */}
              <ellipse cx="30" cy="192" rx="7" ry="24" {...muscleProps("forearms")} />
              <ellipse cx="170" cy="192" rx="7" ry="24" {...muscleProps("forearms")} />

              {/* Abdominaux */}
              <rect x="77" y="128" width="46" height="66" rx="6" {...muscleProps("abs")} />
              {/* Ab lines */}
              <line x1="100" y1="132" x2="100" y2="190" stroke="#0a0a0f" strokeWidth="1.5" strokeOpacity="0.5" />
              <line x1="80" y1="148" x2="120" y2="148" stroke="#0a0a0f" strokeWidth="0.8" strokeOpacity="0.4" />
              <line x1="80" y1="166" x2="120" y2="166" stroke="#0a0a0f" strokeWidth="0.8" strokeOpacity="0.4" />
              <line x1="80" y1="184" x2="120" y2="184" stroke="#0a0a0f" strokeWidth="0.8" strokeOpacity="0.4" />

              {/* Obliques */}
              <path d="M 62 128 Q 72 158 67 196 L 77 196 L 77 128 Z" {...muscleProps("obliques")} />
              <path d="M 138 128 Q 128 158 133 196 L 123 196 L 123 128 Z" {...muscleProps("obliques")} />

              {/* Quadriceps */}
              <path d="M 67 208 L 87 208 L 90 308 L 62 308 Z" rx="4" {...muscleProps("quads")} />
              <path d="M 133 208 L 113 208 L 110 308 L 138 308 Z" rx="4" {...muscleProps("quads")} />

              {/* Mollets face */}
              <ellipse cx="76" cy="348" rx="10" ry="32" {...muscleProps("calves")} />
              <ellipse cx="124" cy="348" rx="10" ry="32" {...muscleProps("calves")} />

              {/* Pieds */}
              <ellipse cx="76" cy="395" rx="12" ry="6" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="0.5" />
              <ellipse cx="124" cy="395" rx="12" ry="6" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="0.5" />
            </svg>
          </div>
        )}

        {/* BACK VIEW */}
        {(view === "back" || view === "both") && (
          <div className="relative">
            <p className="text-center text-[10px] text-white/30 uppercase tracking-wider mb-2">Dos</p>
            <svg viewBox="0 0 200 420" className="w-36 sm:w-44 h-auto">
              {/* Body outline */}
              <ellipse cx="100" cy="30" rx="22" ry="25" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="1" />
              <rect x="88" y="53" width="24" height="14" rx="4" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="0.5" />

              {/* Trapèzes dos */}
              <path d="M 72 68 L 128 68 L 138 98 L 100 118 L 62 98 Z" {...muscleProps("traps")} />

              {/* Épaules arrière */}
              <ellipse cx="45" cy="93" rx="16" ry="20" {...muscleProps("rear_delts")} />
              <ellipse cx="155" cy="93" rx="16" ry="20" {...muscleProps("rear_delts")} />

              {/* Dorsaux */}
              <path d="M 62 98 L 100 118 L 100 198 L 77 198 L 52 148 Z" {...muscleProps("lats")} />
              <path d="M 138 98 L 100 118 L 100 198 L 123 198 L 148 148 Z" {...muscleProps("lats")} />

              {/* Triceps */}
              <ellipse cx="35" cy="138" rx="10" ry="27" {...muscleProps("triceps")} />
              <ellipse cx="165" cy="138" rx="10" ry="27" {...muscleProps("triceps")} />

              {/* Avant-bras */}
              <ellipse cx="30" cy="192" rx="7" ry="24" {...muscleProps("forearms")} />
              <ellipse cx="170" cy="192" rx="7" ry="24" {...muscleProps("forearms")} />

              {/* Lombaires */}
              <rect x="82" y="168" width="36" height="36" rx="4" {...muscleProps("lower_back")} />

              {/* Fessiers */}
              <ellipse cx="82" cy="222" rx="18" ry="16" {...muscleProps("glutes")} />
              <ellipse cx="118" cy="222" rx="18" ry="16" {...muscleProps("glutes")} />

              {/* Ischio-jambiers */}
              <path d="M 62 243 L 90 243 L 87 338 L 57 338 Z" {...muscleProps("hamstrings")} />
              <path d="M 138 243 L 110 243 L 113 338 L 143 338 Z" {...muscleProps("hamstrings")} />

              {/* Mollets */}
              <ellipse cx="72" cy="358" rx="12" ry="28" {...muscleProps("calves")} />
              <ellipse cx="128" cy="358" rx="12" ry="28" {...muscleProps("calves")} />

              {/* Pieds */}
              <ellipse cx="72" cy="398" rx="12" ry="6" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="0.5" />
              <ellipse cx="128" cy="398" rx="12" ry="6" fill="#1a1a2e" stroke="#2a2a3e" strokeWidth="0.5" />
            </svg>
          </div>
        )}
      </div>

      {/* Tooltip */}
      {hoveredData && (
        <MuscleTooltip muscle={hoveredData} />
      )}
    </div>
  );
}
