"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  calculateVMA,
  calculateZones,
  formatPace,
  predictRaceTime,
  formatTime,
  getPhase,
} from "@/lib/running-science";
import { HALF_MARATHON_PLAN } from "@/lib/constants";
import type { CompletedRunningSession } from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Footprints,
  ChevronLeft,
  ChevronRight,
  Play,
  Check,
  Trash2,
  Droplet,
  Activity,
  Timer,
} from "lucide-react";

const BASE_VOLUME = 20;
const VO2MAX = 49;

interface Session {
  name: string;
  type: string;
  distance: number;
  zone: string;
  details: string;
  paceRange?: string;
  intervals?: { reps: number; distance: number; recovery: number } | null;
}

function generateSessions(
  weekNumber: number,
  totalVolume: number,
  vma: number,
  zones: ReturnType<typeof calculateZones>,
  interval: { reps: number; distance: number; recovery: number } | null
): Session[] {
  const phase = getPhase(weekNumber);

  if (phase === "Taper") {
    const easyDist = +(totalVolume * 0.55).toFixed(1);
    const tempoDist = +(totalVolume * 0.45).toFixed(1);
    return [
      { name: "Footing facile", type: "easy", distance: easyDist, zone: "Z2", details: `${easyDist} km en endurance fondamentale`, paceRange: `${formatPace(zones.z2.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}` },
      { name: "Tempo court", type: "tempo", distance: tempoDist, zone: "Z3", details: `10 min Z2 + ${(tempoDist - 3).toFixed(1)} km Z3 + 10 min Z2`, paceRange: `${formatPace(zones.z3.paceMinKm.min)} – ${formatPace(zones.z3.paceMinKm.max)}` },
    ];
  }

  if (phase === "Base") {
    const easyDist = +(totalVolume * 0.4).toFixed(1);
    const longDist = +(totalVolume * 0.6).toFixed(1);
    return [
      { name: "Footing facile", type: "easy", distance: easyDist, zone: "Z2", details: `${easyDist} km en endurance fondamentale`, paceRange: `${formatPace(zones.z2.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}` },
      { name: "Sortie longue", type: "long", distance: longDist, zone: "Z2", details: `${longDist} km en Z1-Z2, allure conversationnelle`, paceRange: `${formatPace(zones.z1.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}` },
    ];
  }

  if (phase === "Build") {
    const longDist = +(totalVolume * 0.55).toFixed(1);
    const session1Dist = +(totalVolume * 0.45).toFixed(1);

    const session1: Session = interval
      ? {
          name: "Fractionné",
          type: "intervals",
          distance: session1Dist,
          zone: "Z4-Z5",
          details: `Échauffement 15 min Z2 + ${interval.reps}×${interval.distance}m (rec ${interval.recovery}m) + retour 10 min Z1`,
          paceRange: `${formatPace(zones.z4.paceMinKm.min)} – ${formatPace(zones.z5.paceMinKm.max)}`,
          intervals: interval,
        }
      : {
          name: "Footing facile",
          type: "easy",
          distance: session1Dist,
          zone: "Z2",
          details: `${session1Dist} km en endurance fondamentale`,
          paceRange: `${formatPace(zones.z2.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}`,
        };

    return [
      session1,
      { name: "Sortie longue", type: "long", distance: longDist, zone: "Z2", details: `${longDist} km en Z1-Z2, progressive`, paceRange: `${formatPace(zones.z1.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}` },
    ];
  }

  // Peak
  const longDist = +(totalVolume * 0.5).toFixed(1);
  const session1Dist = +(totalVolume * 0.5).toFixed(1);

  const session1: Session = interval
    ? {
        name: "Fractionné intensif",
        type: "intervals",
        distance: session1Dist,
        zone: "Z4-Z5",
        details: `Échauffement 15 min Z2 + ${interval.reps}×${interval.distance}m (rec ${interval.recovery}m) + retour 10 min Z1`,
        paceRange: `${formatPace(zones.z4.paceMinKm.min)} – ${formatPace(zones.z5.paceMinKm.max)}`,
        intervals: interval,
      }
    : {
        name: "Tempo",
        type: "tempo",
        distance: session1Dist,
        zone: "Z3",
        details: `10 min Z2 + ${(session1Dist - 3).toFixed(1)} km Z3 + 10 min Z2`,
        paceRange: `${formatPace(zones.z3.paceMinKm.min)} – ${formatPace(zones.z3.paceMinKm.max)}`,
      };

  return [
    session1,
    { name: "Sortie longue progressive", type: "long", distance: longDist, zone: "Z2-Z3", details: `${(longDist * 0.7).toFixed(1)} km Z2 + ${(longDist * 0.3).toFixed(1)} km Z3`, paceRange: `${formatPace(zones.z2.paceMinKm.min)} – ${formatPace(zones.z3.paceMinKm.max)}` },
  ];
}

function phaseColor(phase: string): string {
  switch (phase) {
    case "Base": return "var(--success)";
    case "Build": return "var(--running)";
    case "Peak": return "var(--warning)";
    case "Taper": return "var(--accent-2)";
    default: return "var(--running)";
  }
}

function phaseVariant(phase: string): "success" | "info" | "warning" | "accent" | "default" {
  switch (phase) {
    case "Base": return "success";
    case "Build": return "info";
    case "Peak": return "warning";
    case "Taper": return "accent";
    default: return "default";
  }
}

export default function RunningPage() {
  const { currentRunningWeek, setRunningWeek, completedRunningSessions, addCompletedRunningSession, deleteCompletedRunningSession } = useStore();
  const [trackingSession, setTrackingSession] = useState<number | null>(null);

  const vma = calculateVMA(VO2MAX);
  const zones = calculateZones(vma);

  const weeks = Array.from({ length: HALF_MARATHON_PLAN.duration }, (_, i) => {
    const weekNum = i + 1;
    const volume = +(BASE_VOLUME * HALF_MARATHON_PLAN.volumeProgression[i]).toFixed(1);
    const phase = getPhase(weekNum);
    const interval = HALF_MARATHON_PLAN.intervalProgression[i] ?? null;
    const sessions = generateSessions(weekNum, volume, vma, zones, interval);
    return { weekNum, volume, phase, sessions, interval };
  });

  const currentWeekData = weeks[currentRunningWeek - 1];
  const weekCompletedSessions = completedRunningSessions.filter((s) => s.weekNumber === currentRunningWeek);
  const getSessionCompletion = (sessionIdx: number) => weekCompletedSessions.find((s) => s.sessionIndex === sessionIdx);

  const weekTotalPlanned = currentWeekData.sessions.reduce((sum, s) => sum + s.distance, 0);
  const weekTotalDone = weekCompletedSessions.reduce((sum, s) => sum + s.actualDistance, 0);
  const weekSessionsDone = weekCompletedSessions.length;
  const weekSessionsTotal = currentWeekData.sessions.length;

  const semiPred = predictRaceTime(VO2MAX, 21.1);

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">

      {/* ============ HERO : Semaine courante ============ */}
      <section className="mb-8 animate-in">
        <div className="flex items-center gap-2 mb-2">
          <Footprints size={14} className="text-running" />
          <span className="label">
            Semi-marathon · S{currentRunningWeek}/14 · {currentWeekData.phase}
          </span>
        </div>

        <div className="surface-1 p-6 lg:p-8 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-[0.10] blur-3xl"
            style={{ background: phaseColor(currentWeekData.phase) }}
          />
          <div className="relative">
            <div className="flex items-start justify-between gap-3 mb-5">
              <div>
                <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight mb-1">
                  Semaine <span className="num">{currentRunningWeek}</span>
                </h1>
                <p className="text-sm text-text-secondary">
                  <span className="num">{currentWeekData.volume}</span> km prévus ·{" "}
                  <span className="num">{weekSessionsTotal}</span> séances
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRunningWeek(Math.max(1, currentRunningWeek - 1))}
                  disabled={currentRunningWeek <= 1}
                >
                  <ChevronLeft size={16} />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRunningWeek(Math.min(14, currentRunningWeek + 1))}
                  disabled={currentRunningWeek >= 14}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>

            {/* 3 key numbers */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div>
                <span className="label">Séances</span>
                <p className="num text-2xl font-semibold mt-1">
                  <span className="text-running">{weekSessionsDone}</span>
                  <span className="text-text-tertiary text-lg">/{weekSessionsTotal}</span>
                </p>
              </div>
              <div>
                <span className="label">Km réalisés</span>
                <p className="num text-2xl font-semibold mt-1">
                  <span className="text-running">{weekTotalDone.toFixed(1)}</span>
                  <span className="text-text-tertiary text-lg">/{weekTotalPlanned.toFixed(0)}</span>
                </p>
              </div>
              <div>
                <span className="label">VMA</span>
                <p className="num text-2xl font-semibold mt-1 text-running">
                  {vma.toFixed(1)}
                  <span className="text-text-tertiary text-sm ml-1">km/h</span>
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${weekTotalPlanned > 0 ? Math.min(100, (weekTotalDone / weekTotalPlanned) * 100) : 0}%`,
                  background: "var(--running)",
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ============ Séances de la semaine ============ */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Séances cette semaine</h2>
          <span className="label">{currentWeekData.phase}</span>
        </div>

        <div className="space-y-3">
          {currentWeekData.sessions.map((session, idx) => {
            const completed = getSessionCompletion(idx);
            const isTracking = trackingSession === idx;
            return (
              <div
                key={idx}
                className={`surface-1 p-5 transition-colors ${completed ? "ring-1 ring-success/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-base truncate">{session.name}</h3>
                      {completed && <Badge variant="success" size="sm" dot>Fait</Badge>}
                    </div>
                    <p className="text-[11px] text-text-tertiary">
                      Séance {idx + 1} · Zone {session.zone}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="num text-2xl font-semibold text-running leading-none">
                      {session.distance}
                      <span className="text-sm text-text-tertiary ml-1">km</span>
                    </p>
                    {session.paceRange && (
                      <p className="num text-[11px] text-text-tertiary mt-1">{session.paceRange}</p>
                    )}
                  </div>
                </div>

                <p className="text-[13px] text-text-secondary leading-snug mb-3">
                  {session.details}
                </p>

                {session.intervals && (
                  <div className="bg-warning/8 rounded-lg px-3 py-2 mb-3 border-l-2 border-warning">
                    <p className="text-xs text-warning font-medium">
                      <span className="num">{session.intervals.reps}</span>×<span className="num">{session.intervals.distance}</span>m
                      <span className="text-text-tertiary"> · récup <span className="num">{session.intervals.recovery}</span>m trot</span>
                    </p>
                  </div>
                )}

                {completed && !isTracking && (
                  <div className="mt-3 pt-3 border-t border-border-subtle">
                    <div className="grid grid-cols-3 gap-2 text-center mb-2">
                      <div>
                        <span className="label">Réalisé</span>
                        <p className="num text-sm font-semibold text-success mt-0.5">{completed.actualDistance} km</p>
                      </div>
                      <div>
                        <span className="label">Durée</span>
                        <p className="num text-sm font-semibold mt-0.5">{completed.actualDuration} min</p>
                      </div>
                      <div>
                        <span className="label">Allure</span>
                        <p className="num text-sm font-semibold text-running mt-0.5">{formatPace(completed.avgPace)}/km</p>
                      </div>
                    </div>
                    {(completed.glucoseBefore || completed.glucoseAfter) && (
                      <p className="text-[11px] text-text-tertiary flex items-center gap-2">
                        <Droplet size={10} className="text-diabete" />
                        {completed.glucoseBefore && <>avant <span className="num text-text-secondary">{completed.glucoseBefore}</span></>}
                        {completed.glucoseAfter && <>· après <span className="num text-text-secondary">{completed.glucoseAfter}</span></>}
                      </p>
                    )}
                    {completed.notes && (
                      <p className="text-[11px] text-text-tertiary italic mt-1">{completed.notes}</p>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 !text-error"
                      onClick={() => deleteCompletedRunningSession(completed.id)}
                      leftIcon={<Trash2 size={12} />}
                    >
                      Supprimer
                    </Button>
                  </div>
                )}

                {isTracking && (
                  <SessionTrackingForm
                    weekNumber={currentRunningWeek}
                    sessionIndex={idx}
                    plannedDistance={session.distance}
                    onSave={(s) => { addCompletedRunningSession(s); setTrackingSession(null); }}
                    onCancel={() => setTrackingSession(null)}
                  />
                )}

                {!completed && !isTracking && (
                  <Button
                    variant="secondary"
                    size="md"
                    fullWidth
                    className="mt-2"
                    leftIcon={<Play size={14} />}
                    onClick={() => setTrackingSession(idx)}
                  >
                    Logger cette séance
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ============ Prédiction semi + VMA quick stats ============ */}
      <section className="mb-8 grid grid-cols-2 gap-3">
        <div className="surface-1 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Timer size={12} className="text-running" />
            <span className="label">Prédit semi</span>
          </div>
          <p className="num text-2xl font-semibold text-running mt-1">{formatTime(semiPred.predictedTimeMinutes)}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            <span className="num">{formatPace(semiPred.predictedPace)}</span>/km · {semiPred.confidence}
          </p>
        </div>
        <div className="surface-1 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Activity size={12} className="text-running" />
            <span className="label">Zones</span>
          </div>
          <p className="text-sm font-medium mt-1 truncate">
            Z2 <span className="num text-text-secondary text-[11px]">{formatPace(zones.z2.paceMinKm.min)}–{formatPace(zones.z2.paceMinKm.max)}</span>
          </p>
          <Link href="/running/zones" className="text-[11px] text-running hover:underline inline-flex items-center gap-0.5 mt-1">
            Détail Z1-Z5 <ChevronRight size={10} />
          </Link>
        </div>
      </section>

      {/* ============ 14 semaines overview ============ */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Plan 14 semaines</h2>
          <span className="label">
            <span className="num">{completedRunningSessions.length}</span>/<span className="num">{weeks.reduce((s, w) => s + w.sessions.length, 0)}</span> séances
          </span>
        </div>

        <div className="surface-1 p-4">
          <div className="space-y-1.5">
            {weeks.map((week) => {
              const isCurrent = week.weekNum === currentRunningWeek;
              const weekDone = completedRunningSessions.filter((s) => s.weekNumber === week.weekNum).length;
              const weekTotal = week.sessions.length;
              const weekFullyDone = weekDone >= weekTotal;
              return (
                <button
                  key={week.weekNum}
                  onClick={() => setRunningWeek(week.weekNum)}
                  className={`w-full flex items-center gap-3 p-2 rounded-lg transition-all text-left tap-scale ${
                    isCurrent ? "bg-running/10" : "hover:bg-bg-tertiary"
                  }`}
                >
                  <div
                    className="h-7 w-7 rounded flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                    style={{
                      background: weekFullyDone
                        ? "var(--success)"
                        : isCurrent
                        ? "var(--running)"
                        : "var(--bg-tertiary)",
                      color: weekFullyDone || isCurrent ? "var(--text-ink)" : "var(--text-tertiary)",
                    }}
                  >
                    {weekFullyDone ? <Check size={14} strokeWidth={3} /> : <span className="num">{week.weekNum}</span>}
                  </div>

                  <Badge variant={phaseVariant(week.phase)} size="sm">{week.phase}</Badge>

                  <div className="flex-1 h-1 rounded-full bg-bg-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${(week.volume / Math.max(...weeks.map((w) => w.volume))) * 100}%`,
                        background: weekFullyDone ? "var(--success)" : isCurrent ? "var(--running)" : "rgba(255,255,255,0.12)",
                      }}
                    />
                  </div>

                  <span className={`num text-[11px] font-medium min-w-[44px] text-right ${
                    weekFullyDone ? "text-success" : isCurrent ? "text-running" : "text-text-tertiary"
                  }`}>
                    {week.volume} km
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ T1D tip compact ============ */}
      <section className="mb-6 surface-1 p-5 border-l-2 border-diabete">
        <div className="flex items-center gap-2 mb-2">
          <Droplet size={14} className="text-diabete" />
          <span className="label">Glycémie avant course</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div><Badge variant="error" size="sm" dot>&lt;100</Badge><p className="text-text-tertiary mt-1">20-30g glucides · attendre 15min</p></div>
          <div><Badge variant="warning" size="sm" dot>100-120</Badge><p className="text-text-tertiary mt-1">15g glucides · partir après 10min</p></div>
          <div><Badge variant="success" size="sm" dot>120-180</Badge><p className="text-text-tertiary mt-1">Zone idéale · c&apos;est parti</p></div>
          <div><Badge variant="error" size="sm" dot>&gt;250</Badge><p className="text-text-tertiary mt-1">Vérifier cétones avant</p></div>
        </div>
      </section>
    </div>
  );
}

// ========== Tracking Form ==========

function SessionTrackingForm({
  weekNumber,
  sessionIndex,
  plannedDistance,
  onSave,
  onCancel,
}: {
  weekNumber: number;
  sessionIndex: number;
  plannedDistance: number;
  onSave: (session: CompletedRunningSession) => void;
  onCancel: () => void;
}) {
  const [distance, setDistance] = useState(plannedDistance.toString());
  const [duration, setDuration] = useState("");
  const [glucoseBefore, setGlucoseBefore] = useState("");
  const [glucoseAfter, setGlucoseAfter] = useState("");
  const [feeling, setFeeling] = useState<CompletedRunningSession["feeling"]>("good");
  const [notes, setNotes] = useState("");

  const feelings: { value: CompletedRunningSession["feeling"]; label: string }[] = [
    { value: "great", label: "Super" },
    { value: "good", label: "Bien" },
    { value: "ok", label: "OK" },
    { value: "hard", label: "Dur" },
    { value: "bad", label: "Difficile" },
  ];

  const handleSubmit = () => {
    const dist = parseFloat(distance);
    const dur = parseFloat(duration);
    if (!dist || !dur) return;
    onSave({
      id: `run-${Date.now()}`,
      weekNumber,
      sessionIndex,
      date: new Date().toISOString(),
      plannedDistance,
      actualDistance: dist,
      actualDuration: dur,
      avgPace: dur / dist,
      glucoseBefore: glucoseBefore ? parseFloat(glucoseBefore) : null,
      glucoseAfter: glucoseAfter ? parseFloat(glucoseAfter) : null,
      feeling,
      notes,
    });
  };

  const inputClass = "w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-running/40 num";

  return (
    <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label block mb-1">Distance (km)</label>
          <input type="number" step="0.1" inputMode="decimal" value={distance} onChange={(e) => setDistance(e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className="label block mb-1">Durée (min)</label>
          <input type="number" step="1" inputMode="numeric" value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="45" className={inputClass} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label block mb-1">Glucose avant</label>
          <input type="number" inputMode="numeric" value={glucoseBefore} onChange={(e) => setGlucoseBefore(e.target.value)} placeholder="opt." className={inputClass} />
        </div>
        <div>
          <label className="label block mb-1">Glucose après</label>
          <input type="number" inputMode="numeric" value={glucoseAfter} onChange={(e) => setGlucoseAfter(e.target.value)} placeholder="opt." className={inputClass} />
        </div>
      </div>
      <div>
        <label className="label block mb-1.5">Ressenti</label>
        <div className="flex gap-1.5">
          {feelings.map((f) => (
            <button
              key={f.value}
              onClick={() => setFeeling(f.value)}
              style={{ touchAction: "manipulation" }}
              className={`flex-1 py-2 text-xs rounded-lg transition-all tap-scale ${
                feeling === f.value
                  ? "bg-running/15 text-running ring-1 ring-running/40"
                  : "bg-bg-tertiary text-text-tertiary hover:bg-bg-hover"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label block mb-1">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Sensations, météo..."
          className={`${inputClass} resize-none`}
        />
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSubmit} disabled={!distance || !duration}>Enregistrer</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}
