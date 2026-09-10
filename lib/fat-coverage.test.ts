import test from "node:test";
import assert from "node:assert/strict";
import {
  computeFatCoverage,
  fatCoveragePct,
  normalizeCoveragePct,
  DEFAULT_FAT_COVERAGE_TIERS,
  FAT_COVERAGE_ABSOLUTE_CAP_U,
} from "./fat-coverage";
import { calculateBolus } from "./insulin-calculator";
import { DIABETES_CONFIG } from "./constants";
import type { DiabetesConfig } from "@/types";

/** Ratios réels d'Ethan (profil Maintien), en grammes par unité. */
const R = { lunch: 9.09, dinner: 7.69 };

test("LE test central — le midi de sèche ne déclenche plus rien", () => {
  // 60 g glucides, 15 g lipides, 60 g protéines. L'ancien modèle FPU
  // réclamait 2 U parce que les protéines pesaient 240 des 375 kcal.
  // Ethan sautait cette injection sans conséquence, tous les jours.
  const r = computeFatCoverage({ fatGrams: 15, carbBolusUnits: 60 / R.lunch });
  assert.equal(r.units, 0, "15 g de lipides ne justifient aucune 2ᵉ injection");
  assert.equal(r.pctApplied, 0);
});

// ─────────────────────────────────────────────────────────────────────
// Intégration — à travers calculateBolus, le chemin réellement emprunté
// par l'app. La fonction pure ci-dessus ne prouve rien du câblage :
// transmission des lipides, lecture du barème depuis la config, et
// splitDose.now qui doit rester le bolus initial.
// ─────────────────────────────────────────────────────────────────────

const cfg = {
  ...DIABETES_CONFIG,
  ratios: { morning: 10, lunch: 9.0909, snack: 8.333, dinner: 7.6923 },
  insulinRatios: [
    { id: "d", label: "Dîner", mealKey: "dinner", timeStart: "19:00", timeEnd: "21:00", ratio: 7.6923 },
    { id: "l", label: "Déjeuner", mealKey: "lunch", timeStart: "12:00", timeEnd: "14:00", ratio: 9.0909 },
  ],
} as DiabetesConfig;

test("intégration : à lipides égaux, les protéines ne changent RIEN à la dose", () => {
  // LE test de la correction. 30 g contre 90 g de protéines, tout le reste
  // identique : dose initiale ET 2ᵉ injection doivent être inchangées.
  const peu = calculateBolus(100, "dinner", 120, false, null, 0, cfg, 0, 50, 30);
  const beaucoup = calculateBolus(100, "dinner", 120, false, null, 0, cfg, 0, 50, 90);
  assert.equal(beaucoup.totalBolus, peu.totalBolus, "dose initiale inchangée");
  assert.equal(
    beaucoup.splitDose?.later,
    peu.splitDose?.later,
    `2ᵉ injection inchangée (30g prot: ${peu.splitDose?.later}, 90g prot: ${beaucoup.splitDose?.later})`,
  );
});

test("intégration : le midi de sèche ne produit aucune 2ᵉ injection", () => {
  const r = calculateBolus(60, "lunch", 120, false, null, 0, cfg, 0, 15, 60);
  assert.equal(r.splitDose, undefined, "15 g de lipides : rien, quels que soient les 60 g de protéines");
});

test("intégration : le dîner du 9 septembre donne 4 U dans 2 h 30", () => {
  const r = calculateBolus(109, "dinner", 120, false, null, 0, cfg, 0, 63.7, 49.5);
  assert.equal(r.splitDose?.later, 4);
  assert.equal(r.splitDose?.delayMinutes, 150);
  assert.equal(r.splitDose?.now, r.totalBolus, "splitDose.now doit être le bolus initial");
});

test("intégration : le barème personnalisé de la config est bien lu", () => {
  const perso = { ...cfg, fatCoverageTiers: { moderate: 0.05, high: 0.05, veryHigh: 0.05 } } as DiabetesConfig;
  const parDefaut = calculateBolus(109, "dinner", 120, false, null, 0, cfg, 0, 63.7, 49.5);
  const reglé = calculateBolus(109, "dinner", 120, false, null, 0, perso, 0, 63.7, 49.5);
  assert.equal(parDefaut.splitDose?.later, 4);
  assert.equal(reglé.splitDose?.later, 1, "5 % de 14,2 U = 0,71 U → 1 U");
});

test("le dîner du 9 septembre donne les 4 U réellement nécessaires", () => {
  // 109 g glucides, 63,7 g lipides. Ethan a fait 3 U et s'est réveillé à
  // 146 pour une cible de 110 : il fallait ~3,5 U, soit 4 au stylo.
  // L'app en réclamait 5.
  const r = computeFatCoverage({ fatGrams: 63.7, carbBolusUnits: 109 / R.dinner });
  assert.equal(r.units, 4, `attendu 4 U, reçu ${r.units} (brut ${r.rawUnits.toFixed(2)})`);
  assert.equal(r.delayMinutes, 150, "au-delà de 60 g de lipides, 2 h 30");
});

test("la pizza donne 1 U et non 2 — l'arrondi est au plus proche", () => {
  // 80 g glucides, 30 g lipides → 10 % de 10,4 U = 1,04 U.
  // L'ancien Math.ceil aurait donné 2 U, soit le double du besoin.
  const r = computeFatCoverage({ fatGrams: 30, carbBolusUnits: 80 / R.dinner });
  assert.equal(r.units, 1, `attendu 1 U, reçu ${r.units}`);
});

test("le seuil de 30 g est net des deux côtés", () => {
  const dessous = computeFatCoverage({ fatGrams: 29, carbBolusUnits: 14 });
  const dessus = computeFatCoverage({ fatGrams: 30, carbBolusUnits: 14 });
  assert.equal(dessous.units, 0, "29 g : rien");
  assert.ok(dessus.units > 0, "30 g : une injection");
});

test("les trois paliers montent bien avec les lipides", () => {
  const t = DEFAULT_FAT_COVERAGE_TIERS;
  assert.equal(fatCoveragePct(20, t), 0);
  assert.equal(fatCoveragePct(35, t), t.moderate);
  assert.equal(fatCoveragePct(50, t), t.high);
  assert.equal(fatCoveragePct(70, t), t.veryHigh);
  assert.ok(t.moderate < t.high && t.high < t.veryHigh, "le barème doit être croissant");
});

test("une dose brute inférieure à une demi-unité ne déclenche pas de rappel", () => {
  // 30 g de lipides sur un tout petit repas : 10 % de 4 U = 0,4 U.
  const r = computeFatCoverage({ fatGrams: 30, carbBolusUnits: 4 });
  assert.equal(r.units, 0, "0,4 U ne vaut pas une injection");
  assert.equal(r.delayMinutes, 0);
});

test("le plafond absolu de 8 U tient sur un repas extrême", () => {
  const r = computeFatCoverage({ fatGrams: 150, carbBolusUnits: 60 });
  assert.equal(r.units, FAT_COVERAGE_ABSOLUTE_CAP_U);
  assert.equal(r.capped, true);
});

test("les entrées aberrantes ne produisent jamais de dose", () => {
  for (const bad of [NaN, -10, Infinity]) {
    assert.equal(computeFatCoverage({ fatGrams: bad, carbBolusUnits: 14 }).units, 0);
    assert.equal(computeFatCoverage({ fatGrams: 60, carbBolusUnits: bad }).units, 0);
  }
});

test("un palier hors bornes est refusé", () => {
  assert.equal(normalizeCoveragePct(0.25), 0.25);
  assert.equal(normalizeCoveragePct(0), 0);
  assert.equal(normalizeCoveragePct(0.41), null, "au-delà de 40 %, refus");
  assert.equal(normalizeCoveragePct(-0.1), null);
  assert.equal(normalizeCoveragePct(NaN), null);
});

test("un barème personnalisé est bien pris en compte", () => {
  const perso = { moderate: 0.05, high: 0.05, veryHigh: 0.05 };
  const r = computeFatCoverage({ fatGrams: 63.7, carbBolusUnits: 14.2, tiers: perso });
  assert.equal(r.units, 1, "5 % de 14,2 U = 0,71 U → 1 U");
});
