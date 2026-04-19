"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getCurrentPhaseInfo, VOLUME_LANDMARKS } from "@/lib/muscu-science";
import { generatePersonalizedProgram } from "@/lib/program-generation-flow";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { MetricCard } from "@/components/ui/MetricCard";
import { Pulse } from "@/components/ui/Pulse";
import BodyAnalysisSection from "@/components/body-map/BodyAnalysisSection";
import PersonalizationBadge from "@/components/musculation/PersonalizationBadge";
import ModifyDaysModal from "@/components/musculation/ModifyDaysModal";
import ReasoningModal from "@/components/musculation/ReasoningModal";
import {
  Dumbbell,
  ChevronRight,
  ArrowUpRight,
  Calendar,
  TrendingUp,
  Target,
  Sparkles,
} from "lucide-react";

function computeWeeklyVolume(sessions: { exercises: { name: string; sets: number }[] }[]): Record<string, number> {
  const muscleMap: Record<string, string[]> = {
    "Pectoraux": ["Développé couché", "Développé incliné", "Écarté", "Pec deck", "Dips"],
    "Dos": ["Tractions", "Rowing", "Lat pulldown", "T-bar"],
    "Épaules latérales": ["Élévations latérales"],
    "Épaules postérieures": ["Face pulls", "Reverse pec"],
    "Biceps": ["Curl"],
    "Triceps": ["Extensions triceps", "Barre au front", "Overhead extension"],
    "Quadriceps": ["Presse à cuisses", "Squat bulgare", "Leg extension", "Hack squat", "Sissy squat", "Squat", "Front squat"],
    "Ischio-jambiers": ["Romanian deadlift", "Leg curl", "Nordic curl", "RDL"],
    "Mollets": ["Mollets"],
  };

  const volume: Record<string, number> = {};
  for (const muscle of Object.keys(muscleMap)) volume[muscle] = 0;

  for (const session of sessions) {
    for (const ex of session.exercises) {
      for (const [muscle, keywords] of Object.entries(muscleMap)) {
        if (keywords.some((kw) => ex.name.toLowerCase().includes(kw.toLowerCase()))) {
          volume[muscle] += ex.sets;
        }
      }
    }
  }

  return volume;
}

export default function MuscuPage() {
  const {
    muscuProgram, completedWorkouts, profile,
    activeProgram, setActiveProgram,
    muscuDiagnosticCompleted, muscuDiagnosticData,
    diagnosticHistory,
  } = useStore();

  const [generating, setGenerating] = useState(false);
  const [showModifyDays, setShowModifyDays] = useState(false);
  const [showReasoning, setShowReasoning] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const program = activeProgram;
  const hasDiagnostic = muscuDiagnosticCompleted;

  const displaySessions = program?.sessions || muscuProgram.sessions;
  const displayName = program?.name || muscuProgram.name;
  const displayDaysPerWeek = program?.daysPerWeek || muscuProgram.daysPerWeek;
  const currentWeek = program?.currentWeek || muscuProgram.currentWeek;
  const phase = getCurrentPhaseInfo(currentWeek);
  const weeklyVolume = program?.volumeDistribution
    ? Object.fromEntries(
        Object.entries(program.volumeDistribution).map(([k, v]) => [
          k,
          typeof v === "object" && v !== null && "setsPerWeek" in v
            ? (v as { setsPerWeek: number }).setsPerWeek
            : v,
        ])
      )
    : computeWeeklyVolume(displaySessions);

  const totalSets = displaySessions.reduce(
    (sum, s) => sum + s.exercises.reduce((es, e) => es + e.sets, 0),
    0
  );

  const cycleWeek = ((currentWeek - 1) % 6) + 1;

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const morphologyEntry = diagnosticHistory[0] || null;
      const newProgram = await generatePersonalizedProgram({
        muscuDiagnosticData,
        morphologyEntry,
        profile: { name: profile.name, age: profile.age, height: profile.height, weight: profile.weight, goals: profile.goals },
      });
      setActiveProgram(newProgram);
    } catch (err) {
      console.error("Erreur génération programme:", err);
    } finally {
      setGenerating(false);
    }
  };

  const handleModifyDays = async (newDays: number) => {
    setRegenerating(true);
    try {
      const updatedData = { ...muscuDiagnosticData, daysPerWeek: String(newDays) };
      useStore.getState().setMuscuDiagnosticData(updatedData);
      const morphologyEntry = diagnosticHistory[0] || null;
      const newProgram = await generatePersonalizedProgram({
        muscuDiagnosticData: updatedData,
        morphologyEntry,
        profile: { name: profile.name, age: profile.age, height: profile.height, weight: profile.weight, goals: profile.goals },
      });
      setActiveProgram(newProgram);
      setShowModifyDays(false);
    } catch (err) {
      console.error("Erreur régénération:", err);
    } finally {
      setRegenerating(false);
    }
  };

  // ─── CAS 1 : Pas de diagnostic ───────────────────────────
  if (!hasDiagnostic && !program) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
        <section className="mb-8 animate-in">
          <div className="flex items-center gap-2 mb-2">
            <Dumbbell size={14} className="text-muscu" />
            <span className="label">Musculation</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight mb-1">
            Crée ton programme.
          </h1>
          <p className="text-sm sm:text-base text-text-secondary max-w-xl">
            Complète le diagnostic pour que l&apos;IA génère un programme adapté à ta morphologie,
            ton équipement et tes contraintes T1D.
          </p>
          <div className="mt-5">
            <Link href="/profil/diagnostic">
              <Button rightIcon={<ArrowUpRight size={16} strokeWidth={2.5} />}>
                Commencer le diagnostic
              </Button>
            </Link>
          </div>
        </section>

        <section className="mb-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="text-sm font-semibold tracking-tight">Programme par défaut</h2>
            <Badge variant="default">Statique</Badge>
          </div>
          <div className="grid sm:grid-cols-2 gap-3 stagger">
            {muscuProgram.sessions.map((session) => {
              const sessionSets = session.exercises.reduce((s, e) => s + e.sets, 0);
              return (
                <Link
                  key={session.id}
                  href={`/muscu/seance/${session.id}`}
                  className="group surface-1 p-5 hover:bg-bg-tertiary transition-colors tap-scale"
                >
                  <div className="flex items-start justify-between mb-3 gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate">{session.name}</h3>
                      <p className="text-[11px] text-text-tertiary mt-0.5">
                        {session.day} · <span className="num">{session.duration}</span>min
                      </p>
                    </div>
                    <Badge variant="muscu">{sessionSets} sets</Badge>
                  </div>
                  <p className="text-xs text-muscu mb-3">{session.focus}</p>
                  <div className="space-y-1.5">
                    {session.exercises.map((ex) => (
                      <div key={ex.order} className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary truncate pr-2">{ex.name}</span>
                        <span className="num text-text-tertiary whitespace-nowrap">
                          {ex.sets}×{ex.reps} · RIR{ex.rir}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-end">
                    <span className="text-muscu text-[11px] font-medium inline-flex items-center gap-1">
                      Commencer <ChevronRight size={12} />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  // ─── CAS 2 : Diagnostic fait, pas de programme ────────────
  if (hasDiagnostic && !program) {
    return (
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
        <section className="animate-in flex flex-col items-center justify-center min-h-[60vh] text-center">
          {generating ? (
            <>
              <div className="mb-5">
                <Pulse tone="accent" size="lg" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
                Génération en cours.
              </h1>
              <p className="text-sm text-text-secondary max-w-md">
                L&apos;IA analyse ton diagnostic et ta morphologie pour créer un programme sur mesure.
                Ça peut prendre 15-30 secondes.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-accent" />
                <span className="label">Diagnostic complété</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
                Prêt à générer.
              </h1>
              <p className="text-sm text-text-secondary mb-5 max-w-md">
                Tes données sont prêtes. Génère maintenant ton programme personnalisé
                basé sur ton diagnostic muscu{diagnosticHistory.length > 0 ? ", ta morphologie" : ""} et tes contraintes T1D.
              </p>
              <div className="flex flex-wrap gap-2 mb-6 justify-center">
                {Boolean(muscuDiagnosticData.primaryGoal) && (
                  <Badge variant="muscu" dot>
                    {String(muscuDiagnosticData.primaryGoal).replace(/_/g, " ")}
                  </Badge>
                )}
                {Boolean(muscuDiagnosticData.daysPerWeek) && (
                  <Badge variant="running" dot>
                    {String(muscuDiagnosticData.daysPerWeek)} jours/sem
                  </Badge>
                )}
                {Boolean(muscuDiagnosticData.preferredSplit) && (
                  <Badge variant="default">
                    {String(muscuDiagnosticData.preferredSplit).replace(/_/g, " ")}
                  </Badge>
                )}
              </div>
              <Button
                onClick={handleGenerate}
                size="lg"
                rightIcon={<ArrowUpRight size={16} strokeWidth={2.5} />}
              >
                Générer mon programme
              </Button>
            </>
          )}
        </section>
      </div>
    );
  }

  // ─── CAS 3 : Programme actif ───────────────────────────
  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">

      {/* Modals */}
      {showModifyDays && (
        <ModifyDaysModal
          currentDays={displayDaysPerWeek}
          onConfirm={handleModifyDays}
          onClose={() => setShowModifyDays(false)}
          regenerating={regenerating}
        />
      )}
      {showReasoning && program && (
        <ReasoningModal program={program} onClose={() => setShowReasoning(false)} />
      )}

      {/* ============ HERO ============ */}
      <section className="mb-8 animate-in">
        <div className="flex items-center gap-2 mb-2">
          <Dumbbell size={14} className="text-muscu" />
          <span className="label">Musculation · Semaine {currentWeek} · {phase.name}</span>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight mb-1 truncate">
              {displayName}
            </h1>
            <p className="text-sm text-text-secondary">
              {displayDaysPerWeek} séances/semaine · <span className="num">{totalSets}</span> sets hebdo ·{" "}
              {program?.isGenerated ? "Généré par IA" : "Programme statique"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowModifyDays(true)} leftIcon={<Calendar size={14} />}>
              Modifier jours
            </Button>
            <Link href="/muscu/progression">
              <Button variant="secondary" size="sm" leftIcon={<TrendingUp size={14} />}>
                Progression
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Personalization badge (only for generated programs) */}
      {program?.isGenerated && (
        <div className="mb-6">
          <PersonalizationBadge program={program} onShowReasoning={() => setShowReasoning(true)} />
        </div>
      )}

      {/* ============ METRIC GRID ============ */}
      <section className="mb-10">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <MetricCard
            label="Phase active"
            value={phase.name}
            unit=""
            hint={`Semaine ${cycleWeek}/6 du cycle`}
            tone="muscu"
          />
          <MetricCard
            label="RIR cible"
            value={phase.rirTarget}
            unit="reps"
            tone="accent-2"
          />
          <MetricCard
            label="Volume phase"
            value={Math.round(phase.volumeMultiplier * 100)}
            unit="%"
            hint="vs base Accumulation"
            tone="default"
          />
          <MetricCard
            label="Bench 1RM"
            value={profile.benchPress1RM}
            unit="kg"
            tone="muscu"
          />
        </div>
      </section>

      {/* Body Map */}
      <div className="mb-8">
        <BodyAnalysisSection />
      </div>

      {/* ============ PERIODISATION ============ */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-tight">Périodisation</h2>
          <span className="label">Cycle de 6 semaines</span>
        </div>

        <div className="surface-1 p-5 lg:p-6">
          <div className="grid grid-cols-6 gap-2 mb-5">
            {[1, 2, 3, 4, 5, 6].map((w) => {
              const p = getCurrentPhaseInfo(w);
              const isCurrent = w === cycleWeek;
              const toneVar =
                p.name === "Accumulation"
                  ? "var(--muscu)"
                  : p.name === "Intensification"
                  ? "var(--warning)"
                  : "var(--accent-2)";
              return (
                <div
                  key={w}
                  className={`text-center py-3 rounded-lg transition-all ${
                    isCurrent ? "text-ink font-bold" : "bg-bg-tertiary text-text-tertiary"
                  }`}
                  style={isCurrent ? { background: toneVar } : {}}
                >
                  <p className="num text-xs mb-0.5">S{w}</p>
                  <p className="text-[9px] leading-tight uppercase tracking-wide">
                    {p.name === "Accumulation" ? "Accum" : p.name === "Intensification" ? "Intens" : "Deload"}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="grid sm:grid-cols-3 gap-3 text-xs">
            <div className="surface-2 p-3 border-l-2 border-muscu">
              <p className="font-semibold text-muscu mb-1">Accumulation · S1-S3</p>
              <p className="text-text-tertiary leading-snug">
                Volume élevé, intensité modérée. RIR 2-3. Focus : construire du volume d&apos;entraînement.
              </p>
            </div>
            <div className="surface-2 p-3 border-l-2 border-warning">
              <p className="font-semibold text-warning mb-1">Intensification · S4-S5</p>
              <p className="text-text-tertiary leading-snug">
                Volume réduit (-15%), intensité élevée. RIR 1-2. Focus : pousser les charges.
              </p>
            </div>
            <div className="surface-2 p-3 border-l-2 border-accent-2">
              <p className="font-semibold text-accent-2 mb-1">Deload · S6</p>
              <p className="text-text-tertiary leading-snug">
                Volume -50%, RIR 4-5. Focus : récupération, laisser le corps surcompenser.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============ SESSIONS LIST ============ */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-tight">Séances de la semaine</h2>
          <span className="label">{displaySessions.length} séances</span>
        </div>
        <div className="grid sm:grid-cols-2 gap-3 stagger">
          {displaySessions.map((session) => {
            const sessionSets = session.exercises.reduce((s, e) => s + e.sets, 0);
            const completedCount = completedWorkouts.filter((w) => w.sessionId === session.id).length;
            return (
              <Link
                key={session.id}
                href={`/muscu/seance/${session.id}`}
                className="group surface-1 p-5 hover:bg-bg-tertiary transition-colors tap-scale"
              >
                <div className="flex items-start justify-between mb-3 gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-sm truncate">{session.name}</h3>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {session.day} · <span className="num">{session.duration}</span>min
                    </p>
                  </div>
                  <Badge variant="muscu">{sessionSets} sets</Badge>
                </div>
                <p className="text-xs text-muscu mb-3">{session.focus}</p>
                <div className="space-y-1.5">
                  {session.exercises.map((ex) => (
                    <div key={ex.order} className="flex items-center justify-between text-xs">
                      <span className="text-text-secondary truncate pr-2">{ex.name}</span>
                      <span className="num text-text-tertiary whitespace-nowrap">
                        {ex.sets}×{ex.reps} · RIR{ex.rir}
                      </span>
                    </div>
                  ))}
                  {session.exercises.length === 0 && (
                    <p className="text-xs text-text-disabled italic">Exercices en attente de génération</p>
                  )}
                </div>
                <div className="mt-4 pt-3 border-t border-border-subtle flex items-center justify-between">
                  <span className="num text-[11px] text-text-tertiary">
                    {completedCount} complétée{completedCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-muscu text-[11px] font-medium inline-flex items-center gap-1">
                    Commencer <ChevronRight size={12} />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>

        {hasDiagnostic && (
          <div className="mt-6 flex justify-center">
            <Button variant="ghost" size="sm" onClick={handleGenerate} disabled={generating} isLoading={generating}>
              {generating ? "Régénération..." : "Régénérer depuis le diagnostic"}
            </Button>
          </div>
        )}
      </section>

      {/* ============ VOLUME LANDMARKS ============ */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="text-sm font-semibold tracking-tight">Volume Landmarks</h2>
          <span className="label">Israetel · RP</span>
        </div>
        <p className="text-xs text-text-tertiary mb-5 max-w-2xl">
          MEV = volume minimum efficace · MAV = volume adaptatif · MRV = volume maximum récupérable.
          Les valeurs sont ajustées par le multiplicateur de phase (×{phase.volumeMultiplier}).
        </p>

        <div className="grid sm:grid-cols-2 gap-3">
          {Object.entries(VOLUME_LANDMARKS).map(([muscle, landmarks]) => {
            const current = weeklyVolume[muscle] || 0;
            const adjustedCurrent = Math.round(current * phase.volumeMultiplier);
            const isInMAV = adjustedCurrent >= landmarks.mav_low && adjustedCurrent <= landmarks.mav_high;
            const isBelowMEV = adjustedCurrent < landmarks.mev;
            const isAboveMRV = adjustedCurrent > landmarks.mrv;

            let statusVariant: "success" | "error" | "warning" = "success";
            let statusLabel = "Dans la MAV";
            if (isBelowMEV) {
              statusVariant = "error";
              statusLabel = "Sous MEV";
            } else if (isAboveMRV) {
              statusVariant = "warning";
              statusLabel = "Au-dessus MRV";
            } else if (!isInMAV && adjustedCurrent < landmarks.mav_low) {
              statusVariant = "warning";
              statusLabel = "MEV→MAV";
            } else if (!isInMAV && adjustedCurrent > landmarks.mav_high) {
              statusVariant = "warning";
              statusLabel = "MAV haute";
            }

            const pct = Math.min(100, (adjustedCurrent / landmarks.mrv) * 100);

            return (
              <div key={muscle} className="surface-1 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium">{muscle}</span>
                  <Badge variant={statusVariant} size="sm">{statusLabel}</Badge>
                </div>
                <div className="h-1.5 rounded-full bg-bg-tertiary overflow-hidden mb-2">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      background:
                        statusVariant === "error"
                          ? "var(--error)"
                          : statusVariant === "warning"
                          ? "var(--warning)"
                          : "var(--muscu)",
                    }}
                  />
                </div>
                <div className="flex justify-between num text-[10px] text-text-tertiary mb-1">
                  <span>MEV {landmarks.mev}</span>
                  <span>MAV {landmarks.mav_low}–{landmarks.mav_high}</span>
                  <span>MRV {landmarks.mrv}</span>
                </div>
                <p className="text-[11px] text-text-secondary">
                  Actuel · <span className="num font-medium text-text-primary">{adjustedCurrent}</span> sets/sem
                  {phase.volumeMultiplier !== 1 && (
                    <span className="text-text-disabled num"> (base {current}, ×{phase.volumeMultiplier})</span>
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Goals footer */}
      {profile.weakPoints && profile.weakPoints.length > 0 && (
        <section className="mb-6 surface-1 p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Target size={14} className="text-muscu" />
            <span className="label">Points faibles ciblés</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.weakPoints.map((wp) => (
              <Badge key={wp} variant="muscu" dot>{wp}</Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
