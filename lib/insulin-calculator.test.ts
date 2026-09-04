/**
 * Tests inferMealTimeFromClock — repas auto-déduit de l'heure locale
 * (juillet 2026). Fenêtres calées sur le rythme réel d'Ethan.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  inferMealTimeFromClock,
  getInjectionTimingAdvice,
  calculateBolus,
  getInsulinOnBoard,
} from "./insulin-calculator";
import { activeIOB } from "./glucose-prediction";

/** Date locale au jour arbitraire, heure/minute contrôlées. */
function at(hours: number, minutes = 0): Date {
  return new Date(2026, 6, 9, hours, minutes);
}

test("matin : 04h00-10h59", () => {
  assert.equal(inferMealTimeFromClock(at(4, 0)), "morning");
  assert.equal(inferMealTimeFromClock(at(7, 30)), "morning");
  assert.equal(inferMealTimeFromClock(at(10, 59)), "morning");
});

test("midi : 11h00-14h59", () => {
  assert.equal(inferMealTimeFromClock(at(11, 0)), "lunch");
  assert.equal(inferMealTimeFromClock(at(12, 45)), "lunch");
  assert.equal(inferMealTimeFromClock(at(14, 59)), "lunch");
});

test("goûter : 15h00-18h29 (goûter réel ~17h30)", () => {
  assert.equal(inferMealTimeFromClock(at(15, 0)), "snack");
  assert.equal(inferMealTimeFromClock(at(17, 30)), "snack");
  assert.equal(inferMealTimeFromClock(at(18, 29)), "snack");
});

test("soir : 18h30-23h59 (dîner réel ~19h)", () => {
  assert.equal(inferMealTimeFromClock(at(18, 30)), "dinner");
  assert.equal(inferMealTimeFromClock(at(19, 0)), "dinner");
  assert.equal(inferMealTimeFromClock(at(23, 59)), "dinner");
});

test("nuit 00h00-03h59 : traité comme soir (repas nocturne = comportement dîner)", () => {
  assert.equal(inferMealTimeFromClock(at(0, 0)), "dinner");
  assert.equal(inferMealTimeFromClock(at(2, 15)), "dinner");
  assert.equal(inferMealTimeFromClock(at(3, 59)), "dinner");
});

/**
 * Timing d'injection — pré-bolus gradué calé sur la PK Novorapid (onset
 * 10-20 min). Le point clé : près de la cible, plus de "15 min avant" fixe
 * (qui causait des petites hypos précoces à Ethan) → au moment du repas.
 */
const timing = (g: number, carbs = 60, meal = "lunch" as const, trend?: number) =>
  getInjectionTimingAdvice(g, carbs, meal, trend);

test("proche de la cible (100 mg/dL, stable) → au repas, 0 min (fix hypo Ethan)", () => {
  const t = timing(100, 60, "lunch", 3);
  assert.equal(t?.leadMinutes, 0);
  assert.equal(t?.tone, "with-meal");
});

test("délai gradué selon la glycémie (stable)", () => {
  assert.equal(timing(125)?.leadMinutes, 10); // 110-139
  assert.equal(timing(160)?.leadMinutes, 15); // 140-179
  assert.equal(timing(200)?.leadMinutes, 20); // 180-249 → early
  assert.equal(timing(200)?.tone, "early");
  assert.equal(timing(260)?.leadMinutes, 25); // ≥250
});

test("glycémie basse (<80) ou chute rapide ↓↓ → au repas/après, jamais anticiper", () => {
  assert.equal(timing(75)?.leadMinutes, -1);
  assert.equal(timing(75)?.tone, "delay");
  assert.equal(timing(150, 60, "lunch", 1)?.leadMinutes, -1); // ↓↓
});

test("tendance Libre : ↘ raccourcit, ↗/↑↑ rallongent", () => {
  assert.equal(timing(160, 60, "lunch", 2)?.leadMinutes, 5); // 15 - 10
  assert.equal(timing(125, 60, "lunch", 5)?.leadMinutes, 20); // 10 + 10 → early
  assert.equal(timing(125, 60, "lunch", 5)?.tone, "early");
});

test("snack rapide (<20g) → jamais de long pré-bolus (cap 5 min)", () => {
  assert.equal(getInjectionTimingAdvice(160, 15, "snack")?.leadMinutes, 5);
});

test("pas de conseil : sans glucides, mealTime 'other', ou pré-workout", () => {
  assert.equal(getInjectionTimingAdvice(130, 0, "lunch"), null);
  assert.equal(getInjectionTimingAdvice(130, 60, "other"), null);
  assert.equal(getInjectionTimingAdvice(130, 60, "lunch", 3, true), null);
});

// ─── IOB résiduel et part correction (I9) ─────────────────────────────
//
// La spec « glucides actifs » a fait basculer l'IOB affiché du modèle
// LINÉAIRE au modèle BI-EXPONENTIEL, en affirmant que c'était « purement
// un changement d'affichage ». C'est faux : ce même scalaire est passé à
// `calculateBolus`, où il est soustrait de la part correction. Le
// bi-exponentiel décroît plus vite après ~2 h, donc il masque MOINS de
// correction, donc la dose proposée AUGMENTE.
//
// Ces tests ne jugent pas le modèle (le bi-exponentiel est le bon choix,
// physiologiquement plus juste) : ils figent le comportement actuel pour
// qu'un futur changement d'IOB ne déplace plus les doses en silence.

test("IOB : les deux modèles divergent nettement à 2h30 d'un bolus de 6 U", () => {
  const inj = [{ units: 6, minutesAgo: 150 }];
  const linear = getInsulinOnBoard(inj).totalIOB;
  const biExp = activeIOB(inj);
  assert.equal(linear, 1.4, "modèle linéaire (1 − t/DIA)");
  assert.ok(
    Math.abs(biExp - 0.56) < 0.01,
    `modèle bi-exponentiel attendu ~0,56 U, reçu ${biExp}`,
  );
});

test("IOB : la part correction dépend directement du modèle d'IOB", () => {
  // Glycémie 250, cible 110, ISF 100 → correction brute 1,4 U.
  const call = (iob: number) =>
    calculateBolus(0, "lunch", 250, false, null, 0, undefined, iob);

  assert.equal(call(0).correctionBolus, 1.4, "correction brute sans IOB");

  // Modèle linéaire (1,4 U d'IOB) : la correction est entièrement absorbée.
  assert.equal(call(1.4).correctionBolus, 0);

  // Modèle bi-exponentiel (0,6 U d'IOB) : il reste 0,8 U de correction —
  // soit ~80 mg/dL d'effet à ISF 100 de plus qu'avec l'ancien modèle.
  assert.ok(
    Math.abs(call(0.6).correctionBolus - 0.8) < 0.001,
    `correction attendue 0,8 U, reçue ${call(0.6).correctionBolus}`,
  );
});

test("IOB : jamais soustrait du bolus repas (T1D-safe)", () => {
  // Garde-fou historique : l'IOB ne réduit QUE la correction. Réduire le
  // bolus repas sous-doserait la nourriture qui arrive.
  const withoutIob = calculateBolus(60, "lunch", 110, false, null, 0, undefined, 0);
  const withIob = calculateBolus(60, "lunch", 110, false, null, 0, undefined, 3);
  assert.equal(withIob.carbBolus, withoutIob.carbBolus);
  assert.ok(withIob.carbBolus > 0);
});

// ─── Arrondi du bolus total : au plus proche, plus jamais systématiquement
// au-dessus (sept 2026) ────────────────────────────────────────────────
//
// Retour terrain : l'ancien `Math.ceil` ajoutait jusqu'à +0.9U d'insuline à
// CHAQUE repas, toujours dans le sens qui fait descendre la glycémie — chez
// un patient qui fait des hypos fréquentes (parfois sévères), à ISF 100
// mg/dL/U ça représente jusqu'à 90 mg/dL d'insuline en trop. Ratio midi par
// défaut = 10g/U, donc `carbsGrams / 10` donne directement le rawTotal
// voulu (pas de correction, pas de FPU, pas de trend → pas de bruit).
//
// Discriminance vérifiée manuellement : en repassant temporairement
// `const totalBolus = Math.round(rawTotal)` à `Math.ceil(rawTotal)` dans
// lib/insulin-calculator.ts, les tests "5,2U → 5U" et "message de
// raisonnement" échouent bien (5.2 → 6 au lieu de 5 ; le message dit
// "au-dessus" au lieu de "en dessous") — restauré ensuite à `Math.round`.

test("arrondi au plus proche : 5,2U calculés → 5U injectés (pas 6, ancien Math.ceil)", () => {
  // 52g / (10g/U) = 5.2U de bolus glucides, rien d'autre.
  const result = calculateBolus(52, "lunch", 110, false, null, 0, undefined, 0);
  assert.equal(result.carbBolus, 5.2);
  assert.equal(result.totalBolus, 5);
});

test("arrondi au plus proche : 5,7U calculés → 6U injectés", () => {
  // 57g / (10g/U) = 5.7U.
  const result = calculateBolus(57, "lunch", 110, false, null, 0, undefined, 0);
  assert.equal(result.carbBolus, 5.7);
  assert.equal(result.totalBolus, 6);
});

test("arrondi au plus proche : 6,0U calculés exactement → 6U (pas de sur-arrondi)", () => {
  // 60g / (10g/U) = 6.0U pile — aucun arrondi ne devrait être nécessaire.
  const result = calculateBolus(60, "lunch", 110, false, null, 0, undefined, 0);
  assert.equal(result.carbBolus, 6);
  assert.equal(result.totalBolus, 6);
  // Pas de message "Arrondi ..." dans le raisonnement quand rawTotal est déjà entier.
  assert.ok(!result.reasoning.some((r) => r.startsWith("Arrondi")));
});

test("le total ne peut jamais être négatif (clamp Math.max(0, ...) avant arrondi)", () => {
  // Petit bolus glucides (0.5U) + forte correction négative de tendance
  // (trend ↓↓ = -1U) : la somme brute serait -0.5U avant clamp.
  const result = calculateBolus(5, "lunch", 110, false, null, 0, undefined, 0, 0, 0, 1);
  assert.ok(result.totalBolus >= 0, `totalBolus ne doit jamais être négatif, reçu ${result.totalBolus}`);
  assert.equal(result.totalBolus, 0);
});

test("le message de raisonnement reflète le sens réel de l'arrondi (au-dessus/en dessous)", () => {
  const up = calculateBolus(57, "lunch", 110, false, null, 0, undefined, 0); // 5.7 → 6
  assert.ok(
    up.reasoning.some((r) => r.includes("Arrondi au-dessus") && r.includes("5,7U") && r.includes("6U")),
    `raisonnement attendu "Arrondi au-dessus", reçu ${JSON.stringify(up.reasoning)}`
  );

  const down = calculateBolus(52, "lunch", 110, false, null, 0, undefined, 0); // 5.2 → 5
  assert.ok(
    down.reasoning.some((r) => r.includes("Arrondi en dessous") && r.includes("5,2U") && r.includes("5U")),
    `raisonnement attendu "Arrondi en dessous", reçu ${JSON.stringify(down.reasoning)}`
  );
});

// ─────────────────────────────────────────────────────────────────────
// Règle hypo simple — sept 2026, décision utilisateur : « sous 75 mg/dL,
// moins une unité ». Indépendante de capDoseByPrediction (lib/dose-
// capping.ts) : elle ne lit qu'un chiffre de glycémie, jamais une
// simulation, donc elle fonctionne même sans capteur (glycémie saisie à
// la main). Ratio midi par défaut = 10g/U → 60g = 6U avant la règle.
// ─────────────────────────────────────────────────────────────────────

test("règle hypo simple : 60g à 74 mg/dL → 5U (au lieu de 6)", () => {
  const result = calculateBolus(60, "lunch", 74, false, null, 0, undefined, 0);
  assert.equal(result.carbBolus, 6, "bolus glucides brut inchangé avant la règle");
  assert.equal(result.totalBolus, 5, `attendu 5U, reçu ${result.totalBolus}`);
  assert.ok(
    result.reasoning.some((r) => r.includes("Glycémie basse") && r.includes("74") && r.includes("−1 U de sécurité")),
    `raisonnement attendu sur la réduction, reçu ${JSON.stringify(result.reasoning)}`
  );
  assert.ok(
    result.adjustments.some((a) => a.includes("sécurité")),
    `adjustments attendu sur la réduction, reçu ${JSON.stringify(result.adjustments)}`
  );
});

test("règle hypo simple : 60g à 76 mg/dL → 6U (inchangé, au-dessus du seuil)", () => {
  const result = calculateBolus(60, "lunch", 76, false, null, 0, undefined, 0);
  assert.equal(result.totalBolus, 6, `attendu 6U (pas de réduction), reçu ${result.totalBolus}`);
  assert.ok(
    !result.reasoning.some((r) => r.includes("de sécurité")),
    `aucun message de réduction attendu, reçu ${JSON.stringify(result.reasoning)}`
  );
});

test("règle hypo simple : borne exacte 75 mg/dL → pas de réduction (« sous 75 » = strictement inférieur)", () => {
  // Le seuil est une constante nommée à 75 ; « sous » exclut la borne elle-
  // même. À 75 pile, la règle ne doit PAS se déclencher.
  const result = calculateBolus(60, "lunch", 75, false, null, 0, undefined, 0);
  assert.equal(result.totalBolus, 6, `attendu 6U à la borne exacte, reçu ${result.totalBolus}`);
  assert.ok(
    !result.reasoning.some((r) => r.includes("de sécurité")),
    `aucun message de réduction attendu à la borne exacte, reçu ${JSON.stringify(result.reasoning)}`
  );
});

test("règle hypo simple : correction pure (0g) à 68 mg/dL → inchangée, la règle ne s'applique qu'aux repas", () => {
  const result = calculateBolus(0, "lunch", 68, false, null, 0, undefined, 0);
  assert.ok(
    !result.reasoning.some((r) => r.includes("de sécurité")),
    `la règle ne doit pas s'appliquer sans glucides, reçu ${JSON.stringify(result.reasoning)}`
  );
  // L'ancien conseil générique reste affiché pour ce cas (correction pure, glycémie basse).
  assert.ok(
    result.reasoning.some((r) => r.includes("considérer des glucides supplémentaires")),
    `conseil générique attendu pour une correction pure basse, reçu ${JSON.stringify(result.reasoning)}`
  );
  assert.equal(result.totalBolus, 0);
});

test("règle hypo simple : très petit repas dont la dose tomberait sous 0 → clampé à 0, jamais négatif", () => {
  // 5g / (10g/U) = 0.5U de glucides ; -1U de sécurité → -0.5U brut, clampé à 0.
  const result = calculateBolus(5, "lunch", 60, false, null, 0, undefined, 0);
  assert.equal(result.carbBolus, 0.5);
  assert.ok(result.totalBolus >= 0, `totalBolus ne doit jamais être négatif, reçu ${result.totalBolus}`);
  assert.equal(result.totalBolus, 0);
});
