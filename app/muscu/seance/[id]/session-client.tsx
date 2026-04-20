"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card, PageHeader, Button, Badge, SectionTitle, InfoBox } from "@/components/ui";
import { useStore } from "@/lib/store";
import { MUSCU_PROGRAM } from "@/lib/constants";
import { getCurrentPhaseInfo, suggestNextWeight } from "@/lib/muscu-science";
import Link from "next/link";

interface SetLog {
  reps: number;
  weight: number;
  rir: number;
}

interface ExerciseLog {
  name: string;
  sets: SetLog[];
  difficulty: number;
  pumpRating: number;
}

function RestTimer({ duration, onDone }: { duration: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(duration);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setRemaining(duration);
    intervalRef.current = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          onDone();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [duration, onDone]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const pct = (remaining / duration) * 100;

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-[#a855f7]/10 border border-[#a855f7]/20">
      <div className="relative w-12 h-12">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
          <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
          <circle
            cx="24"
            cy="24"
            r="20"
            fill="none"
            stroke="#a855f7"
            strokeWidth="3"
            strokeDasharray={`${2 * Math.PI * 20}`}
            strokeDashoffset={`${2 * Math.PI * 20 * (1 - pct / 100)}`}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-linear"
          />
        </svg>
      </div>
      <div>
        <p className="text-lg font-bold text-[#a855f7] font-mono">
          {mins}:{secs.toString().padStart(2, "0")}
        </p>
        <p className="text-xs text-white/35">Repos en cours</p>
      </div>
      <Button variant="ghost" size="sm" onClick={onDone}>
        Passer
      </Button>
    </div>
  );
}

function ExerciseCard({
  exercise,
  exerciseIndex,
  log,
  onUpdateSet,
  onUpdateDifficulty,
  onUpdatePump,
  completedWorkouts,
}: {
  exercise: { order: number; name: string; sets: number; reps: string; rir: number; rest: number; weight?: unknown; reasoning?: string; cues?: string[]; alternatives?: (string | { name: string; reason: string })[] };
  exerciseIndex: number;
  log: ExerciseLog;
  onUpdateSet: (setIndex: number, field: keyof SetLog, value: number) => void;
  onUpdateDifficulty: (val: number) => void;
  onUpdatePump: (val: number) => void;
  completedWorkouts: { id: string; sessionId: string; date: string; exercises: ExerciseLog[]; duration: number; glucoseBefore: number | null; glucoseAfter: number | null; recoveryScore: number | null; difficulty: number; notes: string }[];
}) {
  const [showReasoning, setShowReasoning] = useState(false);
  const [showAlternatives, setShowAlternatives] = useState(false);
  const [activeTimer, setActiveTimer] = useState<number | null>(null);

  // Find last completed sets for this exercise for weight suggestion
  const lastWorkout = completedWorkouts.find((w) =>
    w.exercises.some((e) => e.name === exercise.name)
  );
  const lastSets = lastWorkout?.exercises.find((e) => e.name === exercise.name)?.sets;
  const suggestion = lastSets && lastSets.length > 0
    ? suggestNextWeight(lastSets, exercise.reps)
    : null;

  const handleTimerDone = useCallback(() => {
    setActiveTimer(null);
  }, []);

  return (
    <Card className="mb-4">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center justify-center w-8 h-8 rounded-full bg-[#a855f7]/20 text-[#a855f7] text-sm font-bold">
            {exerciseIndex + 1}
          </span>
          <div>
            <h3 className="font-semibold text-sm">{exercise.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-mono text-[#a855f7] font-semibold">
                {exercise.sets} séries × {exercise.reps} reps
              </span>
              <span className="text-white/35">RIR {exercise.rir}</span>
              <span className="text-white/35">Repos {exercise.rest}s</span>
            </div>
          </div>
        </div>
      </div>

      {/* RIR explainer — visible une fois par exo, discret */}
      <div className="mb-3 flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
        <span className="text-[10px] font-mono text-[#a855f7]/70 mt-0.5">i</span>
        <p className="text-[11px] leading-snug text-white/50">
          <span className="text-white/70 font-medium">Objectif :</span>{" "}
          fais <span className="text-white/90 font-semibold font-mono">{exercise.reps} répétitions</span>{" "}
          par série, en gardant{" "}
          <span className="text-white/90 font-semibold font-mono">{exercise.rir} rep{exercise.rir > 1 ? "s" : ""} en réserve</span>{" "}
          (RIR = Reps In Reserve : ce qu&apos;il te reste dans le réservoir à la fin du set).
        </p>
      </div>

      {/* Cues */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {(exercise.cues || []).map((cue, i) => (
          <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] text-white/50">
            {cue}
          </span>
        ))}
      </div>

      {/* Last session + weight suggestion */}
      {lastSets && lastSets.length > 0 && (
        <div className="mb-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
          <p className="text-[10px] text-white/40 mb-1">Derniere seance</p>
          <div className="flex flex-wrap gap-2">
            {lastSets.map((s, i) => (
              <span key={i} className="text-xs text-white/60 font-mono">
                S{i + 1}: {s.weight}kg x {s.reps}
              </span>
            ))}
          </div>
          {suggestion && (
            <p className="text-xs text-[#a855f7] mt-1.5">
              Suggestion: <span className="font-semibold">{suggestion.suggestedWeight} kg</span>
              <span className="text-white/30 ml-1">— {suggestion.reasoning}</span>
            </p>
          )}
        </div>
      )}
      {!lastSets && suggestion && (
        <div className="mb-3 p-2.5 rounded-lg bg-[#a855f7]/5 border border-[#a855f7]/10">
          <p className="text-xs text-[#a855f7]">
            Suggestion: <span className="font-semibold">{suggestion.suggestedWeight} kg</span>
          </p>
          <p className="text-[10px] text-white/40 mt-0.5">{suggestion.reasoning}</p>
        </div>
      )}

      {/* Set tracking table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm mb-3">
          <thead>
            <tr className="text-xs text-white/30">
              <th className="text-left py-1 pr-2 w-12">Set</th>
              <th className="text-left py-1 px-2">Poids (kg)</th>
              <th className="text-left py-1 px-2">
                Reps <span className="text-white/20 font-mono normal-case">({exercise.reps})</span>
              </th>
              <th
                className="text-left py-1 px-2 cursor-help"
                title="RIR (Reps In Reserve) : nombre de reps qu'il te reste dans le réservoir à la fin du set. RIR 2 = tu pouvais en faire 2 de plus."
              >
                RIR <span className="text-white/20">ⓘ</span>
              </th>
              <th className="text-left py-1 pl-2 w-20">Repos</th>
            </tr>
          </thead>
          <tbody>
            {log.sets.map((set, setIdx) => (
              <tr key={setIdx} className="border-t border-white/[0.04]">
                <td className="py-2 pr-2 text-white/40 font-mono text-xs">{setIdx + 1}</td>
                <td className="py-2 px-2">
                  <input
                    type="number"
                    value={set.weight || ""}
                    onChange={(e) => onUpdateSet(setIdx, "weight", parseFloat(e.target.value) || 0)}
                    className="w-20 text-sm !py-1 !px-2"
                    placeholder="kg"
                    step={2.5}
                  />
                </td>
                <td className="py-2 px-2">
                  <input
                    type="number"
                    value={set.reps || ""}
                    onChange={(e) => onUpdateSet(setIdx, "reps", parseInt(e.target.value) || 0)}
                    className="w-20 text-sm !py-1 !px-2 font-mono"
                    placeholder={exercise.reps}
                    title={`Cible: ${exercise.reps} reps`}
                  />
                </td>
                <td className="py-2 px-2">
                  <input
                    type="number"
                    value={set.rir}
                    onChange={(e) => onUpdateSet(setIdx, "rir", parseInt(e.target.value) || 0)}
                    className="w-16 text-sm !py-1 !px-2"
                    placeholder="RIR"
                    min={0}
                    max={5}
                  />
                </td>
                <td className="py-2 pl-2">
                  {activeTimer === setIdx ? (
                    <span className="text-xs text-[#a855f7]">...</span>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setActiveTimer(setIdx)}
                    >
                      {exercise.rest}s
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Active timer */}
      {activeTimer !== null && (
        <RestTimer duration={exercise.rest} onDone={handleTimerDone} />
      )}

      {/* Difficulty + Pump rating */}
      <div className="flex gap-4 mt-2 mb-3">
        <div>
          <p className="text-[10px] text-white/30 mb-1">Difficulte (1-10)</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
              <button
                key={v}
                onClick={() => onUpdateDifficulty(v)}
                className={`w-6 h-6 rounded text-[10px] transition-colors ${
                  v <= log.difficulty
                    ? "bg-[#a855f7] text-white"
                    : "bg-white/[0.05] text-white/30"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-white/30 mb-1">Pump (1-5)</p>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => onUpdatePump(v)}
                className={`w-6 h-6 rounded text-[10px] transition-colors ${
                  v <= log.pumpRating
                    ? "bg-[#a855f7] text-white"
                    : "bg-white/[0.05] text-white/30"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Reasoning expandable */}
      <button
        onClick={() => setShowReasoning(!showReasoning)}
        className="text-xs text-[#a855f7]/70 hover:text-[#a855f7] transition-colors mb-1"
      >
        {showReasoning ? "Masquer" : "Afficher"} le raisonnement
      </button>
      {showReasoning && (
        <div className="p-3 rounded-lg bg-white/[0.02] text-xs text-white/50 mt-1 mb-2 animate-slide-up">
          {exercise.reasoning}
        </div>
      )}

      {/* Alternatives */}
      <button
        onClick={() => setShowAlternatives(!showAlternatives)}
        className="text-xs text-white/30 hover:text-white/50 transition-colors block"
      >
        {showAlternatives ? "Masquer" : "Voir"} les alternatives
      </button>
      {showAlternatives && (
        <div className="mt-1.5 space-y-1 animate-slide-up">
          {(exercise.alternatives || []).map((alt, altIdx) => {
            const altObj = typeof alt === "string" ? { name: alt, reason: "" } : alt;
            return (
              <div key={altObj.name || altIdx} className="flex items-center gap-2 text-xs p-2 rounded-lg bg-white/[0.02]">
                <span className="text-white/60">{altObj.name}</span>
                {altObj.reason && <><span className="text-white/25">--</span><span className="text-white/35">{altObj.reason}</span></>}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

export function SessionClient({ sessionId }: { sessionId: string }) {
  const { muscuProgram, completedWorkouts, addCompletedWorkout, activeProgram } = useStore();
  // Check active (AI-generated) program first, then fall back to static program
  const session =
    activeProgram?.sessions.find((s) => s.id === sessionId) ||
    muscuProgram.sessions.find((s) => s.id === sessionId);

  const currentWeek = activeProgram?.currentWeek || muscuProgram.currentWeek;
  const phase = getCurrentPhaseInfo(currentWeek);

  const [exerciseLogs, setExerciseLogs] = useState<ExerciseLog[]>([]);
  const [glucoseBefore, setGlucoseBefore] = useState<string>("");
  const [glucoseAfter, setGlucoseAfter] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [startTime] = useState(() => Date.now());

  useEffect(() => {
    if (session) {
      // Find last completed workout for this session to pre-fill weights
      const lastWorkout = completedWorkouts.find((w) => w.sessionId === session.id);

      setExerciseLogs(
        session.exercises.map((ex) => {
          const lastExercise = lastWorkout?.exercises.find((e) => e.name === ex.name);
          return {
            name: ex.name,
            sets: Array.from({ length: ex.sets }, (_, i) => {
              const lastSet = lastExercise?.sets[i];
              return {
                reps: lastSet?.reps || 0,
                weight: lastSet?.weight || 0,
                rir: lastSet?.rir ?? ex.rir,
              };
            }),
            difficulty: 0,
            pumpRating: 0,
          };
        })
      );
    }
  }, [session, completedWorkouts]);

  if (!session) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Seance introuvable</h1>
        <p className="text-white/40">Aucune seance ne correspond a cet identifiant.</p>
      </div>
    );
  }

  const updateSet = (exIdx: number, setIdx: number, field: keyof SetLog, value: number) => {
    setExerciseLogs((prev) => {
      const next = [...prev];
      const exercise = { ...next[exIdx] };
      const sets = [...exercise.sets];
      sets[setIdx] = { ...sets[setIdx], [field]: value };
      exercise.sets = sets;
      next[exIdx] = exercise;
      return next;
    });
  };

  const updateDifficulty = (exIdx: number, val: number) => {
    setExerciseLogs((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], difficulty: val };
      return next;
    });
  };

  const updatePump = (exIdx: number, val: number) => {
    setExerciseLogs((prev) => {
      const next = [...prev];
      next[exIdx] = { ...next[exIdx], pumpRating: val };
      return next;
    });
  };

  const handleSubmit = () => {
    const duration = Math.round((Date.now() - startTime) / 60000);
    const avgDifficulty = exerciseLogs.reduce((s, e) => s + e.difficulty, 0) / exerciseLogs.length;

    addCompletedWorkout({
      id: `workout-${Date.now()}`,
      sessionId: session.id,
      date: new Date().toISOString(),
      exercises: exerciseLogs.map((e) => ({
        name: e.name,
        sets: e.sets,
        difficulty: e.difficulty,
        pumpRating: e.pumpRating,
      })),
      duration,
      glucoseBefore: glucoseBefore ? parseFloat(glucoseBefore) : null,
      glucoseAfter: glucoseAfter ? parseFloat(glucoseAfter) : null,
      recoveryScore: null,
      difficulty: Math.round(avgDifficulty),
      notes,
    });

    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto text-center py-20">
        <span className="text-5xl mb-6 block">&#10003;</span>
        <h1 className="text-2xl font-bold mb-2">Seance enregistree !</h1>
        <p className="text-white/40 mb-6">Bonne seance, les donnees sont sauvegardees.</p>
        <div className="flex gap-3 justify-center">
          <Link href="/muscu">
            <Button variant="secondary">Retour au programme</Button>
          </Link>
          <Link href="/muscu/progression">
            <Button variant="ghost">Voir la progression</Button>
          </Link>
        </div>
      </div>
    );
  }

  const completedCount = completedWorkouts.filter((w) => w.sessionId === session.id).length;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      <PageHeader
        title={session.name}
        subtitle={`${session.day} -- ~${session.duration} min -- ${session.focus}`}
        action={
          <Link href="/muscu">
            <Button variant="ghost" size="sm">Retour</Button>
          </Link>
        }
      />

      {/* Session info bar */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Badge color="purple">{phase.name}</Badge>
        <Badge color="gray">RIR cible: {phase.rirTarget}</Badge>
        <Badge color="gray">{session.exercises.length} exercices</Badge>
        <Badge color="gray">{completedCount}x completee</Badge>
      </div>

      {/* Glycemia before */}
      <Card className="mb-6">
        <SectionTitle>Glycemie pre-entrainement</SectionTitle>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={glucoseBefore}
            onChange={(e) => setGlucoseBefore(e.target.value)}
            placeholder="mg/dL"
            className="w-32"
          />
          {glucoseBefore && (
            <span
              className={`text-sm font-medium ${
                parseFloat(glucoseBefore) < 70
                  ? "text-[#ff4757]"
                  : parseFloat(glucoseBefore) > 250
                    ? "text-[#ff9500]"
                    : "text-[#00ff94]"
              }`}
            >
              {parseFloat(glucoseBefore) < 70
                ? "Hypo -- prendre des glucides avant de commencer !"
                : parseFloat(glucoseBefore) > 250
                  ? "Elevee -- surveiller attentivement"
                  : "OK pour s'entrainer"}
            </span>
          )}
        </div>
        <p className="text-[10px] text-white/30 mt-2">{(session.notes as { glycemia?: string } | undefined)?.glycemia || ""}</p>
      </Card>

      {/* Exercises */}
      <SectionTitle>Exercices</SectionTitle>
      {session.exercises.map((exercise, i) => (
        <ExerciseCard
          key={exercise.order}
          exercise={exercise}
          exerciseIndex={i}
          log={exerciseLogs[i] || { name: exercise.name, sets: [], difficulty: 0, pumpRating: 0 }}
          onUpdateSet={(setIdx, field, value) => updateSet(i, setIdx, field, value)}
          onUpdateDifficulty={(val) => updateDifficulty(i, val)}
          onUpdatePump={(val) => updatePump(i, val)}
          completedWorkouts={completedWorkouts}
        />
      ))}

      {/* Glycemia after */}
      <Card className="mb-6">
        <SectionTitle>Glycemie post-entrainement</SectionTitle>
        <div className="flex items-center gap-4">
          <input
            type="number"
            value={glucoseAfter}
            onChange={(e) => setGlucoseAfter(e.target.value)}
            placeholder="mg/dL"
            className="w-32"
          />
          {glucoseBefore && glucoseAfter && (
            <span className="text-xs text-white/40">
              Delta: {(parseFloat(glucoseAfter) - parseFloat(glucoseBefore)).toFixed(0)} mg/dL
            </span>
          )}
        </div>
      </Card>

      {/* Notes & session info */}
      <Card className="mb-6">
        <SectionTitle>Notes de seance</SectionTitle>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Sensations, douleurs, remarques..."
          rows={3}
          className="w-full"
        />
        <div className="mt-3 space-y-1">
          <p className="text-xs text-white/30">
            <span className="text-white/50">Recuperation:</span> {(session.notes as { recovery?: string } | undefined)?.recovery || ""}
          </p>
          <p className="text-xs text-white/30">
            <span className="text-white/50">Progression:</span> {(session.notes as { progression?: string } | undefined)?.progression || ""}
          </p>
        </div>
      </Card>

      {/* Submit */}
      <InfoBox variant="info">
        Verifie que toutes les series sont remplies avant de valider. Les donnees serviront au suivi de progression et aux recommandations de poids.
      </InfoBox>
      <div className="mt-4 flex justify-end">
        <Button
          onClick={handleSubmit}
          className="!bg-[#a855f7] hover:!bg-[#a855f7]/90 text-white"
          size="lg"
        >
          Valider la seance
        </Button>
      </div>
    </div>
  );
}
