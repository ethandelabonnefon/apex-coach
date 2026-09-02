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
import { carbSensitivity } from "./glucose-prediction";

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

test("nuit : creux transitoire ENTRE deux échantillons → déclenche 'mange maintenant'", () => {
  // Régression maille anti-hypo trop large (re-revue de branche) : l'ancien
  // code calculait minPred sur les 3 échantillons de `advice.predictions`
  // (+2h, +4h, réveil) alors que la courbe sous-jacente (mode unifié,
  // `predictGlucoseCurve`) est calculée à pas de 15 min. Un léger sur-dosage
  // par rapport aux glucides (45g + 25g lip + 20g prot, bolus 5,37U injecté
  // il y a 45min) produit un creux à T+2h15 (135min) qui remonte ensuite —
  // digestion des lipides/protéines encore en cours. Vérifié par calcul
  // direct sur predictGlucoseCurve (mêmes paramètres, même nowMs) :
  //   minute 120 (+2h)  → 90 mg/dL  (pas < 90 → l'ancien code ne déclenche PAS)
  //   minute 135        → 89 mg/dL  (< 90, mais AUCUN échantillon ne tombe ici)
  //   minute 240 (+4h)  → 125 mg/dL
  //   minute 420 (réveil) → 155 mg/dL
  // L'ancien minPred (3 échantillons) = min(90, 125, 155) = 90 → pas < 90 →
  // aucune étape "mange maintenant". Le vrai minimum de la courbe est 89 → la
  // correction doit faire apparaître l'étape avec le fix, et ce test échoue
  // sans lui (vérifié en retirant temporairement le fix).
  const ISF = 100;
  const plan = computeNightPlan(
    input({
      currentGlucose: 130,
      trendArrow: 3,
      events: [
        {
          minutesAgo: 45,
          units: 5.37,
          carbsGrams: 45,
          fatGrams: 25,
          proteinGrams: 20,
          carbSensitivity: carbSensitivity(ISF, 10),
        },
      ],
    }),
  );
  const eatNow = plan.steps.find((s) => s.kind === "eat-now");
  assert.ok(
    eatNow,
    "un creux à 89 mg/dL entre +2h et +4h doit déclencher une étape 'mange maintenant', même si les échantillons +2h/+4h/réveil sont tous ≥ 90",
  );
});
