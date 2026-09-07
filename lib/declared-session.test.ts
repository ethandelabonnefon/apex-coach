import test from "node:test";
import assert from "node:assert/strict";
import { findMostRecentExercise, resolveRecentExercise } from "./exercise-insulin-adjustment";
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

// ─────────────────────────────────────────────────────────────────────
// Chemin de PRODUCTION — `app/diabete/page.tsx` appelle
// `resolveRecentExercise`, jamais `findMostRecentExercise` directement.
// Les tests ci-dessus empruntaient la fonction interne : ils restaient
// verts alors que la fonctionnalité était morte en production (revue
// finale F1, sept. 2026).
// ─────────────────────────────────────────────────────────────────────

test("chemin de production : une séance déclarée plus récente l'emporte sur une séance Whoop du matin", () => {
  // Muscu Whoop terminée à 9h, padel déclaré 18h30-20h. À 20h15, c'est le
  // padel qui doit piloter la réduction — l'heure exacte où sa chute
  // décalée commence.
  const at2015 = Date.UTC(2026, 8, 7, 20, 15, 0);
  const r = resolveRecentExercise({
    nowMs: at2015,
    lastWhoopWorkout: {
      sport: "Weightlifting",
      startedAt: new Date(Date.UTC(2026, 8, 7, 8, 0, 0)).toISOString(),
      endedAt: new Date(Date.UTC(2026, 8, 7, 9, 0, 0)).toISOString(),
      strain: 10,
    },
    completedWorkouts: [],
    completedRunningSessions: [],
    declaredSportSessions: [
      session({
        startAt: new Date(Date.UTC(2026, 8, 7, 18, 30, 0)).toISOString(),
        plannedDurationMin: 90,
      }),
    ],
  });
  assert.equal(
    r?.source,
    "intermittent",
    `la séance la plus récemment terminée doit gagner — reçu ${JSON.stringify(r)}`,
  );
});

test("chemin de production : à fraîcheur égale, la mesure Whoop prime sur l'estimation", () => {
  const at2015 = Date.UTC(2026, 8, 7, 20, 15, 0);
  const endedAt = Date.UTC(2026, 8, 7, 20, 0, 0);
  const r = resolveRecentExercise({
    nowMs: at2015,
    lastWhoopWorkout: {
      sport: "Running",
      startedAt: new Date(endedAt - 45 * 60_000).toISOString(),
      endedAt: new Date(endedAt).toISOString(),
      strain: 13,
    },
    completedWorkouts: [],
    completedRunningSessions: [],
    declaredSportSessions: [
      session({
        startAt: new Date(endedAt - 90 * 60_000).toISOString(),
        plannedDurationMin: 90,
      }),
    ],
  });
  assert.equal(r?.strainSource, "whoop", "une mesure réelle doit primer sur une estimation");
});

test("chemin de production : sans séance Whoop, la séance déclarée passe bien", () => {
  const r = resolveRecentExercise({
    nowMs: now,
    lastWhoopWorkout: null,
    completedWorkouts: [],
    completedRunningSessions: [],
    declaredSportSessions: [session()],
  });
  assert.equal(r?.source, "intermittent");
  assert.equal(r?.durationMin, 90);
});
