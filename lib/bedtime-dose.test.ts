/**
 * Tests de la dose du coucher « pic ≤ 130, plancher 80 ».
 *
 * `findBedtimeDose` reçoit un simulateur synthétique : chaque unité retire
 * un nombre fixe de mg/dL au pic et au point bas. Le brief annonçait « −100
 * sur max et min » pour tous les cas, mais ses deux premiers cas sont
 * impossibles avec −100 sur le min (120 − 100 = 20 < 80) : on garde −100
 * sur le pic et −20 sur le point bas pour eux, et −100 / −100 pour le cas
 * compromis (dont `nextUp.min === -5` impose −100 sur le min).
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  findBedtimeDose,
  summarizeCurve,
  NIGHT_CEILING,
  NIGHT_FLOOR,
  CEILING_FROM_MIN,
  DOSE_SEARCH_LIMIT_U,
  type CurveSummary,
} from "./bedtime-dose";

const NOW = new Date("2026-10-27T22:30:00").getTime();

function synth(baseMax: number, baseMin: number, maxPerU = 100, minPerU = 100) {
  const calls: number[] = [];
  const simulate = (u: number): CurveSummary => {
    calls.push(u);
    return {
      max: baseMax - u * maxPerU,
      maxAtMs: NOW + 180 * 60_000,
      min: baseMin - u * minPerU,
      minAtMs: NOW + 300 * 60_000,
    };
  };
  return { simulate, calls };
}

test("constantes de nuit", () => {
  assert.equal(NIGHT_CEILING, 130);
  assert.equal(NIGHT_FLOOR, 80);
  assert.equal(CEILING_FROM_MIN, 120);
  assert.equal(DOSE_SEARCH_LIMIT_U, 10);
});

test("dose : pic 230 / bas 120 → 1 U tient sous 130 sans passer sous 80", () => {
  const r = findBedtimeDose(synth(230, 120, 100, 20).simulate);
  assert.equal(r.kind, "fits");
  if (r.kind !== "fits") return;
  assert.equal(r.units, 1);
  assert.equal(r.withDose.max, 130);
  assert.equal(r.withDose.min, 100);
  assert.equal(r.base.max, 230);
});

test("dose : pic 250 / bas 180 → 2 U", () => {
  const r = findBedtimeDose(synth(250, 180, 100, 20).simulate);
  assert.equal(r.kind, "fits");
  if (r.kind !== "fits") return;
  assert.equal(r.units, 2);
});

test("dose : pic 170 / bas 95 → compromis 0 U (0 U dépasse 130, 1 U passe sous 80)", () => {
  const r = findBedtimeDose(synth(170, 95).simulate);
  assert.equal(r.kind, "compromise");
  if (r.kind !== "compromise") return;
  assert.equal(r.units, 0);
  assert.equal(r.nextUp.min, -5);
  assert.equal(r.withDose.max, 170);
});

test("dose : pic 125 → rien à faire", () => {
  const r = findBedtimeDose(synth(125, 100).simulate);
  assert.equal(r.kind, "none");
  assert.equal(r.base.max, 125);
});

test("dose : unités entières uniquement", () => {
  const { simulate, calls } = synth(400, 390, 37, 3);
  const r = findBedtimeDose(simulate);
  for (const u of calls) assert.ok(Number.isInteger(u), `simulate(${u}) non entier`);
  if (r.kind !== "none") assert.ok(Number.isInteger(r.units));
});

test("dose : jamais au-delà de 10 U", () => {
  // Pic énorme qui ne descend presque pas : le plancher n'est jamais atteint.
  const r = findBedtimeDose(synth(900, 300, 5, 1).simulate);
  assert.notEqual(r.kind, "none");
  if (r.kind === "none") return;
  assert.ok(r.units <= DOSE_SEARCH_LIMIT_U, `units ${r.units} > 10`);
  assert.equal(r.kind, "compromise");
});

test("summarizeCurve : le pic ne compte qu'à partir de T+2h, le point bas dès T+15", () => {
  const curve = [
    { minute: 0, at: NOW, value: 250 },
    { minute: 15, at: NOW + 15 * 60_000, value: 200 },
    { minute: 30, at: NOW + 30 * 60_000, value: 75 },
    { minute: 120, at: NOW + 120 * 60_000, value: 140 },
    { minute: 240, at: NOW + 240 * 60_000, value: 150 },
  ];
  const s = summarizeCurve(curve, NOW);
  assert.equal(s.max, 150);
  assert.equal(s.maxAtMs, NOW + 240 * 60_000);
  assert.equal(s.min, 75);
  assert.equal(s.minAtMs, NOW + 30 * 60_000);

  const s2 = summarizeCurve(
    [
      { minute: 0, at: NOW, value: 100 },
      { minute: 15, at: NOW + 15 * 60_000, value: 200 },
      { minute: 120, at: NOW + 120 * 60_000, value: 110 },
    ],
    NOW,
  );
  assert.equal(s2.max, 110, "un point à 200 à la minute 15 ne compte pas dans max");
});
