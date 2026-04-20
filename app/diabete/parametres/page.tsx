"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { InsulinRatio } from "@/types";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  Pencil,
} from "lucide-react";

// ─── Mon programme fixe (4 ratios) ─────────────────
// Présenté en phrase naturelle. L'utilisateur peut éditer la valeur uniquement.
const MEAL_SLOTS: Array<{
  mealKey: string;
  label: string;
  sentenceSuffix: string; // "le matin", "à midi", "au goûter", "au dîner"
  timeStart: string;
  timeEnd: string;
}> = [
  { mealKey: "morning", label: "Petit-déjeuner", sentenceSuffix: "le matin", timeStart: "07:00", timeEnd: "10:00" },
  { mealKey: "lunch", label: "Déjeuner", sentenceSuffix: "à midi", timeStart: "12:00", timeEnd: "14:00" },
  { mealKey: "snack", label: "Goûter", sentenceSuffix: "au goûter", timeStart: "15:00", timeEnd: "17:00" },
  { mealKey: "dinner", label: "Dîner", sentenceSuffix: "au dîner", timeStart: "19:00", timeEnd: "21:00" },
];

function gPerUtoUper10g(gPerU: number): number {
  return 10 / gPerU;
}
function uPer10gToGperU(uPer10g: number): number {
  return 10 / uPer10g;
}
function formatU(value: number, decimals = 1): string {
  // On affiche "1" si entier, sinon "1,5" / "1,2" etc.
  const rounded = Math.round(value * 10) / 10;
  if (rounded === Math.floor(rounded)) return String(rounded);
  return rounded.toFixed(decimals).replace(".", ",");
}

function RatioSentence({
  slot,
  unitsPer10g,
  onSave,
}: {
  slot: (typeof MEAL_SLOTS)[number];
  unitsPer10g: number;
  onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(unitsPer10g);

  const commit = () => {
    if (draft > 0 && draft <= 10) {
      onSave(draft);
    } else {
      setDraft(unitsPer10g);
    }
    setEditing(false);
  };

  const unitWord = unitsPer10g === 1 ? "unité" : "unités";

  return (
    <div className="surface-2 rounded-2xl p-5 flex items-center justify-between gap-4 group">
      <p className="text-base sm:text-lg text-text-secondary leading-relaxed flex-1">
        {editing ? (
          <>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(Number(e.target.value))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") {
                  setDraft(unitsPer10g);
                  setEditing(false);
                }
              }}
              min={0.1}
              max={10}
              step={0.1}
              className="num w-16 bg-bg-tertiary border border-diabete/50 rounded-lg px-2 py-1 text-lg font-semibold text-diabete focus:outline-none mr-1"
            />{" "}
            <span className="text-diabete font-semibold">{unitWord} pour 10g de glucide</span>{" "}
            <span className="text-text-primary">{slot.sentenceSuffix}</span>
          </>
        ) : (
          <>
            <span className="num text-2xl sm:text-3xl font-semibold text-diabete mr-1">
              {formatU(unitsPer10g)}
            </span>
            <span className="text-diabete font-medium">
              {unitWord} pour 10g de glucide
            </span>{" "}
            <span className="text-text-primary font-medium">{slot.sentenceSuffix}</span>
          </>
        )}
      </p>
      {!editing && (
        <button
          onClick={() => {
            setDraft(unitsPer10g);
            setEditing(true);
          }}
          className="p-2 rounded-lg text-text-tertiary hover:text-diabete hover:bg-diabete/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 flex-shrink-0"
          title="Modifier"
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

export default function DiabeteParametresPage() {
  const { diabetesConfig, updateDiabetesConfig } = useStore();
  const [saved, setSaved] = useState(false);

  // General settings
  const [unitsPer50mg, setUnitsPer50mg] = useState(
    Number((50 / diabetesConfig.insulinSensitivityFactor).toFixed(2))
  );
  const [targetGlucose, setTargetGlucose] = useState(diabetesConfig.targetGlucose);
  const [targetMin, setTargetMin] = useState(diabetesConfig.targetRange.min);
  const [targetMax, setTargetMax] = useState(diabetesConfig.targetRange.max);
  const [activeDuration, setActiveDuration] = useState(diabetesConfig.insulinActiveDuration);

  const existingRatios = diabetesConfig.insulinRatios || [];

  // Lookup helper pour récupérer la valeur courante d'un meal slot
  const getRatioForSlot = (mealKey: string): InsulinRatio | null => {
    return existingRatios.find((r) => r.mealKey === mealKey) || null;
  };

  const getUnitsPer10g = (mealKey: string): number => {
    const existing = getRatioForSlot(mealKey);
    if (existing) return gPerUtoUper10g(existing.ratio);
    // Fallback pour legacy (morning, lunch, dinner)
    const legacy = (diabetesConfig.ratios as Record<string, number | undefined>)[mealKey];
    if (legacy) return gPerUtoUper10g(legacy);
    return 1;
  };

  const handleUpdateSlot = (mealKey: string, newUnitsPer10g: number) => {
    const slot = MEAL_SLOTS.find((s) => s.mealKey === mealKey);
    if (!slot) return;

    const newRatio: InsulinRatio = {
      id: getRatioForSlot(mealKey)?.id || `r-${mealKey}`,
      label: slot.label,
      mealKey: slot.mealKey,
      timeStart: slot.timeStart,
      timeEnd: slot.timeEnd,
      ratio: uPer10gToGperU(newUnitsPer10g),
    };

    // Reconstruire la liste en gardant uniquement les 4 slots (pas d'extras)
    const newRatios = MEAL_SLOTS.map((s) =>
      s.mealKey === mealKey ? newRatio : getRatioForSlot(s.mealKey) || {
        id: `r-${s.mealKey}`,
        label: s.label,
        mealKey: s.mealKey,
        timeStart: s.timeStart,
        timeEnd: s.timeEnd,
        ratio: uPer10gToGperU(getUnitsPer10g(s.mealKey)),
      }
    );

    // Sync legacy ratios (morning/lunch/dinner) pour compat calc bolus
    const legacy: Record<string, number> = {
      morning: newRatios.find((r) => r.mealKey === "morning")?.ratio ?? diabetesConfig.ratios.morning,
      lunch: newRatios.find((r) => r.mealKey === "lunch")?.ratio ?? diabetesConfig.ratios.lunch,
      dinner: newRatios.find((r) => r.mealKey === "dinner")?.ratio ?? diabetesConfig.ratios.dinner,
    };

    updateDiabetesConfig({
      insulinRatios: newRatios,
      ratios: legacy as typeof diabetesConfig.ratios,
    });
    flash();
  };

  const handleSaveSettings = () => {
    const isf = 50 / unitsPer50mg;
    updateDiabetesConfig({
      insulinSensitivityFactor: isf,
      targetGlucose,
      targetRange: { min: targetMin, max: targetMax },
      insulinActiveDuration: activeDuration,
    });
    flash();
  };

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const isfInternal = 50 / unitsPer50mg;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto pb-32 stagger">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="label">Diabète · Paramètres</p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            Mon programme d&apos;insuline
          </h1>
        </div>
        <Link
          href="/diabete"
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border-subtle tap-scale"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour
        </Link>
      </div>

      {saved && (
        <div className="mb-4 text-center">
          <Badge variant="success" size="sm">
            <Check className="w-3 h-3 mr-1" />
            Sauvegardé
          </Badge>
        </div>
      )}

      {/* ── 4 ratios en phrases naturelles ── */}
      <section className="surface-1 rounded-3xl p-6 mb-4">
        <h2 className="text-base font-semibold text-text-primary mb-1">
          Ratios insuline / glucides
        </h2>
        <p className="text-xs text-text-tertiary mb-5">
          Passe la souris et clique sur <Pencil className="inline w-3 h-3 mx-0.5" /> pour modifier une valeur.
        </p>

        <div className="space-y-2">
          {MEAL_SLOTS.map((slot) => (
            <RatioSentence
              key={slot.mealKey}
              slot={slot}
              unitsPer10g={getUnitsPer10g(slot.mealKey)}
              onSave={(value) => handleUpdateSlot(slot.mealKey, value)}
            />
          ))}
        </div>
      </section>

      {/* ── Sensibilité & cibles ── */}
      <section className="surface-1 rounded-3xl p-6 mb-4">
        <h2 className="text-base font-semibold text-text-primary mb-4">
          Sensibilité & cibles
        </h2>

        <div className="space-y-4">
          <div>
            <p className="label mb-1.5">Correction glycémique</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="number"
                inputMode="decimal"
                value={unitsPer50mg}
                onChange={(e) => setUnitsPer50mg(Number(e.target.value))}
                min={0.1}
                max={5}
                step={0.1}
                className="num w-20 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
              />
              <span className="text-sm text-text-secondary">U pour</span>
              <span className="num text-sm font-semibold text-text-primary">50 mg/dL</span>
              <span className="text-sm text-text-secondary">au-dessus de la cible</span>
            </div>
            <p className="text-[11px] text-text-tertiary mt-1.5">
              Équivaut à : 1U fait baisser {formatU(isfInternal, 0)} mg/dL
            </p>
          </div>

          <div>
            <p className="label mb-1.5">Glycémie cible</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={targetGlucose}
                onChange={(e) => setTargetGlucose(Number(e.target.value))}
                min={70}
                max={150}
                className="num w-24 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
              />
              <span className="text-sm text-text-secondary">mg/dL</span>
            </div>
          </div>

          <div>
            <p className="label mb-1.5">Plage cible (zone verte)</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={targetMin}
                onChange={(e) => setTargetMin(Number(e.target.value))}
                min={50}
                max={100}
                className="num w-20 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
              />
              <span className="text-text-tertiary">—</span>
              <input
                type="number"
                value={targetMax}
                onChange={(e) => setTargetMax(Number(e.target.value))}
                min={140}
                max={250}
                className="num w-20 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
              />
              <span className="text-sm text-text-secondary">mg/dL</span>
            </div>
          </div>

          <div>
            <p className="label mb-1.5">Durée d&apos;action de l&apos;insuline</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={activeDuration}
                onChange={(e) => setActiveDuration(Number(e.target.value))}
                min={120}
                max={360}
                step={15}
                className="num w-24 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
              />
              <span className="text-sm text-text-secondary">
                minutes
                <span className="num text-text-tertiary ml-1">
                  ({(activeDuration / 60).toFixed(1)}h)
                </span>
              </span>
            </div>
          </div>

          <button
            onClick={handleSaveSettings}
            className="bg-diabete text-ink text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-diabete/90 transition-colors tap-scale"
          >
            Sauvegarder les paramètres
          </button>
        </div>
      </section>

      {/* ── Patterns connus ── */}
      <section className="surface-1 rounded-3xl p-6">
        <h2 className="text-base font-semibold text-text-primary mb-4">Patterns connus</h2>
        <div className="space-y-2">
          {diabetesConfig.knownPatterns.map((p, i) => (
            <div
              key={i}
              className="surface-2 rounded-xl p-3 flex items-start gap-3"
            >
              <div className="shrink-0 w-7 h-7 rounded-lg bg-warning/15 flex items-center justify-center">
                <AlertTriangle className="w-3.5 h-3.5 text-warning" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">{p.name}</p>
                <p className="text-xs text-text-tertiary mt-0.5">{p.description}</p>
                <p className="text-xs text-diabete mt-1">→ {p.suggestion}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
