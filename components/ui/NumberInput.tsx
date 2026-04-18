"use client";

import { cn } from "@/lib/utils";

type NumberInputSize = "md" | "lg" | "xl";

export interface NumberInputProps {
  value: number | string;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  size?: NumberInputSize;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

const sizes: Record<NumberInputSize, string> = {
  md: "text-2xl h-14 w-24",
  lg: "text-4xl h-16 w-32",
  xl: "text-5xl h-20 w-40",
};

export function NumberInput({
  value,
  onChange,
  unit,
  min,
  max,
  step,
  size = "lg",
  className,
  disabled,
  placeholder,
  ariaLabel,
}: NumberInputProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="number"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode="decimal"
        className={cn(
          "rounded-2xl border border-border-subtle bg-bg-tertiary text-center font-mono font-bold text-text-primary tabular-nums",
          "transition-all duration-200",
          "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          sizes[size],
          className
        )}
      />
      {unit && <span className="text-xl text-text-tertiary">{unit}</span>}
    </div>
  );
}
