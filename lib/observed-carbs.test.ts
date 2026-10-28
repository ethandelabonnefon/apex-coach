import { test } from "node:test";
import assert from "node:assert/strict";
import {
  observedCarbsRemaining,
  buildObservedCarbsInput,
  type ObservedCarbsInput,
} from "./observed-carbs";
import type { CarbEntry, InsulinLog } from "@/types";

const base: ObservedCarbsInput = {
  carbsGrams: 60,
  mealMinutesAgo: 150,
  carbSensitivity: 10,
  boluses: [{ units: 6, minutesAgo: 150 }],
  glucoseAtMeal: 110,
  glucoseNow: 115,
  glucoseNowAgeMin: 3,
  isf: 100,
  otherMealsInWindow: 0,
  rescueInWindow: false,
};

test("dîner du 27/10 : ~57 g restants", () => {
  const r = observedCarbsRemaining({
    ...base,
    carbsGrams: 140,
    boluses: [{ units: 9, minutesAgo: 150 }],
    glucoseAtMeal: 76,
    glucoseNow: 90,
  });
  assert.ok(r);
  assert.ok(r.remainingG >= 50 && r.remainingG <= 65, `remainingG=${r.remainingG}`);
});

test("repas absorbé normalement : ~0", () => {
  // 115 donnait 5,14 g avec la formule du brief : on lit 120 pour rester < 5 g.
  const r = observedCarbsRemaining({ ...base, glucoseNow: 120 });
  assert.ok(r);
  assert.ok(r.remainingG < 5, `remainingG=${r.remainingG}`);
});

test("bornes : jamais < 0, jamais > saisie", () => {
  const haut = observedCarbsRemaining({ ...base, glucoseNow: 300 });
  assert.equal(haut?.remainingG, 0);
  const bas = observedCarbsRemaining({
    ...base,
    boluses: [{ units: 0.5, minutesAgo: 150 }],
    glucoseNow: 60,
  });
  assert.equal(bas?.remainingG, base.carbsGrams);
});

test("null hors conditions de lecture", () => {
  const cas: Partial<ObservedCarbsInput>[] = [
    { mealMinutesAgo: 60 },
    { mealMinutesAgo: 300 },
    { glucoseAtMeal: null },
    { glucoseNow: null },
    { glucoseNowAgeMin: 20 },
    { otherMealsInWindow: 1 },
    { rescueInWindow: true },
    { carbsGrams: 0 },
  ];
  for (const c of cas) {
    assert.equal(observedCarbsRemaining({ ...base, ...c }), null, JSON.stringify(c));
  }
});

// ─── buildObservedCarbsInput ──────────────────────────────────────────

const NOW = new Date("2026-10-27T22:30:00").getTime();
const minAgo = (m: number) => new Date(NOW - m * 60_000);

function meal(over: Partial<InsulinLog> = {}): InsulinLog {
  return {
    id: "dinner",
    units: 9,
    insulinType: "Novorapid",
    mealType: "dinner",
    carbsGrams: 140,
    glucoseBefore: 76,
    injectedAt: minAgo(150),
    ...over,
  } as InsulinLog;
}
const live = { value: 90, date: minAgo(3).toISOString() };
const baseOpts = {
  insulinLogs: [meal()],
  carbEntries: [] as CarbEntry[],
  history: [],
  archive: [],
  live,
  nowMs: NOW,
  isf: 100,
  ratios: { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 },
};

test("build : dîner à T+150, saisie au repas, lecture live 3 min", () => {
  const b = buildObservedCarbsInput(baseOpts);
  assert.ok(b);
  assert.equal(b.sourceId, "dinner");
  assert.equal(b.enteredG, 140);
  assert.equal(b.uncertain, false);
  assert.equal(b.input.glucoseAtMeal, 76);
  assert.equal(b.input.glucoseNow, 90);
  assert.ok(Math.abs(b.input.glucoseNowAgeMin! - 3) < 0.01);
  assert.ok(Math.abs(b.input.mealMinutesAgo - 150) < 0.01);
  assert.equal(b.input.carbSensitivity, 10);
  assert.deepEqual(b.input.boluses.map((x) => x.units), [9]);
  assert.equal(b.input.otherMealsInWindow, 0);
  assert.equal(b.input.rescueInWindow, false);
  const r = observedCarbsRemaining(b.input);
  assert.ok(r && r.remainingG > 40);
});

test("build : repas trop frais (< 90 min) ou trop vieux (> 240 min) → null", () => {
  assert.equal(buildObservedCarbsInput({ ...baseOpts, insulinLogs: [meal({ injectedAt: minAgo(60) })] }), null);
  assert.equal(buildObservedCarbsInput({ ...baseOpts, insulinLogs: [meal({ injectedAt: minAgo(260) })] }), null);
});

test("build : corrections, splits et petits repas ne sont pas visés", () => {
  const logs = [
    meal(),
    meal({ id: "corr", mealType: "correction", carbsGrams: 0, units: 1, injectedAt: minAgo(100) }),
    meal({ id: "split", isSplitDose: true, carbsGrams: 0, units: 3, injectedAt: minAgo(95) }),
    meal({ id: "petit", mealType: "snack", carbsGrams: 10, units: 1, injectedAt: minAgo(92) }),
  ];
  const b = buildObservedCarbsInput({ ...baseOpts, insulinLogs: logs });
  assert.ok(b);
  assert.equal(b.sourceId, "dinner");
  assert.equal(b.input.otherMealsInWindow, 0);
  // Toutes les injections comptent dans le bilan d'insuline.
  assert.equal(b.input.boluses.length, 4);
});

test("build : jamais de lecture inventée — sans capteur, glucoseNow et âge nuls", () => {
  const b = buildObservedCarbsInput({ ...baseOpts, live: null });
  assert.ok(b);
  assert.equal(b.input.glucoseNow, null);
  assert.equal(b.input.glucoseNowAgeMin, null);
  assert.equal(observedCarbsRemaining(b.input), null);
});

test("build : glycémie au repas depuis l'historique puis l'archive à ±20 min", () => {
  const noBefore = [meal({ glucoseBefore: 0 })];
  const fromHistory = buildObservedCarbsInput({
    ...baseOpts,
    insulinLogs: noBefore,
    history: [
      { value: 150, date: minAgo(180).toISOString() },
      { value: 82, date: minAgo(140).toISOString() },
    ],
  });
  assert.equal(fromHistory?.input.glucoseAtMeal, 82);
  const fromArchive = buildObservedCarbsInput({
    ...baseOpts,
    insulinLogs: noBefore,
    archive: [{ t: NOW - 165 * 60_000, value: 77 }],
  });
  assert.equal(fromArchive?.input.glucoseAtMeal, 77);
  const tooFar = buildObservedCarbsInput({
    ...baseOpts,
    insulinLogs: noBefore,
    archive: [{ t: NOW - 180 * 60_000, value: 77 }],
  });
  assert.equal(tooFar?.input.glucoseAtMeal, null);
});

test("build : re-sucrage et glucides libres ≥ 20 g dans la fenêtre", () => {
  const rescue = buildObservedCarbsInput({
    ...baseOpts,
    carbEntries: [{ id: "r", carbsGrams: 15, eatenAt: minAgo(30).toISOString(), hypoEventId: "h1" }],
  });
  assert.equal(rescue?.input.rescueInWindow, true);
  const snack = buildObservedCarbsInput({
    ...baseOpts,
    carbEntries: [{ id: "s", carbsGrams: 30, insulinUnits: 2, eatenAt: minAgo(60).toISOString() }],
  });
  assert.equal(snack?.input.otherMealsInWindow, 1);
  assert.equal(snack?.input.boluses.length, 2);
});

test("build : quantité incertaine remontée", () => {
  const b = buildObservedCarbsInput({ ...baseOpts, insulinLogs: [meal({ carbsUncertain: true })] });
  assert.equal(b?.uncertain, true);
});

test("build : le confirmé prime sur l'estimé", () => {
  const b = buildObservedCarbsInput({ ...baseOpts, insulinLogs: [meal({ carbsConfirmedGrams: 120 })] });
  assert.equal(b?.enteredG, 120);
  assert.equal(b?.input.carbsGrams, 120);
});
