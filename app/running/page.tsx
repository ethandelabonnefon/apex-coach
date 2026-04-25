"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  calculateZones,
  formatPace,
  predictRaceTime,
  formatTime,
  getPhase,
  deriveVMA,
} from "@/lib/running-science";
import { HALF_MARATHON_PLAN } from "@/lib/constants";
import type { CompletedRunningSession } from "@/types";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Ring } from "@/components/ui/Ring";
import { Sparkline } from "@/components/ui/Sparkline";
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
  Sparkles,
  Zap,
  Calendar,
  TrendingUp,
  AlertCircle,
  Info,
  X,
  ArrowRight,
  FlaskConical,
} from "lucide-react";

const BASE_VOLUME = 20;

// ─── Types pour le plan AI Claude ─────────────────────────────────
interface AIPlanZone {
  name: string;
  paceMin: string;
  paceMax: string;
  hrMin: number;
  hrMax: number;
  description: string;
}
interface AIPlanT1DNotes {
  glucoseBefore?: string;
  carbsDuring?: string;
  insulinAdjustment?: string;
}
interface AIPlanSession {
  day: string;
  type: string;
  name: string;
  distance: number;
  duration: number;
  pace: { min: string; max: string };
  zone: string;
  structure: string;
  t1dNotes?: AIPlanT1DNotes;
  reasoning?: string;
}
interface AIPlanWeek {
  week: number;
  phase: string;
  totalVolume: string;
  sessions: AIPlanSession[];
}
interface AIPlan {
  fullAnalysis?: string;
  vmaUsed?: number;
  zones?: AIPlanZone[];
  predictions?: Record<string, string>;
  planDuration?: number;
  phases?: { name: string; weeks: string; focus: string }[];
  weeklyPlan?: AIPlanWeek[];
  t1dProtocol?: {
    easyRuns?: string;
    intervals?: string;
    longRuns?: string;
    alerts?: string[];
  };
}

// ─── Display session unifié (fallback local + AI) ────────────────
interface DisplaySession {
  name: string;
  type: string;
  distance: number;
  zone: string;
  details: string;
  paceRange?: string;
  durationMin?: number;
  intervals?: { reps: number; distance: number; recovery: number } | null;
  t1dNotes?: AIPlanT1DNotes;
  reasoning?: string;
  day?: string;
}

// ─── Fallback : génération locale identique à l'ancien comportement ─
function generateLocalSessions(
  weekNumber: number,
  totalVolume: number,
  vma: number,
  zones: ReturnType<typeof calculateZones>,
  interval: { reps: number; distance: number; recovery: number } | null,
): DisplaySession[] {
  const phase = getPhase(weekNumber);

  if (phase === "Taper") {
    const easyDist = +(totalVolume * 0.55).toFixed(1);
    const tempoDist = +(totalVolume * 0.45).toFixed(1);
    return [
      {
        name: "Footing facile",
        type: "easy",
        distance: easyDist,
        zone: "Z2",
        details: `${easyDist} km en endurance fondamentale`,
        paceRange: `${formatPace(zones.z2.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}`,
      },
      {
        name: "Tempo court",
        type: "tempo",
        distance: tempoDist,
        zone: "Z3",
        details: `10 min Z2 + ${(tempoDist - 3).toFixed(1)} km Z3 + 10 min Z2`,
        paceRange: `${formatPace(zones.z3.paceMinKm.min)} – ${formatPace(zones.z3.paceMinKm.max)}`,
      },
    ];
  }

  if (phase === "Base") {
    const easyDist = +(totalVolume * 0.4).toFixed(1);
    const longDist = +(totalVolume * 0.6).toFixed(1);
    return [
      {
        name: "Footing facile",
        type: "easy",
        distance: easyDist,
        zone: "Z2",
        details: `${easyDist} km en endurance fondamentale`,
        paceRange: `${formatPace(zones.z2.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}`,
      },
      {
        name: "Sortie longue",
        type: "long",
        distance: longDist,
        zone: "Z2",
        details: `${longDist} km en Z1-Z2, allure conversationnelle`,
        paceRange: `${formatPace(zones.z1.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}`,
      },
    ];
  }

  if (phase === "Build") {
    const longDist = +(totalVolume * 0.55).toFixed(1);
    const session1Dist = +(totalVolume * 0.45).toFixed(1);
    const session1: DisplaySession = interval
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
      {
        name: "Sortie longue",
        type: "long",
        distance: longDist,
        zone: "Z2",
        details: `${longDist} km en Z1-Z2, progressive`,
        paceRange: `${formatPace(zones.z1.paceMinKm.min)} – ${formatPace(zones.z2.paceMinKm.max)}`,
      },
    ];
  }

  // Peak
  const longDist = +(totalVolume * 0.5).toFixed(1);
  const session1Dist = +(totalVolume * 0.5).toFixed(1);
  const session1: DisplaySession = interval
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
    {
      name: "Sortie longue progressive",
      type: "long",
      distance: longDist,
      zone: "Z2-Z3",
      details: `${(longDist * 0.7).toFixed(1)} km Z2 + ${(longDist * 0.3).toFixed(1)} km Z3`,
      paceRange: `${formatPace(zones.z2.paceMinKm.min)} – ${formatPace(zones.z3.paceMinKm.max)}`,
    },
  ];
}

function aiSessionsToDisplay(week: AIPlanWeek): DisplaySession[] {
  return week.sessions.map((s) => ({
    name: s.name,
    type: s.type,
    distance: s.distance,
    zone: s.zone,
    details: s.structure,
    paceRange: s.pace ? `${s.pace.min} – ${s.pace.max}` : undefined,
    durationMin: s.duration,
    intervals: null,
    t1dNotes: s.t1dNotes,
    reasoning: s.reasoning,
    day: s.day,
  }));
}

function phaseColor(phase: string): string {
  switch (phase) {
    case "Base":
      return "var(--success)";
    case "Build":
      return "var(--running)";
    case "Peak":
      return "var(--warning)";
    case "Taper":
      return "var(--accent-2)";
    default:
      return "var(--running)";
  }
}

function phaseVariant(phase: string): "success" | "info" | "warning" | "accent" | "default" {
  switch (phase) {
    case "Base":
      return "success";
    case "Build":
      return "info";
    case "Peak":
      return "warning";
    case "Taper":
      return "accent";
    default:
      return "default";
  }
}

// Couleur d'une zone (pour pace meter visuel)
function zoneColor(zone: string): string {
  if (zone.includes("Z5") || zone.includes("Z4-Z5")) return "var(--error)";
  if (zone.includes("Z4")) return "var(--warning)";
  if (zone.includes("Z3")) return "var(--accent)";
  if (zone.includes("Z2")) return "var(--running)";
  return "var(--success)";
}

// Source label pour la VMA (cockpit feel)
function vmaSourceLabel(source: string): string {
  switch (source) {
    case "field-test":
      return "Test terrain";
    case "diagnostic-vo2max":
      return "VO2max diagnostic";
    case "profile-vo2max":
      return "Profil utilisateur";
    default:
      return "Estimation";
  }
}

export default function RunningPage() {
  const {
    profile,
    currentRunningWeek,
    setRunningWeek,
    completedRunningSessions,
    addCompletedRunningSession,
    deleteCompletedRunningSession,
    runningDiagnosticData,
    runningDiagnosticCompleted,
    generatedRunningPlan,
  } = useStore();

  const [trackingSession, setTrackingSession] = useState<number | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);

  // ─── 1. VMA dynamique depuis le diagnostic ─────────────────────
  const vmaInfo = useMemo(
    () => deriveVMA(runningDiagnosticData, profile.vo2max),
    [runningDiagnosticData, profile.vo2max],
  );
  const vma = vmaInfo.vma;
  const zones = useMemo(() => calculateZones(vma), [vma]);

  // ─── 2. Plan AI Claude depuis le store ─────────────────────────
  const aiPlan = generatedRunningPlan as AIPlan | null;
  const hasAIPlan = !!(aiPlan && aiPlan.weeklyPlan && aiPlan.weeklyPlan.length > 0);
  const planDuration = aiPlan?.planDuration || 14;

  // ─── 3. Construction des semaines (AI ou fallback) ─────────────
  const weeks = useMemo(() => {
    if (hasAIPlan && aiPlan?.weeklyPlan) {
      return aiPlan.weeklyPlan.map((w) => {
        const volumeNum = parseFloat(String(w.totalVolume).replace(/[^\d.]/g, "")) || 0;
        return {
          weekNum: w.week,
          volume: volumeNum,
          phase: w.phase,
          sessions: aiSessionsToDisplay(w),
          interval: null as { reps: number; distance: number; recovery: number } | null,
        };
      });
    }
    return Array.from({ length: HALF_MARATHON_PLAN.duration }, (_, i) => {
      const weekNum = i + 1;
      const volume = +(BASE_VOLUME * HALF_MARATHON_PLAN.volumeProgression[i]).toFixed(1);
      const phase = getPhase(weekNum);
      const interval = HALF_MARATHON_PLAN.intervalProgression[i] ?? null;
      const sessions = generateLocalSessions(weekNum, volume, vma, zones, interval);
      return { weekNum, volume, phase, sessions, interval };
    });
  }, [hasAIPlan, aiPlan, vma, zones]);

  const maxWeek = weeks.length;
  const currentWeekData = weeks[Math.min(currentRunningWeek, maxWeek) - 1] ?? weeks[0];
  const weekCompletedSessions = completedRunningSessions.filter(
    (s) => s.weekNumber === currentRunningWeek,
  );
  const getSessionCompletion = (sessionIdx: number) =>
    weekCompletedSessions.find((s) => s.sessionIndex === sessionIdx);

  const weekTotalPlanned = currentWeekData.sessions.reduce((sum, s) => sum + s.distance, 0);
  const weekTotalDone = weekCompletedSessions.reduce((sum, s) => sum + s.actualDistance, 0);
  const weekSessionsDone = weekCompletedSessions.length;
  const weekSessionsTotal = currentWeekData.sessions.length;

  // ─── 4. Prédictions : AI > calcul local ─────────────────────────
  const semiPred = predictRaceTime(vmaInfo.vo2max, 21.1);
  const aiSemiPrediction = aiPlan?.predictions
    ? aiPlan.predictions["Semi"] || aiPlan.predictions["semi"]
    : null;

  // Sparkline : volume par semaine (planifié) sur tout le plan
  const volumeData = weeks.map((w) => w.volume);

  // Date de course depuis le diagnostic
  const raceDate = runningDiagnosticData?.raceDate as string | undefined;
  const formattedRaceDate = raceDate
    ? new Date(raceDate).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    : null;

  // Total km parcourus tout plan
  const totalKmDone = completedRunningSessions.reduce((s, x) => s + x.actualDistance, 0);
  const totalSessionsDone = completedRunningSessions.length;
  const totalSessionsAll = weeks.reduce((s, w) => s + w.sessions.length, 0);

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      {/* ============ STATUS BANNER ============ */}
      <section className="mb-5 animate-in">
        {hasAIPlan ? (
          <div className="surface-2 px-4 py-3 flex items-center gap-3 border-l-2 border-accent">
            <div className="h-7 w-7 rounded-md bg-accent/15 flex items-center justify-center flex-shrink-0">
              <Sparkles size={14} className="text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">Plan personnalisé · IA</p>
              <p className="text-[11px] text-text-tertiary leading-tight mt-0.5 truncate">
                VMA <span className="num text-text-secondary">{vma.toFixed(1)}</span> km/h ·{" "}
                <span className="text-text-secondary">{vmaSourceLabel(vmaInfo.source)}</span>
              </p>
            </div>
            {aiPlan?.fullAnalysis && (
              <button
                onClick={() => setAnalysisOpen(true)}
                style={{ touchAction: "manipulation" }}
                className="text-[11px] text-accent hover:text-accent-hover font-medium tap-scale flex items-center gap-1 flex-shrink-0"
              >
                <span className="hidden sm:inline">Analyse</span>
                <ArrowRight size={12} />
              </button>
            )}
          </div>
        ) : (
          <div className="surface-2 px-4 py-3 flex items-center gap-3 border-l-2 border-warning">
            <div className="h-7 w-7 rounded-md bg-warning/15 flex items-center justify-center flex-shrink-0">
              <AlertCircle size={14} className="text-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-tight">Plan générique</p>
              <p className="text-[11px] text-text-tertiary leading-tight mt-0.5 truncate">
                VMA <span className="num text-text-secondary">{vma.toFixed(1)}</span> km/h ·{" "}
                <span className="text-text-secondary">{vmaSourceLabel(vmaInfo.source)}</span>
              </p>
            </div>
            <Link
              href="/profil/diagnostic"
              className="text-[11px] text-accent hover:text-accent-hover font-medium tap-scale flex items-center gap-1 flex-shrink-0"
            >
              <span className="hidden sm:inline">Diagnostic</span>
              <ArrowRight size={12} />
            </Link>
          </div>
        )}
      </section>

      {/* ============ HERO : Semaine courante (asymétrique) ============ */}
      <section className="mb-8 animate-slide-up">
        <div className="flex items-center gap-2 mb-3">
          <Footprints size={14} className="text-running" />
          <span className="label">
            Semi-marathon · S{currentWeekData.weekNum}/{maxWeek} · {currentWeekData.phase}
          </span>
        </div>

        <div className="surface-1 p-5 sm:p-6 lg:p-8 relative overflow-hidden">
          {/* Glow phase color */}
          <div
            aria-hidden
            className="absolute -top-32 -right-32 h-80 w-80 rounded-full opacity-[0.10] blur-3xl"
            style={{ background: phaseColor(currentWeekData.phase) }}
          />

          {/* Mobile-first : top bar avec week number + chevrons */}
          <div className="relative">
            <div className="flex items-start justify-between gap-2 mb-4 sm:hidden">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight leading-none">
                  Semaine <span className="num">{currentWeekData.weekNum}</span>
                </h1>
                <p className="text-[11px] text-text-tertiary mt-1.5">
                  <span className="num text-text-secondary">{currentWeekData.volume}</span> km ·{" "}
                  <span className="num text-text-secondary">{weekSessionsTotal}</span> séances
                </p>
              </div>
              <div className="flex items-center gap-0.5 flex-shrink-0">
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
                  onClick={() => setRunningWeek(Math.min(maxWeek, currentRunningWeek + 1))}
                  disabled={currentRunningWeek >= maxWeek}
                >
                  <ChevronRight size={16} />
                </Button>
              </div>
            </div>

            {/* Mobile : Ring + km centered // Desktop : grid Ring + info side-by-side */}
            <div className="flex flex-col sm:grid sm:grid-cols-[auto_1fr] gap-5 sm:gap-7 items-center sm:items-start">
              {/* Ring séances réalisées */}
              <div className="flex-shrink-0">
                <Ring
                  value={weekSessionsDone}
                  max={Math.max(1, weekSessionsTotal)}
                  size={108}
                  strokeWidth={9}
                  color={phaseColor(currentWeekData.phase)}
                >
                  <div className="text-center">
                    <p className="num text-2xl font-bold leading-none">
                      {weekSessionsDone}
                      <span className="text-text-tertiary">/{weekSessionsTotal}</span>
                    </p>
                    <p className="label mt-1">séances</p>
                  </div>
                </Ring>
              </div>

              {/* Bloc info semaine — desktop only header, plus progress */}
              <div className="min-w-0 w-full">
                {/* Desktop header */}
                <div className="hidden sm:flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-none">
                      Semaine <span className="num">{currentWeekData.weekNum}</span>
                    </h1>
                    <p className="text-xs text-text-tertiary mt-1.5 truncate">
                      <span className="num text-text-secondary">{currentWeekData.volume}</span> km prévus ·{" "}
                      <span className="num text-text-secondary">{weekSessionsTotal}</span> séances
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5 flex-shrink-0">
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
                      onClick={() => setRunningWeek(Math.min(maxWeek, currentRunningWeek + 1))}
                      disabled={currentRunningWeek >= maxWeek}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>

                {/* Progress km */}
                <div>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="label">Km réalisés</span>
                    <span className="num text-sm font-semibold">
                      <span className="text-running">{weekTotalDone.toFixed(1)}</span>
                      <span className="text-text-tertiary"> / {weekTotalPlanned.toFixed(0)}</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${weekTotalPlanned > 0 ? Math.min(100, (weekTotalDone / weekTotalPlanned) * 100) : 0}%`,
                        background: phaseColor(currentWeekData.phase),
                      }}
                    />
                  </div>
                </div>

                {/* Race date if any */}
                {formattedRaceDate && (
                  <div className="mt-3 pt-3 border-t border-border-subtle flex items-center gap-2">
                    <Calendar size={11} className="text-text-tertiary" />
                    <span className="text-[11px] text-text-tertiary">Course :</span>
                    <span className="num text-[11px] font-medium text-text-secondary">{formattedRaceDate}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ Séances de la semaine ============ */}
      <section className="mb-8 stagger">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Séances cette semaine</h2>
          <Badge variant={phaseVariant(currentWeekData.phase)} size="sm">
            {currentWeekData.phase}
          </Badge>
        </div>

        <div className="space-y-3">
          {currentWeekData.sessions.map((session, idx) => {
            const completed = getSessionCompletion(idx);
            const isTracking = trackingSession === idx;
            const zColor = zoneColor(session.zone);
            return (
              <div
                key={idx}
                className={`surface-1 p-5 transition-all relative overflow-hidden ${
                  completed ? "ring-1 ring-success/25" : ""
                }`}
              >
                {/* Pace meter visual : bar gauche colorée par zone */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ background: zColor, opacity: completed ? 1 : 0.7 }}
                />

                <div className="flex items-start justify-between gap-3 mb-3 ml-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-base">{session.name}</h3>
                      {completed && (
                        <Badge variant="success" size="sm" dot>
                          Fait
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
                      <span>Séance {idx + 1}</span>
                      <span aria-hidden>·</span>
                      <span style={{ color: zColor }} className="font-medium">{session.zone}</span>
                      {session.day && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{session.day}</span>
                        </>
                      )}
                      {session.durationMin && (
                        <>
                          <span aria-hidden>·</span>
                          <span className="num">{session.durationMin} min</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="num text-2xl font-bold text-running leading-none">
                      {session.distance}
                      <span className="text-sm text-text-tertiary ml-1 font-medium">km</span>
                    </p>
                    {session.paceRange && (
                      <p className="num text-[11px] text-text-tertiary mt-1">{session.paceRange}/km</p>
                    )}
                  </div>
                </div>

                <p className="text-[13px] text-text-secondary leading-snug mb-3 ml-2">
                  {session.details}
                </p>

                {session.intervals && (
                  <div className="bg-warning/8 rounded-lg px-3 py-2 mb-3 ml-2 border-l-2 border-warning">
                    <p className="text-xs text-warning font-medium">
                      <span className="num">{session.intervals.reps}</span>×
                      <span className="num">{session.intervals.distance}</span>m
                      <span className="text-text-tertiary">
                        {" "}
                        · récup <span className="num">{session.intervals.recovery}</span>m trot
                      </span>
                    </p>
                  </div>
                )}

                {/* T1D notes inline (AI plan only) */}
                {session.t1dNotes && (
                  <div className="mb-3 ml-2 grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {session.t1dNotes.glucoseBefore && (
                      <div className="bg-diabete/8 rounded-lg px-3 py-2 border-l-2 border-diabete">
                        <p className="label flex items-center gap-1 mb-0.5">
                          <Droplet size={9} className="text-diabete" /> Glycémie
                        </p>
                        <p className="text-[11px] text-text-secondary">{session.t1dNotes.glucoseBefore}</p>
                      </div>
                    )}
                    {session.t1dNotes.carbsDuring && (
                      <div className="bg-diabete/8 rounded-lg px-3 py-2 border-l-2 border-diabete">
                        <p className="label mb-0.5">Glucides</p>
                        <p className="text-[11px] text-text-secondary">{session.t1dNotes.carbsDuring}</p>
                      </div>
                    )}
                    {session.t1dNotes.insulinAdjustment && (
                      <div className="bg-diabete/8 rounded-lg px-3 py-2 border-l-2 border-diabete">
                        <p className="label mb-0.5">Insuline</p>
                        <p className="text-[11px] text-text-secondary">{session.t1dNotes.insulinAdjustment}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Reasoning Claude (collapsible) */}
                {session.reasoning && (
                  <details className="ml-2 mb-3 group">
                    <summary className="cursor-pointer text-[11px] text-text-tertiary hover:text-text-secondary flex items-center gap-1 select-none">
                      <Info size={10} /> Pourquoi cette séance
                    </summary>
                    <p className="text-[12px] text-text-secondary mt-2 italic leading-snug">
                      {session.reasoning}
                    </p>
                  </details>
                )}

                {completed && !isTracking && (
                  <div className="mt-3 pt-3 border-t border-border-subtle ml-2">
                    <div className="grid grid-cols-3 gap-2 text-center mb-2">
                      <div>
                        <span className="label">Réalisé</span>
                        <p className="num text-sm font-semibold text-success mt-0.5">
                          {completed.actualDistance} km
                        </p>
                      </div>
                      <div>
                        <span className="label">Durée</span>
                        <p className="num text-sm font-semibold mt-0.5">{completed.actualDuration} min</p>
                      </div>
                      <div>
                        <span className="label">Allure</span>
                        <p className="num text-sm font-semibold text-running mt-0.5">
                          {formatPace(completed.avgPace)}/km
                        </p>
                      </div>
                    </div>
                    {(completed.glucoseBefore || completed.glucoseAfter) && (
                      <p className="text-[11px] text-text-tertiary flex items-center gap-2">
                        <Droplet size={10} className="text-diabete" />
                        {completed.glucoseBefore && (
                          <>
                            avant <span className="num text-text-secondary">{completed.glucoseBefore}</span>
                          </>
                        )}
                        {completed.glucoseAfter && (
                          <>
                            · après <span className="num text-text-secondary">{completed.glucoseAfter}</span>
                          </>
                        )}
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
                  <div className="ml-2">
                    <SessionTrackingForm
                      weekNumber={currentRunningWeek}
                      sessionIndex={idx}
                      plannedDistance={session.distance}
                      onSave={(s) => {
                        addCompletedRunningSession(s);
                        setTrackingSession(null);
                      }}
                      onCancel={() => setTrackingSession(null)}
                    />
                  </div>
                )}

                {!completed && !isTracking && (
                  <Button
                    variant="secondary"
                    size="md"
                    fullWidth
                    className="mt-2 ml-2"
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

      {/* ============ Stats trio ============ */}
      <section className="mb-8 grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="surface-1 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Zap size={11} className="text-running" />
            <span className="label">VMA</span>
          </div>
          <p className="num text-2xl font-bold text-running mt-1">
            {vma.toFixed(1)}
            <span className="text-xs text-text-tertiary ml-1 font-medium">km/h</span>
          </p>
          <p className="text-[10px] text-text-tertiary mt-1 truncate">
            {vmaSourceLabel(vmaInfo.source)} · VO2 {vmaInfo.vo2max.toFixed(0)}
          </p>
        </div>

        <div className="surface-1 p-4">
          <div className="flex items-center gap-1.5 mb-1">
            <Timer size={11} className="text-running" />
            <span className="label">Prédit semi</span>
          </div>
          <p className="num text-2xl font-bold text-running mt-1">
            {aiSemiPrediction || formatTime(semiPred.predictedTimeMinutes)}
          </p>
          <p className="text-[10px] text-text-tertiary mt-1">
            {!aiSemiPrediction && (
              <>
                <span className="num">{formatPace(semiPred.predictedPace)}</span>/km · {semiPred.confidence}
              </>
            )}
            {aiSemiPrediction && "Estimation IA"}
          </p>
        </div>

        <div className="surface-1 p-4 col-span-2 lg:col-span-1">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={11} className="text-running" />
            <span className="label">Volume plan</span>
          </div>
          <div className="flex items-end justify-between gap-3 mt-1">
            <div className="min-w-0">
              <p className="num text-2xl font-bold text-running leading-none">
                {volumeData.reduce((s, v) => s + v, 0).toFixed(0)}
                <span className="text-xs text-text-tertiary ml-1 font-medium">km</span>
              </p>
              <p className="text-[10px] text-text-tertiary mt-1">
                Total <span className="num text-text-secondary">{maxWeek}</span> semaines
              </p>
            </div>
            <Sparkline
              data={volumeData}
              color="var(--running)"
              width={84}
              height={32}
            />
          </div>
        </div>
      </section>

      {/* ============ Phase timeline 14 semaines ============ */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Plan {maxWeek} semaines</h2>
          <span className="label">
            <span className="num">{totalSessionsDone}</span>/<span className="num">{totalSessionsAll}</span> séances ·{" "}
            <span className="num">{totalKmDone.toFixed(0)}</span>/
            <span className="num">{volumeData.reduce((s, v) => s + v, 0).toFixed(0)}</span> km
          </span>
        </div>

        {/* Segmented phase bar */}
        <div className="surface-1 p-4 mb-3">
          <div className="relative h-9 rounded-md overflow-hidden flex">
            {weeks.map((w) => {
              const isCurrent = w.weekNum === currentRunningWeek;
              const weekDone =
                completedRunningSessions.filter((s) => s.weekNumber === w.weekNum).length >=
                w.sessions.length;
              return (
                <button
                  key={w.weekNum}
                  onClick={() => setRunningWeek(w.weekNum)}
                  style={{
                    flex: 1,
                    background: weekDone
                      ? "var(--success)"
                      : isCurrent
                      ? phaseColor(w.phase)
                      : "rgba(255,255,255,0.06)",
                    borderRight: "1px solid var(--bg-primary)",
                    touchAction: "manipulation",
                  }}
                  className="relative group hover:brightness-125 transition-all"
                  aria-label={`Semaine ${w.weekNum} ${w.phase}`}
                >
                  {isCurrent && (
                    <div className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-text-primary" />
                  )}
                  {weekDone && (
                    <Check size={10} className="text-text-ink mx-auto" strokeWidth={3} />
                  )}
                </button>
              );
            })}
          </div>
          {/* Phase labels */}
          <div className="flex mt-2 text-[10px] text-text-tertiary uppercase tracking-wider font-medium">
            {["Base", "Build", "Peak", "Taper"].map((p) => {
              const phaseWeeks = weeks.filter((w) => w.phase === p).length;
              if (phaseWeeks === 0) return null;
              return (
                <div
                  key={p}
                  style={{ flex: phaseWeeks }}
                  className="text-center truncate"
                >
                  {p}
                </div>
              );
            })}
          </div>
        </div>

        {/* Week pills (compact horizontal scroll) */}
        <div className="surface-1 p-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {weeks.map((w) => {
              const isCurrent = w.weekNum === currentRunningWeek;
              const weekDone = completedRunningSessions.filter((s) => s.weekNumber === w.weekNum).length;
              const weekFullyDone = weekDone >= w.sessions.length;
              return (
                <button
                  key={w.weekNum}
                  onClick={() => setRunningWeek(w.weekNum)}
                  style={{ touchAction: "manipulation" }}
                  className={`flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2 rounded-lg transition-all tap-scale min-w-[52px] ${
                    isCurrent
                      ? "bg-running/15 ring-1 ring-running/40"
                      : "hover:bg-bg-tertiary"
                  }`}
                >
                  <span
                    className={`num text-[11px] font-semibold ${
                      isCurrent
                        ? "text-running"
                        : weekFullyDone
                        ? "text-success"
                        : "text-text-secondary"
                    }`}
                  >
                    S{w.weekNum}
                  </span>
                  <div className="flex items-end gap-px h-5">
                    {[...Array(w.sessions.length)].map((_, i) => (
                      <div
                        key={i}
                        className="w-1 rounded-sm"
                        style={{
                          height: "100%",
                          background: i < weekDone ? "var(--success)" : "rgba(255,255,255,0.12)",
                        }}
                      />
                    ))}
                  </div>
                  <span
                    className={`num text-[10px] ${
                      isCurrent ? "text-running" : "text-text-tertiary"
                    }`}
                  >
                    {w.volume}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* ============ Zones link ============ */}
      <section className="mb-6">
        <Link
          href="/running/zones"
          style={{ touchAction: "manipulation" }}
          className="surface-1 p-4 flex items-center gap-3 tap-scale hover-lift transition-all"
        >
          <div className="h-9 w-9 rounded-md bg-running/15 flex items-center justify-center flex-shrink-0">
            <Activity size={16} className="text-running" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">Détail zones Z1 → Z5</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              Allures et FC calculées sur ta VMA <span className="num">{vma.toFixed(1)}</span> km/h
            </p>
          </div>
          <ChevronRight size={16} className="text-text-tertiary flex-shrink-0" />
        </Link>
      </section>

      {/* ============ T1D tip glucose ============ */}
      <section className="mb-6 surface-1 p-5 border-l-2 border-diabete">
        <div className="flex items-center gap-2 mb-3">
          <Droplet size={14} className="text-diabete" />
          <span className="label">Glycémie avant course</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div>
            <Badge variant="error" size="sm" dot>
              &lt;100
            </Badge>
            <p className="text-text-tertiary mt-1.5 leading-snug">20-30g glucides · attendre 15min</p>
          </div>
          <div>
            <Badge variant="warning" size="sm" dot>
              100-120
            </Badge>
            <p className="text-text-tertiary mt-1.5 leading-snug">15g glucides · partir après 10min</p>
          </div>
          <div>
            <Badge variant="success" size="sm" dot>
              120-180
            </Badge>
            <p className="text-text-tertiary mt-1.5 leading-snug">Zone idéale · c&apos;est parti</p>
          </div>
          <div>
            <Badge variant="error" size="sm" dot>
              &gt;250
            </Badge>
            <p className="text-text-tertiary mt-1.5 leading-snug">Vérifier cétones avant</p>
          </div>
        </div>
      </section>

      {/* ============ Modal "Pourquoi ce plan ?" ============ */}
      {analysisOpen && aiPlan && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm animate-in"
          onClick={() => setAnalysisOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="surface-1 w-full sm:max-w-2xl max-h-[85vh] overflow-y-auto sm:rounded-2xl rounded-t-2xl animate-slide-up"
          >
            <div className="glass sticky top-0 px-5 py-4 flex items-center justify-between border-b border-border-subtle z-10">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-accent" />
                <h2 className="text-base font-semibold">Pourquoi ce plan ?</h2>
              </div>
              <button
                onClick={() => setAnalysisOpen(false)}
                style={{ touchAction: "manipulation" }}
                className="h-8 w-8 rounded-full hover:bg-bg-hover flex items-center justify-center tap-scale"
                aria-label="Fermer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-5">
              {aiPlan.fullAnalysis && (
                <div>
                  <p className="label mb-2 flex items-center gap-1.5">
                    <FlaskConical size={11} /> Analyse complète
                  </p>
                  <div className="text-[13px] text-text-secondary leading-relaxed whitespace-pre-line">
                    {aiPlan.fullAnalysis}
                  </div>
                </div>
              )}

              {aiPlan.predictions && (
                <div>
                  <p className="label mb-2 flex items-center gap-1.5">
                    <Timer size={11} /> Prédictions courses
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(aiPlan.predictions).map(([dist, time]) => (
                      <div key={dist} className="surface-2 p-2.5 text-center">
                        <p className="label">{dist}</p>
                        <p className="num text-sm font-semibold text-running mt-1">{String(time)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiPlan.phases && aiPlan.phases.length > 0 && (
                <div>
                  <p className="label mb-2">Phases du plan</p>
                  <div className="space-y-2">
                    {aiPlan.phases.map((p) => (
                      <div key={p.name} className="surface-2 p-3 flex items-center gap-3">
                        <Badge variant={phaseVariant(p.name)} size="sm">
                          {p.name}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] text-text-secondary">{p.focus}</p>
                          <p className="text-[10px] text-text-tertiary mt-0.5">S{p.weeks}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {aiPlan.t1dProtocol && (
                <div>
                  <p className="label mb-2 flex items-center gap-1.5">
                    <Droplet size={11} className="text-diabete" /> Protocole T1D
                  </p>
                  <div className="space-y-2">
                    {aiPlan.t1dProtocol.easyRuns && (
                      <div className="bg-diabete/8 rounded-lg p-3 border-l-2 border-diabete">
                        <p className="text-[11px] font-medium text-diabete mb-1">Sorties faciles</p>
                        <p className="text-[12px] text-text-secondary leading-snug">
                          {aiPlan.t1dProtocol.easyRuns}
                        </p>
                      </div>
                    )}
                    {aiPlan.t1dProtocol.intervals && (
                      <div className="bg-diabete/8 rounded-lg p-3 border-l-2 border-diabete">
                        <p className="text-[11px] font-medium text-diabete mb-1">Intervalles</p>
                        <p className="text-[12px] text-text-secondary leading-snug">
                          {aiPlan.t1dProtocol.intervals}
                        </p>
                      </div>
                    )}
                    {aiPlan.t1dProtocol.longRuns && (
                      <div className="bg-diabete/8 rounded-lg p-3 border-l-2 border-diabete">
                        <p className="text-[11px] font-medium text-diabete mb-1">Sorties longues</p>
                        <p className="text-[12px] text-text-secondary leading-snug">
                          {aiPlan.t1dProtocol.longRuns}
                        </p>
                      </div>
                    )}
                    {aiPlan.t1dProtocol.alerts && aiPlan.t1dProtocol.alerts.length > 0 && (
                      <div className="bg-error/8 rounded-lg p-3 border-l-2 border-error">
                        <p className="text-[11px] font-medium text-error mb-1">Alertes</p>
                        <ul className="text-[12px] text-text-secondary leading-snug space-y-0.5 list-disc list-inside">
                          {aiPlan.t1dProtocol.alerts.map((a, i) => (
                            <li key={i}>{a}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-2 border-t border-border-subtle">
                <p className="text-[10px] text-text-tertiary">
                  Plan généré par Claude Sonnet 4 sur la base de ton diagnostic running, profil et VMA.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
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

  const inputClass =
    "w-full bg-bg-tertiary border border-border-subtle rounded-lg px-3 py-2 text-sm text-text-primary placeholder:text-text-disabled focus:outline-none focus:ring-2 focus:ring-running/40 num";

  return (
    <div className="mt-4 space-y-3 border-t border-border-subtle pt-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label block mb-1">Distance (km)</label>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className="label block mb-1">Durée (min)</label>
          <input
            type="number"
            step="1"
            inputMode="numeric"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="45"
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label block mb-1">Glucose avant</label>
          <input
            type="number"
            inputMode="numeric"
            value={glucoseBefore}
            onChange={(e) => setGlucoseBefore(e.target.value)}
            placeholder="opt."
            className={inputClass}
          />
        </div>
        <div>
          <label className="label block mb-1">Glucose après</label>
          <input
            type="number"
            inputMode="numeric"
            value={glucoseAfter}
            onChange={(e) => setGlucoseAfter(e.target.value)}
            placeholder="opt."
            className={inputClass}
          />
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
        <Button size="sm" onClick={handleSubmit} disabled={!distance || !duration}>
          Enregistrer
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
