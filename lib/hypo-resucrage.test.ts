/**
 * Tests de `buildHypoCarbEntry` — fix production septembre 2026.
 *
 * Bug : un re-sucrage n'écrivait qu'un `HypoEvent`, jamais un `CarbEntry`.
 * `computeCarbsOnBoard` et `buildPredictionEvents` lisent `carbEntries`
 * mais jamais `hypoEvents` : le re-sucrage était invisible pour tout le
 * moteur de prédiction. Ces tests couvrent la fonction pure qui construit
 * désormais le `CarbEntry` associé à chaque re-sucrage.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildHypoCarbEntry } from "./hypo-resucrage";

test("construit un CarbEntry avec les bons grammes, insulinUnits à 0, l'hypoEventId et l'instant de prise", () => {
  const consumedAt = "2026-09-02T22:15:00.000Z";
  const entry = buildHypoCarbEntry({
    hypoEventId: "hypo-abc123",
    carbsGrams: 13,
    consumedAt,
  });

  assert.ok(entry, "un CarbEntry doit être produit pour un resucrage valide");
  assert.equal(entry!.carbsGrams, 13);
  assert.equal(entry!.insulinUnits, 0);
  assert.equal(entry!.hypoEventId, "hypo-abc123");
  assert.equal(entry!.eatenAt, consumedAt);
  assert.equal(entry!.label, "Resucrage");
});

test("accepte un Date pour consumedAt et le convertit en ISO", () => {
  const d = new Date("2026-09-02T22:15:00.000Z");
  const entry = buildHypoCarbEntry({
    hypoEventId: "hypo-xyz",
    carbsGrams: 10,
    consumedAt: d,
  });

  assert.ok(entry);
  assert.equal(entry!.eatenAt, d.toISOString());
});

test("0g ne produit aucun CarbEntry", () => {
  const entry = buildHypoCarbEntry({
    hypoEventId: "hypo-1",
    carbsGrams: 0,
    consumedAt: new Date().toISOString(),
  });
  assert.equal(entry, null);
});

test("une valeur négative ne produit aucun CarbEntry", () => {
  const entry = buildHypoCarbEntry({
    hypoEventId: "hypo-2",
    carbsGrams: -5,
    consumedAt: new Date().toISOString(),
  });
  assert.equal(entry, null);
});

test("NaN ne produit aucun CarbEntry", () => {
  const entry = buildHypoCarbEntry({
    hypoEventId: "hypo-3",
    carbsGrams: NaN,
    consumedAt: new Date().toISOString(),
  });
  assert.equal(entry, null);
});

// ─── Insuline en trop au moment du resucrage (fable-5.2, nov. 2026) ─────

import { suggestCarbsForHypo, type PersonalGRG } from "./hypo-resucrage";

const GRG: PersonalGRG = { value: 4, sampleSize: 8, confidence: "high", isDefault: false };

test("sans insuline en trop, la suggestion ne change pas", () => {
  const plain = suggestCarbsForHypo(62, GRG);
  assert.equal(plain.grams, 12);
  assert.equal(plain.extraForInsulinG, 0);
  const tiny = suggestCarbsForHypo(62, GRG, undefined, { units: 0.3, isf: 100 });
  assert.equal(tiny.grams, 12, "0,3 U : dans le bruit du modèle, ignoré");
});

test("1 U en trop à l'ISF 100 ajoute 25 g au GRG 4", () => {
  const s = suggestCarbsForHypo(62, GRG, undefined, { units: 1, isf: 100 });
  assert.equal(s.extraForInsulinG, 25);
  assert.equal(s.grams, 37);
  assert.match(s.detail, /25 g pour les 1,0 U/);
});

test("le total est plafonné à 45 g même avec beaucoup d'insuline en trop", () => {
  const s = suggestCarbsForHypo(55, GRG, undefined, { units: 4, isf: 100 });
  assert.equal(s.grams, 45);
});

test("ISF invalide → l'excès est ignoré plutôt que de produire un chiffre absurde", () => {
  const s = suggestCarbsForHypo(62, GRG, undefined, { units: 2, isf: 0 });
  assert.equal(s.grams, 12);
});
