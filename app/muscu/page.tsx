"use client";

import { useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { getCurrentPhaseInfo } from "@/lib/muscu-science";
import { generatePersonalizedProgram } from "@/lib/program-generation-flow";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Pulse } from "@/components/ui/Pulse";
import ModifyDaysModal from "@/components/musculation/ModifyDaysModal";
import ReasoningModal from "@/components/musculation/ReasoningModal";
import {
  Dumbbell,
  ChevronRight,
  ArrowUpRight,
  Calendar,
  TrendingUp,
  Sparkles,
  Play,
  RefreshCw,
} from "lucide-react";

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

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
  const cycleWeek = ((currentWeek - 1) % 6) + 1;

  const todayName = DAYS_FR[new Date().getDay()];
  const todaySession = displaySessions.find((s) => s.day === todayName);
  const nextSession = !todaySession
    ? displaySessions.find((s) => {
        const idx = DAYS_FR.indexOf(s.day);
        const today = new Date().getDay();
        return idx > today;
      }) || displaySessions[0]
    : null;

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

  // ─── CAS 1 : Pas de diagnostic ──────────────────────────
  if (!hasDiagnostic && !program) {
    return (
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
        <section className="mb-8 animate-in">
          <div className="flex items-center gap-2 mb-2">
            <Dumbbell size={14} className="text-muscu" />
            <span className="label">Musculation</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-2">
            Crée ton programme.
          </h1>
          <p className="text-sm sm:text-base text-text-secondary max-w-xl">
            Complète le diagnostic pour que l&apos;IA génère un programme adapté à ta morphologie
            et tes contraintes T1D.
          </p>
          <div className="mt-5">
            <Link href="/profil/diagnostic">
              <Button rightIcon={<ArrowUpRight size={16} strokeWidth={2.5} />}>
                Commencer le diagnostic
              </Button>
            </Link>
          </div>
        </section>

        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-semibold tracking-tight">Programme par défaut</h2>
            <Badge variant="default">Template statique</Badge>
          </div>
          <p className="text-xs text-text-tertiary mb-4">
            En attendant ton diagnostic, tu peux déjà tester ces séances.
          </p>
          <div className="space-y-2">
            {muscuProgram.sessions.map((session) => {
              const sets = session.exercises.reduce((s, e) => s + e.sets, 0);
              return (
                <Link
                  key={session.id}
                  href={`/muscu/seance/${session.id}`}
                  className="group flex items-center gap-4 surface-1 p-4 hover:bg-bg-tertiary transition-colors tap-scale"
                >
                  <div className="h-10 w-10 rounded-lg bg-muscu/10 flex items-center justify-center flex-shrink-0">
                    <Dumbbell size={18} className="text-muscu" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{session.name}</p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {session.day} · <span className="num">{session.duration}</span>min ·{" "}
                      <span className="num">{sets}</span> sets
                    </p>
                  </div>
                  <ChevronRight size={16} className="text-text-tertiary group-hover:text-muscu transition-colors" />
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  // ─── CAS 2 : Diagnostic fait, pas de programme ─────────
  if (hasDiagnostic && !program) {
    return (
      <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
        <section className="animate-in flex flex-col items-center justify-center min-h-[70vh] text-center">
          {generating ? (
            <>
              <div className="mb-5"><Pulse tone="accent" size="lg" /></div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight mb-2">
                Génération en cours.
              </h1>
              <p className="text-sm text-text-secondary max-w-md">
                L&apos;IA analyse ton diagnostic pour créer un programme sur mesure. 15-30 secondes.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-accent" />
                <span className="label">Diagnostic complété</span>
              </div>
              <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight mb-3">
                Prêt à générer.
              </h1>
              <p className="text-sm text-text-secondary mb-6 max-w-md">
                Tes données sont prêtes. Génère ton programme personnalisé.
              </p>
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
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">

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

      {/* ============ HERO : Séance du jour ============ */}
      <section className="mb-8 animate-in">
        <div className="flex items-center gap-2 mb-2">
          <Dumbbell size={14} className="text-muscu" />
          <span className="label">
            {todaySession ? `Aujourd'hui · ${todayName}` : `${todayName} · Repos`}
          </span>
        </div>

        {todaySession ? (
          <TodaySessionHero
            session={todaySession}
            phaseName={phase.name}
            rirTarget={phase.rirTarget}
          />
        ) : (
          <RestDayHero nextSession={nextSession} />
        )}
      </section>

      {/* ============ Mini context : program + phase ============ */}
      <section className="mb-8 grid grid-cols-2 gap-3">
        <div className="surface-1 p-4">
          <span className="label">Programme</span>
          <p className="text-sm font-medium mt-1 truncate">{displayName}</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            {displayDaysPerWeek} jours/sem · {program?.isGenerated ? "IA" : "Statique"}
          </p>
        </div>
        <div className="surface-1 p-4">
          <span className="label">Phase · Semaine {cycleWeek}/6</span>
          <p className="text-sm font-medium mt-1" style={{
            color: phase.name === "Accumulation" ? "var(--muscu)" : phase.name === "Intensification" ? "var(--warning)" : "var(--accent-2)",
          }}>
            {phase.name}
          </p>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            RIR <span className="num">{phase.rirTarget}</span> ·{" "}
            <span className="num">{Math.round(phase.volumeMultiplier * 100)}%</span> vol
          </p>
        </div>
      </section>

      {/* ============ Semaine : 7 jours avec séances ============ */}
      <section className="mb-8">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Cette semaine</h2>
          <span className="label">{displaySessions.length} séances</span>
        </div>
        <div className="space-y-2">
          {displaySessions.map((session) => {
            const isToday = session.day === todayName;
            const sets = session.exercises.reduce((s, e) => s + e.sets, 0);
            const done = completedWorkouts.filter((w) => w.sessionId === session.id).length;
            return (
              <Link
                key={session.id}
                href={`/muscu/seance/${session.id}`}
                className={`group flex items-center gap-3 surface-1 p-4 hover:bg-bg-tertiary transition-colors tap-scale ${
                  isToday ? "ring-1 ring-muscu/40" : ""
                }`}
              >
                <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isToday ? "bg-muscu text-ink" : "bg-muscu/10 text-muscu"
                }`}>
                  <span className="text-xs font-semibold uppercase">
                    {session.day.slice(0, 3)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm truncate">{session.name}</p>
                    {isToday && <Badge variant="muscu" size="sm">Aujourd&apos;hui</Badge>}
                  </div>
                  <p className="text-[11px] text-text-tertiary mt-0.5 truncate">
                    <span className="num">{session.exercises.length}</span> exos ·{" "}
                    <span className="num">{sets}</span> sets ·{" "}
                    <span className="num">{session.duration}</span>min
                    {done > 0 && <span className="text-muscu"> · {done} fait{done > 1 ? "s" : ""}</span>}
                  </p>
                </div>
                <ChevronRight size={16} className="text-text-tertiary group-hover:text-muscu transition-colors flex-shrink-0" />
              </Link>
            );
          })}
        </div>
      </section>

      {/* ============ Actions ============ */}
      <section className="mb-6 flex flex-wrap gap-2">
        <Link href="/muscu/progression">
          <Button variant="secondary" size="sm" leftIcon={<TrendingUp size={14} />}>
            Progression & volume
          </Button>
        </Link>
        <Button variant="ghost" size="sm" onClick={() => setShowModifyDays(true)} leftIcon={<Calendar size={14} />}>
          Modifier jours/sem
        </Button>
        {hasDiagnostic && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleGenerate}
            disabled={generating}
            isLoading={generating}
            leftIcon={!generating ? <RefreshCw size={14} /> : undefined}
          >
            {generating ? "Régénération..." : "Régénérer"}
          </Button>
        )}
      </section>

      {/* ============ Pourquoi ce programme — carte visuelle ============ */}
      {program?.isGenerated && (
        <section className="mb-8">
          <button
            onClick={() => setShowReasoning(true)}
            className="group w-full flex items-center gap-4 surface-1 p-5 text-left hover:bg-bg-tertiary transition-colors tap-scale"
          >
            <div className="h-12 w-12 rounded-xl bg-muscu/10 flex items-center justify-center flex-shrink-0">
              <Sparkles size={20} className="text-muscu" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="font-medium text-sm">Pourquoi ce programme&nbsp;?</p>
                <Badge variant="muscu" size="sm">IA</Badge>
              </div>
              <p className="text-[11px] text-text-tertiary leading-snug">
                Le split, le volume par muscle, le choix de chaque exercice, le protocole T1D —
                visualise le raisonnement complet.
              </p>
            </div>
            <ChevronRight size={18} className="text-text-tertiary group-hover:text-muscu transition-colors flex-shrink-0" />
          </button>
        </section>
      )}
    </div>
  );
}

// ================== HERO Components ==================

type HeroSession = {
  id: string;
  name: string;
  focus: string;
  duration: number;
  exercises: Array<{ order: number; name: string; sets: number; reps: string }>;
};

function TodaySessionHero({
  session,
  phaseName,
  rirTarget,
}: {
  session: HeroSession;
  phaseName: string;
  rirTarget: string;
}) {
  const totalSets = session.exercises.reduce((s, e) => s + e.sets, 0);
  return (
    <div className="surface-1 p-6 lg:p-8 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-[0.08] blur-3xl"
        style={{ background: "var(--muscu)" }}
      />
      <div className="relative">
        <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight mb-1">
          {session.name}
        </h1>
        <p className="text-sm text-text-secondary mb-5">
          {session.focus} · <span className="num">{session.duration}</span>min ·{" "}
          <span className="num">{session.exercises.length}</span> exos ·{" "}
          <span className="num">{totalSets}</span> sets · RIR <span className="num">{rirTarget}</span> ({phaseName})
        </p>

        {/* Exercises list — BIG & READABLE */}
        <div className="space-y-2 mb-6">
          {session.exercises.map((ex) => (
            <div
              key={ex.order}
              className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-bg-tertiary"
            >
              <span className="num text-xs text-text-tertiary w-5 flex-shrink-0">
                {ex.order}
              </span>
              <span className="flex-1 text-sm text-text-primary truncate">{ex.name}</span>
              <span className="num text-base font-semibold text-muscu whitespace-nowrap">
                {ex.sets}×{ex.reps}
              </span>
            </div>
          ))}
          {session.exercises.length === 0 && (
            <p className="text-sm text-text-tertiary italic py-4 text-center">
              Exercices en attente de génération
            </p>
          )}
        </div>

        <Link href={`/muscu/seance/${session.id}`}>
          <Button size="lg" fullWidth rightIcon={<Play size={16} strokeWidth={2.5} />}>
            Commencer la séance
          </Button>
        </Link>
      </div>
    </div>
  );
}

function RestDayHero({
  nextSession,
}: {
  nextSession: HeroSession | null | undefined;
}) {
  return (
    <div className="surface-1 p-6 lg:p-8">
      <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight mb-1">
        Jour de repos.
      </h1>
      <p className="text-sm text-text-secondary mb-5">
        Récupération active : mobilité, marche, étirements. Pas de séance aujourd&apos;hui.
      </p>

      {nextSession && (
        <Link
          href={`/muscu/seance/${nextSession.id}`}
          className="group flex items-center gap-3 surface-2 p-4 hover:bg-bg-hover transition-colors tap-scale"
        >
          <div className="h-10 w-10 rounded-lg bg-muscu/10 flex items-center justify-center flex-shrink-0">
            <Dumbbell size={18} className="text-muscu" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="label block mb-0.5">Prochaine séance</span>
            <p className="text-sm font-medium truncate">{nextSession.name}</p>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              <span className="num">{nextSession.exercises.length}</span> exos ·{" "}
              <span className="num">{nextSession.duration}</span>min
            </p>
          </div>
          <ChevronRight size={16} className="text-text-tertiary group-hover:text-muscu transition-colors" />
        </Link>
      )}
    </div>
  );
}
