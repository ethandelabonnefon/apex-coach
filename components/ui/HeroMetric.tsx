"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export interface HeroMetricProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  tone?: "default" | "accent" | "accent-2" | "warning" | "error";
  size?: "md" | "lg" | "xl";
  subtitle?: string;
}

const toneClass: Record<NonNullable<HeroMetricProps["tone"]>, string> = {
  default: "text-text-primary",
  accent: "text-accent",
  "accent-2": "text-accent-2",
  warning: "text-warning",
  error: "text-error",
};

const sizeClass: Record<NonNullable<HeroMetricProps["size"]>, string> = {
  md: "text-4xl leading-none",
  lg: "text-5xl leading-none",
  xl: "text-6xl sm:text-7xl leading-none",
};

export const HeroMetric = forwardRef<HTMLDivElement, HeroMetricProps>(
  (
    {
      className,
      label,
      value,
      unit,
      delta,
      deltaDirection = "flat",
      tone = "default",
      size = "lg",
      subtitle,
      ...props
    },
    ref
  ) => {
    const deltaColor =
      deltaDirection === "up"
        ? "text-success"
        : deltaDirection === "down"
        ? "text-error"
        : "text-text-tertiary";
    const deltaGlyph =
      deltaDirection === "up" ? "↑" : deltaDirection === "down" ? "↓" : "→";

    return (
      <div ref={ref} className={cn("flex flex-col gap-2", className)} {...props}>
        <div className="flex items-center gap-2">
          <span className="label">{label}</span>
          {delta && (
            <span className={cn("num text-[11px] font-medium", deltaColor)}>
              {deltaGlyph} {delta}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-2">
          <span className={cn("num-hero", sizeClass[size], toneClass[tone])}>
            {value}
          </span>
          {unit && (
            <span className="text-sm text-text-tertiary font-mono tabular-nums">
              {unit}
            </span>
          )}
        </div>
        {subtitle && (
          <p className="text-xs text-text-secondary">{subtitle}</p>
        )}
      </div>
    );
  }
);

HeroMetric.displayName = "HeroMetric";
