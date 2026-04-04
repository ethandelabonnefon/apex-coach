"use client";

import { Card, PageHeader, Button, Badge, SectionTitle, InfoBox } from "@/components/ui";
import { useStore } from "@/lib/store";
import { estimate1RM, detectPlateau } from "@/lib/muscu-science";
import { MUSCU_PROGRAM } from "@/lib/constants";
import Link from "next/link";
import { useMemo } from "react";

interface ExerciseProgressionEntry {
  date: string;
  weight: number;
  reps: number;
  estimated1RM: number;
  sessionId: string;
}

export default function ProgressionPage() {
  const { completedWorkouts } = useStore();

  // Build progression data per exercise
  const progressionByExercise = useMemo(() => {
    const map: Record<string, ExerciseProgressionEntry[]> = {};

    // Iterate in reverse so entries are chronological
    const sorted = [...completedWorkouts].reverse();

    for (const workout of sorted) {
      for (const exercise of workout.exercises) {
        if (!map[exercise.name]) {
          map[exercise.name] = [];
        }
        // Use the best set (highest estimated 1RM) from this workout
        let bestRM = 0;
        let bestWeight = 0;
        let bestReps = 0;
        for (const set of exercise.sets) {
          if (set.weight > 0 && set.reps > 0) {
            const rm = estimate1RM(set.weight, set.reps);
            if (rm > bestRM) {
              bestRM = rm;
              bestWeight = set.weight;
              bestReps = set.reps;
            }
          }
        }
        if (bestRM > 0) {
          map[exercise.name].push({
            date: workout.date,
            weight: bestWeight,
            reps: bestReps,
            estimated1RM: bestRM,
            sessionId: workout.sessionId,
          });
        }
      }
    }

    return map;
  }, [completedWorkouts]);

  const exerciseNames = Object.keys(progressionByExercise).sort();

  // Plateau detection per exercise
  const plateauResults = useMemo(() => {
    const results: Record<string, ReturnType<typeof detectPlateau>> = {};
    for (const [name, entries] of Object.entries(progressionByExercise)) {
      results[name] = detectPlateau(entries.map((e) => ({ date: e.date, estimated1RM: e.estimated1RM })));
    }
    return results;
  }, [progressionByExercise]);

  const hasAnyData = exerciseNames.length > 0;

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Progression"
        subtitle={`${completedWorkouts.length} seance${completedWorkouts.length !== 1 ? "s" : ""} enregistree${completedWorkouts.length !== 1 ? "s" : ""}`}
        action={
          <Link href="/muscu">
            <Button variant="secondary" size="sm">Retour programme</Button>
          </Link>
        }
      />

      {!hasAnyData ? (
        <div className="text-center py-20">
          <span className="text-5xl mb-6 block opacity-40">&#128202;</span>
          <p className="text-white/60 font-medium text-lg mb-2">Aucune donnee de progression</p>
          <p className="text-white/35 text-sm mb-6">Complete ta premiere seance pour voir ta progression ici.</p>
          <Link href="/muscu">
            <Button variant="secondary">Voir le programme</Button>
          </Link>
        </div>
      ) : (
        <>
          {/* Plateau alerts */}
          {Object.entries(plateauResults).some(([, r]) => r.isPlateaued) && (
            <div className="mb-6">
              <SectionTitle>Alertes plateau</SectionTitle>
              <div className="space-y-3">
                {Object.entries(plateauResults)
                  .filter(([, r]) => r.isPlateaued)
                  .map(([name, result]) => (
                    <InfoBox key={name} variant="warning">
                      <div>
                        <p className="font-semibold mb-1">{name} -- plateau detecte</p>
                        <p className="text-xs opacity-80 mb-2">
                          Aucun PR depuis {result.weeksSincePR} semaine{result.weeksSincePR > 1 ? "s" : ""}.
                        </p>
                        <ul className="space-y-1">
                          {result.suggestions.map((s, i) => (
                            <li key={i} className="text-xs opacity-70 flex items-start gap-1.5">
                              <span className="mt-0.5">&#8226;</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </InfoBox>
                  ))}
              </div>
            </div>
          )}

          {/* Per-exercise progression */}
          <SectionTitle>1RM estime par exercice</SectionTitle>
          <div className="space-y-6">
            {exerciseNames.map((exerciseName) => {
              const entries = progressionByExercise[exerciseName];
              const plateau = plateauResults[exerciseName];
              const currentMax = Math.max(...entries.map((e) => e.estimated1RM));
              const firstRM = entries[0]?.estimated1RM || 0;
              const lastRM = entries[entries.length - 1]?.estimated1RM || 0;
              const progression = firstRM > 0 ? lastRM - firstRM : 0;

              // Simple bar chart (percentage of max)
              const maxRM = Math.max(...entries.map((e) => e.estimated1RM), 1);

              return (
                <Card key={exerciseName}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-sm">{exerciseName}</h3>
                      <p className="text-xs text-white/35 mt-0.5">
                        {entries.length} entree{entries.length > 1 ? "s" : ""}
                        {plateau.isPlateaued && (
                          <span className="text-[#ff9500] ml-2">Plateau</span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-[#a855f7]">{currentMax} kg</p>
                      <p className="text-xs text-white/35">1RM max estime</p>
                      {progression !== 0 && (
                        <p className={`text-xs font-medium ${progression > 0 ? "text-[#00ff94]" : "text-[#ff4757]"}`}>
                          {progression > 0 ? "+" : ""}{progression} kg
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Mini bar chart */}
                  <div className="flex items-end gap-1 h-16 mb-3">
                    {entries.map((entry, i) => {
                      const height = (entry.estimated1RM / maxRM) * 100;
                      const isMax = entry.estimated1RM === currentMax;
                      return (
                        <div
                          key={i}
                          className="flex-1 min-w-[4px] max-w-[20px] rounded-t transition-all group relative"
                          style={{
                            height: `${Math.max(height, 8)}%`,
                            background: isMax ? "#a855f7" : "rgba(168, 85, 247, 0.3)",
                          }}
                          title={`${new Date(entry.date).toLocaleDateString("fr-FR")} : ${entry.weight}x${entry.reps} = ${entry.estimated1RM}kg 1RM`}
                        />
                      );
                    })}
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-white/25 border-b border-white/[0.04]">
                          <th className="text-left py-1.5 pr-3">Date</th>
                          <th className="text-left py-1.5 px-3">Poids x Reps</th>
                          <th className="text-left py-1.5 px-3">1RM estime</th>
                          <th className="text-left py-1.5 pl-3">Delta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...entries].reverse().map((entry, i, arr) => {
                          const prev = i < arr.length - 1 ? arr[i + 1] : null;
                          const delta = prev ? entry.estimated1RM - prev.estimated1RM : 0;
                          const isMax = entry.estimated1RM === currentMax;
                          return (
                            <tr key={i} className="border-t border-white/[0.03]">
                              <td className="py-1.5 pr-3 text-white/40">
                                {new Date(entry.date).toLocaleDateString("fr-FR", {
                                  day: "numeric",
                                  month: "short",
                                })}
                              </td>
                              <td className="py-1.5 px-3 text-white/60 font-mono">
                                {entry.weight}kg x {entry.reps}
                              </td>
                              <td className={`py-1.5 px-3 font-mono font-medium ${isMax ? "text-[#a855f7]" : "text-white/60"}`}>
                                {entry.estimated1RM} kg
                                {isMax && <Badge color="purple">PR</Badge>}
                              </td>
                              <td className="py-1.5 pl-3">
                                {delta !== 0 && (
                                  <span className={`font-mono ${delta > 0 ? "text-[#00ff94]" : "text-[#ff4757]"}`}>
                                    {delta > 0 ? "+" : ""}{delta}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Completed workouts list */}
          <SectionTitle className="mt-8">Historique des seances</SectionTitle>
          <div className="space-y-2">
            {completedWorkouts.map((workout) => {
              const session = MUSCU_PROGRAM.sessions.find((s) => s.id === workout.sessionId);
              const totalVolume = workout.exercises.reduce(
                (sum, ex) => sum + ex.sets.reduce((setSum, s) => setSum + s.weight * s.reps, 0),
                0
              );
              return (
                <Card key={workout.id} className="!p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{session?.name || workout.sessionId}</p>
                      <p className="text-xs text-white/35">
                        {new Date(workout.date).toLocaleDateString("fr-FR", {
                          weekday: "short",
                          day: "numeric",
                          month: "long",
                        })}
                        {" -- "}
                        {workout.duration} min
                        {" -- "}
                        Difficulte {workout.difficulty}/10
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-[#a855f7]">{Math.round(totalVolume).toLocaleString()} kg</p>
                      <p className="text-[10px] text-white/30">volume total</p>
                      {workout.glucoseBefore !== null && workout.glucoseAfter !== null && (
                        <p className="text-[10px] text-white/30 mt-0.5">
                          Glyc: {workout.glucoseBefore} &rarr; {workout.glucoseAfter} mg/dL
                        </p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
