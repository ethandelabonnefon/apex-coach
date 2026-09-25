/**
 * Calendrier, suivi et progression des séances (sept. 2026).
 *
 * Règles reprises du programme Notion :
 *  - jour double = muscu d'abord, cardio ensuite (règle d'or n°5) ;
 *  - progression : +2,5 kg quand toutes les séries passent au RPE cible
 *    (RPE 6 en S1-S2 sur les jambes, 7 ensuite) ;
 *  - semaine 7 = deload, charges −30 % ;
 *  - feu Whoop : vert = plein, jaune = −20 %, rouge = technique légère.
 *    Le −20 % est une SUGGESTION affichée avec un bouton, jamais appliquée
 *    d'office (même principe que les doses — cf. Docteur).
 *
 * ⚠️ Pure module. Aucun import serveur, aucun import React.
 */

import {
  PHASE0,
  PLANNED_SESSIONS,
  WORKOUT_TEMPLATES,
  isWorkoutKind,
  type ExerciseTemplate,
  type PlannedSession,
} from "./phase0";

// ─── Journal des séances (persisté dans le store) ─────────────────────

export interface TrainingSetLog {
  weight: number | null;
  reps: number | null;
  rpe: number | null;
  done: boolean;
}

export interface TrainingExerciseLog {
  exerciseId: string;
  sets: TrainingSetLog[];
}

export interface TrainingLog {
  sessionId: string;
  status: "in-progress" | "done";
  /** ISO — premier geste dans la séance (sert d'heure de début pour le diabète). */
  startedAt?: string;
  /** ISO — coché fait. */
  doneAt?: string;
  durationMin?: number;
  /** Effort perçu de la séance (1-10). */
  rpe?: number;
  glucoseBefore?: number;
  glucoseAfter?: number;
  notes?: string;
  /** Facteur appliqué aux charges suggérées (0,8 = feu jaune accepté). */
  loadFactor?: number;
  exercises?: TrainingExerciseLog[];
}

// ─── Dates ────────────────────────────────────────────────────────────

/** YYYY-MM-DD en heure LOCALE (les dates du programme sont locales). */
export function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Date locale à midi (évite les bascules DST en ajoutant des jours). */
export function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

export function addDays(iso: string, days: number): string {
  const d = parseLocalDate(iso);
  d.setDate(d.getDate() + days);
  return localISODate(d);
}

/** Les 7 dates (lun → dim) d'une semaine du programme. */
export function weekDates(week: number): string[] {
  const monday = addDays(PHASE0.startDate, (week - 1) * 7);
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

/** Semaine du programme contenant la date, ou null hors programme. */
export function programWeekOf(iso: string): number | null {
  if (iso < PHASE0.startDate) return null;
  const days = Math.round((parseLocalDate(iso).getTime() - parseLocalDate(PHASE0.startDate).getTime()) / 86_400_000);
  const week = Math.floor(days / 7) + 1;
  return week >= 1 && week <= PHASE0.weeks ? week : null;
}

/** Jours restants avant le début (0 si commencé). */
export function daysUntilStart(todayIso: string): number {
  const d = Math.round((parseLocalDate(PHASE0.startDate).getTime() - parseLocalDate(todayIso).getTime()) / 86_400_000);
  return Math.max(0, d);
}

// ─── Séances ──────────────────────────────────────────────────────────

/** Ordre dans une journée : muscu avant cardio (règle d'or n°5). */
function dayOrder(s: PlannedSession): number {
  return isWorkoutKind(s.kind) ? 0 : 1;
}

export function sessionsOn(iso: string, sessions: PlannedSession[] = PLANNED_SESSIONS): PlannedSession[] {
  return sessions.filter((s) => s.date === iso).sort((a, b) => dayOrder(a) - dayOrder(b));
}

export function sessionsOfWeek(week: number, sessions: PlannedSession[] = PLANNED_SESSIONS): PlannedSession[] {
  return sessions
    .filter((s) => s.week === week)
    .sort((a, b) => (a.date === b.date ? dayOrder(a) - dayOrder(b) : a.date < b.date ? -1 : 1));
}

export function getSession(id: string): PlannedSession | null {
  return PLANNED_SESSIONS.find((s) => s.id === id) ?? null;
}

/** Première séance non faite à partir de `todayIso` (incluse). */
export function nextSession(todayIso: string, doneIds: Set<string>): PlannedSession | null {
  const upcoming = PLANNED_SESSIONS.filter((s) => s.date >= todayIso && !doneIds.has(s.id)).sort((a, b) =>
    a.date === b.date ? dayOrder(a) - dayOrder(b) : a.date < b.date ? -1 : 1,
  );
  return upcoming[0] ?? null;
}

export function doneSessionIds(logs: TrainingLog[]): Set<string> {
  return new Set(logs.filter((l) => l.status === "done").map((l) => l.sessionId));
}

// ─── Exercices & progression ──────────────────────────────────────────

export function exerciseName(ex: ExerciseTemplate, week: number): string {
  const variant = [...(ex.variants ?? [])].sort((a, b) => b.fromWeek - a.fromWeek).find((v) => week >= v.fromWeek);
  return variant?.name ?? ex.name;
}

/** Borne basse des répétitions visées : "6-8" → 6, "10 / jambe" → 10, "45 sec" → 45. */
export function targetReps(reps: string): number {
  const m = reps.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

/** RPE cible : 6 sur les jambes en S1-S2 (reprise), 7 ensuite. */
export function targetRpe(session: PlannedSession): number {
  return session.week <= 2 && (session.kind === "Lower A" || session.kind === "Lower B") ? 6 : 7;
}

/** Arrondi au 0,5 kg (haltères et disques courants). */
export function roundLoad(kg: number): number {
  return Math.round(kg * 2) / 2;
}

export interface LoadSuggestion {
  weight: number | null;
  /** "progress" = +2,5 kg mérité ; "repeat" = même charge ; "deload" = −30 % ; "none" = pas d'historique. */
  reason: "progress" | "repeat" | "deload" | "none";
  /** Date (YYYY-MM-DD) de la séance de référence. */
  fromDate: string | null;
}

/**
 * Charge suggérée pour un exercice : dernière séance FAITE (hors deload)
 * qui contient cet exercice avec une charge. `+2,5 kg` si toutes ses
 * séries ont été faites, aux reps visées, sans dépasser le RPE cible.
 */
export function suggestLoad(
  exercise: ExerciseTemplate,
  session: PlannedSession,
  logs: TrainingLog[],
): LoadSuggestion {
  if (exercise.unit !== "kg") return { weight: null, reason: "none", fromDate: null };

  const previous = logs
    .filter((l) => l.status === "done" && l.sessionId !== session.id)
    .map((l) => ({ log: l, planned: getSession(l.sessionId) }))
    .filter((x) => x.planned && !x.planned.deload && x.planned.date < session.date)
    .map((x) => ({ ...x, ex: x.log.exercises?.find((e) => e.exerciseId === exercise.id) }))
    .filter((x) => x.ex && x.ex.sets.some((s) => s.done && s.weight !== null))
    .sort((a, b) => (a.planned!.date < b.planned!.date ? 1 : -1))[0];

  if (!previous) return { weight: null, reason: "none", fromDate: null };

  const doneSets = previous.ex!.sets.filter((s) => s.done && s.weight !== null);
  const top = Math.max(...doneSets.map((s) => s.weight as number));
  const reps = targetReps(exercise.reps);
  const rpeCap = targetRpe(previous.planned!);
  const allPassed =
    previous.ex!.sets.length >= exercise.sets &&
    previous.ex!.sets.every((s) => s.done && (s.reps ?? 0) >= reps && (s.rpe === null || s.rpe <= rpeCap));

  let weight = allPassed ? top + 2.5 : top;
  let reason: LoadSuggestion["reason"] = allPassed ? "progress" : "repeat";
  if (session.deload) {
    weight = roundLoad(top * 0.7);
    reason = "deload";
  }
  return { weight: roundLoad(weight), reason, fromDate: previous.planned!.date };
}

// ─── Feu Whoop ────────────────────────────────────────────────────────

export interface RecoveryAdvice {
  light: "green" | "yellow" | "red" | "unknown";
  label: string;
  detail: string;
  /** Facteur de charge suggéré (1 = inchangé, null = ne pas charger). */
  loadFactor: number | null;
}

export function recoveryAdvice(recoveryScore: number | null): RecoveryAdvice {
  if (recoveryScore === null) {
    return { light: "unknown", label: "Récup inconnue", detail: "Whoop non connecté — séance comme prévue, à l'écoute des sensations.", loadFactor: 1 };
  }
  if (recoveryScore >= 67) {
    return { light: "green", label: "Feu vert", detail: "Séance comme prévue, intensité pleine.", loadFactor: 1 };
  }
  if (recoveryScore >= 34) {
    return { light: "yellow", label: "Feu jaune", detail: "Volume maintenu, intensité réduite : charges −20 % ou RPE 6-7 max. Footing en Z2 stricte.", loadFactor: 0.8 };
  }
  return { light: "red", label: "Feu rouge", detail: "Technique légère ou repos complet. Le footing devient marche.", loadFactor: null };
}

/** Séries initiales d'un exercice (vides) pour démarrer la saisie. */
export function emptySets(ex: ExerciseTemplate): TrainingSetLog[] {
  return Array.from({ length: ex.sets }, () => ({ weight: null, reps: null, rpe: null, done: false }));
}

export function workoutTemplateFor(session: PlannedSession) {
  return isWorkoutKind(session.kind) ? WORKOUT_TEMPLATES[session.kind] : null;
}
