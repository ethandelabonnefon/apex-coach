import type { ActiveProgram } from "./store";

/**
 * Apply a coach-proposed modification to the active program.
 * Runs entirely client-side — mutates a copy and returns the updated program.
 */
export function applyCoachModification(
  program: ActiveProgram,
  payload: Record<string, unknown>
): ActiveProgram {
  const updated = structuredClone(program);
  updated.version += 1;

  switch (payload.type) {
    case "change_exercise": {
      const sessionIdx = payload.sessionIndex as number;
      const exerciseIdx = payload.exerciseIndex as number;
      const newExercise = payload.newExercise as Record<string, unknown>;

      if (updated.sessions[sessionIdx]?.exercises[exerciseIdx]) {
        const existing = updated.sessions[sessionIdx].exercises[exerciseIdx];
        updated.sessions[sessionIdx].exercises[exerciseIdx] = {
          order: existing.order,
          name: (newExercise.name as string) || existing.name,
          sets: (newExercise.sets as number) || existing.sets,
          reps: (newExercise.reps as string) || existing.reps,
          rir: (newExercise.rir as number) ?? existing.rir,
          rest: (newExercise.rest as number) || existing.rest,
          reasoning: (newExercise.reasoning as string) || `Modifié via Coach IA (était: ${existing.name})`,
          cues: (newExercise.cues as string[]) || existing.cues,
          alternatives: existing.alternatives,
        };
      }
      break;
    }

    case "add_session": {
      const sessionData = payload.session as Record<string, unknown>;
      const newSession = {
        id: `session-coach-${Date.now()}`,
        name: (sessionData.name as string) || "Séance Bonus",
        day: (sessionData.day as string) || "Samedi",
        focus: (sessionData.focus as string) || "Points faibles",
        duration: (sessionData.duration as number) || 45,
        exercises: ((sessionData.exercises as Array<Record<string, unknown>>) || []).map(
          (ex, i) => ({
            order: i + 1,
            name: (ex.name as string) || "Exercice",
            sets: (ex.sets as number) || 3,
            reps: (ex.reps as string) || "10-12",
            rir: (ex.rir as number) ?? 2,
            rest: (ex.rest as number) || 90,
            reasoning: (ex.reasoning as string) || "Ajouté via Coach IA",
            cues: (ex.cues as string[]) || [],
            alternatives: [],
          })
        ),
        notes: sessionData.isOptional ? "Séance optionnelle" : undefined,
      };
      updated.sessions.push(newSession);
      updated.daysPerWeek = updated.sessions.length;
      break;
    }

    case "adjust_volume": {
      const sessionIdx = payload.sessionIndex as number;
      const exerciseIdx = payload.exerciseIndex as number;
      const newSets = payload.sets as number;

      if (updated.sessions[sessionIdx]?.exercises[exerciseIdx] && newSets > 0) {
        updated.sessions[sessionIdx].exercises[exerciseIdx].sets = newSets;
      }
      break;
    }

    case "remove_exercise": {
      const sessionIdx = payload.sessionIndex as number;
      const exerciseIdx = payload.exerciseIndex as number;

      if (updated.sessions[sessionIdx]?.exercises[exerciseIdx]) {
        updated.sessions[sessionIdx].exercises.splice(exerciseIdx, 1);
        // Re-order
        updated.sessions[sessionIdx].exercises.forEach((ex, i) => {
          ex.order = i + 1;
        });
      }
      break;
    }

    case "change_day": {
      const sessionIdx = payload.sessionIndex as number;
      const newDay = payload.day as string;

      if (updated.sessions[sessionIdx] && newDay) {
        updated.sessions[sessionIdx].day = newDay;
      }
      break;
    }

    default:
      console.warn("Unknown modification type:", payload.type);
  }

  return updated;
}
