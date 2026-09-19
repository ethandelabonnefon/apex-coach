"use client";

import { Card, Badge, Button, SectionTitle, InfoBox } from "@/components/ui";
import type { ProgramChange } from "@/lib/store";
import type { DiagnosticDiff } from "@/lib/diagnostic-comparison";

interface ProgramUpdateModalProps {
  change: ProgramChange;
  diff: DiagnosticDiff | null;
  onAcknowledge: () => void;
  onApply?: () => void;
  onClose: () => void;
}

export default function ProgramUpdateModal({ change, diff, onAcknowledge, onApply, onClose }: ProgramUpdateModalProps) {
  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border-default bg-bg-elevated">
        {/* Header */}
        <div className="sticky top-0 bg-bg-elevated border-b border-border-subtle p-5 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="text-xl">🔄</span>
            <h2 className="text-lg font-bold">Programme mis à jour</h2>
          </div>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary transition-colors text-xl">&times;</button>
        </div>

        <div className="p-5 space-y-6">
          {/* Diagnostic changes detected */}
          {diff && diff.hasSignificantChanges && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📊</span>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Changements détectés</h3>
              </div>
              <div className="space-y-2">
                {diff.changes.map((c, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-bg-hover">
                    <span className="text-sm text-text-secondary">{c.label}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-text-tertiary">{c.before}</span>
                      <span className="text-text-tertiary">→</span>
                      <span className="text-sm font-semibold">{c.after}</span>
                      <Badge color={c.direction === 'up' ? 'green' : c.direction === 'down' ? 'orange' : 'gray'}>
                        {c.delta > 0 ? '+' : ''}{c.delta.toFixed(1)}
                      </Badge>
                    </div>
                  </div>
                ))}
                {diff.mobilityChanges.map((c, i) => (
                  <div key={`mob-${i}`} className="flex items-center justify-between p-3 rounded-lg bg-bg-hover">
                    <span className="text-sm text-text-secondary">{c.label}</span>
                    <div className="flex items-center gap-2">
                      <Badge color="gray">{c.before}</Badge>
                      <span className="text-text-tertiary">→</span>
                      <Badge color="green">{c.after}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Exercise changes */}
          {change.comparativeAnalysis.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">💪</span>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Modifications du programme</h3>
              </div>
              <div className="space-y-3">
                {change.comparativeAnalysis.map((item, i) => (
                  <Card key={i}>
                    <div className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-[var(--chart-2)]/15 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[var(--chart-2)] text-xs font-bold">{i + 1}</span>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-text-primary">{item.aspect}</p>
                        <div className="mt-2 space-y-1">
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-text-tertiary shrink-0 w-12">Avant</span>
                            <span className="text-xs text-text-secondary">{item.before}</span>
                          </div>
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-[var(--success)]/60 shrink-0 w-12">Après</span>
                            <span className="text-xs text-[var(--success)]/80 font-medium">{item.after}</span>
                          </div>
                        </div>
                        {item.reasoning && (
                          <div className="mt-3 p-2.5 rounded-lg bg-[var(--chart-2)]/5 border border-[var(--chart-2)]/10">
                            <p className="text-[10px] text-[var(--chart-2)]/60 uppercase tracking-wider mb-1">Pourquoi ?</p>
                            <p className="text-xs text-text-secondary leading-relaxed">{item.reasoning}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Volume adjustments */}
          {Object.keys(change.volumeAdjustments).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📈</span>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Volumes ajustés</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(change.volumeAdjustments).map(([muscle, adj]) => (
                  <div key={muscle} className="p-3 rounded-lg bg-bg-hover">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-text-secondary capitalize">{muscle}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-text-tertiary">{adj.before} séries</span>
                        <span className="text-text-tertiary">→</span>
                        <span className="text-sm font-semibold">{adj.after} séries</span>
                      </div>
                    </div>
                    <p className="text-xs text-text-tertiary mt-1">{adj.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Priorities */}
          {change.priorities.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🎯</span>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Nouvelles priorités</h3>
              </div>
              <div className="space-y-2">
                {change.priorities.map((p) => (
                  <div key={p.rank} className="flex items-center gap-3 p-2.5 rounded-lg bg-bg-hover">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      p.rank === 1 ? 'bg-[var(--success)]/15 text-[var(--success)]' : p.rank === 2 ? 'bg-[var(--chart-2)]/15 text-[var(--chart-2)]' : 'bg-bg-hover text-text-secondary'
                    }`}>
                      {p.rank}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text-primary">{p.muscle}</p>
                      <p className="text-xs text-text-tertiary">{p.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Predictions */}
          {Object.keys(change.predictions).length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">🔮</span>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Prédictions à 8 semaines</h3>
              </div>
              <Card>
                <div className="space-y-2">
                  {Object.entries(change.predictions).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-2 rounded-lg bg-bg-hover">
                      <span className="text-sm text-text-secondary capitalize">{key.replace(/_/g, ' ')}</span>
                      <span className="text-sm text-[var(--success)] font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* Full analysis text */}
          {change.fullAnalysis && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-base">📋</span>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-text-secondary">Analyse détaillée</h3>
              </div>
              <Card>
                <div className="text-sm text-text-secondary leading-relaxed whitespace-pre-line">
                  {change.fullAnalysis}
                </div>
              </Card>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-bg-elevated border-t border-border-subtle p-5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
          <Button variant="secondary" onClick={onAcknowledge}>Ignorer</Button>
          {onApply && (
            <Button onClick={onApply}>
              Appliquer au programme
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
