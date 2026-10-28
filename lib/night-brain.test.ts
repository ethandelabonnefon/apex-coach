/**
 * Tests de l'étape « couverture » du plan de la nuit.
 *
 * Deux invariants y sont vérifiés :
 *  1. Night Brain PRÉSENTE le statut COB, il ne le recalcule pas. Deux
 *     définitions concurrentes de « excès » faisaient diverger la tuile
 *     (« Couvert ») et le plan de la nuit (« trop d'insuline ») juste après
 *     un split correctement injecté.
 *  2. Un repas incertain rend le plan muet sur la dose (pas d'étape déficit)
 *     mais JAMAIS silencieux sur un risque d'hypo (l'étape excès survit).
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { computeNightPlan, type NightBrainInput } from "./night-brain";
import type { InsulinLog } from "@/types";
import { resolveCobStatus, NIGHT_BALANCE_THRESHOLD_U } from "./carbs-on-board";
import { carbSensitivity } from "./glucose-prediction";
import { computeBedtimeAdvice } from "./bedtime-advisor";
import { summarizeCurve } from "./bedtime-dose";
import { buildObservedCarbsInput, observedCarbsRemaining } from "./observed-carbs";
import { buildPredictionEvents, withMealBolusTail, withObservedCarbs } from "./prediction-inputs";

const EVENING = new Date("2026-09-02T22:30:00").getTime();

function input(over: Partial<NightBrainInput> = {}): NightBrainInput {
  return {
    currentGlucose: 140,
    trendArrow: 3,
    iobUnits: 0,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    targetGlucose: 110,
    hoursUntilWakeup: 7,
    nowMs: EVENING,
    ...over,
  };
}

const coverageStep = (plan: ReturnType<typeof computeNightPlan>) =>
  plan.steps.find((s) => s.kind === "coverage");

test("nuit : excès d'insuline → étape couverture 'garde du sucre à portée'", () => {
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 3,
        balanceU: 2.4,
        status: "excess",
        uncertain: false,
      },
    }),
  );
  const step = coverageStep(plan);
  assert.ok(step, "une étape couverture est attendue");
  assert.equal(step.tone, "info");
  assert.match(step.detail, /sucre/i);
});

test("nuit : repas INCERTAIN avec excès d'insuline → alerte hypo maintenue", () => {
  // Régression : `mealCoverage` était supprimé en bloc dès qu'une source
  // était incertaine, ce qui emportait aussi la branche « trop d'insuline ».
  // Ce test échoue si l'incertitude neutralise à nouveau la branche excès.
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 3,
        balanceU: 2.4,
        status: "excess",
        uncertain: true,
      },
    }),
  );
  const step = coverageStep(plan);
  assert.ok(step, "l'alerte d'excès doit survivre à un repas incertain");
  assert.equal(step.tone, "info");
});

test("nuit : repas INCERTAIN en déficit → aucun conseil de dose à la hausse", () => {
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 70,
        balanceU: -3,
        status: "deficit",
        uncertain: true,
      },
    }),
  );
  assert.equal(coverageStep(plan), undefined);
});

test("nuit : déficit certain → étape couverture d'alerte", () => {
  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 70,
        balanceU: -3,
        status: "deficit",
        uncertain: false,
      },
    }),
  );
  const step = coverageStep(plan);
  assert.ok(step);
  assert.equal(step.tone, "warning");
});

test("nuit : après un split correctement injecté → pas de faux 'trop d'insuline'", () => {
  // Pâtes du soir : 60 g encore à digérer, split de 4 U qui vient d'être
  // injecté → balance +2 U. L'ancien seuillage local (`balanceU >= 1.5`,
  // sans la condition sur les grammes) criait « trop d'insuline » alors que
  // la tuile disait « Couvert ». Faux positif sur le geste que l'app
  // recommande elle-même.
  const status = resolveCobStatus({
    totalRemainingG: 60,
    insulinActiveU: 8,
    balanceU: 2,
    thresholdU: NIGHT_BALANCE_THRESHOLD_U,
  });
  assert.equal(status, "covered");

  const plan = computeNightPlan(
    input({
      mealCoverage: {
        carbsRemainingG: 60,
        balanceU: 2,
        status,
        uncertain: false,
      },
    }),
  );
  assert.equal(coverageStep(plan), undefined);
});

test("nuit : creux transitoire ENTRE deux échantillons → déclenche 'mange maintenant'", () => {
  // Régression maille anti-hypo trop large (re-revue de branche) : l'ancien
  // code calculait minPred sur les 3 échantillons de `advice.predictions`
  // (+2h, +4h, réveil) alors que la courbe sous-jacente (mode unifié,
  // `predictGlucoseCurve`) est calculée à pas de 15 min. Un léger sur-dosage
  // par rapport aux glucides (45g + 25g lip + 20g prot, bolus 5,37U injecté
  // il y a 45min) produit un creux à T+2h15 (135min) qui remonte ensuite —
  // digestion des lipides/protéines encore en cours. Vérifié par calcul
  // direct sur predictGlucoseCurve (mêmes paramètres, même nowMs) :
  //   minute 120 (+2h)  → 90 mg/dL  (pas < 90 → l'ancien code ne déclenche PAS)
  //   minute 135        → 89 mg/dL  (< 90, mais AUCUN échantillon ne tombe ici)
  //   minute 240 (+4h)  → 125 mg/dL
  //   minute 420 (réveil) → 155 mg/dL
  // L'ancien minPred (3 échantillons) = min(90, 125, 155) = 90 → pas < 90 →
  // aucune étape "mange maintenant". Le vrai minimum de la courbe est 89 → la
  // correction doit faire apparaître l'étape avec le fix, et ce test échoue
  // sans lui (vérifié en retirant temporairement le fix).
  const ISF = 100;
  const plan = computeNightPlan(
    input({
      currentGlucose: 130,
      trendArrow: 3,
      events: [
        {
          minutesAgo: 45,
          units: 5.37,
          carbsGrams: 45,
          fatGrams: 25,
          proteinGrams: 20,
          carbSensitivity: carbSensitivity(ISF, 10),
        },
      ],
    }),
  );
  const eatNow = plan.steps.find((s) => s.kind === "eat-now");
  assert.ok(
    eatNow,
    "un creux à 89 mg/dL entre +2h et +4h doit déclencher une étape 'mange maintenant', même si les échantillons +2h/+4h/réveil sont tous ≥ 90",
  );
});

// ───────────────────────────────────────────────────────────────────────
// Dose du coucher « pic ≤ 130, plancher 80 » (mode events)
// ───────────────────────────────────────────────────────────────────────

const OCT27 = new Date("2026-10-27T22:30:00").getTime();

/** Soir du 27/10 : 9 U pour 140 g il y a 2h30, ~57 g lus encore à digérer. */
function oct27(over: Partial<NightBrainInput> = {}): NightBrainInput {
  return input({
    currentGlucose: 94,
    trendArrow: 3,
    nowMs: OCT27,
    glucoseAgeMin: 5,
    events: [
      {
        minutesAgo: 150,
        units: 9,
        carbsGrams: 140,
        carbSensitivity: 10,
        observedRemainingG: 57,
        lateCarbMgPerG: 1.5,
      },
    ],
    observedCarbs: { remainingG: 57, enteredG: 140, uncertain: false },
    ...over,
  });
}

const correctionStep = (plan: ReturnType<typeof computeNightPlan>) =>
  plan.steps.find((s) => s.kind === "correction");

test("nuit 27/10 : glucides restants lus → étape « à digérer », pic sans dose > 130, dose entière ≤ 2 U si proposée", () => {
  const plan = computeNightPlan(oct27());
  const dig = plan.steps.find((s) => s.kind === "digesting");
  assert.ok(dig, "étape « à digérer » attendue");
  assert.match(dig.headline, /~57 g/);
  const peak = Number(/jusqu'à ~(\d+) mg\/dL/.exec(dig.detail)?.[1]);
  assert.ok(peak > 130, `pic sans dose ${peak} attendu > 130`);
  const step = correctionStep(plan);
  if (step?.action) {
    assert.equal(step.action.kind, "log-correction");
    assert.ok(Number.isInteger(step.action.quantity));
    assert.ok(step.action.quantity <= 2, `quantity ${step.action.quantity}`);
  }
});

test("nuit : dose proposée → plus de collation préventive contradictoire", () => {
  // 88 ↘, correction 0,5 U il y a 2h, gros reliquat observé : la courbe sans
  // dose frôle 85 (collation préventive) puis monte haut ; 1 U tient ≥ 80.
  // Glucides lus SANS bolus propre : avec un bolus de repas, sa queue d'IOB
  // compte au plancher (withMealBolusTail) et aucune dose ne tiendrait.
  const at = (glucoseAgeMin: number | undefined) =>
    computeNightPlan(
      oct27({
        currentGlucose: 88,
        trendArrow: 2,
        glucoseAgeMin,
        events: [
          { minutesAgo: 120, units: 0.5 },
          { minutesAgo: 150, carbsGrams: 250, carbSensitivity: 10, observedRemainingG: 120, lateCarbMgPerG: 1.5 },
        ],
        observedCarbs: { remainingG: 120, enteredG: 250, uncertain: false },
      }),
    );
  const noDose = at(undefined); // lecture d'âge inconnu → pas de dose
  assert.ok(noDose.steps.some((s) => s.kind === "eat-now"), "sans dose, la collation préventive est là");
  const withDose = at(5);
  assert.ok(correctionStep(withDose)?.action, "une dose est proposée");
  assert.equal(withDose.steps.find((s) => s.kind === "eat-now"), undefined);
  withDose.steps.forEach((s, i) => assert.equal(s.order, i + 1));
});

test("nuit : 200 au coucher sans rien d'autre → une dose est proposée", () => {
  const plan = computeNightPlan(
    input({ currentGlucose: 200, trendArrow: 3, nowMs: OCT27, glucoseAgeMin: 3, events: [] }),
  );
  const step = correctionStep(plan);
  assert.ok(step?.action, "une dose est attendue");
  assert.ok(step.action.quantity >= 1);
  assert.doesNotMatch(step.headline, /impossible/i);
});

test("nuit : repas incertain → même dose, avec l'avertissement de quantité", () => {
  // Scénario indépendant du 27/10 (qui ne produit pas de dose avec le
  // prédicteur actuel, cf. rapport task 4) : 200 au coucher, repas lu.
  const at200 = (uncertain: boolean) =>
    input({
      currentGlucose: 200,
      trendArrow: 3,
      nowMs: OCT27,
      glucoseAgeMin: 5,
      events: [],
      observedCarbs: { remainingG: 20, enteredG: 140, uncertain },
    });
  const sure = correctionStep(computeNightPlan(at200(false)));
  const unsure = correctionStep(computeNightPlan(at200(true)));
  assert.equal(sure?.warning, undefined);
  assert.ok(sure?.action && unsure?.action);
  assert.equal(unsure.action.quantity, sure.action.quantity);
  assert.equal(
    unsure.warning,
    "Quantité incertaine : cette dose part des 140 g que tu as saisis. Si tu as moins mangé, elle peut te faire descendre.",
  );
});

test("nuit : garde-fous de dose (bas, chute rapide, lecture absente ou vieille)", () => {
  assert.equal(correctionStep(computeNightPlan(oct27({ currentGlucose: 75 }))), undefined, "glycémie 75");
  assert.equal(correctionStep(computeNightPlan(oct27({ trendArrow: 1 }))), undefined, "↓↓");
  assert.equal(
    correctionStep(computeNightPlan(oct27({ glucoseAgeMin: undefined }))),
    undefined,
    "lecture d'âge inconnu",
  );
  assert.equal(correctionStep(computeNightPlan(oct27({ glucoseAgeMin: 20 }))), undefined, "lecture de 20 min");
});

test("nuit : courbe sans dose déjà sous 80 → aucune étape de dose (même pas « impossible »)", () => {
  // 95 mg/dL avec 3 U d'insuline encore active et pas de glucides : la courbe
  // sans rien descend sous 80 → les étapes hypo gèrent, pas d'étape de dose.
  const plan = computeNightPlan(
    input({
      currentGlucose: 95,
      trendArrow: 3,
      nowMs: OCT27,
      glucoseAgeMin: 5,
      events: [{ minutesAgo: 30, units: 3 }],
    }),
  );
  assert.equal(correctionStep(plan), undefined);
  assert.ok(plan.steps.some((s) => s.kind === "eat-now"), "l'étape hypo prend le relais");
});

test("nuit : glucides observés → étape « à digérer », plus d'alerte déficit", () => {
  const plan = computeNightPlan(
    oct27({
      mealCoverage: { carbsRemainingG: 70, balanceU: -3, status: "deficit", uncertain: false },
    }),
  );
  const dig = plan.steps.find((s) => s.kind === "digesting");
  assert.ok(dig);
  assert.equal(dig.headline, "Il reste ~57 g de ton repas à digérer");
  assert.match(dig.detail, /^Ça va monter jusqu'à ~\d+ mg\/dL vers \d\d:\d\d si tu ne fais rien\.$/);
  assert.equal(coverageStep(plan), undefined, "plus d'étape couverture déficit");
});

test("nuit : glucides observés + excès d'insuline → l'alerte excès reste", () => {
  const plan = computeNightPlan(
    oct27({
      mealCoverage: { carbsRemainingG: 3, balanceU: 2.4, status: "excess", uncertain: false },
    }),
  );
  assert.ok(coverageStep(plan), "l'alerte d'excès survit aux glucides observés");
});

test("nuit : dîner il y a 30 min (courbe peu fiable) → aucune dose, on attend", () => {
  const plan = computeNightPlan(
    input({
      currentGlucose: 180,
      trendArrow: 3,
      nowMs: OCT27,
      glucoseAgeMin: 5,
      events: [{ minutesAgo: 30, units: 9, carbsGrams: 100, carbSensitivity: 10 }],
    }),
  );
  assert.equal(correctionStep(plan)?.action, undefined, "pas de dose sur un repas frais");
  assert.ok(plan.steps.some((s) => s.kind === "wait"), "une étape d'attente est attendue");
  assert.equal(plan.steps.find((s) => s.kind === "all-good"), undefined);
});

test("nuit : glucides observés mais 0 U tient déjà → « Va te coucher » reste affiché", () => {
  const plan = computeNightPlan(
    oct27({
      // 90 + 5 g × 1,5 + dawn : pic ≤ 130, bas ≥ 80 → 0 U tient.
      currentGlucose: 90,
      events: [
        { minutesAgo: 150, units: 9, carbsGrams: 140, carbSensitivity: 10, observedRemainingG: 5, lateCarbMgPerG: 1.5 },
      ],
      observedCarbs: { remainingG: 5, enteredG: 140, uncertain: false },
    }),
  );
  // 5 g < 10 g : pas d'étape « à digérer » (rien d'utile à dire).
  assert.equal(plan.steps.find((s) => s.kind === "digesting"), undefined);
  assert.equal(correctionStep(plan), undefined);
  const ok = plan.steps.find((s) => s.kind === "all-good");
  assert.ok(ok, "la ligne de décision est attendue");
  assert.equal(ok.headline, "Va te coucher, rien à ajuster");
});

test("nuit 27/10 : bas sécurité sans dose < 80, pic > 130 → « Pas de correction possible », sans action", () => {
  // Avec la queue d'IOB du bolus de 9 U, la courbe SANS dose descend déjà
  // sous 80 (courbe sécurité) alors que le pic normal dépasse 130 : le plan
  // ne reste pas muet, il dit qu'aucune correction n'est possible.
  const inp = oct27();
  const safeMin = floorMin(inp, 0, true);
  assert.ok(safeMin < 80, `bas sécurité sans dose : ${safeMin}`);
  assert.ok(floorMin(inp, 0, false) >= 80, `bas normal sans dose : ${floorMin(inp, 0, false)}`);
  const normalMax = summarizeCurve(computeBedtimeAdvice(inp).curve!, OCT27).max;
  assert.ok(normalMax > 130, `pic normal ${normalMax}`);
  const plan = computeNightPlan(inp);
  const step = correctionStep(plan);
  assert.ok(step, "la ligne de décision est attendue");
  assert.equal(step.headline, "Pas de correction possible sans risque d'hypo");
  assert.equal(step.action, undefined);
  assert.equal(step.tone, "info");
  const hh = (ms: number) => new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  assert.match(
    step.detail,
    /^Pic prévu ~\d+ vers \d\d:\d\d\. La fin de ton bolus du repas agit encore : une dose maintenant risquerait de te faire passer sous 80 avant que le repas ne remonte\. Recontrôle vers \d\d:\d\d\.$/,
  );
  assert.equal(Number(/^Pic prévu ~(\d+)/.exec(step.detail)?.[1]), Math.round(normalMax));
  assert.ok(step.detail.endsWith(`Recontrôle vers ${hh(OCT27 + 90 * 60_000)}.`), step.detail);
  // Le pire cas n'est pas cité comme une prédiction.
  assert.ok(!step.detail.includes(`~${Math.round(safeMin)}`), step.detail);
  assert.ok(plan.steps.find((s) => s.kind === "digesting"));
  assert.equal(plan.steps.find((s) => s.kind === "wait"), undefined);
});

test("nuit 27/10 : les garde-fous restent muets même si le bas sécurité < 80", () => {
  for (const over of [
    { currentGlucose: 75 },
    { trendArrow: 1 },
    { glucoseAgeMin: undefined },
    { glucoseAgeMin: 20 },
  ] as Partial<NightBrainInput>[]) {
    assert.equal(correctionStep(computeNightPlan(oct27(over))), undefined, JSON.stringify(over));
  }
});

test("nuit : compromis 0 U → « Pas de correction possible », bas cité = courbe sécurité", () => {
  // Dîner 140 g / 2 U, 57 g lus, 94 → : 0 U tient le plancher mais pas le
  // plafond ; 1 U franchit 80 sur la courbe sécurité.
  const inp = oct27({
    events: [
      { minutesAgo: 150, units: 2, carbsGrams: 140, carbSensitivity: 10, observedRemainingG: 57, lateCarbMgPerG: 1.5 },
    ],
  });
  const step = correctionStep(computeNightPlan(inp));
  assert.ok(step);
  assert.equal(step.headline, "Pas de correction possible sans risque d'hypo");
  assert.equal(step.action, undefined);
  assert.match(step.detail, /^Pic prévu ~\d+ vers \d\d:\d\d ; 1U te ferait descendre à ~\d+ vers \d\d:\d\d\.$/);
  const quoted = Number(/descendre à ~(\d+)/.exec(step.detail)?.[1]);
  assert.equal(quoted, Math.round(floorMin(inp, 1, true)));
});

// ───────────────────────────────────────────────────────────────────────
// Étape « à digérer » : seuil 10 g et pic sur toute la courbe future
// ───────────────────────────────────────────────────────────────────────

test("nuit : étape « à digérer » seulement à partir de 10 g observés", () => {
  const at = (remainingG: number) =>
    computeNightPlan(
      oct27({
        events: [
          { minutesAgo: 150, units: 9, carbsGrams: 140, carbSensitivity: 10, observedRemainingG: remainingG, lateCarbMgPerG: 1.5 },
        ],
        observedCarbs: { remainingG, enteredG: 140, uncertain: false },
      }),
    ).steps.find((s) => s.kind === "digesting");
  assert.equal(at(9.9), undefined);
  assert.ok(at(10));
});

test("nuit : le pic de l'étape « à digérer » = max de toute la courbe future (avant T+2h compris)", () => {
  // ↑↑ au coucher + correction tout juste faite : le pic arrive dans la
  // première heure, puis l'insuline fait redescendre.
  const inp = oct27({
    currentGlucose: 150,
    trendArrow: 5,
    events: [
      { minutesAgo: 150, units: 6, carbsGrams: 60, carbSensitivity: 10, observedRemainingG: 12, lateCarbMgPerG: 1.5 },
      { minutesAgo: 0, units: 1 },
    ],
    observedCarbs: { remainingG: 12, enteredG: 60, uncertain: false },
  });
  const curve = computeBedtimeAdvice(inp).curve!;
  const fullMax = Math.max(...curve.filter((p) => p.minute > 0).map((p) => p.value));
  const lateMax = summarizeCurve(curve, OCT27).max;
  assert.ok(fullMax > lateMax, `scénario : pic précoce ${fullMax} > pic dès T+2h ${lateMax}`);
  const dig = computeNightPlan(inp).steps.find((s) => s.kind === "digesting");
  assert.ok(dig);
  const quoted = Number(/jusqu'à ~(\d+) mg\/dL/.exec(dig.detail)?.[1]);
  assert.equal(quoted, Math.round(fullMax));
});

// ───────────────────────────────────────────────────────────────────────
// Régression : pas de dose sur un dîner bien dosé entre T+90 et T+150
// ───────────────────────────────────────────────────────────────────────

/** Dîner 60 g / 6 U, glycémie plate (150 par défaut) depuis le repas, lecture 3 min. */
function wellDosedDinner(minutesAfterMeal: number, fatGrams = 0, level = 150) {
  const nowMs = OCT27;
  const mealMs = nowMs - minutesAfterMeal * 60_000;
  const insulinLogs = [
    {
      id: "dinner",
      units: 6,
      insulinType: "Novorapid",
      mealType: "dinner",
      carbsGrams: 60,
      fatGrams,
      glucoseBefore: level,
      injectedAt: new Date(mealMs),
    },
  ] as InsulinLog[];
  const history = [] as { value: number; date: string }[];
  for (let t = mealMs - 30 * 60_000; t <= nowMs; t += 15 * 60_000) {
    history.push({ value: level, date: new Date(t).toISOString() });
  }
  const built = buildObservedCarbsInput({
    insulinLogs,
    carbEntries: [],
    history,
    archive: [],
    live: { value: level, date: new Date(nowMs - 3 * 60_000).toISOString() },
    nowMs,
    isf: 100,
    ratios: { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 },
  });
  const obs = built ? observedCarbsRemaining(built.input) : null;
  // Événements construits comme la page (`buildPredictionEvents` + part observée).
  const base = buildPredictionEvents({
    insulinLogs,
    carbEntries: [],
    isf: 100,
    ratios: { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 },
    nowMs,
  });
  const events = obs && built ? withObservedCarbs(base, built.sourceId, obs.remainingG, 1.5) : base;
  const inp = input({
    currentGlucose: level,
    trendArrow: 3,
    nowMs,
    glucoseAgeMin: 3,
    events,
    observedCarbs: obs && built ? { remainingG: obs.remainingG, enteredG: built.enteredG, uncertain: built.uncertain } : undefined,
  });
  const plan = computeNightPlan(inp);
  return { built, obs, plan, inp };
}

test("régression T+90 : dîner bien dosé 60 g / 6 U, plat à 150 → pas de lecture observée, pas de dose", () => {
  const { built, obs, plan } = wellDosedDinner(90);
  assert.equal(built, null, "pas de lecture observée avant T+150");
  assert.equal(obs, null);
  assert.equal(correctionStep(plan)?.action, undefined, "aucune dose proposée");
});

test("régression T+150 : dîner bien dosé 60 g / 6 U, plat à 150 → pas de dose", () => {
  const { built, plan } = wellDosedDinner(150);
  assert.ok(built, "lecture observée attendue à T+150");
  assert.equal(correctionStep(plan)?.action, undefined, "aucune dose proposée");
});

test("régression T+150 : mêmes lipides ou pas (40 g) → même proposition (aucune dose)", () => {
  const lean = wellDosedDinner(150, 0).plan;
  const fatty = wellDosedDinner(150, 40).plan;
  assert.equal(correctionStep(fatty)?.action, undefined);
  assert.deepEqual(correctionStep(fatty)?.action, correctionStep(lean)?.action);
  assert.equal(correctionStep(fatty)?.headline, correctionStep(lean)?.headline);
});

// ───────────────────────────────────────────────────────────────────────
// Plancher 80 : la queue d'IOB du bolus du repas compte pour le point bas
// ───────────────────────────────────────────────────────────────────────

/** Point bas d'une courbe : courbe normale ou « sécurité » (queue de bolus). */
const floorMin = (inp: NightBrainInput, extraU = 0, safety = true) => {
  const base = inp.events ?? [];
  const evs = safety ? withMealBolusTail(base) : base;
  const all = extraU > 0 ? [...evs, { units: extraU, minutesAgo: 0 }] : evs;
  return summarizeCurve(computeBedtimeAdvice({ ...inp, events: all }).curve!, OCT27).min;
};

test("plancher T+150 : dîner bien dosé 60 g / 6 U, plat à 180 → aucune dose dont le bas cité < 80", () => {
  const { built, plan, inp } = wellDosedDinner(150, 0, 180);
  assert.ok(built, "lecture observée attendue à T+150");
  // Scénario : la courbe normale autorise 1 U (bas ≥ 80), la courbe
  // sécurité (queue du bolus de 6 U) la fait passer sous 80.
  assert.ok(floorMin(inp, 1, false) >= 80, `courbe normale avec 1 U : ${floorMin(inp, 1, false)}`);
  assert.ok(floorMin(inp, 1, true) < 80, `courbe sécurité avec 1 U : ${floorMin(inp, 1, true)}`);
  const step = correctionStep(plan);
  assert.equal(step?.action, undefined, "aucune dose proposée");
  // Si une étape cite un point bas, c'est celui de la courbe sécurité.
  const quoted = step ? /descendre à ~(\d+)/.exec(step.detail)?.[1] : undefined;
  if (quoted !== undefined) assert.equal(Number(quoted), Math.round(floorMin(inp, 1, true)));
});

test("plancher : gros reliquat observé + petit bolus → dose entière, bas sécurité ≥ 80", () => {
  const inp = oct27({
    currentGlucose: 200,
    trendArrow: 3,
    events: [
      { minutesAgo: 150, units: 2, carbsGrams: 140, carbSensitivity: 10, observedRemainingG: 60, lateCarbMgPerG: 1.5 },
    ],
    observedCarbs: { remainingG: 60, enteredG: 140, uncertain: false },
  });
  const step = correctionStep(computeNightPlan(inp));
  assert.ok(step?.action, "une dose est attendue");
  const u = step.action!.quantity;
  assert.ok(Number.isInteger(u) && u >= 1, `dose entière : ${u}`);
  const safeMin = floorMin(inp, u, true);
  assert.ok(safeMin >= 80, `bas sécurité avec ${u} U : ${safeMin}`);
  const quoted = /point bas ~(\d+)/.exec(step.detail)?.[1];
  if (quoted !== undefined) assert.equal(Number(quoted), Math.round(safeMin));
});
