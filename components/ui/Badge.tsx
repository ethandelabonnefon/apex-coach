"use client";

import { cn } from "@/lib/utils";

type BadgeVariant =
  | "default"
  | "success"
  | "warning"
  | "error"
  | "info"
  | "accent"
  | "muscu"
  | "running"
  | "nutrition"
  | "diabete";

type BadgeSize = "sm" | "md";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
}

const variants: Record<BadgeVariant, string> = {
  default: "bg-bg-tertiary text-text-secondary",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  error: "bg-error/10 text-error",
  info: "bg-info/10 text-info",
  accent: "bg-accent/10 text-accent",
  muscu: "bg-muscu/10 text-muscu",
  running: "bg-running/10 text-running",
  nutrition: "bg-nutrition/10 text-nutrition",
  diabete: "bg-diabete/10 text-diabete",
};

const dotColors: Record<BadgeVariant, string> = {
  default: "bg-text-tertiary",
  success: "bg-success",
  warning: "bg-warning",
  error: "bg-error",
  info: "bg-info",
  accent: "bg-accent",
  muscu: "bg-muscu",
  running: "bg-running",
  nutrition: "bg-nutrition",
  diabete: "bg-diabete",
};

const sizes: Record<BadgeSize, string> = {
  sm: "px-2 py-0.5 text-xs gap-1",
  md: "px-3 py-1 text-sm gap-1.5",
};

export function Badge({
  children,
  variant = "default",
  size = "sm",
  dot = false,
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 rounded-full", dotColors[variant])}
        />
      )}
      {children}
    </span>
  );
}
