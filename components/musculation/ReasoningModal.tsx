"use client";

import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { ActiveProgram } from "@/lib/store";
import {
  Split,
  BarChart3,
  Droplet,
  Sparkles,
  Target,
  Dumbbell,
  X,
} from "lucide-react";

interface ReasoningModalProps {
  program: ActiveProgram;
  onClose: () => void;
}

function muscleTone(status: string): "accent" | "warning" | "error" | "default" {
  if (status === "weak") return "error";
  if (status === "improve") return "warning";
  if (status === "strong") return "accent";
  return "default";
}

export default function ReasoningModal({ program, onClose }: ReasoningModalProps) {
  const volumeEntries = Object.entries(program.volumeDistribution);
  const predictionEntries = Object.entries(program.predictions);

  // Collect per-exercise reasoning (only exercises that actually have one)
  const sessionsWithReasoning = program.sessions.map((s) => ({
    id: s.id,
    name: s.name,
    day: s.day,
    focus: s.focus,
    exercises: s.exercises.filter((e) => e.reasoning && e.reasoning.trim().length > 0),
  })).filter((s) => s.exercises.length > 0);

  return (
    <div
      className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-bg-secondary border-t border-border-default sm:border sm:rounded-2xl rounded-t-3xl animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — glass sticky */}
        <div className="glass sticky top-0 z-10 flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-muscu" />
            <span className="label">Diagnostic IA</span>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-full flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-hover transition-colors tap-scale"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-6 space-y-7 stagger">
          {/* Title */}
          <section>
            <h2 className="text-2xl font-semibold tracking-tight mb-1">
              Pourquoi ce programme&nbsp;?
            </h2>
            <p className="text-sm text-text-secondary">
              Les choix qui ont guidé la génération pour toi.
            </p>
          </section>

          {/* Split choice */}
          <section className="surface-1 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Split size={14} className="text-muscu" />
              <span className="label">Split choisi</span>
            </div>
            <p className="text-base font-medium capitalize">
              {program.splitType.replace(/_/g, " ").toLowerCase()}
            </p>
            <p className="text-xs text-text-tertiary mt-1">
              <span className="num">{program.daysPerWeek}</span> séances par semaine ·{" "}
              <span className="num">{program.sessions.length}</span> sessions dans le cycle
            </p>
          </section>

          {/* Volume distribution per muscle */}
          {volumeEntries.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <BarChart3 size={14} className="text-muscu" />
                <span className="label">Volume par muscle · séries/semaine</span>
              </div>
              <div className="space-y-2">
                {volumeEntries
                  .sort(([, a], [, b]) => b.setsPerWeek - a.setsPerWeek)
                  .map(([muscle, data]) => {
                    const tone = muscleTone(data.status);
                    return (
                      <div key={muscle} className="surface-1 p-3">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium capitalize truncate">
                              {muscle}
                            </span>
                            {data.status && (
                              <Badge variant={tone === "error" ? "error" : tone === "warning" ? "warning" : tone === "accent" ? "muscu" : "default"} size="sm">
                                {data.status}
                              </Badge>
                            )}
                          </div>
                          <span className="num text-sm font-semibold text-muscu flex-shrink-0">
                            {data.setsPerWeek}
                          </span>
                        </div>
                        {data.justification && (
                          <p className="text-[11px] text-text-tertiary leading-snug">
                            {data.justification}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </section>
          )}

          {/* Per-exercise reasoning */}
          {sessionsWithReasoning.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Dumbbell size={14} className="text-muscu" />
                <span className="label">Pourquoi ces exercices</span>
              </div>
              <div className="space-y-4">
                {sessionsWithReasoning.map((session) => (
                  <div key={session.id} className="surface-1 p-4">
                    <div className="flex items-baseline justify-between mb-3">
                      <p className="text-sm font-semibold">{session.name}</p>
                      <span className="text-[10px] text-text-tertiary uppercase tracking-wider">
                        {session.day}
                      </span>
                    </div>
                    <div className="space-y-2.5">
                      {session.exercises.map((ex) => (
                        <div key={ex.order} className="flex gap-3">
                          <span className="num text-[10px] text-text-tertiary mt-1 w-5 flex-shrink-0">
                            {ex.order}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-text-primary mb-0.5">
                              {ex.name}
                            </p>
                            <p className="text-[11px] text-text-secondary leading-snug">
                              {ex.reasoning}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* T1D Protocol */}
          {program.t1dProtocol?.preworkout && (
            <section className="surface-1 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Droplet size={14} className="text-diabete" />
                <span className="label">Protocole T1D</span>
              </div>
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-warning uppercase tracking-wider mb-0.5">
                    Avant la séance
                  </p>
                  <p className="text-xs text-text-secondary leading-snug">
                    {program.t1dProtocol.preworkout}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-success uppercase tracking-wider mb-0.5">
                    Après la séance
                  </p>
                  <p className="text-xs text-text-secondary leading-snug">
                    {program.t1dProtocol.postworkout}
                  </p>
                </div>
                {program.t1dProtocol.alerts && program.t1dProtocol.alerts.length > 0 && (
                  <div className="pt-1">
                    <p className="text-[10px] text-error uppercase tracking-wider mb-1">
                      Alertes
                    </p>
                    <ul className="space-y-1">
                      {program.t1dProtocol.alerts.map((a, i) => (
                        <li key={i} className="text-xs text-text-secondary leading-snug">
                          · {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Full analysis */}
          {program.generationReasoning && (
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={14} className="text-muscu" />
                <span className="label">Analyse complète</span>
              </div>
              <div className="surface-1 p-4">
                <p className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                  {program.generationReasoning}
                </p>
              </div>
            </section>
          )}

          {/* Predictions */}
          {predictionEntries.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Target size={14} className="text-muscu" />
                <span className="label">Prédictions de progression</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {predictionEntries.map(([period, prediction]) => (
                  <div key={period} className="surface-1 p-3">
                    <p className="text-[10px] text-text-tertiary uppercase tracking-wider mb-1 capitalize">
                      {period.replace(/([A-Z])/g, " $1").trim()}
                    </p>
                    <p className="text-xs text-text-secondary leading-snug">
                      {prediction}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Close CTA */}
          <div className="pt-2">
            <Button onClick={onClose} fullWidth size="lg">
              Compris
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
