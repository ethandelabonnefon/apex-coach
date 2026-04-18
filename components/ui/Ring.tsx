"use client";

import { cn } from "@/lib/utils";

export interface RingProps {
  value: number;
  max?: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  label?: string;
  sublabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export function Ring({
  value,
  max = 100,
  size = 96,
  strokeWidth = 6,
  color = "var(--accent)",
  trackColor = "rgba(255, 255, 255, 0.06)",
  label,
  sublabel,
  className,
  children,
}: RingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, value / max));
  const offset = circumference * (1 - pct);

  return (
    <div className={cn("inline-flex flex-col items-center gap-2", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="-rotate-90"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={trackColor}
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{
              transition: "stroke-dashoffset 0.6s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {children ?? (
            <>
              <span className="num text-lg font-semibold leading-none">
                {Math.round(pct * 100)}
              </span>
              <span className="label mt-0.5">%</span>
            </>
          )}
        </div>
      </div>
      {(label || sublabel) && (
        <div className="text-center">
          {label && <p className="text-xs font-medium text-text-primary">{label}</p>}
          {sublabel && <p className="text-[10px] text-text-tertiary">{sublabel}</p>}
        </div>
      )}
    </div>
  );
}
