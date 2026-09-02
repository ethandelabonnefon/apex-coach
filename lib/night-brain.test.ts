/**
 * Tests de l'étape « couverture » du plan de la nuit.
 *
 * Deux invariants y sont vérifiés :
 *  1. Night Brain PRÉSENTE le statut COB, il ne le recalcule pas. Deux
 *     définitions concurrentes de « excès » faisaient diverger la tuile
 *     (« Couvert ») et le plan de la nuit (« trop d'insuline ») juste après
 *     un split correctement injecté.
 *  2. Un repas incertain rend le plan muet sur la dose (pas d'étape déficit)
 *     mais JAMAIS silencieux sur un risque d'hypo (l'étape excès survit).
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeNightPlan, type NightBrainInput } from "./night-brain";
import { resolveCobStatus, NIGHT_BALANCE_THRESHOLD_U } from "./carbs-on-board";

const EVENING = new Date("2026-09-02T22:30:00").getTime();

function input(over: Partial<NightBrainInput> = {}): NightBrainInput {
  return {
    currentGlucose: 140,
    trendArrow: 3,
    iobUnits: 0,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    targetGlucose: 110,
    hoursUntilWakeup: 7,
    nowMs: EVENING,
    ...over,
  };
}

const coverageStep = (plan: ReturnType<typeof computeNightPlan>) =>
  plan.steps.find((s) => s.kind === "coverage");

test("nuit : excès d'insuline → étape couverture 'garde du sucre à portée'", () => {
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 3,
        balanceU: 2.4,
        status: "excess",
        uncertain: false,
      },
    }),
  );
  const step = coverageStep(plan);
  assert.ok(step, "une étape couverture est attendue");
  assert.equal(step.tone, "info");
  assert.match(step.detail, /sucre/i);
});

test("nuit : repas INCERTAIN avec excès d'insuline → alerte hypo maintenue", () => {
  // Régression : `mealCoverage` était supprimé en bloc dès qu'une source
  // était incertaine, ce qui emportait aussi la branche « trop d'insuline ».
  // Ce test échoue si l'incertitude neutralise à nouveau la branche excès.
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 3,
        balanceU: 2.4,
        status: "excess",
        uncertain: true,
      },
    }),
  );
  const step = coverageStep(plan);
  assert.ok(step, "l'alerte d'excès doit survivre à un repas incertain");
  assert.equal(step.tone, "info");
});

test("nuit : repas INCERTAIN en déficit → aucun conseil de dose à la hausse", () => {
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 70,
        balanceU: -3,
        status: "deficit",
        uncertain: true,
      },
    }),
  );
  assert.equal(coverageStep(plan), undefined);
});

test("nuit : déficit certain → étape couverture d'alerte", () => {
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 70,
        balanceU: -3,
        status: "deficit",
        uncertain: false,
      },
    }),
  );
  const step = coverageStep(plan);
  assert.ok(step);
  assert.equal(step.tone, "warning");
});

test("nuit : après un split correctement injecté → pas de faux 'trop d'insuline'", () => {
  // Pâtes du soir : 60 g encore à digérer, split de 4 U qui vient d'être
  // injecté → balance +2 U. L'ancien seuillage local (`balanceU >= 1.5`,
  // sans la condition sur les grammes) criait « trop d'insuline » alors que
  // la tuile disait « Couvert ». Faux positif sur le geste que l'app
  // recommande elle-même.
  const status = resolveCobStatus({
    totalRemainingG: 60,
    insulinActiveU: 8,
    balanceU: 2,
    thresholdU: NIGHT_BALANCE_THRESHOLD_U,
  });
  assert.equal(status, "covered");

  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 60,
        balanceU: 2,
        status,
        uncertain: false,
      },
    }),
  );
  assert.equal(coverageStep(plan), undefined);
});
