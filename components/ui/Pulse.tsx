"use client";

import { cn } from "@/lib/utils";

export interface PulseProps {
  tone?: "accent" | "success" | "warning" | "error" | "info";
  size?: "sm" | "md" | "lg";
  className?: string;
}

const toneClass: Record<NonNullable<PulseProps["tone"]>, string> = {
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
};

const sizeClass: Record<NonNullable<PulseProps["size"]>, string> = {
  sm: "h-1.5 w-1.5",
  md: "h-2 w-2",
  lg: "h-2.5 w-2.5",
};

export function Pulse({ tone = "accent", size = "md", className }: PulseProps) {
  return (
    <span
      className={cn(
        "relative inline-flex rounded-full",
        sizeClass[size],
        toneClass[tone],
        className
      )}
      aria-hidden
    >
      <span
        className={cn(
          "absolute inset-0 rounded-full opacity-60 animate-ping",
          toneClass[tone]
        )}
      />
    </span>
  );
}
