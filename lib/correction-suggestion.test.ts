import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHyperCorrection } from "./correction-suggestion";

const base = { target: 110, thresholdHigh: 180, isf: 100, iobUnits: 0 };

test("en dessous du seuil → aucune suggestion", () => {
  assert.equal(computeHyperCorrection({ ...base, glucose: 180 }), null);
  assert.equal(computeHyperCorrection({ ...base, glucose: 120 }), null);
});

test("211 mg/dL → 1 U, et plus 2 U (l'ancien arrondi au-dessus atterrissait à 11)", () => {
  const r = computeHyperCorrection({ ...base, glucose: 211 });
  assert.equal(r?.kind, "dose");
  if (r?.kind !== "dose") return;
  assert.equal(r.units, 1);
  assert.equal(r.landing, 111);
});

test("181 mg/dL → dose trop faible, plus 1 U (qui atterrissait à 81)", () => {
  assert.equal(computeHyperCorrection({ ...base, glucose: 181 })?.kind, "too-small");
  assert.equal(computeHyperCorrection({ ...base, glucose: 209 })?.kind, "too-small");
});

test("la dose proposée n'atterrit jamais sous la cible", () => {
  for (let g = 181; g <= 400; g += 1) {
    const r = computeHyperCorrection({ ...base, glucose: g });
    if (r?.kind === "dose") assert.ok(r.landing >= base.target, `à ${g} → ${r.landing}`);
  }
});

test("310 mg/dL → 2 U", () => {
  const r = computeHyperCorrection({ ...base, glucose: 310 });
  assert.equal(r?.kind === "dose" ? r.units : null, 2);
});

test("insuline active au-dessus de 0,5 U → on attend", () => {
  const r = computeHyperCorrection({ ...base, glucose: 260, iobUnits: 1.2 });
  assert.equal(r?.kind, "wait-iob");
});

test("insuline active faible → soustraite de la correction", () => {
  // 260 → 1,5 U théoriques, moins 0,5 U actives = 1,0 → 1 U.
  const r = computeHyperCorrection({ ...base, glucose: 260, iobUnits: 0.5 });
  assert.equal(r?.kind === "dose" ? r.units : null, 1);
  // 250 → 1,4 − 0,5 = 0,9 → trop faible.
  assert.equal(computeHyperCorrection({ ...base, glucose: 250, iobUnits: 0.5 })?.kind, "too-small");
});

test("glycémie déjà en descente → pas de correction", () => {
  assert.equal(computeHyperCorrection({ ...base, glucose: 260, trendArrow: 2 })?.kind, "falling");
  assert.equal(computeHyperCorrection({ ...base, glucose: 260, trendArrow: 1 })?.kind, "falling");
  assert.equal(computeHyperCorrection({ ...base, glucose: 260, trendArrow: 4 })?.kind, "dose");
});

test("après le sport, la correction est réduite", () => {
  // 320 → 2,1 U ; −40 % → 1,26 → 1 U.
  const r = computeHyperCorrection({ ...base, glucose: 320, exerciseReductionPct: 40 });
  assert.equal(r?.kind === "dose" ? r.units : null, 1);
});

test("ISF invalide → aucune suggestion plutôt qu'une division par zéro", () => {
  assert.equal(computeHyperCorrection({ ...base, glucose: 260, isf: 0 }), null);
});
