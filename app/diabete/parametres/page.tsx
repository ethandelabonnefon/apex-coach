"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import type { InsulinRatio } from "@/types";
import { Badge } from "@/components/ui/Badge";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  AlertTriangle,
  Info,
} from "lucide-react";

function generateId() {
  return "r-" + Math.random().toString(36).slice(2, 9);
}

// Helpers : conversion entre format interne (g/U) et format naturel (U/10g)
function gPerUtoUper10g(gPerU: number): number {
  return 10 / gPerU;
}
function uPer10gToGperU(uPer10g: number): number {
  return 10 / uPer10g;
}
function formatU(value: number, decimals = 1): string {
  return value.toFixed(decimals).replace(".", ",");
}

function RatioCard({
  ratio,
  onUpdate,
  onDelete,
}: {
  ratio: InsulinRatio;
  onUpdate: (updated: InsulinRatio) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(ratio.label);
  const [timeStart, setTimeStart] = useState(ratio.timeStart);
  const [timeEnd, setTimeEnd] = useState(ratio.timeEnd);
  // On édite au format naturel : X U / 10g
  const [unitsPer10g, setUnitsPer10g] = useState(
    Number(gPerUtoUper10g(ratio.ratio).toFixed(2))
  );

  const handleSave = () => {
    onUpdate({
      ...ratio,
      label,
      timeStart,
      timeEnd,
      ratio: uPer10gToGperU(unitsPer10g),
    });
    setEditing(false);
  };

  const handleCancel = () => {
    setLabel(ratio.label);
    setTimeStart(ratio.timeStart);
    setTimeEnd(ratio.timeEnd);
    setUnitsPer10g(Number(gPerUtoUper10g(ratio.ratio).toFixed(2)));
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="surface-2 rounded-2xl p-4 space-y-3 border border-diabete/30">
        <div>
          <p className="label mb-1">Nom du repas</p>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="label mb-1">Heure début</p>
            <input
              type="time"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
              className="num w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
            />
          </div>
          <div>
            <p className="label mb-1">Heure fin</p>
            <input
              type="time"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
              className="num w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
            />
          </div>
        </div>
        <div>
          <p className="label mb-1">Ratio insuline / glucides</p>
          <div className="flex items-center gap-2">
            <input
              type="number"
              inputMode="decimal"
              value={unitsPer10g}
              onChange={(e) => setUnitsPer10g(Number(e.target.value))}
              min={0.1}
              max={10}
              step={0.1}
              className="num w-20 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
            />
            <span className="text-sm text-text-secondary">U pour</span>
            <span className="num text-sm font-semibold text-text-primary">10g</span>
            <span className="text-sm text-text-secondary">de glucides</span>
          </div>
          <p className="text-[11px] text-text-tertiary mt-1.5">
            Interne : 1U pour {formatU(uPer10gToGperU(unitsPer10g), 1)}g
          </p>
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 bg-diabete text-ink text-xs font-semibold px-4 py-2 rounded-lg hover:bg-diabete/90 transition-colors tap-scale"
          >
            <Check className="w-3.5 h-3.5" />
            Sauvegarder
          </button>
          <button
            onClick={handleCancel}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-2 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Annuler
          </button>
        </div>
      </div>
    );
  }

  const naturalUnits = gPerUtoUper10g(ratio.ratio);

  return (
    <div className="surface-2 rounded-2xl p-4 flex items-center justify-between hover-lift group">
      <div className="flex items-center gap-4">
        <div className="text-center min-w-[80px]">
          <p className="num text-xl font-semibold text-diabete leading-none">
            {formatU(naturalUnits, 1)}
            <span className="text-xs text-text-tertiary ml-0.5">U</span>
          </p>
          <p className="text-[10px] text-text-tertiary mt-0.5">/ 10g glucides</p>
        </div>
        <div className="border-l border-border-subtle pl-4">
          <p className="text-sm font-medium text-text-primary">{ratio.label}</p>
          <p className="num text-xs text-text-tertiary mt-0.5">
            {ratio.timeStart} — {ratio.timeEnd}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => setEditing(true)}
          className="p-2 rounded-lg text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors"
          title="Modifier"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-text-tertiary hover:text-error hover:bg-error/10 transition-colors"
          title="Supprimer"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export default function DiabeteParametresPage() {
  const { diabetesConfig, updateDiabetesConfig } = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [saved, setSaved] = useState(false);

  // New ratio form
  const [newLabel, setNewLabel] = useState("");
  const [newTimeStart, setNewTimeStart] = useState("15:00");
  const [newTimeEnd, setNewTimeEnd] = useState("17:00");
  const [newUnitsPer10g, setNewUnitsPer10g] = useState(1);

  // General settings
  // ISF en format naturel : X U pour 50 mg/dL au-dessus
  const [unitsPer50mg, setUnitsPer50mg] = useState(
    Number((50 / diabetesConfig.insulinSensitivityFactor).toFixed(2))
  );
  const [targetGlucose, setTargetGlucose] = useState(diabetesConfig.targetGlucose);
  const [targetMin, setTargetMin] = useState(diabetesConfig.targetRange.min);
  const [targetMax, setTargetMax] = useState(diabetesConfig.targetRange.max);
  const [activeDuration, setActiveDuration] = useState(diabetesConfig.insulinActiveDuration);

  const ratios: InsulinRatio[] = diabetesConfig.insulinRatios || [
    { id: "r-morning", label: "Petit-déjeuner", mealKey: "morning", timeStart: "07:00", timeEnd: "10:00", ratio: diabetesConfig.ratios.morning },
    { id: "r-lunch", label: "Déjeuner", mealKey: "lunch", timeStart: "12:00", timeEnd: "14:00", ratio: diabetesConfig.ratios.lunch },
    { id: "r-dinner", label: "Dîner", mealKey: "dinner", timeStart: "19:00", timeEnd: "21:00", ratio: diabetesConfig.ratios.dinner },
  ];

  const syncLegacyRatios = (updatedRatios: InsulinRatio[]) => {
    const legacy = {
      morning: diabetesConfig.ratios.morning,
      lunch: diabetesConfig.ratios.lunch,
      dinner: diabetesConfig.ratios.dinner,
    };
    for (const r of updatedRatios) {
      if (r.mealKey in legacy) {
        (legacy as Record<string, number>)[r.mealKey] = r.ratio;
      }
    }
    return legacy;
  };

  const handleUpdateRatio = (updated: InsulinRatio) => {
    const newRatios = ratios.map((r) => (r.id === updated.id ? updated : r));
    updateDiabetesConfig({
      insulinRatios: newRatios,
      ratios: syncLegacyRatios(newRatios),
    });
    flash();
  };

  const handleDeleteRatio = (id: string) => {
    const newRatios = ratios.filter((r) => r.id !== id);
    updateDiabetesConfig({
      insulinRatios: newRatios,
      ratios: syncLegacyRatios(newRatios),
    });
    flash();
  };

  const handleAddRatio = () => {
    if (!newLabel.trim() || newUnitsPer10g <= 0) return;
    const mealKey = newLabel.toLowerCase().replace(/[^a-z]/g, "");
    const newEntry: InsulinRatio = {
      id: generateId(),
      label: newLabel.trim(),
      mealKey,
      timeStart: newTimeStart,
      timeEnd: newTimeEnd,
      ratio: uPer10gToGperU(newUnitsPer10g),
    };
    const newRatios = [...ratios, newEntry];
    updateDiabetesConfig({
      insulinRatios: newRatios,
      ratios: syncLegacyRatios(newRatios),
    });
    setNewLabel("");
    setNewTimeStart("15:00");
    setNewTimeEnd("17:00");
    setNewUnitsPer10g(1);
    setShowAddForm(false);
    flash();
  };

  const handleSaveSettings = () => {
    // Conversion U pour 50 mg/dL → mg/dL par U (ISF interne)
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
            Ratios & sensibilité
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

      {/* ── Ratios insuline / glucides ── */}
      <section className="surface-1 rounded-3xl p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-text-primary">
              Ratios insuline / glucides
            </h2>
          </div>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-lg border border-border-subtle transition-colors tap-scale"
          >
            {showAddForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {showAddForm ? "Annuler" : "Ajouter"}
          </button>
        </div>

        <div className="flex items-start gap-2 bg-info/5 border border-info/20 rounded-xl p-3 mb-4">
          <Info className="w-4 h-4 text-info shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">
            Exemple : <span className="num font-semibold text-text-primary">1,5U pour 10g</span> signifie
            que tu injectes 1,5 unité d&apos;insuline rapide par tranche de 10 grammes de glucides.
          </p>
        </div>

        {showAddForm && (
          <div className="surface-2 rounded-2xl p-4 mb-4 space-y-3 border border-diabete/30 animate-slide-up">
            <p className="label" style={{ color: "var(--diabete)" }}>Nouveau ratio</p>
            <div>
              <p className="label mb-1">Nom du repas</p>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Collation soir, Pré-entraînement..."
                className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:border-diabete/50 transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="label mb-1">Heure début</p>
                <input
                  type="time"
                  value={newTimeStart}
                  onChange={(e) => setNewTimeStart(e.target.value)}
                  className="num w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
                />
              </div>
              <div>
                <p className="label mb-1">Heure fin</p>
                <input
                  type="time"
                  value={newTimeEnd}
                  onChange={(e) => setNewTimeEnd(e.target.value)}
                  className="num w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <p className="label mb-1">Ratio</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  value={newUnitsPer10g}
                  onChange={(e) => setNewUnitsPer10g(Number(e.target.value))}
                  min={0.1}
                  max={10}
                  step={0.1}
                  className="num w-20 bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
                />
                <span className="text-sm text-text-secondary">U pour</span>
                <span className="num text-sm font-semibold text-text-primary">10g</span>
                <span className="text-sm text-text-secondary">de glucides</span>
              </div>
            </div>
            <button
              onClick={handleAddRatio}
              className="bg-diabete text-ink text-xs font-semibold px-4 py-2 rounded-lg hover:bg-diabete/90 transition-colors tap-scale"
            >
              Ajouter le ratio
            </button>
          </div>
        )}

        <div className="space-y-2">
          {ratios.map((ratio) => (
            <RatioCard
              key={ratio.id}
              ratio={ratio}
              onUpdate={handleUpdateRatio}
              onDelete={() => handleDeleteRatio(ratio.id)}
            />
          ))}
          {ratios.length === 0 && (
            <p className="text-center text-text-tertiary text-sm py-4">
              Aucun ratio configuré
            </p>
          )}
        </div>
      </section>

      {/* ── Paramètres généraux ── */}
      <section className="surface-1 rounded-3xl p-6 mb-4">
        <h2 className="text-base font-semibold text-text-primary mb-4">
          Sensibilité & cibles
        </h2>

        <div className="space-y-4">
          {/* Sensibilité (ISF) en format naturel */}
          <div>
            <p className="label mb-1.5">Sensibilité (correction glycémique)</p>
            <div className="flex items-center gap-2">
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

          {/* Glycémie cible */}
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

          {/* Plage cible */}
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

          {/* Durée d'action */}
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

      {/* ── Patterns connus (read-only) ── */}
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
