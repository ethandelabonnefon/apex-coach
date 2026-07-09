/**
 * Tests inferMealTimeFromClock — repas auto-déduit de l'heure locale
 * (juillet 2026). Fenêtres calées sur le rythme réel d'Ethan.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { inferMealTimeFromClock } from "./insulin-calculator";

/** Date locale au jour arbitraire, heure/minute contrôlées. */
function at(hours: number, minutes = 0): Date {
  return new Date(2026, 6, 9, hours, minutes);
}

test("matin : 04h00-10h59", () => {
  assert.equal(inferMealTimeFromClock(at(4, 0)), "morning");
  assert.equal(inferMealTimeFromClock(at(7, 30)), "morning");
  assert.equal(inferMealTimeFromClock(at(10, 59)), "morning");
});

test("midi : 11h00-14h59", () => {
  assert.equal(inferMealTimeFromClock(at(11, 0)), "lunch");
  assert.equal(inferMealTimeFromClock(at(12, 45)), "lunch");
  assert.equal(inferMealTimeFromClock(at(14, 59)), "lunch");
});

test("goûter : 15h00-18h29 (goûter réel ~17h30)", () => {
  assert.equal(inferMealTimeFromClock(at(15, 0)), "snack");
  assert.equal(inferMealTimeFromClock(at(17, 30)), "snack");
  assert.equal(inferMealTimeFromClock(at(18, 29)), "snack");
});

test("soir : 18h30-23h59 (dîner réel ~19h)", () => {
  assert.equal(inferMealTimeFromClock(at(18, 30)), "dinner");
  assert.equal(inferMealTimeFromClock(at(19, 0)), "dinner");
  assert.equal(inferMealTimeFromClock(at(23, 59)), "dinner");
});

test("nuit 00h00-03h59 : traité comme soir (repas nocturne = comportement dîner)", () => {
  assert.equal(inferMealTimeFromClock(at(0, 0)), "dinner");
  assert.equal(inferMealTimeFromClock(at(2, 15)), "dinner");
  assert.equal(inferMealTimeFromClock(at(3, 59)), "dinner");
});
