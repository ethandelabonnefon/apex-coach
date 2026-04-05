"use client";

import { useState } from "react";
import { Button, InfoBox } from "@/components/ui";

interface ModifyDaysModalProps {
  currentDays: number;
  onConfirm: (newDays: number) => void;
  onClose: () => void;
  regenerating?: boolean;
}

const DAY_OPTIONS = [
  { value: 2, label: "2 jours / semaine", note: "Full Body recommandé" },
  { value: 3, label: "3 jours / semaine", note: "PPL ou Full Body" },
  { value: 4, label: "4 jours / semaine", note: "Push/Pull ou Upper/Lower" },
  { value: 5, label: "5 jours / semaine", note: "PPL + spécialisation" },
  { value: 6, label: "6 jours / semaine", note: "PPL x2" },
];

export default function ModifyDaysModal({ currentDays, onConfirm, onClose, regenerating }: ModifyDaysModalProps) {
  const [selectedDays, setSelectedDays] = useState(currentDays);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 sm:flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0 sm:relative sm:inset-auto bg-[#0f0f18] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 max-w-sm w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-white mb-4">Modifier le nombre de séances</h2>

        <div className="space-y-2 mb-5">
          {DAY_OPTIONS.map(({ value, label, note }) => (
            <button
              key={value}
              onClick={() => setSelectedDays(value)}
              className={`w-full p-3.5 rounded-xl border-2 transition-all flex items-center justify-between ${
                selectedDays === value
                  ? "border-[#00ff94]/50 bg-[#00ff94]/5"
                  : "border-white/[0.08] hover:border-white/20 bg-white/[0.02]"
              }`}
            >
              <div className="text-left">
                <p className="text-sm font-medium text-white">{label}</p>
                <p className="text-[10px] text-white/30">{note}</p>
              </div>
              {selectedDays === value && <span className="text-[#00ff94] text-lg">✓</span>}
            </button>
          ))}
        </div>

        {selectedDays !== currentDays && (
          <div className="mb-4">
            <InfoBox variant="warning">
              <p className="text-xs">Changer le nombre de jours va régénérer ton programme complet avec un nouveau split adapté.</p>
            </InfoBox>
          </div>
        )}

        <div className="flex gap-3">
          <Button variant="ghost" onClick={onClose} className="flex-1" disabled={regenerating}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm(selectedDays)} className="flex-1" disabled={regenerating || selectedDays === currentDays}>
            {regenerating ? "Génération..." : "Confirmer"}
          </Button>
        </div>
      </div>
    </div>
  );
}
