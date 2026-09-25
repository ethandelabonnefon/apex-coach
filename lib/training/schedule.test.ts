import { test } from "node:test";
import assert from "node:assert/strict";
import { PLANNED_SESSIONS, WORKOUT_TEMPLATES, PHASE0 } from "./phase0";
import {
  sessionsOn,
  sessionsOfWeek,
  weekDates,
  programWeekOf,
  daysUntilStart,
  nextSession,
  doneSessionIds,
  exerciseName,
  targetReps,
  targetRpe,
  suggestLoad,
  recoveryAdvice,
  getSession,
  type TrainingLog,
} from "./schedule";

test("import Notion : 47 séances, ids uniques, bornes 12 oct → 28 nov", () => {
  assert.equal(PLANNED_SESSIONS.length, 47);
  assert.equal(new Set(PLANNED_SESSIONS.map((s) => s.id)).size, 47);
  const dates = PLANNED_SESSIONS.map((s) => s.date).sort();
  assert.equal(dates[0], PHASE0.startDate);
  assert.equal(dates[dates.length - 1], PHASE0.endDate);
  assert.equal(PLANNED_SESSIONS.filter((s) => s.kind in WORKOUT_TEMPLATES).length, 27);
  assert.equal(PLANNED_SESSIONS.filter((s) => s.deload).length, 3);
});

test("jour double : la muscu passe avant le footing", () => {
  const day = sessionsOn("2026-10-13");
  assert.deepEqual(day.map((s) => s.kind), ["Upper A", "Run Z2"]);
  assert.deepEqual(sessionsOn("2026-10-14"), []);
});

test("semaines : S1 = 12→18 oct, S7 finit le 29 nov ; hors programme = null", () => {
  assert.deepEqual(weekDates(1), ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]);
  assert.equal(weekDates(7)[6], "2026-11-29");
  assert.equal(programWeekOf("2026-10-11"), null);
  assert.equal(programWeekOf("2026-10-12"), 1);
  assert.equal(programWeekOf("2026-10-18"), 1);
  assert.equal(programWeekOf("2026-10-19"), 2);
  assert.equal(programWeekOf("2026-11-29"), 7);
  assert.equal(programWeekOf("2026-11-30"), null);
  assert.equal(sessionsOfWeek(1).length, 7);
  assert.equal(sessionsOfWeek(1)[1].kind, "Upper A");
});

test("J-x avant le départ, et prochaine séance non faite", () => {
  assert.equal(daysUntilStart("2026-09-25"), 17);
  assert.equal(daysUntilStart("2026-10-20"), 0);
  assert.equal(nextSession("2026-09-25", new Set())?.id, "2026-10-12-lower-a");
  const done = new Set(["2026-10-13-upper-a"]);
  assert.equal(nextSession("2026-10-13", done)?.id, "2026-10-13-run-z2");
  assert.equal(nextSession("2026-11-29", new Set()), null);
});

test("squat gobelet devient squat barre en S3 ; reps et RPE cibles", () => {
  const squat = WORKOUT_TEMPLATES["Lower A"].exercises[0];
  assert.equal(exerciseName(squat, 2), "Squat gobelet");
  assert.equal(exerciseName(squat, 3), "Squat barre");
  assert.equal(targetReps("6-8"), 6);
  assert.equal(targetReps("10 / jambe"), 10);
  assert.equal(targetReps("45 sec"), 45);
  assert.equal(targetRpe(getSession("2026-10-12-lower-a")!), 6);
  assert.equal(targetRpe(getSession("2026-10-13-upper-a")!), 7);
  assert.equal(targetRpe(getSession("2026-10-26-lower-a")!), 7);
});

const row = WORKOUT_TEMPLATES["Upper A"].exercises[0]; // Rowing barre 4×8
const set = (weight: number, reps: number, rpe: number | null, done = true) => ({ weight, reps, rpe, done });
const logWith = (sessionId: string, sets: ReturnType<typeof set>[]): TrainingLog => ({
  sessionId,
  status: "done",
  doneAt: "2026-10-13T19:00:00.000Z",
  exercises: [{ exerciseId: "barbell-row", sets }],
});

test("progression : +2,5 kg si toutes les séries passent au RPE cible, sinon même charge", () => {
  const s2 = getSession("2026-10-20-upper-a")!;
  const passed = logWith("2026-10-13-upper-a", [set(60, 8, 7), set(60, 8, 7), set(60, 8, 7), set(60, 8, 7)]);
  assert.deepEqual(suggestLoad(row, s2, [passed]), { weight: 62.5, reason: "progress", fromDate: "2026-10-13" });

  const hard = logWith("2026-10-13-upper-a", [set(60, 8, 7), set(60, 8, 8), set(60, 7, 9), set(60, 6, 9)]);
  assert.deepEqual(suggestLoad(row, s2, [hard]), { weight: 60, reason: "repeat", fromDate: "2026-10-13" });

  const incomplete = logWith("2026-10-13-upper-a", [set(60, 8, 7), set(60, 8, 7), set(60, 8, 7)]);
  assert.equal(suggestLoad(row, s2, [incomplete]).reason, "repeat");

  assert.deepEqual(suggestLoad(row, s2, []), { weight: null, reason: "none", fromDate: null });
});

test("progression : la séance la plus récente fait foi, les séances futures sont ignorées", () => {
  const s3 = getSession("2026-10-27-upper-a")!;
  const w1 = logWith("2026-10-13-upper-a", [set(60, 8, 7), set(60, 8, 7), set(60, 8, 7), set(60, 8, 7)]);
  const w2 = logWith("2026-10-20-upper-a", [set(62.5, 8, 8), set(62.5, 8, 8), set(62.5, 8, 8), set(62.5, 8, 8)]);
  const future = logWith("2026-11-03-upper-a", [set(80, 8, 5), set(80, 8, 5), set(80, 8, 5), set(80, 8, 5)]);
  assert.deepEqual(suggestLoad(row, s3, [w1, w2, future]), { weight: 62.5, reason: "repeat", fromDate: "2026-10-20" });
});

test("deload S7 : −30 % arrondi au 0,5 kg ; les deloads ne servent pas de référence", () => {
  const s7 = getSession("2026-11-24-upper-a")!;
  const w6 = logWith("2026-11-17-upper-a", [set(70, 8, 7), set(70, 8, 7), set(70, 8, 7), set(70, 8, 7)]);
  assert.deepEqual(suggestLoad(row, s7, [w6]), { weight: 49, reason: "deload", fromDate: "2026-11-17" });
});

test("exercices sans charge : aucune suggestion", () => {
  const plank = WORKOUT_TEMPLATES["Lower A"].exercises.find((e) => e.id === "plank")!;
  assert.equal(suggestLoad(plank, getSession("2026-10-19-lower-a")!, []).reason, "none");
});

test("feu Whoop : vert 67+, jaune 34-66 (−20 %), rouge < 34, inconnu sans Whoop", () => {
  assert.equal(recoveryAdvice(80).loadFactor, 1);
  assert.equal(recoveryAdvice(64).light, "yellow");
  assert.equal(recoveryAdvice(64).loadFactor, 0.8);
  assert.equal(recoveryAdvice(20).loadFactor, null);
  assert.equal(recoveryAdvice(null).light, "unknown");
});

test("doneSessionIds ne compte que les séances terminées", () => {
  const ids = doneSessionIds([
    { sessionId: "a", status: "done" },
    { sessionId: "b", status: "in-progress" },
  ]);
  assert.deepEqual([...ids], ["a"]);
});
