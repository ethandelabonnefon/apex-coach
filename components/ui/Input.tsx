"use client";

import { forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  icon?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, hint, icon, suffix, id, ...props },
    ref
  ) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const describedBy = error
      ? `${inputId}-error`
      : hint
        ? `${inputId}-hint`
        : undefined;

    return (
      <div className="space-y-2">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-secondary"
          >
            {label}
          </label>
        )}

        <div className="relative">
          {icon && (
            <span
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
            >
              {icon}
            </span>
          )}

          <input
            ref={ref}
            id={inputId}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cn(
              "w-full rounded-xl border border-border-subtle bg-bg-tertiary px-4 py-3",
              "text-text-primary placeholder:text-text-tertiary",
              "transition-all duration-200",
              "focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20",
              "disabled:cursor-not-allowed disabled:opacity-50",
              icon && "pl-10",
              suffix && "pr-10",
              error &&
                "border-error focus:border-error focus:ring-error/20",
              className
            )}
            {...props}
          />

          {suffix && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">
              {suffix}
            </span>
          )}
        </div>

        {error && (
          <p id={`${inputId}-error`} className="text-sm text-error">
            {error}
          </p>
        )}

        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-sm text-text-tertiary">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
