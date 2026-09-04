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
import { TOPUP_MAX_GLUCOSE_AGE_MIN } from "./carbs-on-board";
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

test("une candidate fractionnaire rend une dose entière — cas plafonné", () => {
  // Le contrat de la fonction (pas celui de l'appelant) garantit l'entier :
  // même un appelant qui oublierait d'arrondir en amont ne doit jamais
  // recevoir une dose à demi-unité.
  const r = capDoseByPrediction(10.4, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(Number.isInteger(r.units), true, `dose non entière : ${r.units}`);
  assert.equal(Number.isInteger(r.originalUnits), true, `originalUnits non entier : ${r.originalUnits}`);
  assert.equal(r.capped, true);
});

test("une candidate fractionnaire rend une dose entière — cas non plafonné", () => {
  const r = capDoseByPrediction(6.4, ctx({
    currentGlucose: 140,
    pendingMeal: { carbsGrams: 60, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(Number.isInteger(r.units), true, `dose non entière : ${r.units}`);
  assert.equal(r.units, 6);
  assert.equal(r.capped, false);
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
    avecResucrage.units > sansResucrage.units,
    `le resucrage doit autoriser STRICTEMENT plus d'insuline (sans: ${sansResucrage.units}, avec: ${avecResucrage.units}) — un '>=' laisserait passer un câblage cassé des carbEntries`,
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

// ─────────────────────────────────────────────────────────────────────
// C1 — le plafond doit voir le split FPU programmé par le même clic
// ─────────────────────────────────────────────────────────────────────

test("C1 : un split en attente réduit STRICTEMENT plus la dose que sans lui, mêmes entrées", () => {
  // Cas mesuré par la revue finale : 56 mg/dL, 2,5 U actives, repas
  // 100g/35g lip/45g prot → calculateBolus proposerait 10 U + split
  // {later: 3, delayMinutes: 150}. Sans voir ce split, le plafond validait
  // 9U comme si la trajectoire tenait ; en réalité 9U + le split descend
  // sous 80 bien plus loin dans la courbe. C'est le test qui échouerait si
  // quelqu'un retirait `pendingSplit` du contexte (ou son branchement dans
  // simulateMinAfterGrace) : sans lui, sansSplit.units === avecSplit.units.
  const base = {
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 35, proteinGrams: 45, mealType: "lunch" },
  };
  const sansSplit = capDoseByPrediction(10, ctx(base));
  const avecSplit = capDoseByPrediction(10, ctx({
    ...base,
    pendingSplit: { units: 3, minutesUntil: 150 },
  }));
  assert.ok(
    avecSplit.units < sansSplit.units,
    `le split doit forcer une dose STRICTEMENT plus basse (sans: ${sansSplit.units}, avec: ${avecSplit.units})`,
  );
  assert.equal(sansSplit.units, 9);
  assert.equal(avecSplit.units, 8);
});

test("C1 : sans split en attente, le comportement est inchangé (horizon standard)", () => {
  // Garde-fou explicite du brief : l'extension d'horizon ne doit JAMAIS
  // s'appliquer quand pendingSplit est absent.
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 8, `attendu 8 U (comportement historique), reçu ${r.units}`);
});

test("C1 : l'horizon étendu (split) découvre un creux plus bas que l'horizon standard aurait vu", () => {
  // Preuve directe que l'extension d'horizon change la lecture de sécurité
  // (pas juste un détail cosmétique) : predictedMinBefore doit être
  // strictement inférieur à ce que l'horizon standard aurait rapporté pour
  // la même dose candidate. Comparaison contre le cas équivalent sans
  // split (même dose, mêmes entrées) qui, lui, reste à l'horizon standard.
  const withoutSplit = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 35, proteinGrams: 45, mealType: "lunch" },
  }));
  const withSplit = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 35, proteinGrams: 45, mealType: "lunch" },
    pendingSplit: { units: 3, minutesUntil: 150 },
  }));
  assert.ok(
    (withSplit.predictedMinBefore as number) < (withoutSplit.predictedMinBefore as number),
    `le creux vu avec split (${withSplit.predictedMinBefore}) doit être plus bas que sans (${withoutSplit.predictedMinBefore})`,
  );
});

// ─────────────────────────────────────────────────────────────────────
// I3 — une lecture capteur périmée et HAUTE ne doit pas désactiver le
// plafond en silence : il doit refuser explicitement de plafonner.
// ─────────────────────────────────────────────────────────────────────

test("C1 : l'extension d'horizon (pas juste le branchement pendingSplit) est nécessaire — faux négatif sinon", () => {
  // Cas adversarial mais réaliste : split de 8U (borne haute du calibrage
  // MDI, LATER_DOSE_ABSOLUTE_CAP) à +150min (borne haute des délais), sur
  // une candidate volontairement petite (2U) pour un repas 80g/20/20. À
  // l'horizon standard (300min), le point le plus bas visible tombe à la
  // borne (min 151 mg/dL @300) — AU-DESSUS de la limite, donc rien n'est
  // plafonné. Le vrai creux (78 mg/dL) survient 45min plus tard, quand
  // l'IOB du split finit de se consommer (DIA 195min après SON propre
  // déclenchement) — invisible sans l'extension d'horizon. C'est le test
  // qui échouerait si l'extension de `horizonMinutes` disparaissait alors
  // que `pendingSplit` resterait branché à `predictGlucoseCurve` (donc pas
  // redondant avec le test C1 précédent, qui passerait déjà sans elle).
  const r = capDoseByPrediction(2, ctx({
    currentGlucose: 120,
    insulinLogs: [],
    pendingMeal: { carbsGrams: 80, fatGrams: 20, proteinGrams: 20, mealType: "lunch" },
    pendingSplit: { units: 8, minutesUntil: 150 },
  }));
  assert.equal(r.capped, true, `attendu plafonné (creux réel 78 < 80), reçu ${JSON.stringify(r)}`);
  assert.equal(r.units, 1);
});

test("I3 : lecture périmée (> seuil suggestTopUp) → pas de plafonnement, raison explicite", () => {
  const base = {
    currentGlucose: 180,
    insulinLogs: [pastBolus(30, 6)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  };
  const fresh = capDoseByPrediction(10, ctx({ ...base, glucoseAgeMin: 5 }));
  const stale = capDoseByPrediction(10, ctx({ ...base, glucoseAgeMin: 20 }));
  // Même contexte, seule la fraîcheur change : la fraîche doit plafonner
  // (le risque est réel : 6U actives + 10U de plus), la périmée doit s'en
  // remettre au patient plutôt que d'affirmer une trajectoire saine sur une
  // valeur qui pourrait être obsolète.
  assert.equal(fresh.capped, true, `attendu un plafonnement sur lecture fraîche, reçu ${JSON.stringify(fresh)}`);
  assert.equal(stale.capped, false);
  assert.equal(stale.units, 10, "dose candidate renvoyée telle quelle, pas plafonnée en silence");
  assert.ok(
    stale.reason && /périmé/i.test(stale.reason),
    `raison attendue sur la péremption, reçu : ${stale.reason}`,
  );
});

test("I3 : fraîcheur inconnue (glucoseAgeMin absent) → comportement historique conservé", () => {
  // Ne doit PAS se comporter comme une lecture périmée : les appelants
  // existants (tests ci-dessus, code non encore migré) ne renseignent pas
  // cette valeur et doivent continuer de voir le plafond fonctionner.
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.capped, true);
});

test("le seuil de péremption réutilisé est bien celui de suggestTopUp (15 min), pas un nouveau", () => {
  assert.equal(TOPUP_MAX_GLUCOSE_AGE_MIN, 15);
});

// ─────────────────────────────────────────────────────────────────────
// Mineurs
// ─────────────────────────────────────────────────────────────────────

test("mineur : Math.floor à l'entrée, jamais Math.round — ne monte jamais au-dessus de la candidate", () => {
  // 7,6 U candidate, sans aucun risque hypo (trajectoire saine) : le
  // résultat SANS plafonnement doit rapporter originalUnits = 7 (floor),
  // jamais 8 (round). Un Math.round rendrait une dose > candidate,
  // contredisant l'invariant « ne jamais augmenter ».
  const r = capDoseByPrediction(7.6, ctx({
    currentGlucose: 120,
    insulinLogs: [],
    pendingMeal: { carbsGrams: 70, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.capped, false, `attendu non plafonné pour vérifier le floor isolément, reçu ${JSON.stringify(r)}`);
  assert.equal(r.originalUnits, 7, "Math.floor(7.6) = 7, pas Math.round(7.6) = 8");
  assert.equal(r.units, 7);
});

test("mineur : le plafond ne monte jamais la dose, sur tous les cas de la table (incluant 7,6)", () => {
  const cases: { candidate: number; glucose: number; carbs: number }[] = [
    { candidate: 10, glucose: 56, carbs: 100 },
    { candidate: 6, glucose: 140, carbs: 60 },
    { candidate: 2, glucose: 180, carbs: 100 },
    { candidate: 7.6, glucose: 60, carbs: 80 },
  ];
  for (const c of cases) {
    const r = capDoseByPrediction(c.candidate, ctx({
      currentGlucose: c.glucose,
      pendingMeal: { carbsGrams: c.carbs, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
    }));
    assert.ok(
      r.units <= r.originalUnits,
      `units (${r.units}) ne doit jamais dépasser originalUnits (${r.originalUnits}) — cas ${JSON.stringify(c)}`,
    );
  }
});

test("mineur : candidate NaN → renvoyée à 0, jamais NaN (le clamp défensif doit vraiment clamper)", () => {
  const r = capDoseByPrediction(NaN, ctx({ currentGlucose: 120 }));
  assert.equal(r.units, 0, `attendu 0, reçu ${r.units}`);
  assert.equal(Number.isNaN(r.units), false);
  assert.equal(r.capped, false);
});

test("mineur : candidate négative ET currentGlucose NaN → renvoyée à 0 sans tenter de simuler", () => {
  const r = capDoseByPrediction(-3, ctx({ currentGlucose: NaN }));
  assert.equal(r.units, 0, `attendu 0, reçu ${r.units}`);
  assert.equal(r.capped, false);
});
