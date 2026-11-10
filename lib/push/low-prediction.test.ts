import { test } from "node:test";
import assert from "node:assert/strict";
import { assessLowSoon, readingAgeMinutes } from "./low-prediction";

test("95 en chute rapide → alerte (projeté 55)", () => {
  const r = assessLowSoon({ value: 95, trend: "SingleDown", readingAgeMin: 2 });
  assert.equal(r.warn, true);
  assert.equal(r.projected, 55);
});

test("85 en descente → alerte (projeté 65)", () => {
  assert.equal(assessLowSoon({ value: 85, trend: "FortyFiveDown", readingAgeMin: 2 }).warn, true);
});

test("95 en descente simple → pas d'alerte (projeté 75)", () => {
  assert.equal(assessLowSoon({ value: 95, trend: "FortyFiveDown", readingAgeMin: 2 }).warn, false);
});

test("120 en chute rapide → pas d'alerte (projeté 80)", () => {
  assert.equal(assessLowSoon({ value: 120, trend: "SingleDown", readingAgeMin: 2 }).warn, false);
});

test("stable ou en montée → jamais d'alerte", () => {
  for (const trend of ["Flat", "FortyFiveUp", "SingleUp", "NotComputable", undefined]) {
    assert.equal(assessLowSoon({ value: 72, trend, readingAgeMin: 1 }).warn, false);
  }
});

test("déjà sous 70 → c'est l'alerte hypo qui parle", () => {
  assert.equal(assessLowSoon({ value: 65, trend: "SingleDown", readingAgeMin: 1 }).warn, false);
});

test("lecture vieille de 25 min → on n'alerte pas sur une donnée périmée", () => {
  assert.equal(assessLowSoon({ value: 80, trend: "SingleDown", readingAgeMin: 25 }).warn, false);
});

test("readingAgeMinutes : date illisible → Infinity", () => {
  assert.equal(readingAgeMinutes("pas une date", Date.now()), Infinity);
  const now = Date.UTC(2026, 10, 9, 12, 0);
  assert.equal(readingAgeMinutes(new Date(now - 6 * 60_000).toISOString(), now), 6);
});
