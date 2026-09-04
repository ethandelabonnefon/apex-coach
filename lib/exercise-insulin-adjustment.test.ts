/**
 * Tests de `resolveRecentExercise` — I5 (revue finale, plafonnement prédictif).
 *
 * Contexte : `app/diabete/page.tsx` résolvait la séance récente à DEUX
 * endroits divergents — un memo inline (branche Whoop) qui réimplémentait
 * la logique SANS le garde `endedAtMs <= nowMs` ni le `Math.max(1,
 * durationMin)` de `resolveRecentExercise`, et un second memo qui appelait
 * la version correcte. Les deux alimentaient le MÊME chiffre de dose (l'un
 * réduisait la candidate, l'autre modulait la simulation qui la plafonne).
 * Sur un workout Whoop daté dans le futur (fuseaux, sync différée), le
 * calculateur réduisait la dose pour une séance que le plafond ignorait.
 *
 * Le fix (page.tsx) supprime le memo inline divergent et fait dériver
 * `exerciseAdjustment` de la MÊME résolution (`recentExercise`, construite
 * via `resolveRecentExercise`) que celle passée au plafond prédictif. Ces
 * tests couvrent la fonction dont dépend maintenant tout le fichier —
 * `page.tsx` n'a plus de logique de résolution propre à tester séparément.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveRecentExercise,
  type LastWhoopWorkout,
} from "./exercise-insulin-adjustment";

const NOW = new Date("2026-09-03T20:00:00Z").getTime();

test("I5 : un workout Whoop daté dans le FUTUR est ignoré, pas utilisé comme séance récente", () => {
  // C'est exactement le garde que l'ancien memo inline de page.tsx
  // n'avait pas (`endedAtMs <= nowMs` manquant) : un sync Whoop différé ou
  // un décalage de fuseau peut renvoyer un `endedAt` après `nowMs`.
  const futureWorkout: LastWhoopWorkout = {
    sport: "Running",
    startedAt: new Date(NOW + 30 * 60_000).toISOString(),
    endedAt: new Date(NOW + 60 * 60_000).toISOString(),
    strain: 14,
  };
  const r = resolveRecentExercise({
    nowMs: NOW,
    lastWhoopWorkout: futureWorkout,
    completedWorkouts: [],
    completedRunningSessions: [],
  });
  assert.equal(r, null, `un workout futur ne doit produire AUCUNE séance récente, reçu ${JSON.stringify(r)}`);
});

test("I5 : un workout Whoop futur ne masque pas une vraie séance passée (fallback estimation)", () => {
  const futureWorkout: LastWhoopWorkout = {
    sport: "Running",
    startedAt: new Date(NOW + 30 * 60_000).toISOString(),
    endedAt: new Date(NOW + 60 * 60_000).toISOString(),
    strain: 14,
  };
  const r = resolveRecentExercise({
    nowMs: NOW,
    lastWhoopWorkout: futureWorkout,
    completedWorkouts: [
      { id: "w1", date: new Date(NOW - 90 * 60_000).toISOString(), duration: 60 },
    ],
    completedRunningSessions: [],
  });
  assert.ok(r !== null, "doit retomber sur la séance muscu passée");
  assert.equal(r?.source, "muscu");
});

test("I5 : un workout Whoop passé et valide est bien utilisé (pas de régression du cas normal)", () => {
  const pastWorkout: LastWhoopWorkout = {
    sport: "Running",
    startedAt: new Date(NOW - 60 * 60_000).toISOString(),
    endedAt: new Date(NOW - 15 * 60_000).toISOString(),
    strain: 12,
  };
  const r = resolveRecentExercise({
    nowMs: NOW,
    lastWhoopWorkout: pastWorkout,
    completedWorkouts: [],
    completedRunningSessions: [],
  });
  assert.ok(r !== null);
  assert.equal(r?.source, "running");
  assert.equal(r?.strainSource, "whoop");
  assert.equal(r?.durationMin, 45);
});

test("I5 : durée nulle/négative (horloge Whoop incohérente) est plancherisée à 1 min, jamais 0 ou négative", () => {
  // `Math.max(1, durationMin)` — l'autre garde que l'ancien memo inline
  // n'avait pas. `startedAt` après `endedAt` produirait une durée négative
  // sans ce plancher.
  const weirdWorkout: LastWhoopWorkout = {
    sport: "Weightlifting",
    startedAt: new Date(NOW - 5 * 60_000).toISOString(),
    endedAt: new Date(NOW - 10 * 60_000).toISOString(), // avant le début : horloge incohérente
    strain: 10,
  };
  const r = resolveRecentExercise({
    nowMs: NOW,
    lastWhoopWorkout: weirdWorkout,
    completedWorkouts: [],
    completedRunningSessions: [],
  });
  assert.ok(r !== null);
  assert.ok(r && r.durationMin >= 1, `durationMin doit être planchérisée à 1, reçu ${r?.durationMin}`);
});
