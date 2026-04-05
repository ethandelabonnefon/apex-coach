"use client";

import { useState } from "react";
import { Card, PageHeader, Button, Badge, SectionTitle, ProgressBar, InfoBox } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { ActiveProgram } from "@/lib/store";
import { getCurrentPhaseInfo, VOLUME_LANDMARKS } from "@/lib/muscu-science";
import { MUSCU_PROGRAM } from "@/lib/constants";
import { generatePersonalizedProgram } from "@/lib/program-generation-flow";
import Link from "next/link";
import BodyAnalysisSection from "@/components/body-map/BodyAnalysisSection";
import PersonalizationBadge from "@/components/musculation/PersonalizationBadge";
import ModifyDaysModal from "@/components/musculation/ModifyDaysModal";
import ReasoningModal from "@/components/musculation/ReasoningModal";

// Calcul du volume hebdomadaire actuel par groupe musculaire
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
  for (const muscle of Object.keys(muscleMap)) {
    volume[muscle] = 0;
  }

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

  // Determine which program to show
  const program = activeProgram;
  const hasDiagnostic = muscuDiagnosticCompleted;

  // Use active program's sessions or fallback to static
  const displaySessions = program?.sessions || muscuProgram.sessions;
  const displayName = program?.name || muscuProgram.name;
  const displayDaysPerWeek = program?.daysPerWeek || muscuProgram.daysPerWeek;
  const currentWeek = program?.currentWeek || muscuProgram.currentWeek;
  const phase = getCurrentPhaseInfo(currentWeek);
  const weeklyVolume = computeWeeklyVolume(displaySessions);

  const totalSets = displaySessions.reduce(
    (sum, s) => sum + s.exercises.reduce((es, e) => es + e.sets, 0),
    0
  );

  const cycleWeek = ((currentWeek - 1) % 6) + 1;

  // Generate program from diagnostic
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

  // Regenerate with new days
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

  // ─── CAS 1 : Pas de diagnostic → Rediriger ────────────────────
  if (!hasDiagnostic && !program) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <PageHeader title="Musculation" subtitle="Programme personnalisé" />
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <div className="text-6xl mb-4">💪</div>
          <h2 className="text-xl font-bold mb-2">Crée ton programme personnalisé</h2>
          <p className="text-sm text-white/40 mb-6 max-w-md">
            Complète le diagnostic musculation pour que l'IA génère un programme
            adapté à tes objectifs, ta morphologie et ton emploi du temps.
          </p>
          <Link href="/profil/diagnostic">
            <Button>Commencer le diagnostic</Button>
          </Link>

          {/* Fallback: show static program */}
          <div className="mt-10 w-full text-left">
            <div className="flex items-center justify-between mb-3">
              <SectionTitle className="!mb-0">Programme par défaut</SectionTitle>
              <Badge color="gray">Statique</Badge>
            </div>
            <p className="text-xs text-white/30 mb-4">
              En attendant ton diagnostic, voici le programme template. Il sera remplacé par un programme personnalisé.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ─── CAS 2 : Diagnostic fait mais pas de programme → Générer ──
  if (hasDiagnostic && !program) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <PageHeader title="Musculation" subtitle="Programme personnalisé" />
        <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
          {generating ? (
            <>
              <div className="w-12 h-12 border-3 border-[#00ff94] border-t-transparent rounded-full animate-spin mb-4" />
              <h2 className="text-xl font-bold mb-2">Génération en cours...</h2>
              <p className="text-sm text-white/40 max-w-md">
                L'IA analyse ton diagnostic et ta morphologie pour créer un programme sur mesure.
                Ça peut prendre 15-30 secondes.
              </p>
            </>
          ) : (
            <>
              <div className="text-6xl mb-4">🎯</div>
              <h2 className="text-xl font-bold mb-2">Diagnostic complété !</h2>
              <p className="text-sm text-white/40 mb-2 max-w-md">
                Tes données sont prêtes. Génère maintenant ton programme personnalisé
                basé sur ton diagnostic muscu{diagnosticHistory.length > 0 ? ", ta morphologie" : ""} et tes contraintes T1D.
              </p>
              <div className="flex flex-wrap gap-2 mb-6 justify-center">
                {Boolean(muscuDiagnosticData.primaryGoal) && (
                  <Badge color="purple">Objectif : {String(muscuDiagnosticData.primaryGoal).replace(/_/g, " ")}</Badge>
                )}
                {Boolean(muscuDiagnosticData.daysPerWeek) && (
                  <Badge color="blue">{String(muscuDiagnosticData.daysPerWeek)} jours/sem</Badge>
                )}
                {Boolean(muscuDiagnosticData.preferredSplit) && (
                  <Badge color="gray">Split : {String(muscuDiagnosticData.preferredSplit).replace(/_/g, " ")}</Badge>
                )}
              </div>
              <Button onClick={handleGenerate}>Générer mon programme</Button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ─── CAS 3 : Programme actif → Afficher ───────────────────────
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Musculation"
        subtitle="Programme, periodisation et volume"
        action={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowModifyDays(true)}>
              Modifier jours
            </Button>
            <Link href="/muscu/progression">
              <Button variant="secondary" size="sm">Progression</Button>
            </Link>
          </div>
        }
      />

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

      {/* Personalization badge (only for generated programs) */}
      {program?.isGenerated && (
        <div className="mb-6">
          <PersonalizationBadge program={program} onShowReasoning={() => setShowReasoning(true)} />
        </div>
      )}

      {/* Programme overview */}
      <Card glow="purple" className="mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h2 className="text-xl font-bold">{displayName}</h2>
              <Badge color="purple">{phase.name}</Badge>
              {program?.isGenerated && <Badge color="green">IA</Badge>}
              {!program?.isGenerated && <Badge color="gray">Statique</Badge>}
            </div>
            <p className="text-sm text-white/40">
              Semaine {currentWeek} -- {displayDaysPerWeek} seances/semaine -- {totalSets} sets/semaine
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-3">
            <div className="text-center px-3 sm:px-4 py-2 rounded-xl bg-white/[0.03]">
              <p className="text-[10px] sm:text-xs text-white/35">RIR cible</p>
              <p className="text-base sm:text-lg font-bold text-[#a855f7]">{phase.rirTarget}</p>
            </div>
            <div className="text-center px-3 sm:px-4 py-2 rounded-xl bg-white/[0.03]">
              <p className="text-[10px] sm:text-xs text-white/35">Volume</p>
              <p className="text-base sm:text-lg font-bold text-[#a855f7]">{Math.round(phase.volumeMultiplier * 100)}%</p>
            </div>
            <div className="text-center px-3 sm:px-4 py-2 rounded-xl bg-white/[0.03]">
              <p className="text-[10px] sm:text-xs text-white/35">DC 1RM</p>
              <p className="text-base sm:text-lg font-bold text-[#a855f7]">{profile.benchPress1RM} kg</p>
            </div>
          </div>
        </div>
      </Card>

      {/* Body Map */}
      <div className="mb-6">
        <BodyAnalysisSection />
      </div>

      {/* Periodisation */}
      <SectionTitle>Periodisation (cycle de 6 semaines)</SectionTitle>
      <Card className="mb-6">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6].map((w) => {
            const p = getCurrentPhaseInfo(w);
            const isCurrent = w === cycleWeek;
            const colors: Record<string, string> = {
              Accumulation: "bg-[#a855f7]",
              Intensification: "bg-[#ff9500]",
              Deload: "bg-[#00ff94]",
            };
            return (
              <div
                key={w}
                className={`text-center py-3 rounded-xl border transition-all ${
                  isCurrent
                    ? `${colors[p.name]} text-black font-bold border-transparent`
                    : "bg-white/[0.03] border-white/[0.06] text-white/50"
                }`}
              >
                <p className="text-xs mb-1">S{w}</p>
                <p className="text-[10px] leading-tight">
                  {p.name === "Accumulation" ? "Accum" : p.name === "Intensification" ? "Intens" : "Deload"}
                </p>
              </div>
            );
          })}
        </div>
        <div className="grid sm:grid-cols-3 gap-3 sm:gap-4 text-sm">
          <div className="p-3 rounded-xl bg-[#a855f7]/10 border border-[#a855f7]/20">
            <p className="font-semibold text-[#a855f7] mb-1">Accumulation (S1-S3)</p>
            <p className="text-white/50 text-xs">Volume eleve, intensite moderee. RIR 2-3. Focus : construire du volume d&apos;entrainement.</p>
          </div>
          <div className="p-3 rounded-xl bg-[#ff9500]/10 border border-[#ff9500]/20">
            <p className="font-semibold text-[#ff9500] mb-1">Intensification (S4-S5)</p>
            <p className="text-white/50 text-xs">Volume reduit (-15%), intensite elevee. RIR 1-2. Focus : pousser les charges.</p>
          </div>
          <div className="p-3 rounded-xl bg-[#00ff94]/10 border border-[#00ff94]/20">
            <p className="font-semibold text-[#00ff94] mb-1">Deload (S6)</p>
            <p className="text-white/50 text-xs">Volume -50%, RIR 4-5. Focus : recuperation, laisser le corps surcompenser.</p>
          </div>
        </div>
      </Card>

      {/* Sessions list */}
      <SectionTitle>Seances de la semaine</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {displaySessions.map((session) => {
          const sessionSets = session.exercises.reduce((s, e) => s + e.sets, 0);
          const completedCount = completedWorkouts.filter((w) => w.sessionId === session.id).length;
          return (
            <Link key={session.id} href={`/muscu/seance/${session.id}`}>
              <Card className="h-full hover:border-[#a855f7]/30 transition-colors cursor-pointer">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-sm">{session.name}</h3>
                    <p className="text-xs text-white/35 mt-0.5">{session.day} -- {session.duration} min</p>
                  </div>
                  <Badge color="purple">{sessionSets} sets</Badge>
                </div>
                <p className="text-xs text-[#a855f7]/70 mb-3">{session.focus}</p>
                <div className="space-y-1.5">
                  {session.exercises.map((ex) => (
                    <div key={ex.order} className="flex items-center justify-between text-xs">
                      <span className="text-white/60">{ex.name}</span>
                      <span className="text-white/30">
                        {ex.sets}x{ex.reps} RIR{ex.rir}
                      </span>
                    </div>
                  ))}
                  {session.exercises.length === 0 && (
                    <p className="text-xs text-white/25 italic">Exercices en attente de génération</p>
                  )}
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs text-white/30">
                    {completedCount} seance{completedCount !== 1 ? "s" : ""} completee{completedCount !== 1 ? "s" : ""}
                  </span>
                  <span className="text-[#a855f7] text-xs font-medium">Commencer &rarr;</span>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Regenerate button */}
      {hasDiagnostic && (
        <div className="mb-8 text-center">
          <Button variant="ghost" onClick={handleGenerate} disabled={generating}>
            {generating ? "Régénération en cours..." : "Régénérer le programme depuis le diagnostic"}
          </Button>
        </div>
      )}

      {/* Volume landmarks */}
      <SectionTitle>Volume Landmarks par groupe musculaire</SectionTitle>
      <InfoBox variant="info">
        Basé sur les recommandations de Mike Israetel (RP). MEV = volume minimum efficace, MAV = volume adaptatif, MRV = volume maximum recuperable.
      </InfoBox>
      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mt-4">
        {Object.entries(VOLUME_LANDMARKS).map(([muscle, landmarks]) => {
          const current = weeklyVolume[muscle] || 0;
          const adjustedCurrent = Math.round(current * phase.volumeMultiplier);
          const isInMAV = adjustedCurrent >= landmarks.mav_low && adjustedCurrent <= landmarks.mav_high;
          const isBelowMEV = adjustedCurrent < landmarks.mev;
          const isAboveMRV = adjustedCurrent > landmarks.mrv;

          let statusColor = "text-[#00ff94]";
          let statusLabel = "Dans la MAV";
          if (isBelowMEV) {
            statusColor = "text-[#ff4757]";
            statusLabel = "Sous le MEV";
          } else if (isAboveMRV) {
            statusColor = "text-[#ff9500]";
            statusLabel = "Au-dessus du MRV";
          } else if (!isInMAV && adjustedCurrent < landmarks.mav_low) {
            statusColor = "text-[#ff9500]";
            statusLabel = "Entre MEV et MAV";
          } else if (!isInMAV && adjustedCurrent > landmarks.mav_high) {
            statusColor = "text-[#ff9500]";
            statusLabel = "MAV haute - proche MRV";
          }

          return (
            <Card key={muscle} className="!p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">{muscle}</span>
                <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
              </div>
              <ProgressBar value={adjustedCurrent} max={landmarks.mrv} color="#a855f7" />
              <div className="flex justify-between text-[10px] text-white/30 mt-1">
                <span>MEV: {landmarks.mev}</span>
                <span>MAV: {landmarks.mav_low}-{landmarks.mav_high}</span>
                <span>MRV: {landmarks.mrv}</span>
              </div>
              <p className="text-xs text-white/40 mt-1">
                Actuel: <span className="text-white/70 font-medium">{adjustedCurrent} sets/sem</span>
                {phase.volumeMultiplier !== 1 && (
                  <span className="text-white/25"> (base {current}, x{phase.volumeMultiplier})</span>
                )}
              </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
