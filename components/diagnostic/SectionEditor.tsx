"use client";

import { useState } from "react";
import { Button, Card, SectionTitle } from "@/components/ui";

interface SectionEditorProps {
  section: string;
  initialData: Record<string, string>;
  onSave: (section: string, data: Record<string, string>) => void;
  onCancel: () => void;
}

const SECTION_CONFIG: Record<string, { title: string; fields: { key: string; label: string; type: string; unit?: string; options?: string[] }[] }> = {
  mensurations: {
    title: "Mensurations (cm)",
    fields: [
      { key: "chest", label: "Tour de poitrine", type: "number", unit: "cm" },
      { key: "shoulders", label: "Tour d'épaules", type: "number", unit: "cm" },
      { key: "waist", label: "Tour de taille", type: "number", unit: "cm" },
      { key: "hips", label: "Tour de hanches", type: "number", unit: "cm" },
      { key: "armRelaxed", label: "Bras relâché", type: "number", unit: "cm" },
      { key: "armFlexed", label: "Bras contracté", type: "number", unit: "cm" },
      { key: "thigh", label: "Tour de cuisse", type: "number", unit: "cm" },
      { key: "calf", label: "Tour de mollet", type: "number", unit: "cm" },
    ],
  },
  longueurs: {
    title: "Longueurs segmentaires (cm)",
    fields: [
      { key: "armSpan", label: "Envergure", type: "number", unit: "cm" },
      { key: "torsoLength", label: "Longueur du tronc", type: "number", unit: "cm" },
    ],
  },
  mobilite: {
    title: "Tests de mobilité",
    fields: [
      { key: "shoulderMobility", label: "Mains derrière le dos", type: "select", options: ["Non", "Difficilement", "Facilement"] },
      { key: "hipMobility", label: "Squat complet", type: "select", options: ["Non", "Difficilement", "Facilement"] },
      { key: "ankleMobility", label: "Genou au mur (12cm)", type: "select", options: ["Non", "Difficilement", "Facilement"] },
    ],
  },
  historique: {
    title: "Historique et forces",
    fields: [
      { key: "injuries", label: "Blessures / limitations", type: "text" },
      { key: "trainingHistory", label: "Années d'entraînement", type: "number", unit: "ans" },
      { key: "benchPress1RM", label: "DC 1RM", type: "number", unit: "kg" },
      { key: "squat1RM", label: "Squat 1RM", type: "number", unit: "kg" },
      { key: "deadlift1RM", label: "Deadlift 1RM", type: "number", unit: "kg" },
      { key: "ohp1RM", label: "OHP 1RM", type: "number", unit: "kg" },
      { key: "pullups", label: "Tractions max", type: "number", unit: "reps" },
    ],
  },
};

export default function SectionEditor({ section, initialData, onSave, onCancel }: SectionEditorProps) {
  const config = SECTION_CONFIG[section];
  const [data, setData] = useState<Record<string, string>>({ ...initialData });

  if (!config) return null;

  const update = (key: string, value: string) => {
    setData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
        <Card>
          <SectionTitle>{config.title}</SectionTitle>
          <p className="text-xs text-white/40 mb-4">Modifie les valeurs que tu souhaites mettre à jour.</p>

          <div className="space-y-3">
            {config.fields.map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-white/50 mb-1.5">{field.label}</label>
                {field.type === "select" ? (
                  <select
                    value={data[field.key] || ""}
                    onChange={(e) => update(field.key, e.target.value)}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/20 transition-colors appearance-none"
                  >
                    <option value="" className="bg-[#0a0a0f]">Sélectionner...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt} className="bg-[#0a0a0f]">{opt}</option>
                    ))}
                  </select>
                ) : field.type === "text" ? (
                  <textarea
                    value={data[field.key] || ""}
                    onChange={(e) => update(field.key, e.target.value)}
                    rows={2}
                    className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/20 transition-colors resize-none"
                  />
                ) : (
                  <div className="relative">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={data[field.key] || ""}
                      onChange={(e) => update(field.key, e.target.value)}
                      className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/20 transition-colors"
                    />
                    {field.unit && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">{field.unit}</span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-white/[0.06]">
            <Button variant="ghost" onClick={onCancel}>Annuler</Button>
            <Button onClick={() => onSave(section, data)}>Sauvegarder</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
