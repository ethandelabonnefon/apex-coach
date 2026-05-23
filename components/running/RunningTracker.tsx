"use client";

/**
 * RunningTracker — UI overlay du tracker GPS (Phase A, mai 2026).
 *
 * Affiche l'écran de tracking en mode plein écran (en surcouche de la
 * page running). 4 stats hero (Durée / Distance / Allure live / Allure
 * moy) + boutons Pause/Resume/Stop.
 *
 * À l'arrêt : modal de confirmation avec récap + bouton "Enregistrer
 * la séance" qui appelle `onSave` avec le summary complet.
 */

import { useEffect, useState } from "react";
import {
  useRunningTracker,
  type TrackerSummary,
} from "@/hooks/useRunningTracker";
import {
  formatDistance,
  formatDuration,
  formatPace,
} from "@/lib/running-tracker";
import {
  Footprints,
  Pause,
  Play,
  Square,
  AlertTriangle,
  X,
  Check,
  Loader2,
} from "lucide-react";

interface RunningTrackerProps {
  /** Callback appelé quand l'utilisateur valide la séance. */
  onSave: (summary: TrackerSummary, feeling: Feeling, notes: string) => void;
  /** Callback appelé quand l'utilisateur ferme le tracker sans sauvegarder. */
  onClose: () => void;
}

type Feeling = 'great' | 'good' | 'ok' | 'hard' | 'bad';

const FEELINGS: { id: Feeling; label: string; emoji: string }[] = [
  { id: 'great', label: 'Excellent', emoji: '🔥' },
  { id: 'good',  label: 'Bon',       emoji: '👍' },
  { id: 'ok',    label: 'OK',        emoji: '👌' },
  { id: 'hard',  label: 'Dur',       emoji: '😓' },
  { id: 'bad',   label: 'Mauvais',   emoji: '😣' },
];

export default function RunningTracker({ onSave, onClose }: RunningTrackerProps) {
  const tracker = useRunningTracker();
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState<TrackerSummary | null>(null);
  const [feeling, setFeeling] = useState<Feeling>('ok');
  const [notes, setNotes] = useState('');

  // Auto-start au mount
  useEffect(() => {
    tracker.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleStop() {
    const s = tracker.stop();
    setSummary(s);
    setShowSummary(true);
  }

  function handleConfirmSave() {
    if (!summary) return;
    onSave(summary, feeling, notes);
  }

  function handleDiscard() {
    tracker.reset();
    onClose();
  }

  // ─── Écran de récap (après stop) ─────────────────────
  if (showSummary && summary) {
    const tooShort = summary.distanceMeters < 100;
    return (
      <div className="fixed inset-0 z-50 bg-bg-primary/95 backdrop-blur-md overflow-y-auto">
        <div className="max-w-2xl mx-auto p-4 sm:p-6 stagger">
          <div className="flex items-center justify-between mb-6">
            <div>
              <p className="label">Séance terminée</p>
              <h1 className="text-2xl font-semibold text-text-primary mt-1">
                Bilan
              </h1>
            </div>
            <button
              type="button"
              onClick={handleDiscard}
              aria-label="Fermer sans enregistrer"
              className="w-10 h-10 rounded-full bg-bg-tertiary border border-border-subtle flex items-center justify-center text-text-secondary hover:text-error hover:border-error/40 transition-colors tap-scale"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {tooShort && (
            <div className="surface-1 rounded-2xl p-4 mb-4 bg-warning/10 border border-warning/30 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <p className="text-xs text-text-secondary leading-relaxed">
                Distance très faible ({formatDistance(summary.distanceMeters)}) — vérifie que tu avais bien le GPS activé.
                Tu peux quand même enregistrer ou abandonner.
              </p>
            </div>
          )}

          {/* Stats grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <SummaryStat label="Durée"          value={formatDuration(summary.durationSec)} />
            <SummaryStat label="Distance"       value={formatDistance(summary.distanceMeters)} />
            <SummaryStat label="Allure moyenne" value={formatPace(summary.paceAvg)} unit="/km" />
            <SummaryStat label="Splits 1km"     value={`${summary.splits.length}`} />
          </div>

          {/* Splits détaillés */}
          {summary.splits.length > 0 && (
            <section className="surface-1 rounded-2xl p-5 mb-4">
              <p className="label mb-3">Splits par km</p>
              <div className="space-y-1.5">
                {summary.splits.map((s) => (
                  <div
                    key={s.km}
                    className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2 text-sm"
                  >
                    <span className="num text-text-secondary">Km {s.km}</span>
                    <span className="num text-running font-semibold">
                      {formatPace(s.paceMinPerKm)}
                      <span className="text-[10px] text-text-tertiary ml-1">/km</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Ressenti */}
          <section className="surface-1 rounded-2xl p-5 mb-4">
            <p className="label mb-3">Ressenti</p>
            <div className="grid grid-cols-5 gap-2">
              {FEELINGS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFeeling(f.id)}
                  className={`flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-all tap-scale ${
                    feeling === f.id
                      ? 'bg-running/15 border-running/40 text-running'
                      : 'bg-bg-tertiary border-border-subtle text-text-secondary'
                  }`}
                >
                  <span className="text-lg" aria-hidden>{f.emoji}</span>
                  <span className="text-[10px] font-medium">{f.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Notes */}
          <section className="surface-1 rounded-2xl p-5 mb-4">
            <label className="block">
              <p className="label mb-2">Notes (optionnel)</p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Météo, ressenti, douleurs, glycémie observée..."
                className="w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-running/50 transition-colors resize-none"
              />
            </label>
          </section>

          {/* Boutons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleDiscard}
              className="flex-1 bg-bg-tertiary text-text-secondary font-medium py-3 rounded-xl hover:bg-bg-hover transition-colors tap-scale border border-border-subtle"
            >
              Abandonner
            </button>
            <button
              type="button"
              onClick={handleConfirmSave}
              className="flex-[2] bg-running text-ink font-semibold py-3 rounded-xl hover:bg-running/90 transition-colors tap-scale flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Enregistrer la séance
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Écran de tracking (en direct) ───────────────────
  const isPaused = tracker.status === 'paused';
  const isStarting = tracker.status === 'idle';

  return (
    <div className="fixed inset-0 z-50 bg-bg-primary flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-6">
        <div className="flex items-center gap-2">
          <Footprints className="w-5 h-5 text-running" />
          <p className="text-sm font-medium text-text-primary">Séance running</p>
        </div>
        <button
          type="button"
          onClick={handleDiscard}
          aria-label="Quitter le tracker"
          className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-subtle flex items-center justify-center text-text-secondary hover:text-error transition-colors tap-scale"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* GPS status */}
      {tracker.gpsError && (
        <div className="mx-4 sm:mx-6 mb-4 rounded-xl bg-error/10 border border-error/30 px-3 py-2 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
          <p className="text-xs text-error leading-snug">{tracker.gpsError}</p>
        </div>
      )}

      {/* Stats hero — durée géante au centre */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-6">
        <p className="label mb-2">Durée</p>
        <p className="num-hero text-6xl sm:text-7xl font-semibold text-running tabular-nums leading-none">
          {formatDuration(tracker.durationSec)}
        </p>
        {isPaused && (
          <p className="text-xs text-warning mt-3 uppercase tracking-wide font-semibold animate-pulse">
            En pause
          </p>
        )}
        {isStarting && (
          <div className="flex items-center gap-2 mt-3 text-xs text-text-secondary">
            <Loader2 className="w-3 h-3 animate-spin" />
            Acquisition GPS…
          </div>
        )}

        {/* Stats secondaires */}
        <div className="grid grid-cols-3 gap-4 mt-12 w-full max-w-md">
          <HeroStat label="Distance" value={formatDistance(tracker.distanceMeters)} />
          <HeroStat label="Allure" value={formatPace(tracker.paceLive)} unit="/km" />
          <HeroStat label="Allure moy." value={formatPace(tracker.paceAvg)} unit="/km" />
        </div>

        {tracker.points.length > 0 && (
          <p className="num text-[10px] text-text-tertiary mt-6">
            {tracker.points.length} points GPS · précision ~{Math.round(tracker.points.at(-1)?.accuracy ?? 0)}m
          </p>
        )}
      </div>

      {/* Boutons de contrôle */}
      <div className="p-4 sm:p-6 flex items-center justify-center gap-4">
        {!isPaused ? (
          <button
            type="button"
            onClick={tracker.pause}
            disabled={isStarting}
            className="w-16 h-16 rounded-full bg-bg-tertiary border border-border-default flex items-center justify-center text-text-primary hover:bg-bg-hover transition-colors tap-scale disabled:opacity-40"
            aria-label="Pause"
          >
            <Pause className="w-6 h-6" />
          </button>
        ) : (
          <button
            type="button"
            onClick={tracker.resume}
            className="w-16 h-16 rounded-full bg-running/20 border border-running/40 flex items-center justify-center text-running hover:bg-running/30 transition-colors tap-scale"
            aria-label="Reprendre"
          >
            <Play className="w-6 h-6 ml-0.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleStop}
          disabled={isStarting}
          className="w-20 h-20 rounded-full bg-running text-ink flex items-center justify-center font-bold transition-all tap-scale disabled:opacity-40 hover:bg-running/90 shadow-lg shadow-running/20"
          aria-label="Arrêter et enregistrer"
        >
          <Square className="w-7 h-7" fill="currentColor" />
        </button>
      </div>

      {/* Footer hint */}
      <p className="text-center text-[10px] text-text-tertiary pb-4 px-4">
        Garde APEX ouvert pendant la séance. L&apos;écran reste allumé automatiquement.
      </p>
    </div>
  );
}

function HeroStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="text-center">
      <p className="label mb-1">{label}</p>
      <p className="num text-xl sm:text-2xl font-semibold text-text-primary tabular-nums">
        {value}
        {unit && <span className="text-[10px] text-text-tertiary ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function SummaryStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="surface-1 rounded-xl p-4">
      <p className="label mb-1.5">{label}</p>
      <p className="num text-xl font-semibold text-running tabular-nums">
        {value}
        {unit && <span className="text-[10px] text-text-tertiary ml-1">{unit}</span>}
      </p>
    </div>
  );
}
