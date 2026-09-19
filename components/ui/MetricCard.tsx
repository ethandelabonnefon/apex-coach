"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";
import { Sparkline } from "./Sparkline";

type Tone = "default" | "accent" | "accent-2" | "muscu" | "running" | "nutrition" | "diabete" | "warning" | "error";

const toneColor: Record<Tone, string> = {
  default: "var(--text-primary)",
  accent: "var(--accent)",
  "accent-2": "var(--accent-2)",
  muscu: "var(--muscu)",
  running: "var(--running)",
  nutrition: "var(--nutrition)",
  diabete: "var(--diabete)",
  warning: "var(--warning)",
  error: "var(--error)",
};

const toneText: Record<Tone, string> = {
  default: "text-text-primary",
  accent: "text-accent",
  "accent-2": "text-accent-2",
  muscu: "text-muscu",
  running: "text-running",
  nutrition: "text-nutrition",
  diabete: "text-diabete",
  warning: "text-warning",
  error: "text-error",
};

export interface MetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  tone?: Tone;
  sparkline?: number[];
  delta?: string;
  deltaDirection?: "up" | "down" | "flat";
  hint?: string;
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  (
    {
      className,
      label,
      value,
      unit,
      tone = "default",
      sparkline,
      delta,
      deltaDirection = "flat",
      hint,
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
      <div
        ref={ref}
        className={cn(
          "relative surface-1 p-4 overflow-hidden transition-colors hover:bg-bg-tertiary",
          className
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <span className="label">{label}</span>
          {delta && (
            <span className={cn("num text-[11px] font-medium", deltaColor)}>
              {deltaGlyph} {delta}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className={cn("num text-3xl font-semibold leading-none", toneText[tone])}>
            {value}
          </span>
          {unit && (
            <span className="text-xs text-text-tertiary font-mono tabular-nums">
              {unit}
            </span>
          )}
        </div>
        {hint && (
          <p className="mt-2 text-[11px] text-text-tertiary leading-snug">{hint}</p>
        )}
        {sparkline && sparkline.length > 1 && (
          <div className="mt-3 -mx-1">
            <Sparkline
              data={sparkline}
              color={toneColor[tone]}
              height={28}
              width={160}
            />
          </div>
        )}
      </div>
    );
  }
);

MetricCard.displayName = "MetricCard";
