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
