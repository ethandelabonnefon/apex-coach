/**
 * Tests du moteur « glucides actifs » (COB).
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCarbs,
  isLearnable,
  fpuRemainingFraction,
  computeCarbsOnBoard,
} from "./carbs-on-board";
import type { InsulinLog } from "@/types";

const ISF = 100;
const RATIOS = { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 };

/** InsulinLog minimal, injecté il y a `minutesAgo` minutes. */
function log(minutesAgo: number, over: Partial<InsulinLog> = {}): InsulinLog {
  return {
    id: over.id ?? `log-${minutesAgo}`,
    units: 0,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams: 0,
    glucoseBefore: 120,
    notes: "",
    injectedAt: new Date(Date.now() - minutesAgo * 60_000),
    ...over,
  };
}

test("resolveCarbs : le confirmé prime, sinon fallback sur l'estimation", () => {
  assert.equal(resolveCarbs(log(0, { carbsGrams: 100 })), 100);
  assert.equal(
    resolveCarbs(log(0, { carbsGrams: 100, carbsConfirmedGrams: 140 })),
    140,
  );
  // 0 g confirmé est une valeur légitime, pas un "absent"
  assert.equal(
    resolveCarbs(log(0, { carbsGrams: 100, carbsConfirmedGrams: 0 })),
    0,
  );
});

test("isLearnable : faux si incertain, vrai sinon", () => {
  assert.equal(isLearnable(log(0, { carbsGrams: 60 })), true);
  assert.equal(
    isLearnable(log(0, { carbsGrams: 60, carbsUncertain: true })),
    false,
  );
});

test("fpuRemainingFraction : décroissance linéaire sur 5h", () => {
  assert.equal(fpuRemainingFraction(0), 1);
  assert.equal(fpuRemainingFraction(150), 0.5);
  assert.equal(fpuRemainingFraction(300), 0);
  assert.equal(fpuRemainingFraction(400), 0);
});

test("repas bien dosé à T+30 : couvert, balance proche de 0", () => {
  // 60 g au ratio midi 10 g/U → 6 U. Rien d'autre en cours.
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(30, { carbsGrams: 60, units: 6 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "covered");
  assert.ok(
    Math.abs(cob.balanceU) < 1,
    `balance attendue < 1 U, reçue ${cob.balanceU}`,
  );
  assert.ok(cob.carbsRemainingG > 0, "des glucides restent à absorber à T+30");
});

test("sous-dosage : bolus pour 100 g, 140 g confirmés → déficit ~4 U", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(20, { carbsGrams: 100, carbsConfirmedGrams: 140, units: 10 }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "deficit");
  // 40 g non couverts au ratio 10 → ~4 U manquantes, atténué par la part
  // déjà absorbée à T+20. On vérifie l'ordre de grandeur et le signe.
  assert.ok(
    cob.balanceU <= -2 && cob.balanceU >= -4.5,
    `déficit attendu entre -2 et -4,5 U, reçu ${cob.balanceU}`,
  );
});

test("épuisement : à T+5h, plus rien d'actif → idle", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(300, { carbsGrams: 60, units: 6 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "idle");
  assert.ok(cob.totalRemainingG < 5);
});

test("ratios distincts : matin et soir ne se moyennent pas", () => {
  // 30 g le matin (6,7 g/U → 4,5 U) + 30 g le soir (10 g/U → 3 U)
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(10, { id: "m", carbsGrams: 30, units: 0, mealType: "morning" }),
      log(10, { id: "s", carbsGrams: 30, units: 0, mealType: "dinner" }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  // Sans insuline : besoin = 30/6,7 + 30/10 pondéré par la part restante.
  // La moyenne naïve (60 g / 8,35) donnerait un chiffre plus bas.
  const naive = (cob.carbsRemainingG + cob.fpuRemainingG) / 8.35;
  assert.ok(
    cob.insulinNeededU > naive,
    `besoin par source (${cob.insulinNeededU}) doit dépasser la moyenne naïve (${naive})`,
  );
});

test("FPU non couverts à T+3h → déficit détecté", () => {
  // Pizza : 80 g glucides bien bolussés, mais 40 g lip + 30 g prot non couverts.
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(180, {
        carbsGrams: 80,
        fatGrams: 40,
        proteinGrams: 30,
        units: 8,
        mealType: "dinner",
      }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.ok(cob.fpuRemainingG > 0, "les FPU sont encore en cours à T+3h");
  assert.equal(cob.status, "deficit");
});

test("glucides sans insuline (CarbEntry) comptés dans le besoin", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [],
    carbEntries: [
      { id: "c1", carbsGrams: 40, eatenAt: new Date(Date.now() - 10 * 60_000).toISOString() },
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.ok(cob.insulinNeededU > 2, "40 g au ratio 10 ≈ 4 U de besoin");
  assert.equal(cob.insulinActiveU, 0);
  assert.equal(cob.status, "deficit");
});

test("repas incertain : compté dans la couverture, mais flag uncertain levé", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(20, { carbsGrams: 80, units: 8, carbsUncertain: true }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.uncertain, true);
  // Les glucides ne sont PAS mis à zéro : sinon on verrait 8 U d'insuline
  // face à 0 g et on conclurait à tort à un excès → fausse alerte hypo.
  assert.ok(cob.carbsRemainingG > 0);
});

test("excès d'insuline : glucides épuisés, IOB encore présent", () => {
  // Bolus de 8 U il y a 60 min pour seulement 20 g de glucides.
  // NB : à T+30 (valeur initialement estimée dans le plan), la courbe
  // bi-exponentielle réutilisée de glucose-prediction.ts (pic à 60 min)
  // n'a encore quasi rien absorbé (~18 g restants sur 20g, au-dessus
  // d'EXCESS_MAX_CARBS_G=15) : le statut reste "covered". À T+60, ~13 g
  // restent (sous le seuil) alors que l'IOB est encore largement actif.
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(60, { carbsGrams: 20, units: 8 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "excess");
  assert.ok(cob.balanceU >= 1);
});

test("aucune donnée → idle, tous les compteurs à zéro", () => {
  const cob = computeCarbsOnBoard({ insulinLogs: [], isf: ISF, ratios: RATIOS });
  assert.equal(cob.status, "idle");
  assert.equal(cob.totalRemainingG, 0);
  assert.equal(cob.insulinNeededU, 0);
  assert.equal(cob.insulinActiveU, 0);
  assert.equal(cob.uncertain, false);
});
