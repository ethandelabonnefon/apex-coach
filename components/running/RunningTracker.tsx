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
import dynamic from "next/dynamic";
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
  MapPin,
} from "lucide-react";

// Leaflet a besoin du DOM → import dynamique sans SSR
const RunningMap = dynamic(() => import("./RunningMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-bg-secondary text-text-tertiary">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  ),
});

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
      <div
        className="fixed inset-0 z-50 bg-bg-primary/95 backdrop-blur-md overflow-y-auto"
        style={{
          paddingTop: "env(safe-area-inset-top)",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
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

          {/* Carte avec trace complète (Phase B) */}
          {summary.points.length >= 2 && (
            <section className="surface-1 rounded-2xl overflow-hidden mb-4 relative">
              <div className="absolute top-3 left-3 z-[500] flex items-center gap-1.5 bg-bg-tertiary/80 backdrop-blur-md rounded-full px-2.5 py-1 border border-border-subtle">
                <MapPin className="w-3 h-3 text-running" />
                <span className="text-[10px] uppercase tracking-wide text-text-secondary font-semibold">
                  Trace GPS
                </span>
              </div>
              <div style={{ height: 280 }}>
                <RunningMap points={summary.points} mode="replay" />
              </div>
              <div className="absolute bottom-3 right-3 z-[500] flex flex-col items-end gap-1 text-[9px] text-text-tertiary">
                <div className="flex items-center gap-1 bg-bg-tertiary/80 backdrop-blur-md rounded-full px-2 py-0.5 border border-border-subtle">
                  <span className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span>Départ</span>
                </div>
                <div className="flex items-center gap-1 bg-bg-tertiary/80 backdrop-blur-md rounded-full px-2 py-0.5 border border-border-subtle">
                  <span className="w-1.5 h-1.5 rounded-full bg-error" />
                  <span>Arrivée</span>
                </div>
              </div>
            </section>
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
    <div className="fixed inset-0 z-50 bg-bg-primary">
      {/* Carte plein écran en background */}
      <div className="absolute inset-0">
        <RunningMap points={tracker.points} mode="live" />
      </div>

      {/* Overlay top : header glass.
          z-[1000] obligatoire : Leaflet utilise z-100 à z-800 sur ses
          panes internes (tilePane, markerPane, tooltipPane, controls).
          Sans ça, nos overlays sont cachés derrière les markers Leaflet.
          paddingTop safe-area-inset-top : sur iPhone, descend le header
          sous la barre système (heure/wifi/batterie). */}
      <div
        className="absolute top-0 inset-x-0 z-[1000] glass border-b border-border-subtle"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <Footprints className="w-5 h-5 text-running" />
            <p className="text-sm font-medium text-text-primary">Séance running</p>
            {isPaused && (
              <span className="ml-1 text-[10px] text-warning uppercase tracking-wide font-semibold animate-pulse">
                · En pause
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={handleDiscard}
            aria-label="Quitter le tracker"
            className="w-9 h-9 rounded-full bg-bg-tertiary/80 border border-border-subtle flex items-center justify-center text-text-secondary hover:text-error transition-colors tap-scale"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* GPS status banner */}
        {tracker.gpsError && (
          <div className="mx-3 mb-3 rounded-xl bg-error/15 border border-error/30 px-3 py-2 flex items-start gap-2 backdrop-blur-md">
            <AlertTriangle className="w-4 h-4 text-error shrink-0 mt-0.5" />
            <p className="text-xs text-error leading-snug">{tracker.gpsError}</p>
          </div>
        )}
        {isStarting && !tracker.gpsError && (
          <div className="mx-3 mb-3 rounded-xl bg-bg-tertiary/80 border border-border-subtle px-3 py-2 flex items-center gap-2 backdrop-blur-md">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-running" />
            <p className="text-xs text-text-secondary">Acquisition GPS en cours…</p>
          </div>
        )}
      </div>

      {/* Overlay bottom : stats + boutons en glass (z-[1000] cf top).
          paddingBottom safe-area-inset-bottom : sur iPhone, évite que
          les boutons soient cachés par le home indicator. */}
      <div
        className="absolute bottom-0 inset-x-0 z-[1000] glass border-t border-border-subtle"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {/* Stats compactes — 4 colonnes */}
        <div className="grid grid-cols-4 gap-2 px-3 py-3 sm:px-4">
          <OverlayStat label="Durée" value={formatDuration(tracker.durationSec)} />
          <OverlayStat label="Distance" value={formatDistance(tracker.distanceMeters)} />
          <OverlayStat label="Allure" value={formatPace(tracker.paceLive)} unit="/km" />
          <OverlayStat label="Moy." value={formatPace(tracker.paceAvg)} unit="/km" />
        </div>

        {/* Boutons */}
        <div className="px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-center gap-4">
          {!isPaused ? (
            <button
              type="button"
              onClick={tracker.pause}
              disabled={isStarting}
              className="w-14 h-14 rounded-full bg-bg-tertiary/90 border border-border-default flex items-center justify-center text-text-primary hover:bg-bg-hover transition-colors tap-scale disabled:opacity-40 backdrop-blur-md"
              aria-label="Pause"
            >
              <Pause className="w-5 h-5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={tracker.resume}
              className="w-14 h-14 rounded-full bg-running/30 border border-running/50 flex items-center justify-center text-running hover:bg-running/40 transition-colors tap-scale backdrop-blur-md"
              aria-label="Reprendre"
            >
              <Play className="w-5 h-5 ml-0.5" />
            </button>
          )}
          <button
            type="button"
            onClick={handleStop}
            disabled={isStarting}
            className="w-18 h-18 rounded-full bg-running text-ink flex items-center justify-center font-bold transition-all tap-scale disabled:opacity-40 hover:bg-running/90 shadow-xl shadow-running/30"
            style={{ width: '4.5rem', height: '4.5rem' }}
            aria-label="Arrêter et enregistrer"
          >
            <Square className="w-6 h-6" fill="currentColor" />
          </button>
        </div>

        {/* Indicator GPS points (très discret) */}
        {tracker.points.length > 0 && (
          <p className="num text-[9px] text-text-tertiary text-center pb-2 px-4 leading-none">
            {tracker.points.length} pts · ±{Math.round(tracker.points.at(-1)?.accuracy ?? 0)}m
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Stat compacte pour l'overlay glass de l'écran de tracking.
 * Format vertical : label en haut, valeur en gros num en bas.
 */
function OverlayStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="text-center min-w-0">
      <p className="text-[9px] uppercase tracking-wide text-text-tertiary font-semibold mb-0.5 truncate">
        {label}
      </p>
      <p className="num text-base sm:text-lg font-semibold text-text-primary tabular-nums leading-none truncate">
        {value}
        {unit && <span className="text-[9px] text-text-tertiary ml-0.5">{unit}</span>}
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
