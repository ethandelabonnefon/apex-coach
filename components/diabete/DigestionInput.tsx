"use client";

/**
 * DigestionInput — déclaration manuelle « ce que tu digères » (Night Brain).
 *
 * Permet à Ethan de dire ce qu'il a actuellement dans le ventre (glucides /
 * lipides / protéines + insuline prise + il y a combien de temps). Alimente
 * le plan nuit (prédiction FPU/glucides) et déclenche l'alerte « tu as
 * peut-être trop mangé » si l'insuline ne couvre pas les glucides.
 *
 * Visible en soirée, juste au-dessus du Night Brain.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { Utensils, Check, Trash2, ChevronDown } from "lucide-react";

/** Repas déjà loggé (via le calculateur de bolus) proposé en pré-remplissage. */
export interface SuggestedMeal {
  carbsGrams: number;
  fatGrams: number;
  proteinGrams: number;
  insulinUnits: number;
  minsAgo: number;
  timeLabel: string;
}

interface DigestionInputProps {
  /** Ratio glucides du soir (g par U) pour le hint de couverture live. */
  gramsPerU?: number;
  /** Repas loggé à reprendre automatiquement (dîner + macros). */
  suggestedMeal?: SuggestedMeal | null;
}

export default function DigestionInput({ gramsPerU, suggestedMeal }: DigestionInputProps) {
  const manualDigestion = useStore((s) => s.manualDigestion);
  const setManualDigestion = useStore((s) => s.setManualDigestion);

  const [open, setOpen] = useState(false);
  const [carbs, setCarbs] = useState(0);
  const [fat, setFat] = useState(0);
  const [protein, setProtein] = useState(0);
  const [insulin, setInsulin] = useState(0);
  const [minsAgo, setMinsAgo] = useState(0);
  // true si les champs viennent du repas loggé (pas encore d'ajout manuel)
  const [fromLoggedMeal, setFromLoggedMeal] = useState(false);
  // Hydratation une seule fois (sinon le tick 60s écraserait les saisies)
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (hydratedRef.current) return;
    if (manualDigestion) {
      // Un repas est déjà déclaré à la main → on le reprend.
      setCarbs(manualDigestion.carbsGrams);
      setFat(manualDigestion.fatGrams);
      setProtein(manualDigestion.proteinGrams);
      setInsulin(manualDigestion.insulinUnits);
      setMinsAgo(
        Math.max(0, Math.round((Date.now() - new Date(manualDigestion.eatenAt).getTime()) / 60000)),
      );
      setFromLoggedMeal(false);
      setOpen(true);
      hydratedRef.current = true;
    } else if (suggestedMeal) {
      // Sinon on pré-remplit avec le repas loggé pour qu'Ethan n'ait qu'à
      // ajouter son en-cas par-dessus (sans perdre le FPU du dîner).
      setCarbs(suggestedMeal.carbsGrams);
      setFat(suggestedMeal.fatGrams);
      setProtein(suggestedMeal.proteinGrams);
      setInsulin(suggestedMeal.insulinUnits);
      setMinsAgo(suggestedMeal.minsAgo);
      setFromLoggedMeal(true);
      hydratedRef.current = true;
    }
  }, [manualDigestion, suggestedMeal]);

  const coverageHint = useMemo(() => {
    if (!gramsPerU || gramsPerU <= 0 || carbs <= 0) return null;
    const expected = carbs / gramsPerU;
    const delta = insulin - expected;
    if (delta <= -1.5)
      return {
        tone: "text-warning",
        text: `Sous-dosé : ${carbs}g ≈ ${expected.toFixed(1).replace(".", ",")}U, tu as pris ${insulin
          .toFixed(1)
          .replace(".", ",")}U → tu vas monter.`,
      };
    if (delta >= 1.5)
      return {
        tone: "text-info",
        text: `Sur-dosé : ${insulin.toFixed(1).replace(".", ",")}U pour ${carbs}g → risque de baisse.`,
      };
    return {
      tone: "text-success",
      text: `Bien couvert : ${insulin.toFixed(1).replace(".", ",")}U pour ${carbs}g.`,
    };
  }, [carbs, insulin, gramsPerU]);

  function handleSave() {
    if (carbs <= 0 && fat <= 0 && protein <= 0) return;
    const eatenAt = new Date(Date.now() - minsAgo * 60000).toISOString();
    setManualDigestion({
      carbsGrams: carbs,
      fatGrams: fat,
      proteinGrams: protein,
      insulinUnits: insulin,
      eatenAt,
    });
  }

  function handleClear() {
    setManualDigestion(null);
    setCarbs(0);
    setFat(0);
    setProtein(0);
    setInsulin(0);
    setMinsAgo(0);
    setFromLoggedMeal(false);
    // Autorise un nouveau pré-remplissage depuis le repas loggé.
    hydratedRef.current = false;
  }

  // Toute édition manuelle = on n'est plus "juste le repas loggé".
  const onEdit = (setter: (v: number) => void) => (v: number) => {
    setter(v);
    setFromLoggedMeal(false);
  };

  return (
    <section className="surface-1 rounded-3xl p-5 mb-4 border border-border-subtle">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 min-w-0 text-left tap-scale"
        >
          <div className="shrink-0 w-9 h-9 rounded-xl bg-bg-tertiary flex items-center justify-center">
            <Utensils className="w-4 h-4 text-text-secondary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-text-primary leading-tight">
              Ce que tu digères
            </h2>
            <p className="text-[11px] text-text-tertiary mt-0.5 truncate">
              {manualDigestion
                ? `${manualDigestion.carbsGrams}g gluc · ${manualDigestion.fatGrams}g lip · ${manualDigestion.proteinGrams}g prot · ${manualDigestion.insulinUnits}U`
                : suggestedMeal
                  ? `Ton repas de ${suggestedMeal.timeLabel} est repris — ajoute un en-cas`
                  : "Déclare ce que tu as mangé pour que le plan nuit en tienne compte"}
            </p>
          </div>
        </button>
        <ChevronDown
          className={`w-4 h-4 text-text-tertiary shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          onClick={() => setOpen((v) => !v)}
        />
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          {fromLoggedMeal && suggestedMeal && (
            <p className="text-[11px] text-accent-2 leading-snug">
              Repris de ton repas loggé à {suggestedMeal.timeLabel}. Ajoute ton
              en-cas (glucides + insuline si tu en as fait) puis enregistre.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Glucides (g)" value={carbs} onChange={onEdit(setCarbs)} step={5} />
            <Field label="Insuline prise (U)" value={insulin} onChange={onEdit(setInsulin)} step={1} decimal />
            <Field label="Lipides (g)" value={fat} onChange={onEdit(setFat)} step={5} />
            <Field label="Protéines (g)" value={protein} onChange={onEdit(setProtein)} step={5} />
            <Field label="Il y a (min)" value={minsAgo} onChange={onEdit(setMinsAgo)} step={15} />
          </div>

          {coverageHint && (
            <p className={`text-[11px] font-medium ${coverageHint.tone} leading-snug`}>
              {coverageHint.text}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={carbs <= 0 && fat <= 0 && protein <= 0}
              className="flex-1 bg-accent-2 text-ink font-semibold py-2.5 rounded-xl tap-scale disabled:opacity-40 flex items-center justify-center gap-1.5 text-sm"
            >
              <Check className="w-4 h-4" />
              {manualDigestion ? "Mettre à jour" : "Déclarer ce repas"}
            </button>
            {manualDigestion && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Effacer"
                className="px-4 rounded-xl bg-bg-tertiary border border-border-default text-text-tertiary hover:text-error transition-colors tap-scale"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
  decimal,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
  decimal?: boolean;
}) {
  return (
    <div>
      <label className="label mb-1 block">{label}</label>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, +(value - step).toFixed(1)))}
          className="w-8 h-8 shrink-0 rounded-lg bg-bg-tertiary border border-border-default text-text-primary tap-scale"
          aria-label="Moins"
        >
          −
        </button>
        <input
          type="number"
          inputMode={decimal ? "decimal" : "numeric"}
          value={value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          className="min-w-0 flex-1 bg-bg-tertiary border border-border-default rounded-lg px-2 py-1.5 text-center num text-sm text-text-primary tabular-nums"
        />
        <button
          type="button"
          onClick={() => onChange(+(value + step).toFixed(1))}
          className="w-8 h-8 shrink-0 rounded-lg bg-bg-tertiary border border-border-default text-text-primary tap-scale"
          aria-label="Plus"
        >
          +
        </button>
      </div>
    </div>
  );
}
