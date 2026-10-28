/**
 * Non-régression : le moteur d'événements — celui qui alimente la
 * prédiction du réveil, donc la recommandation de correction du coucher —
 * doit lire les glucides CONFIRMÉS quand ils existent.
 *
 * Sans ça : le patient confirme 140 g au lieu de 100, l'étape « couverture »
 * du plan de la nuit dit « il manque 4 U », et la prédiction du réveil
 * affichée deux lignes plus bas modélise toujours 100 g (~140 mg/dL
 * d'écart sur la trajectoire).
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildPredictionEvents, withObservedCarbs } from "./prediction-inputs";
import type { InsulinLog } from "@/types";

const RATIOS = { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 };

function log(over: Partial<InsulinLog> = {}): InsulinLog {
  return {
    id: "l1",
    units: 10,
    insulinType: "Novorapid",
    mealType: "dinner",
    carbsGrams: 100,
    glucoseBefore: 120,
    notes: "",
    injectedAt: new Date(Date.now() - 30 * 60_000),
    ...over,
  };
}

test("buildPredictionEvents : les glucides confirmés priment sur l'estimation", () => {
  const [evt] = buildPredictionEvents({
    insulinLogs: [log({ carbsGrams: 100, carbsConfirmedGrams: 140 })],
    isf: 100,
    ratios: RATIOS,
  });
  assert.equal(evt.carbsGrams, 140);
});

test("buildPredictionEvents : macros confirmées prises en compte", () => {
  const [evt] = buildPredictionEvents({
    insulinLogs: [
      log({
        fatGrams: 10,
        proteinGrams: 12,
        fatConfirmedGrams: 30,
        proteinConfirmedGrams: 45,
      }),
    ],
    isf: 100,
    ratios: RATIOS,
  });
  assert.equal(evt.fatGrams, 30);
  assert.equal(evt.proteinGrams, 45);
});

test("buildPredictionEvents : sans confirmation, on garde l'estimation", () => {
  const [evt] = buildPredictionEvents({
    insulinLogs: [log({ carbsGrams: 100, fatGrams: 10, proteinGrams: 12 })],
    isf: 100,
    ratios: RATIOS,
  });
  assert.equal(evt.carbsGrams, 100);
  assert.equal(evt.fatGrams, 10);
  assert.equal(evt.proteinGrams, 12);
});

test("buildPredictionEvents : 0 g confirmé est une valeur, pas un absent", () => {
  const [evt] = buildPredictionEvents({
    insulinLogs: [log({ carbsGrams: 100, carbsConfirmedGrams: 0 })],
    isf: 100,
    ratios: RATIOS,
  });
  assert.equal(evt.carbsGrams, 0);
});

test("buildPredictionEvents renseigne sourceId", () => {
  const now = Date.now();
  const evs = buildPredictionEvents({
    insulinLogs: [log({ id: "L9", injectedAt: new Date(now - 30 * 60_000) })],
    carbEntries: [{ id: "C7", carbsGrams: 20, eatenAt: new Date(now - 10 * 60_000).toISOString() } as any],
    isf: 100,
    ratios: RATIOS,
    nowMs: now,
  });
  assert.deepEqual(evs.map((e) => e.sourceId).sort(), ["C7", "L9"]);
});

test("withObservedCarbs ne modifie que l'événement ciblé, sans muter", () => {
  const a = { sourceId: "a", minutesAgo: 10, carbsGrams: 50 };
  const b = { sourceId: "b", minutesAgo: 20, carbsGrams: 60 };
  const input = [a, b];
  const out = withObservedCarbs(input, "b", 30, 2);
  assert.equal(out[0], a);
  assert.equal(out[1].observedRemainingG, 30);
  assert.equal(out[1].lateCarbMgPerG, 2);
  assert.equal((b as any).observedRemainingG, undefined);
  assert.notEqual(out, input);
});
