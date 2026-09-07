import test from "node:test";
import assert from "node:assert/strict";
import { findMostRecentExercise } from "./exercise-insulin-adjustment";
import type { DeclaredSportSession } from "@/types";

const now = Date.UTC(2026, 8, 7, 20, 0, 0);
const session = (over: Partial<DeclaredSportSession> = {}): DeclaredSportSession => ({
  id: "s1", sportKey: "padel", family: "intermittent",
  startAt: new Date(now - 120 * 60_000).toISOString(),
  plannedDurationMin: 90, createdAt: new Date(now - 150 * 60_000).toISOString(),
  ...over,
});

test("une séance déclarée et terminée alimente l'ajustement post-exercice", () => {
  const r = findMostRecentExercise([], [], undefined, now, [session()]);
  assert.equal(r?.source, "intermittent");
  assert.equal(r?.durationMin, 90);
});

test("une séance annulée est ignorée", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ cancelledAt: new Date(now - 10 * 60_000).toISOString() }),
  ]);
  assert.equal(r, null, "une séance annulée ne doit jamais réduire un bolus");
});

test("une séance qui n'est pas encore terminée est ignorée", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ startAt: new Date(now - 10 * 60_000).toISOString(), plannedDurationMin: 90 }),
  ]);
  assert.equal(r, null, "l'effet de sensibilité commence après l'effort, pas pendant");
});

test("la durée réelle Whoop prend le pas sur la durée prévue", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ plannedDurationMin: 90, actualDurationMin: 40 }),
  ]);
  assert.equal(r?.durationMin, 40);
});

test("une date de début invalide est écartée proprement, sans planter", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ startAt: "n'importe-quoi" }),
  ]);
  assert.equal(r, null);
});

test("sans actualDurationMin, la durée prévue sert de repli", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ plannedDurationMin: 75 }),
  ]);
  assert.equal(r?.durationMin, 75);
});
