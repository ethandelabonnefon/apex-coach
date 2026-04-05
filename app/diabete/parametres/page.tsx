"use client";

import { useState } from "react";
import { Card, PageHeader, Button, SectionTitle, InfoBox } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { InsulinRatio } from "@/types";
import Link from "next/link";

function generateId() {
  return "r-" + Math.random().toString(36).slice(2, 9);
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
  const [ratioValue, setRatioValue] = useState(ratio.ratio);

  const handleSave = () => {
    onUpdate({ ...ratio, label, timeStart, timeEnd, ratio: ratioValue });
    setEditing(false);
  };

  const handleCancel = () => {
    setLabel(ratio.label);
    setTimeStart(ratio.timeStart);
    setTimeEnd(ratio.timeEnd);
    setRatioValue(ratio.ratio);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-4 rounded-xl bg-white/[0.05] border border-white/[0.08] space-y-3">
        <div>
          <label className="text-xs text-white/40 block mb-1">Nom du repas</label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/40 block mb-1">Heure debut</label>
            <input
              type="time"
              value={timeStart}
              onChange={(e) => setTimeStart(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Heure fin</label>
            <input
              type="time"
              value={timeEnd}
              onChange={(e) => setTimeEnd(e.target.value)}
              className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
            />
          </div>
        </div>
        <div>
          <label className="text-xs text-white/40 block mb-1">Ratio (1 unite pour X grammes de glucides)</label>
          <div className="flex items-center gap-3">
            <span className="text-white/50 text-sm font-medium">1:</span>
            <input
              type="number"
              value={ratioValue}
              onChange={(e) => setRatioValue(Number(e.target.value))}
              min={1}
              max={30}
              step={0.5}
              className="w-24 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
            />
            <span className="text-xs text-white/35">g de glucides</span>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} size="sm">Sauvegarder</Button>
          <Button onClick={handleCancel} variant="ghost" size="sm">Annuler</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors group">
      <div className="flex items-center gap-4">
        <div className="text-center min-w-[60px]">
          <p className="text-xl font-bold text-[#00ff94]">1:{ratio.ratio}</p>
          <p className="text-[10px] text-white/25 mt-0.5">1U / {ratio.ratio}g</p>
        </div>
        <div>
          <p className="text-sm font-medium">{ratio.label}</p>
          <p className="text-xs text-white/35">{ratio.timeStart} — {ratio.timeEnd}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setEditing(true)}
          className="p-2 rounded-lg text-white/40 hover:text-white hover:bg-white/[0.05] transition-colors"
          title="Modifier"
        >
          ✏️
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-white/40 hover:text-[#ff4757] hover:bg-[#ff4757]/10 transition-colors"
          title="Supprimer"
        >
          🗑️
        </button>
      </div>
    </div>
  );
}

export default function DiabeteParametresPage() {
  const { diabetesConfig, updateDiabetesConfig } = useStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [saved, setSaved] = useState(false);

  // New ratio form state
  const [newLabel, setNewLabel] = useState("");
  const [newTimeStart, setNewTimeStart] = useState("15:00");
  const [newTimeEnd, setNewTimeEnd] = useState("17:00");
  const [newRatio, setNewRatio] = useState(8);

  // General settings
  const [isf, setIsf] = useState(diabetesConfig.insulinSensitivityFactor);
  const [targetGlucose, setTargetGlucose] = useState(diabetesConfig.targetGlucose);
  const [targetMin, setTargetMin] = useState(diabetesConfig.targetRange.min);
  const [targetMax, setTargetMax] = useState(diabetesConfig.targetRange.max);
  const [activeDuration, setActiveDuration] = useState(diabetesConfig.insulinActiveDuration);

  // Ensure insulinRatios exists (migration for existing users)
  const ratios: InsulinRatio[] = diabetesConfig.insulinRatios || [
    { id: "r-morning", label: "Petit-déjeuner", mealKey: "morning", timeStart: "07:00", timeEnd: "10:00", ratio: diabetesConfig.ratios.morning },
    { id: "r-lunch", label: "Déjeuner", mealKey: "lunch", timeStart: "12:00", timeEnd: "14:00", ratio: diabetesConfig.ratios.lunch },
    { id: "r-dinner", label: "Dîner", mealKey: "dinner", timeStart: "19:00", timeEnd: "21:00", ratio: diabetesConfig.ratios.dinner },
  ];

  const syncLegacyRatios = (updatedRatios: InsulinRatio[]) => {
    const legacy: Record<string, number> = {
      morning: diabetesConfig.ratios.morning,
      lunch: diabetesConfig.ratios.lunch,
      dinner: diabetesConfig.ratios.dinner,
    };
    for (const r of updatedRatios) {
      if (r.mealKey in legacy) {
        legacy[r.mealKey] = r.ratio;
      }
    }
    return { morning: legacy.morning, lunch: legacy.lunch, dinner: legacy.dinner };
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
    if (!newLabel.trim()) return;
    const mealKey = newLabel.toLowerCase().replace(/[^a-z]/g, "");
    const newEntry: InsulinRatio = {
      id: generateId(),
      label: newLabel.trim(),
      mealKey,
      timeStart: newTimeStart,
      timeEnd: newTimeEnd,
      ratio: newRatio,
    };
    const newRatios = [...ratios, newEntry];
    updateDiabetesConfig({
      insulinRatios: newRatios,
      ratios: syncLegacyRatios(newRatios),
    });
    setNewLabel("");
    setNewTimeStart("15:00");
    setNewTimeEnd("17:00");
    setNewRatio(8);
    setShowAddForm(false);
    flash();
  };

  const handleSaveSettings = () => {
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

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-3xl mx-auto pb-32">
      <PageHeader
        title="Parametres Diabete"
        subtitle="Gere tes ratios insuline/glucides et parametres de calcul"
        action={
          <Link href="/diabete">
            <Button variant="ghost" size="sm">← Retour</Button>
          </Link>
        }
      />

      {saved && (
        <div className="mb-4 text-center">
          <span className="text-sm text-[#00ff94] animate-pulse">Sauvegarde !</span>
        </div>
      )}

      {/* Insulin Ratios */}
      <Card glow="orange" className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle className="!mb-0">Ratios insuline / glucides</SectionTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "Annuler" : "+ Ajouter"}
          </Button>
        </div>

        <InfoBox variant="info">
          Le ratio indique combien de grammes de glucides sont couverts par 1 unite d&apos;insuline rapide.
          Par exemple, 1:7 signifie 1U pour 7g de glucides.
        </InfoBox>

        {/* Add form */}
        {showAddForm && (
          <div className="mt-4 p-4 rounded-xl bg-white/[0.05] border border-[#00ff94]/20 space-y-3">
            <p className="text-sm font-medium text-[#00ff94]">Nouveau ratio</p>
            <div>
              <label className="text-xs text-white/40 block mb-1">Nom du repas</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Ex: Collation soir, Pre-entrainement..."
                className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50 transition-colors"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/40 block mb-1">Heure debut</label>
                <input
                  type="time"
                  value={newTimeStart}
                  onChange={(e) => setNewTimeStart(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Heure fin</label>
                <input
                  type="time"
                  value={newTimeEnd}
                  onChange={(e) => setNewTimeEnd(e.target.value)}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-white/40 block mb-1">Ratio</label>
              <div className="flex items-center gap-3">
                <span className="text-white/50 text-sm font-medium">1:</span>
                <input
                  type="number"
                  value={newRatio}
                  onChange={(e) => setNewRatio(Number(e.target.value))}
                  min={1}
                  max={30}
                  step={0.5}
                  className="w-24 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
                />
                <span className="text-xs text-white/35">g de glucides</span>
              </div>
            </div>
            <Button onClick={handleAddRatio} size="sm">Ajouter le ratio</Button>
          </div>
        )}

        {/* Ratio list */}
        <div className="mt-4 space-y-2">
          {ratios.map((ratio) => (
            <RatioCard
              key={ratio.id}
              ratio={ratio}
              onUpdate={handleUpdateRatio}
              onDelete={() => handleDeleteRatio(ratio.id)}
            />
          ))}
          {ratios.length === 0 && (
            <p className="text-center text-white/30 text-sm py-4">Aucun ratio configure</p>
          )}
        </div>
      </Card>

      {/* General Diabetes Settings */}
      <Card className="mb-6">
        <SectionTitle>Parametres generaux</SectionTitle>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/40 block mb-1">Facteur de sensibilite (ISF)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={isf}
                onChange={(e) => setIsf(Number(e.target.value))}
                min={10}
                max={100}
                className="w-24 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
              />
              <span className="text-xs text-white/35">mg/dL par unite</span>
            </div>
            <p className="text-[10px] text-white/25 mt-1">1U d&apos;insuline fait baisser la glycemie de {isf} mg/dL</p>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Glycemie cible</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={targetGlucose}
                onChange={(e) => setTargetGlucose(Number(e.target.value))}
                min={70}
                max={150}
                className="w-24 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
              />
              <span className="text-xs text-white/35">mg/dL</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Plage cible</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={targetMin}
                onChange={(e) => setTargetMin(Number(e.target.value))}
                min={50}
                max={100}
                className="w-20 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
              />
              <span className="text-xs text-white/35">—</span>
              <input
                type="number"
                value={targetMax}
                onChange={(e) => setTargetMax(Number(e.target.value))}
                min={140}
                max={250}
                className="w-20 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
              />
              <span className="text-xs text-white/35">mg/dL</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 block mb-1">Duree d&apos;action de l&apos;insuline</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={activeDuration}
                onChange={(e) => setActiveDuration(Number(e.target.value))}
                min={120}
                max={360}
                step={15}
                className="w-24 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 transition-colors"
              />
              <span className="text-xs text-white/35">minutes ({(activeDuration / 60).toFixed(1)}h)</span>
            </div>
          </div>

          <Button onClick={handleSaveSettings}>Sauvegarder les parametres</Button>
        </div>
      </Card>

      {/* Known Patterns (read-only) */}
      <Card>
        <SectionTitle>Patterns connus</SectionTitle>
        <div className="space-y-3">
          {diabetesConfig.knownPatterns.map((p, i) => (
            <div key={i} className="p-3 rounded-xl bg-white/[0.03]">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[#ff9500]">⚠</span>
                <p className="text-sm font-medium">{p.name}</p>
              </div>
              <p className="text-xs text-white/40">{p.description}</p>
              <p className="text-xs text-white/50 mt-1">{p.suggestion}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
