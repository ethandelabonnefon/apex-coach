"use client";

import { cn } from "@/lib/utils";

type ProgressSize = "sm" | "md" | "lg";
type ProgressColor = "accent" | "warning" | "error" | "info" | "success";

export interface ProgressProps {
  value: number;
  max?: number;
  size?: ProgressSize;
  color?: ProgressColor;
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const sizes: Record<ProgressSize, string> = {
  sm: "h-1",
  md: "h-2",
  lg: "h-3",
};

const colors: Record<ProgressColor, string> = {
  accent: "bg-accent",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  success: "bg-success",
};

export function Progress({
  value,
  max = 100,
  size = "md",
  color = "accent",
  showLabel = false,
  label,
  className,
}: ProgressProps) {
  const safeMax = max <= 0 ? 100 : max;
  const percentage = Math.max(0, Math.min(100, (value / safeMax) * 100));

  return (
    <div className={cn("space-y-1.5", className)}>
      {(showLabel || label) && (
        <div className="flex items-center justify-between text-xs text-text-tertiary">
          <span>{label ?? `${Math.round(percentage)}%`}</span>
          {showLabel && !label && (
            <span className="font-mono tabular-nums">
              {value}
              <span className="text-text-tertiary">/{max}</span>
            </span>
          )}
        </div>
      )}

      <div
        role="progressbar"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={safeMax}
        className={cn(
          "w-full overflow-hidden rounded-full bg-bg-tertiary",
          sizes[size]
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500 ease-out",
            colors[color]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
