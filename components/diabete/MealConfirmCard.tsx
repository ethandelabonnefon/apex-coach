"use client";

/**
 * Carte de confirmation des glucides réellement mangés (T+15 min → T+3 h).
 *
 * État DÉRIVÉ des insulinLogs : aucun état persistant supplémentaire. La
 * carte disparaît dès que l'injection porte carbsConfirmedAt ou
 * carbsUncertain.
 *
 * Si la confirmation révèle un déficit, la carte se transforme en
 * proposition d'appoint plutôt que de disparaître. Aucune dose n'est
 * jamais appliquée sans clic explicite + confirm().
 */

import { useState } from "react";
import { Check, HelpCircle, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import type { InsulinLog } from "@/types";

export interface MealConfirmCardProps {
  log: InsulinLog;
  onConfirm: (values: {
    carbs: number;
    fat: number;
    protein: number;
  }) => void;
  onUncertain: () => void;
}

export function MealConfirmCard({
  log,
  onConfirm,
  onUncertain,
}: MealConfirmCardProps) {
  const [carbs, setCarbs] = useState(log.carbsGrams);
  const [fat, setFat] = useState(log.fatGrams ?? 0);
  const [protein, setProtein] = useState(log.proteinGrams ?? 0);
  const [showMacros, setShowMacros] = useState(false);

  const injectedLabel = new Date(log.injectedAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="surface-1 rounded-2xl p-5 border border-accent-2/25 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <UtensilsCrossed className="w-4 h-4 text-accent-2" />
        <h2 className="text-base font-semibold text-text-primary">
          Tu as mangé combien finalement ?
        </h2>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Injection de {log.units} U à {injectedLabel} pour ~{log.carbsGrams} g
        estimés.
      </p>

      <Button
        className="w-full mb-3"
        onClick={() =>
          onConfirm({
            carbs: log.carbsGrams,
            fat: log.fatGrams ?? 0,
            protein: log.proteinGrams ?? 0,
          })
        }
      >
        <Check className="w-4 h-4 mr-1.5" />
        C&apos;était bien {log.carbsGrams} g
      </Button>

      <div className="mb-3">
        <p className="label mb-1">Corriger les glucides</p>
        <NumberInput
          value={carbs}
          onChange={setCarbs}
          step={5}
          min={0}
          unit="g"
          ariaLabel="Glucides réellement mangés"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMacros((v) => !v)}
        className="text-xs text-text-tertiary underline mb-3 tap-scale"
      >
        {showMacros ? "Masquer" : "Ajuster"} lipides & protéines
      </button>

      {showMacros && (
        <div className="grid grid-cols-2 gap-3 mb-3 animate-slide-up">
          <div>
            <p className="label mb-1">Lipides</p>
            <NumberInput
              value={fat}
              onChange={setFat}
              step={5}
              min={0}
              unit="g"
              size="md"
              ariaLabel="Lipides confirmés"
            />
          </div>
          <div>
            <p className="label mb-1">Protéines</p>
            <NumberInput
              value={protein}
              onChange={setProtein}
              step={5}
              min={0}
              unit="g"
              size="md"
              ariaLabel="Protéines confirmées"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={() => onConfirm({ carbs, fat, protein })}>
          Enregistrer
        </Button>
        <Button variant="ghost" onClick={onUncertain}>
          <HelpCircle className="w-4 h-4 mr-1.5" />
          Je ne sais pas
        </Button>
      </div>
    </section>
  );
}
