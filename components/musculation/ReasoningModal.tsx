"use client";

import { Button } from "@/components/ui";
import type { ActiveProgram } from "@/lib/store";

interface ReasoningModalProps {
  program: ActiveProgram;
  onClose: () => void;
}

export default function ReasoningModal({ program, onClose }: ReasoningModalProps) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 sm:flex sm:items-center sm:justify-center sm:p-4" onClick={onClose}>
      <div
        className="absolute inset-x-0 bottom-0 sm:relative sm:inset-auto bg-[#0f0f18] border border-white/10 rounded-t-2xl sm:rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Pourquoi ce programme ?</h2>
          <button onClick={onClose} className="text-white/30 hover:text-white text-lg">✕</button>
        </div>

        <div className="space-y-4">
          {/* Split reasoning */}
          <div>
            <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Split choisi</p>
            <p className="text-sm text-white/70">
              <span className="text-[#a855f7] font-medium">{program.splitType.replace(/_/g, " ")}</span> — {program.daysPerWeek} jours/semaine
            </p>
          </div>

          {/* Volume distribution */}
          {Object.keys(program.volumeDistribution).length > 0 && (
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Volume par muscle</p>
              <div className="space-y-1.5">
                {Object.entries(program.volumeDistribution).map(([muscle, data]) => (
                  <div key={muscle} className="flex items-center justify-between text-xs">
                    <span className="text-white/60">{muscle}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white/80 font-medium">{data.setsPerWeek} séries/sem</span>
                      {data.status && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                          data.status === "weak" ? "bg-red-500/15 text-red-400" :
                          data.status === "improve" ? "bg-orange-500/15 text-orange-400" :
                          data.status === "strong" ? "bg-green-500/15 text-green-400" :
                          "bg-white/5 text-white/30"
                        }`}>
                          {data.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* T1D Protocol */}
          {program.t1dProtocol?.preworkout && (
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Protocole T1D</p>
              <div className="space-y-1">
                <p className="text-xs text-white/50"><span className="text-[#ff9500]">Avant :</span> {program.t1dProtocol.preworkout}</p>
                <p className="text-xs text-white/50"><span className="text-[#00ff94]">Après :</span> {program.t1dProtocol.postworkout}</p>
              </div>
            </div>
          )}

          {/* Full analysis */}
          {program.generationReasoning && (
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-1">Analyse complète</p>
              <div className="text-sm text-white/60 leading-relaxed whitespace-pre-line">
                {program.generationReasoning}
              </div>
            </div>
          )}

          {/* Predictions */}
          {Object.keys(program.predictions).length > 0 && (
            <div>
              <p className="text-[10px] text-white/35 uppercase tracking-wider mb-2">Prédictions</p>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(program.predictions).map(([period, prediction]) => (
                  <div key={period} className="p-2.5 rounded-lg bg-white/[0.03]">
                    <p className="text-[10px] text-white/30 capitalize">{period.replace(/([A-Z])/g, " $1")}</p>
                    <p className="text-xs text-white/70 mt-0.5">{prediction}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <Button onClick={onClose} className="w-full mt-5">Compris</Button>
      </div>
    </div>
  );
}
