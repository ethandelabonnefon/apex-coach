/**
 * Test de consolidation (juin 2026) : en mode unifié (events fournis), les
 * prédictions du plan nuit (computeBedtimeAdvice) doivent être STRICTEMENT
 * égales aux points de predictGlucoseCurve aux mêmes horizons — preuve qu'il
 * n'y a plus deux moteurs qui divergent.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBedtimeAdvice } from "./bedtime-advisor";
import { predictGlucoseCurve, carbSensitivity } from "./glucose-prediction";

const ISF = 100;
const NOON = new Date("2026-06-20T20:00:00").getTime(); // soirée

const events = [
  { minutesAgo: 60, units: 7, carbsGrams: 70, fatGrams: 25, proteinGrams: 30, carbSensitivity: carbSensitivity(ISF, 10) },
];

test("plan nuit (events) = predictGlucoseCurve aux mêmes horizons", () => {
  const advice = computeBedtimeAdvice({
    currentGlucose: 160,
    trendArrow: 3,
    iobUnits: 5,
    isfMgPerU: ISF,
    insulinActiveMinutes: 195,
    targetGlucose: 110,
    hoursUntilWakeup: 7,
    nowMs: NOON,
    events,
  });

  const curve = predictGlucoseCurve({
    currentGlucose: 160,
    trendArrow: 3,
    events,
    isf: ISF,
    dia: 195,
    horizonMinutes: 7 * 60,
    stepMinutes: 15,
    nowMs: NOON,
  });
  const at = (m: number) => curve.curve.find((p) => p.minute === m)!.value;

  const byLabel = Object.fromEntries(advice.predictions.map((p) => [p.label, p.glucose]));
  assert.equal(byLabel["+2h"], at(120), "+2h doit matcher la courbe");
  assert.equal(byLabel["+4h"], at(240), "+4h doit matcher la courbe");
  assert.equal(byLabel["Réveil"], at(420), "Réveil doit matcher la courbe");
});

test("plan nuit voit les glucides sans insuline (montée intégrée)", () => {
  const base = {
    currentGlucose: 110,
    trendArrow: 3,
    iobUnits: 0,
    isfMgPerU: ISF,
    insulinActiveMinutes: 195,
    targetGlucose: 110,
    hoursUntilWakeup: 7,
    nowMs: NOON,
  };
  const sansCarbs = computeBedtimeAdvice({ ...base, events: [] });
  const avecCarbs = computeBedtimeAdvice({
    ...base,
    events: [{ minutesAgo: 0, carbsGrams: 40, carbSensitivity: carbSensitivity(ISF, 10) }],
  });
  const max = (a: typeof sansCarbs) => Math.max(...a.predictions.map((p) => p.glucose));
  assert.ok(max(avecCarbs) > max(sansCarbs), "40g sans insuline doivent faire monter la prédiction nuit");
});

// ─── minPred sur la courbe complète : risque + recommandation (re-revue) ──
//
// Même scénario que le test "creux transitoire" de lib/night-brain.test.ts :
// un léger sur-dosage (45g glucides / 25g lip / 20g prot, bolus 5,37U injecté
// il y a 45min, glycémie 130) produit, sur la courbe à pas de 15 min :
//   minute 120 (+2h)  → 90 mg/dL   (pas < 90)
//   minute 135        → 89 mg/dL   (< 90, AUCUN échantillon ne tombe ici)
//   minute 240 (+4h)  → 125 mg/dL
//   minute 420 (réveil) → 155 mg/dL
// Ancien minPred (3 échantillons) = min(90, 125, 155) = 90 → ni le risque
// (90 n'est pas < 90) ni la recommandation (idem) ne voient le creux. Le
// vrai minimum de la courbe est 89 → les deux doivent basculer.

const EVENING = new Date("2026-09-02T22:30:00").getTime();
const dipEvents = [
  {
    minutesAgo: 45,
    units: 5.37,
    carbsGrams: 45,
    fatGrams: 25,
    proteinGrams: 20,
    carbSensitivity: carbSensitivity(ISF, 10),
  },
];

function dipAdvice() {
  return computeBedtimeAdvice({
    currentGlucose: 130,
    trendArrow: 3,
    iobUnits: 0,
    isfMgPerU: ISF,
    insulinActiveMinutes: 195,
    targetGlucose: 110,
    hoursUntilWakeup: 7,
    nowMs: EVENING,
    events: dipEvents,
  });
}

test("risque : un creux à 89 mg/dL entre +2h et +4h fait basculer le risque en caution-low", () => {
  const advice = dipAdvice();
  // Les 3 échantillons (90/125/155) ne franchissent aucun seuil de risque :
  // sans le fix, risk resterait 'safe'.
  assert.ok(
    advice.risk === "caution-low" || advice.risk === "risk-low",
    `creux à 89 mg/dL attendu en caution-low (ou risk-low), reçu '${advice.risk}'`,
  );
});

test("recommandation : le même creux produit une collation, pas 'tout va bien'", () => {
  const advice = dipAdvice();
  // Sans le fix, minPred (3 échantillons) = 90 → aucune branche hypo ne
  // matche → fallback 'all-good'. Avec le fix, minPred = 89 → 'eat-carbs'.
  assert.equal(
    advice.recommendation.type,
    "eat-carbs",
    `une collation est attendue sur ce creux, reçu '${advice.recommendation.type}' (${advice.recommendation.headline})`,
  );
});

// ─── buildSplitAdjustment : dernier des 3 sites (re-revue, passe finale) ──
//
// C'est la décision la plus directement anti-hypo du module : elle annule ou
// réduit une dose d'insuline DÉJÀ programmée (le split FPU en attente), pas
// un simple message. Scénario : un split de 2U en attente (déclenché dans
// 30min), sur-dosage modéré (45g glucides / 25g lip / 20g prot, bolus 4,3U
// injecté il y a 45min, glycémie 130). Courbe résultante (pas 15 min,
// pendingSplit inclus dans le calcul) :
//   minute 120 (+2h)  → 96 mg/dL   (pas < 70)
//   minute 165-195    → 66 mg/dL   (< 70, AUCUN échantillon ne tombe ici)
//   minute 240 (+4h)  → 75 mg/dL   (pas < 70)
//   minute 420 (réveil) → 104 mg/dL (pas < 70)
// Ancien minPred (3 échantillons) = min(96, 75, 104) = 75 → tombe dans la
// branche REDUCE (70-85), pas SKIP : le split serait réduit à 1U et FAIT,
// pendant que la glycémie réelle creuse à 66 entre-temps. Avec le fix, le
// vrai minimum de la courbe (66) < 70 → SKIP.

const splitDipEvents = [
  {
    minutesAgo: 45,
    units: 4.3,
    carbsGrams: 45,
    fatGrams: 25,
    proteinGrams: 20,
    carbSensitivity: carbSensitivity(ISF, 10),
  },
];

test("split en attente : un creux à 66 mg/dL entre échantillons impose SKIP, pas REDUCE", () => {
  const advice = computeBedtimeAdvice({
    currentGlucose: 130,
    trendArrow: 3,
    iobUnits: 0,
    isfMgPerU: ISF,
    insulinActiveMinutes: 195,
    targetGlucose: 110,
    hoursUntilWakeup: 7,
    nowMs: EVENING,
    events: splitDipEvents,
    pendingSplitUnits: 2,
    pendingSplitMinutesUntil: 30,
  });
  assert.equal(
    advice.recommendation.splitAdjustment?.type,
    "skip",
    `un creux à 66 mg/dL doit annuler le split (skip), reçu '${advice.recommendation.splitAdjustment?.type}'`,
  );
});

test("mode legacy (sans events) reste fonctionnel (rétrocompat)", () => {
  const advice = computeBedtimeAdvice({
    currentGlucose: 140,
    trendArrow: 3,
    iobUnits: 1,
    isfMgPerU: ISF,
    insulinActiveMinutes: 195,
    targetGlucose: 110,
    hoursUntilWakeup: 7,
    nowMs: NOON,
    lastMealHoursAgo: 2,
    lastMealCarbs: 60,
  });
  assert.equal(advice.predictions.length, 3);
  assert.ok(advice.recommendation.headline.length > 0);
});
