"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { DIABETES_CONFIG } from "@/lib/constants";
import type { InsulinRatio } from "@/types";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  Pencil,
  RotateCcw,
  X,
} from "lucide-react";

// ─── Mon programme fixe (4 ratios) ─────────────────
// Présenté en phrase naturelle. L'utilisateur peut éditer la valeur uniquement.
const MEAL_SLOTS: Array<{
  mealKey: "morning" | "lunch" | "snack" | "dinner";
  label: string;
  sentenceSuffix: string;
  timeStart: string;
  timeEnd: string;
}> = [
  { mealKey: "morning", label: "Petit-déjeuner", sentenceSuffix: "le matin", timeStart: "07:00", timeEnd: "10:00" },
  { mealKey: "lunch", label: "Déjeuner", sentenceSuffix: "à midi", timeStart: "12:00", timeEnd: "14:00" },
  { mealKey: "snack", label: "Goûter", sentenceSuffix: "au goûter", timeStart: "15:00", timeEnd: "17:00" },
  { mealKey: "dinner", label: "Dîner", sentenceSuffix: "au dîner", timeStart: "19:00", timeEnd: "21:00" },
];

// ─── Helpers de conversion ─────────────────
function gPerUtoUper10g(gPerU: number): number {
  if (!gPerU || gPerU <= 0) return 1;
  return 10 / gPerU;
}
function uPer10gToGperU(uPer10g: number): number {
  if (!uPer10g || uPer10g <= 0) return 10;
  return 10 / uPer10g;
}
function formatU(value: number, decimals = 1): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === Math.floor(rounded)) return String(rounded);
  return rounded.toFixed(decimals).replace(".", ",");
}
/** Accepte `1,5` ou `1.5` (saisie française) */
function parseFrenchNumber(raw: string): number {
  const cleaned = raw.replace(",", ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

// ═══════════════════════════════════════════════════════
// RatioSentence — phrase éditable pour un créneau
// Fix Phase 9 :
//  - sync `draft` avec la prop via useEffect (corrige le stale state
//    qui rendait l'input inmodifiable après sauvegarde)
//  - input qui accepte la virgule (1,5) ET le point (1.5)
//  - bouton pencil visible par défaut sur mobile (pas d'hover-only)
// ═══════════════════════════════════════════════════════
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
  const [draft, setDraft] = useState<string>(() => formatU(unitsPer10g));

  // Sync draft quand la prop change (après save/migration/reset)
  useEffect(() => {
    if (!editing) {
      setDraft(formatU(unitsPer10g));
    }
  }, [unitsPer10g, editing]);

  const commit = () => {
    const parsed = parseFrenchNumber(draft);
    if (parsed > 0 && parsed <= 10) {
      onSave(Math.round(parsed * 10) / 10); // arrondi à 0.1 U
    } else {
      setDraft(formatU(unitsPer10g));
    }
    setEditing(false);
  };

  const cancel = () => {
    setDraft(formatU(unitsPer10g));
    setEditing(false);
  };

  const unitWord = unitsPer10g === 1 ? "unité" : "unités";

  return (
    <div className="surface-2 rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm sm:text-base text-text-secondary leading-relaxed flex-1 min-w-0">
          {editing ? (
            <span className="flex flex-wrap items-center gap-1">
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") cancel();
                }}
                className="num w-16 bg-bg-tertiary border border-diabete/50 rounded-lg px-2 py-1.5 text-lg font-semibold text-diabete focus:outline-none focus:border-diabete"
              />
              <span className="text-diabete font-semibold">
                {unitWord} pour 10g de glucide
              </span>
              <span className="text-text-primary">{slot.sentenceSuffix}</span>
            </span>
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

        {editing ? (
          <div className="flex gap-1 flex-shrink-0">
            <button
              onClick={commit}
              className="p-2 rounded-lg bg-diabete/15 text-diabete hover:bg-diabete/25 transition-colors tap-scale"
              aria-label="Valider"
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={cancel}
              className="p-2 rounded-lg text-text-tertiary hover:text-text-secondary hover:bg-bg-hover transition-colors tap-scale"
              aria-label="Annuler"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="p-2 rounded-lg text-text-tertiary hover:text-diabete hover:bg-diabete/10 transition-colors tap-scale flex-shrink-0"
            aria-label="Modifier"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
// Page principale
// ═══════════════════════════════════════════════════════
export default function DiabeteParametresPage() {
  const { diabetesConfig, updateDiabetesConfig } = useStore();
  const [saved, setSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // General settings (local draft, commité au bouton "Sauvegarder")
  const [unitsPer50mg, setUnitsPer50mg] = useState<string>(
    formatU(50 / diabetesConfig.insulinSensitivityFactor, 2),
  );
  const [targetGlucose, setTargetGlucose] = useState(diabetesConfig.targetGlucose);
  const [targetMin, setTargetMin] = useState(diabetesConfig.targetRange.min);
  const [targetMax, setTargetMax] = useState(diabetesConfig.targetRange.max);
  const [activeDuration, setActiveDuration] = useState(diabetesConfig.insulinActiveDuration);

  // Re-sync si le config change côté store (ex: après migration/reset)
  useEffect(() => {
    setUnitsPer50mg(formatU(50 / diabetesConfig.insulinSensitivityFactor, 2));
    setTargetGlucose(diabetesConfig.targetGlucose);
    setTargetMin(diabetesConfig.targetRange.min);
    setTargetMax(diabetesConfig.targetRange.max);
    setActiveDuration(diabetesConfig.insulinActiveDuration);
  }, [diabetesConfig]);

  const existingRatios = diabetesConfig.insulinRatios || [];

  const getRatioForSlot = (mealKey: string): InsulinRatio | null => {
    return existingRatios.find((r) => r.mealKey === mealKey) || null;
  };

  const getUnitsPer10g = (mealKey: string): number => {
    const existing = getRatioForSlot(mealKey);
    if (existing && existing.ratio > 0) return gPerUtoUper10g(existing.ratio);
    // Fallback legacy (morning, lunch, snack, dinner)
    const legacy = (diabetesConfig.ratios as Record<string, number | undefined>)[mealKey];
    if (legacy && legacy > 0) return gPerUtoUper10g(legacy);
    return 1;
  };

  const handleUpdateSlot = (mealKey: string, newUnitsPer10g: number) => {
    const slot = MEAL_SLOTS.find((s) => s.mealKey === mealKey);
    if (!slot) return;

    const newGperU = uPer10gToGperU(newUnitsPer10g);

    const newRatio: InsulinRatio = {
      id: getRatioForSlot(mealKey)?.id || `r-${mealKey}`,
      label: slot.label,
      mealKey: slot.mealKey,
      timeStart: slot.timeStart,
      timeEnd: slot.timeEnd,
      ratio: newGperU,
    };

    // Reconstruire la liste en gardant les 4 slots (crée les manquants)
    const newRatios: InsulinRatio[] = MEAL_SLOTS.map((s) => {
      if (s.mealKey === mealKey) return newRatio;
      const existing = getRatioForSlot(s.mealKey);
      if (existing) return existing;
      return {
        id: `r-${s.mealKey}`,
        label: s.label,
        mealKey: s.mealKey,
        timeStart: s.timeStart,
        timeEnd: s.timeEnd,
        ratio: uPer10gToGperU(getUnitsPer10g(s.mealKey)),
      };
    });

    // Sync legacy `ratios` (toutes les clés — Phase 9 inclut snack)
    const legacy = {
      morning: newRatios.find((r) => r.mealKey === "morning")?.ratio ?? diabetesConfig.ratios.morning,
      lunch: newRatios.find((r) => r.mealKey === "lunch")?.ratio ?? diabetesConfig.ratios.lunch,
      snack: newRatios.find((r) => r.mealKey === "snack")?.ratio ?? diabetesConfig.ratios.snack,
      dinner: newRatios.find((r) => r.mealKey === "dinner")?.ratio ?? diabetesConfig.ratios.dinner,
    };

    updateDiabetesConfig({
      insulinRatios: newRatios,
      ratios: legacy,
    });
    flash();
  };

  const handleSaveSettings = () => {
    const per50 = parseFrenchNumber(unitsPer50mg);
    if (per50 <= 0) return;
    const isf = 50 / per50;
    updateDiabetesConfig({
      insulinSensitivityFactor: isf,
      targetGlucose,
      targetRange: { min: targetMin, max: targetMax },
      insulinActiveDuration: activeDuration,
    });
    flash();
  };

  const handleResetRatios = () => {
    updateDiabetesConfig({
      insulinRatios: [...DIABETES_CONFIG.insulinRatios],
      ratios: { ...DIABETES_CONFIG.ratios },
      insulinSensitivityFactor: DIABETES_CONFIG.insulinSensitivityFactor,
    });
    setConfirmReset(false);
    flash();
  };

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const isfInternal = diabetesConfig.insulinSensitivityFactor;

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
      <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex-1">
            <h2 className="text-base font-semibold text-text-primary">
              Ratios insuline / glucides
            </h2>
            <p className="text-xs text-text-tertiary mt-1">
              Tape l&apos;icône <Pencil className="inline w-3 h-3 mx-0.5" /> pour modifier.
              Accepte virgule ou point (ex : 1,5 ou 1.5).
            </p>
          </div>
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="shrink-0 flex items-center gap-1.5 text-[11px] text-text-tertiary hover:text-diabete transition-colors px-2 py-1.5 rounded-lg border border-border-subtle hover:border-diabete/30 tap-scale"
            title="Réinitialiser aux valeurs par défaut"
          >
            <RotateCcw className="w-3 h-3" />
            Réinitialiser
          </button>
        </div>

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

        {confirmReset && (
          <div className="mt-4 rounded-xl bg-warning/10 border border-warning/25 p-4">
            <p className="text-sm text-text-primary font-medium mb-1">
              Réinitialiser les ratios ?
            </p>
            <p className="text-xs text-text-tertiary mb-3">
              Tes valeurs seront remplacées par les defaults Ethan : Matin 1,5 · Midi 1 · Goûter 1,2 · Soir 1 U pour 10g.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleResetRatios}
                className="bg-warning text-ink text-xs font-semibold px-3 py-2 rounded-lg hover:bg-warning/90 transition-colors tap-scale"
              >
                Oui, réinitialiser
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="text-xs text-text-secondary px-3 py-2 rounded-lg hover:text-text-primary transition-colors"
              >
                Annuler
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Sensibilité & cibles ── */}
      <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
        <h2 className="text-base font-semibold text-text-primary mb-4">
          Sensibilité &amp; cibles
        </h2>

        <div className="space-y-4">
          <div>
            <p className="label mb-1.5">Correction glycémique</p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                inputMode="decimal"
                value={unitsPer50mg}
                onChange={(e) => setUnitsPer50mg(e.target.value)}
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
                inputMode="numeric"
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
                inputMode="numeric"
                value={targetMin}
                onChange={(e) => setTargetMin(Number(e.target.value))}
                min={50}
                max={100}
                className="num w-20 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
              />
              <span className="text-text-tertiary">—</span>
              <input
                type="number"
                inputMode="numeric"
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
                inputMode="numeric"
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
      <section className="surface-1 rounded-3xl p-5 sm:p-6">
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
