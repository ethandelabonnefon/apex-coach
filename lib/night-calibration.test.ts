/**
 * Tests du facteur « glucides tardifs » appris sur les nuits passées.
 *
 * Une nuit synthétique : dîner à 20h (80 g, bolus de 8 U), lecture à T+150 min,
 * glycémie à la lecture fixée pour que le bilan de masse donne exactement
 * `remaining` g restants, puis une montée réelle de 30 + slope × remaining.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  estimateLateCarbFactor,
  iobRemainingFraction,
  LATE_CARB_DEFAULT,
  LATE_CARB_MAX,
  type LateCarbMeal,
  type NightInjection,
} from "./night-calibration";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";

const ISF = 100;
const CSF = 10; // mg/dL par g
const CARBS = 80;
const BOLUS_U = 8;
const MIN = 60_000;

interface NightOpts {
  day: number; // jour d'octobre 2026 du dîner
  remaining: number; // g restants à T+150 par construction
  slope?: number; // mg/dL de montée par g restant
  extraInjectionMin?: number; // injection à reading + N min
  weirdRise?: number; // force la montée réelle
}

/** Construit points + repas + injections d'une nuit. */
function buildNight(o: NightOpts) {
  const mealMs = new Date(2026, 9, o.day, 20, 0).getTime();
  const readingMs = mealMs + 150 * MIN;
  const used =
    BOLUS_U * (iobRemainingFraction(-150) - iobRemainingFraction(150));
  const glucoseAtMeal = 100;
  const readingValue = glucoseAtMeal + (CARBS - o.remaining) * CSF - used * ISF;
  const rise = o.weirdRise ?? 30 + (o.slope ?? 2) * o.remaining;

  const points: ArchivedPoint[] = [];
  for (let t = mealMs - 60 * MIN; t <= readingMs + 300 * MIN; t += 15 * MIN) {
    let value = glucoseAtMeal;
    if (t === readingMs) value = readingValue;
    if (t === readingMs + 120 * MIN) value = readingValue + rise;
    else if (t > readingMs) value = readingValue;
    points.push({ t, value, trend: "flat", isHigh: false, isLow: false });
  }
  const meals: LateCarbMeal[] = [
    {
      injectedAt: new Date(mealMs).toISOString(),
      carbsGrams: CARBS,
      carbSensitivity: CSF,
    },
  ];
  const injections: NightInjection[] = [
    { injectedAt: new Date(mealMs).toISOString(), units: BOLUS_U },
  ];
  if (o.extraInjectionMin != null) {
    injections.push({
      injectedAt: new Date(readingMs + o.extraInjectionMin * MIN).toISOString(),
      units: 2,
    });
  }
  return { points, meals, injections };
}

function build(nights: NightOpts[]) {
  const all = nights.map(buildNight);
  return {
    points: all.flatMap((n) => n.points),
    meals: all.flatMap((n) => n.meals),
    injections: all.flatMap((n) => n.injections),
  };
}

const REMAININGS = [0, 10, 20, 30, 40, 50];

test("estimateLateCarbFactor : moins de 5 nuits utilisables -> défaut", () => {
  const d = build(REMAININGS.slice(0, 4).map((r, i) => ({ day: 1 + i, remaining: r })));
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set());
  assert.equal(res.mgPerGram, LATE_CARB_DEFAULT);
  assert.equal(res.isDefault, true);
  assert.equal(res.sampleNights, 4);
});

test("estimateLateCarbFactor : 6 nuits, montée = 30 + 2 x restant -> ~2", () => {
  const d = build(REMAININGS.map((r, i) => ({ day: 1 + i, remaining: r })));
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set());
  assert.equal(res.isDefault, false);
  assert.equal(res.sampleNights, 6);
  assert.ok(Math.abs(res.mgPerGram - 2) < 0.05, `obtenu ${res.mgPerGram}`);
});

test("estimateLateCarbFactor : pente 10 -> bornée à 4", () => {
  const d = build(REMAININGS.map((r, i) => ({ day: 1 + i, remaining: r, slope: 10 })));
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set());
  assert.equal(res.mgPerGram, LATE_CARB_MAX);
});

test("estimateLateCarbFactor : injection dans les 5 h après la lecture -> nuit ignorée", () => {
  const nights: NightOpts[] = REMAININGS.slice(0, 5).map((r, i) => ({ day: 1 + i, remaining: r }));
  nights.push({ day: 6, remaining: 50, weirdRise: 600, extraInjectionMin: 60 });
  const d = build(nights);
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set());
  assert.equal(res.sampleNights, 5);
  assert.ok(Math.abs(res.mgPerGram - 2) < 0.05, `obtenu ${res.mgPerGram}`);
});

test("estimateLateCarbFactor : nuit exclue -> ignorée", () => {
  const nights: NightOpts[] = REMAININGS.slice(0, 5).map((r, i) => ({ day: 1 + i, remaining: r }));
  nights.push({ day: 6, remaining: 50, weirdRise: 600 });
  const d = build(nights);
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set(["2026-10-06"]));
  assert.equal(res.sampleNights, 5);
  assert.ok(Math.abs(res.mgPerGram - 2) < 0.05, `obtenu ${res.mgPerGram}`);
});

test("estimateLateCarbFactor : variance nulle des restants -> défaut", () => {
  const d = build([1, 2, 3, 4, 5, 6].map((day) => ({ day, remaining: 20 })));
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set());
  assert.equal(res.mgPerGram, LATE_CARB_DEFAULT);
  assert.equal(res.isDefault, true);
});

test("estimateLateCarbFactor : repas incertain (sampleable false) -> pas un échantillon", () => {
  const d = build(REMAININGS.map((r, i) => ({ day: 1 + i, remaining: r })));
  d.meals[5] = { ...d.meals[5], sampleable: false };
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set());
  assert.equal(res.sampleNights, 5);
});

test("estimateLateCarbFactor : repas incertain voisin -> disqualifie quand même le dîner", () => {
  const d = build(REMAININGS.map((r, i) => ({ day: 1 + i, remaining: r })));
  // Goûter incertain 30 g, 1 h avant le dîner du 6 : perturbateur.
  const dinnerMs = new Date(2026, 9, 6, 20, 0).getTime();
  d.meals.push({
    injectedAt: new Date(dinnerMs - 60 * MIN).toISOString(),
    carbsGrams: 30,
    carbSensitivity: CSF,
    sampleable: false,
  });
  const res = estimateLateCarbFactor(d.points, d.meals, d.injections, ISF, new Set());
  assert.equal(res.sampleNights, 5);
});
