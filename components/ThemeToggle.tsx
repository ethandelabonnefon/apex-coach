"use client";

/**
 * ThemeToggle — contrôle segmenté Système / Clair / Sombre.
 * Respecte la préférence système par défaut, override persistant.
 * Voir hooks/useTheme.ts pour la logique.
 */

import { Monitor, Sun, Moon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTheme, type ThemeChoice } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: LucideIcon }[] = [
  { value: "system", label: "Système", Icon: Monitor },
  { value: "light", label: "Clair", Icon: Sun },
  { value: "dark", label: "Sombre", Icon: Moon },
];

export function ThemeToggle({ className }: { className?: string }) {
  const { choice, setChoice, mounted } = useTheme();

  return (
    <div
      role="radiogroup"
      aria-label="Thème de l'interface"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-pill bg-bg-tertiary p-0.5",
        className
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        // Avant hydratation, aucun état actif (évite un mismatch SSR).
        const active = mounted && choice === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            title={label}
            onClick={() => setChoice(value)}
            className={cn(
              "flex h-8 w-9 items-center justify-center rounded-pill transition-colors tap-scale",
              active
                ? "bg-bg-secondary text-accent shadow-[var(--card-shadow)]"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            <Icon size={15} strokeWidth={2} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
