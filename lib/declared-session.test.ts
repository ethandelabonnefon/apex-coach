import test from "node:test";
import assert from "node:assert/strict";
import {
  findMostRecentExercise,
  resolveRecentExercise,
  computeExerciseAdjustment,
  DECLARED_SESSION_STRAIN_CAP,
} from "./exercise-insulin-adjustment";
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

test("F3 : une séance seulement déclarée ne peut pas armer la réduction maximale", () => {
  // Padel de 90 min : la durée seule produirait un strain de 18, donc le
  // bracket maximal (-50 % pendant 2 h, fenêtre 24 h). Deux taps suffisaient.
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ plannedDurationMin: 90 }),
  ]);
  assert.ok(r, "la séance doit bien être retenue");
  assert.ok(
    r!.strain <= DECLARED_SESSION_STRAIN_CAP,
    `strain ${r!.strain} doit être plafonné à ${DECLARED_SESSION_STRAIN_CAP} sans mesure d'intensité`,
  );
});

test("F3 : une séance réconciliée est pilotée par le strain MESURÉ, pas par une estimation", () => {
  // Padel déclaré 18h30 pour 90 min, réellement joué 18h25-20h00, strain
  // Whoop 11. Le premier correctif levait le plafond dès qu'une durée réelle
  // existait — en croyant obtenir une mesure, alors que ce chemin n'a que
  // `estimateStrain` (durée seule) : 95 min donnaient 18, soit -50 % sur 24 h
  // au lieu des -25 % sur 12 h réellement mesurés.
  const at2030 = Date.UTC(2026, 8, 7, 20, 30, 0);
  const r = resolveRecentExercise({
    nowMs: at2030,
    lastWhoopWorkout: {
      sport: "Padel",
      startedAt: new Date(Date.UTC(2026, 8, 7, 18, 25, 0)).toISOString(),
      endedAt: new Date(Date.UTC(2026, 8, 7, 20, 0, 0)).toISOString(),
      strain: 11,
    },
    completedWorkouts: [],
    completedRunningSessions: [],
    declaredSportSessions: [
      session({
        startAt: new Date(Date.UTC(2026, 8, 7, 18, 30, 0)).toISOString(),
        plannedDurationMin: 90,
        actualDurationMin: 95,
        endedAt: new Date(Date.UTC(2026, 8, 7, 20, 0, 0)).toISOString(),
        whoopWorkoutId: "w1",
      }),
    ],
  });
  assert.equal(r?.strainSource, "whoop", "la mesure doit piloter, pas l'estimation");
  assert.equal(r?.strain, 11, `strain mesuré attendu, reçu ${r?.strain}`);
  const adj = computeExerciseAdjustment(r!, at2030)!;
  assert.equal(adj.reductionPct, 25, "bracket cardio modéré, pas le bracket maximal");
  assert.equal(adj.windowHours, 12);
});

test("F1 : une séance trackée et vue par Whoop ne fait pas gagner l'estimation pour 2 minutes", () => {
  // Même sortie, deux sources : l'app la calcule finissant 2 min plus tard
  // que le bracelet. Sans rapprochement, l'estimation gagnait le
  // départage « la plus récente » et faisait passer la réduction de 25 %
  // sur 12 h (mesuré) à 40 % sur 18 h (estimé).
  const at2100 = Date.UTC(2026, 8, 7, 21, 0, 0);
  const whoopEnd = Date.UTC(2026, 8, 7, 20, 0, 0);
  const r = resolveRecentExercise({
    nowMs: at2100,
    lastWhoopWorkout: {
      sport: "Running",
      startedAt: new Date(whoopEnd - 55 * 60_000).toISOString(),
      endedAt: new Date(whoopEnd).toISOString(),
      strain: 11,
    },
    completedWorkouts: [],
    completedRunningSessions: [
      {
        id: "r1",
        date: new Date(whoopEnd - 57 * 60_000).toISOString(),
        actualDuration: 59,
      },
    ],
    declaredSportSessions: [],
  });
  assert.equal(r?.strainSource, "whoop", "la mesure doit primer sur l'estimation");
  const adj = computeExerciseAdjustment(r!, at2100)!;
  assert.equal(adj.reductionPct, 25);
});

test("F1 : deux séances vraiment distinctes restent départagées par la plus récente", () => {
  // Muscu Whoop le matin, padel déclaré le soir : plus de 45 min d'écart,
  // ce ne sont pas les mêmes — la plus récente doit gagner.
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
  assert.equal(r?.source, "intermittent", "le padel du soir doit l'emporter sur la muscu du matin");
});
