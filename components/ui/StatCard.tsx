"use client";

import { cn } from "@/lib/utils";

type StatColor = "default" | "accent" | "warning" | "error" | "info";
type Trend = "up" | "down" | "neutral";

export interface StatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: React.ReactNode;
  trend?: Trend;
  trendLabel?: string;
  color?: StatColor;
  className?: string;
}

const colorMap: Record<StatColor, string> = {
  default: "text-text-primary",
  accent: "text-accent",
  warning: "text-warning",
  error: "text-error",
  info: "text-info",
};

const trendIcon: Record<Trend, string> = {
  up: "↑",
  down: "↓",
  neutral: "→",
};

const trendColor: Record<Trend, string> = {
  up: "text-success",
  down: "text-error",
  neutral: "text-text-tertiary",
};

export function StatCard({
  label,
  value,
  unit,
  icon,
  trend,
  trendLabel,
  color = "default",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-bg-secondary p-4 transition-colors duration-200",
        className
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-text-tertiary">
          {label}
        </span>
        {icon && <span className="text-lg leading-none">{icon}</span>}
      </div>

      <div className="flex items-baseline gap-1">
        <span
          className={cn(
            "font-mono text-2xl font-bold tabular-nums",
            colorMap[color]
          )}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-text-tertiary">{unit}</span>}
      </div>

      {trend && (
        <div
          className={cn(
            "mt-1 flex items-center gap-1 text-xs",
            trendColor[trend]
          )}
        >
          <span aria-hidden>{trendIcon[trend]}</span>
          {trendLabel && <span>{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
