"use client";

/**
 * Proposition d'appoint d'insuline quand les glucides restants ne sont pas
 * couverts. Rien n'est jamais appliqué sans clic explicite : la validation
 * repasse par un confirm() natif côté page.
 */

import { Syringe } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TopUpSuggestion } from "@/lib/carbs-on-board";

export interface TopUpCardProps {
  topUp: TopUpSuggestion;
  onAccept: (units: number) => void;
  onDismiss: () => void;
}

export function TopUpCard({ topUp, onAccept, onDismiss }: TopUpCardProps) {
  return (
    <section className="panel border border-warning/25 mb-4">
      <div className="panel-hd">
        <div className="flex items-center gap-2">
          <Syringe className="w-4 h-4 text-warning" />
          <h2>
          Appoint suggéré
        </h2>
        </div>
      </div>
      <p className="text-sm text-text-secondary mb-4">{topUp.reason}</p>
      <div className="flex items-baseline gap-1.5 mb-4">
        <span className="num-hero text-5xl font-semibold text-warning leading-none">
          {topUp.units}
        </span>
        <span className="text-xs text-text-tertiary">U</span>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onAccept(topUp.units)}>
          Valider {topUp.units} U
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Plus tard
        </Button>
      </div>
    </section>
  );
}
