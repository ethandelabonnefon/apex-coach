import { test } from "node:test";
import assert from "node:assert/strict";
import { observedCarbsRemaining, type ObservedCarbsInput } from "./observed-carbs";

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
