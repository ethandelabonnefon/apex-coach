/**
 * Tests inferMealTimeFromClock — repas auto-déduit de l'heure locale
 * (juillet 2026). Fenêtres calées sur le rythme réel d'Ethan.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  inferMealTimeFromClock,
  getInjectionTimingAdvice,
} from "./insulin-calculator";

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

/**
 * Timing d'injection — pré-bolus gradué calé sur la PK Novorapid (onset
 * 10-20 min). Le point clé : près de la cible, plus de "15 min avant" fixe
 * (qui causait des petites hypos précoces à Ethan) → au moment du repas.
 */
const timing = (g: number, carbs = 60, meal = "lunch" as const, trend?: number) =>
  getInjectionTimingAdvice(g, carbs, meal, trend);

test("proche de la cible (100 mg/dL, stable) → au repas, 0 min (fix hypo Ethan)", () => {
  const t = timing(100, 60, "lunch", 3);
  assert.equal(t?.leadMinutes, 0);
  assert.equal(t?.tone, "with-meal");
});

test("délai gradué selon la glycémie (stable)", () => {
  assert.equal(timing(125)?.leadMinutes, 10); // 110-139
  assert.equal(timing(160)?.leadMinutes, 15); // 140-179
  assert.equal(timing(200)?.leadMinutes, 20); // 180-249 → early
  assert.equal(timing(200)?.tone, "early");
  assert.equal(timing(260)?.leadMinutes, 25); // ≥250
});

test("glycémie basse (<80) ou chute rapide ↓↓ → au repas/après, jamais anticiper", () => {
  assert.equal(timing(75)?.leadMinutes, -1);
  assert.equal(timing(75)?.tone, "delay");
  assert.equal(timing(150, 60, "lunch", 1)?.leadMinutes, -1); // ↓↓
});

test("tendance Libre : ↘ raccourcit, ↗/↑↑ rallongent", () => {
  assert.equal(timing(160, 60, "lunch", 2)?.leadMinutes, 5); // 15 - 10
  assert.equal(timing(125, 60, "lunch", 5)?.leadMinutes, 20); // 10 + 10 → early
  assert.equal(timing(125, 60, "lunch", 5)?.tone, "early");
});

test("snack rapide (<20g) → jamais de long pré-bolus (cap 5 min)", () => {
  assert.equal(getInjectionTimingAdvice(160, 15, "snack")?.leadMinutes, 5);
});

test("pas de conseil : sans glucides, mealTime 'other', ou pré-workout", () => {
  assert.equal(getInjectionTimingAdvice(130, 0, "lunch"), null);
  assert.equal(getInjectionTimingAdvice(130, 60, "other"), null);
  assert.equal(getInjectionTimingAdvice(130, 60, "lunch", 3, true), null);
});
