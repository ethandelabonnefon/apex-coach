/**
 * Tests du plafonnement prédictif de la dose.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  capDoseByPrediction,
  PREDICTION_SAFETY_LIMIT,
  CAPPING_GRACE_MIN,
  type DoseCappingContext,
} from "./dose-capping";
import type { InsulinLog } from "@/types";

const NOW = new Date("2026-09-03T12:00:00Z").getTime();
const ISF = 100;
const RATIOS = { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 };

/** Injection passée, `minutesAgo` minutes avant NOW. */
function pastBolus(minutesAgo: number, units: number, carbsGrams = 0): InsulinLog {
  return {
    id: `b-${minutesAgo}`,
    units,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams,
    glucoseBefore: 120,
    notes: "",
    injectedAt: new Date(NOW - minutesAgo * 60_000),
  };
}

function ctx(over: Partial<DoseCappingContext> = {}): DoseCappingContext {
  return {
    currentGlucose: 120,
    insulinLogs: [],
    carbEntries: [],
    pendingMeal: { carbsGrams: 0, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
    isf: ISF,
    ratios: RATIOS,
    nowMs: NOW,
    ...over,
  };
}

test("le cas réel d'Ethan : 56 mg/dL, 100 g, 2,5 U actives → 10 U ramenées à 8 U", () => {
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 8, `attendu 8 U, reçu ${r.units}`);
  assert.equal(r.originalUnits, 10);
  assert.equal(r.capped, true);
  assert.ok(
    r.predictedMinBefore !== null && r.predictedMinBefore < PREDICTION_SAFETY_LIMIT,
    `le minimum avant plafonnement doit être sous la limite, reçu ${r.predictedMinBefore}`,
  );
  assert.ok(
    r.predictedMinAfter !== null && r.predictedMinAfter >= PREDICTION_SAFETY_LIMIT,
    `le minimum après plafonnement doit tenir, reçu ${r.predictedMinAfter}`,
  );
  assert.ok(r.reason && r.reason.length > 0);
});

test("la fenêtre de grâce est nécessaire : on ne tombe pas à 0 U en partant de 56", () => {
  // Sans la fenêtre de grâce, le minimum absolu resterait proche de 56
  // quelle que soit la dose → la boucle descendrait jusqu'à 0.
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.ok(r.units > 0, "la dose ne doit pas être ramenée à zéro");
});

test("trajectoire saine : la dose candidate passe inchangée", () => {
  const r = capDoseByPrediction(6, ctx({
    currentGlucose: 140,
    pendingMeal: { carbsGrams: 60, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 6);
  assert.equal(r.capped, false);
  assert.equal(r.reason, null);
});

test("le plafond ne monte JAMAIS la dose, même si l'app prédit une hyperglycémie", () => {
  // 100 g avec seulement 2 U : trajectoire franchement haute.
  const r = capDoseByPrediction(2, ctx({
    currentGlucose: 180,
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 2, "la dose candidate doit rester intacte");
  assert.equal(r.capped, false);
});

test("la dose retenue est toujours un entier", () => {
  const r = capDoseByPrediction(9, ctx({
    currentGlucose: 60,
    insulinLogs: [pastBolus(60, 3)],
    pendingMeal: { carbsGrams: 80, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(Number.isInteger(r.units), true, `dose non entière : ${r.units}`);
});

test("sans mesure capteur : aucun plafonnement, raison explicite", () => {
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: null,
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 10);
  assert.equal(r.capped, false);
  assert.ok(r.reason && /capteur|mesure/i.test(r.reason), `raison attendue sur l'absence de mesure, reçu : ${r.reason}`);
  assert.equal(r.predictedMinBefore, null);
});

test("dose candidate nulle ou négative : renvoyée telle quelle sans simuler", () => {
  const r = capDoseByPrediction(0, ctx({ currentGlucose: 56 }));
  assert.equal(r.units, 0);
  assert.equal(r.capped, false);
});

test("les glucides de resucrage en cours font monter, donc autorisent une dose plus élevée", () => {
  const base = {
    currentGlucose: 70,
    insulinLogs: [pastBolus(60, 2)],
    pendingMeal: { carbsGrams: 60, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  };
  const sansResucrage = capDoseByPrediction(6, ctx(base));
  const avecResucrage = capDoseByPrediction(6, ctx({
    ...base,
    carbEntries: [{
      id: "r1", label: "Resucrage", carbsGrams: 20, insulinUnits: 0,
      eatenAt: new Date(NOW - 5 * 60_000).toISOString(), hypoEventId: "e1",
    }],
  }));
  assert.ok(
    avecResucrage.units >= sansResucrage.units,
    `le resucrage doit autoriser au moins autant d'insuline (sans: ${sansResucrage.units}, avec: ${avecResucrage.units})`,
  );
});

test("le décalage du minimum est renvoyé en minutes, jamais formaté en heure", () => {
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(typeof r.predictedMinMinute, "number");
  assert.ok((r.predictedMinMinute as number) >= CAPPING_GRACE_MIN);
});

test("les constantes valent bien celles de la spec", () => {
  assert.equal(PREDICTION_SAFETY_LIMIT, 80);
  assert.equal(CAPPING_GRACE_MIN, 60);
});
