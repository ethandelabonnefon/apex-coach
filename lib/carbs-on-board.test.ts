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
  cobVerdict,
  resolveCobStatus,
  suggestTopUp,
  resolveCarbDelta,
  TOPUP_DELTA_WINDOW_MIN,
  filterLearnableNightLogs,
  NIGHT_BALANCE_THRESHOLD_U,
  type CarbDelta,
  type TopUpContext,
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

test("glucides avec bolus (CarbEntry) : l'insuline compte dans l'IOB", () => {
  // Sans ça, les glucides du CarbEntry entrent dans `insulinNeededU` mais
  // ses unités sont ignorées de `insulinActiveU` → déficit fantôme, donc
  // appoint injustifié.
  const cob = computeCarbsOnBoard({
    insulinLogs: [],
    carbEntries: [
      {
        id: "c1",
        carbsGrams: 60,
        insulinUnits: 6,
        eatenAt: new Date(Date.now() - 20 * 60_000).toISOString(),
      },
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.ok(cob.insulinActiveU > 0, "le bolus du CarbEntry doit être vu par activeIOB");
  assert.notEqual(cob.status, "deficit");
  assert.ok(
    Math.abs(cob.balanceU) < 1,
    `60 g au ratio 10 pour 6 U : balance attendue ~0, reçue ${cob.balanceU}`,
  );
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

test("dérive d'horloge : injection ~3 min dans le futur → pas de déficit fantôme", () => {
  // Régression : buildCarbSources clampait minutesAgo à 0 (glucides comptés
  // en entier dans insulinNeededU) alors que le filtre des bolus pour
  // activeIOB rejetait la valeur NON clampée (minutesAgo < 0) → ses unités
  // disparaissaient de insulinActiveU. Résultat : un repas fraîchement loggé
  // avec une horloge client légèrement en avance déclenchait un
  // "deficit" fantôme, qui sur cette app peut suggérer un appoint
  // d'insuline injustifié.
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(-3, { carbsGrams: 60, units: 6 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.ok(cob.insulinActiveU > 0, "le bolus doit être vu par activeIOB malgré le timestamp futur");
  assert.notEqual(cob.status, "deficit");
  // Repas dosé pile au ratio midi (60g / 10 = 6U pour 6U injectées) : les
  // deux moitiés du calcul doivent s'annuler, pas juste "ne pas être en déficit".
  assert.ok(Math.abs(cob.balanceU) < 1, `balance attendue ~0, reçue ${cob.balanceU}`);
});

test("aucune donnée → idle, tous les compteurs à zéro", () => {
  const cob = computeCarbsOnBoard({ insulinLogs: [], isf: ISF, ratios: RATIOS });
  assert.equal(cob.status, "idle");
  assert.equal(cob.totalRemainingG, 0);
  assert.equal(cob.insulinNeededU, 0);
  assert.equal(cob.insulinActiveU, 0);
  assert.equal(cob.uncertain, false);
});

// ─── Verdict affiché par la tuile ─────────────────────────────────────

test("verdict : repas incertain avec insuline en excès → alerte hypo toujours émise", () => {
  // Spec §5 : « un repas incertain rend l'app muette sur la dose et
  // aveugle pour l'apprentissage, mais JAMAIS silencieuse sur un risque
  // d'hypoglycémie ». Ce test échoue si la branche `uncertain` repasse en
  // priorité devant `excess` dans le verdict.
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(60, { carbsGrams: 20, units: 8, carbsUncertain: true })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "excess");
  assert.equal(cob.uncertain, true);

  const v = cobVerdict(cob);
  assert.match(v.text, /excès/i, `alerte d'excès attendue, reçu « ${v.text} »`);
  // L'incertitude reste signalée — comme modificateur, pas comme écran.
  assert.match(v.text, /incertaine/i);
  assert.equal(v.approximate, true);
});

test("verdict : repas incertain en déficit → aucun conseil de dose à la hausse", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(20, { carbsGrams: 100, units: 0, carbsUncertain: true })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "deficit");
  const v = cobVerdict(cob);
  assert.doesNotMatch(v.text, /il manque/i);
  assert.match(v.text, /incertaine/i);
});

test("verdict : déficit certain → nombre d'unités manquantes affiché", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(20, { carbsGrams: 100, units: 0 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "deficit");
  const v = cobVerdict(cob);
  assert.match(v.text, /il manque/i);
  assert.equal(v.tone, "warning");
  assert.equal(v.approximate, false);
});

// ─── Définition unique du statut (seuil paramétrable) ─────────────────

test("statut : le seuil du soir est plus strict, la définition reste la même", () => {
  const base = { totalRemainingG: 3, insulinActiveU: 2 };
  // Balance +1,2 U : excès le jour (seuil 1,0), pas le soir (seuil 1,5).
  assert.equal(resolveCobStatus({ ...base, balanceU: 1.2 }), "excess");
  assert.equal(
    resolveCobStatus({ ...base, balanceU: 1.2, thresholdU: NIGHT_BALANCE_THRESHOLD_U }),
    "covered",
  );
  // La condition sur les grammes vaut aussi pour le seuil du soir : juste
  // après un split correctement injecté, il reste des glucides à digérer,
  // donc ce n'est PAS un excès (faux positif du plan de la nuit).
  assert.equal(
    resolveCobStatus({
      totalRemainingG: 60,
      insulinActiveU: 8,
      balanceU: 2,
      thresholdU: NIGHT_BALANCE_THRESHOLD_U,
    }),
    "covered",
  );
});

/** Écart de glucides synthétique pour tester les garde-fous isolément. */
function deltaWith(over: Partial<CarbDelta> = {}): CarbDelta {
  return {
    injectionId: "inj-1",
    extraCarbsG: 40,
    gramsPerU: 10,
    uncertain: false,
    ...over,
  };
}

/** Contexte nominal : lecture capteur réelle, fraîche, en plage. */
const OK_CTX: TopUpContext = { currentGlucose: 150, glucoseAgeMin: 2 };

test("appoint : delta de 40 g au ratio 10 → 4 U proposées", () => {
  const s = suggestTopUp(deltaWith(), OK_CTX);
  assert.ok(s, "une suggestion est attendue");
  assert.equal(s.units, 4);
  // Traçabilité : l'appoint sait toujours quel repas l'a causé.
  assert.equal(s.injectionId, "inj-1");
});

test("appoint : dose arrondie à l'entier inférieur (stylo sans demi-unités)", () => {
  const s = suggestTopUp(deltaWith({ extraCarbsG: 38 }), OK_CTX);
  assert.equal(s?.units, 3);
});

test("appoint : plafonné à 4 U même sur un gros écart", () => {
  const s = suggestTopUp(deltaWith({ extraCarbsG: 90 }), {
    currentGlucose: 200,
    glucoseAgeMin: 2,
  });
  assert.equal(s?.units, 4);
  assert.equal(s?.capped, true);
});

test("appoint : rien sous le seuil de 1 U", () => {
  assert.equal(suggestTopUp(deltaWith({ extraCarbsG: 9 }), OK_CTX), null);
});

test("appoint : bloqué si glycémie < 90", () => {
  assert.equal(
    suggestTopUp(deltaWith(), { currentGlucose: 85, glucoseAgeMin: 2 }),
    null,
  );
});

test("appoint : bloqué si trend en chute rapide", () => {
  assert.equal(
    suggestTopUp(deltaWith(), { ...OK_CTX, trendArrow: 1 }),
    null,
  );
});

test("appoint : bloqué si le repas est marqué incertain", () => {
  assert.equal(suggestTopUp(deltaWith({ uncertain: true }), OK_CTX), null);
});

test("appoint : aucun delta (pas d'injection confirmée) → null", () => {
  assert.equal(suggestTopUp(null, OK_CTX), null);
});

test("appoint : delta nul ou négatif (confirmé ≤ estimé) → null", () => {
  assert.equal(suggestTopUp(deltaWith({ extraCarbsG: 0 }), OK_CTX), null);
  assert.equal(suggestTopUp(deltaWith({ extraCarbsG: -40 }), OK_CTX), null);
});

test("appoint : entrées non finies → null (pas de dose sortie de NaN)", () => {
  // Un ratio à 0 donne extraCarbsG/0 = Infinity, un delta NaN donne NaN :
  // les deux traversent tous les seuils (comparer avec NaN est toujours
  // faux) et produiraient une dose plafonnée à 4 U sans aucun fondement.
  assert.equal(suggestTopUp(deltaWith({ gramsPerU: 0 }), OK_CTX), null);
  assert.equal(suggestTopUp(deltaWith({ gramsPerU: NaN }), OK_CTX), null);
  assert.equal(suggestTopUp(deltaWith({ extraCarbsG: NaN }), OK_CTX), null);
});

test("appoint : gros FPU mais delta glucides nul → null (non-régression C1)", () => {
  // Pâtes 100 g / 24 g lip / 40 g prot : `calculateBolus` diffère
  // volontairement l'insuline FPU dans le split. Le patient confirme
  // exactement les 100 g estimés → aucun appoint ne doit être proposé.
  // Ce test échoue si le FPU (ou la couverture absolue de la tuile)
  // revient dans le calcul de la dose d'appoint.
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(10, {
        carbsGrams: 100,
        carbsConfirmedGrams: 100,
        carbsConfirmedAt: new Date().toISOString(),
        fatGrams: 24,
        proteinGrams: 40,
        units: 10,
      }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  // La tuile, elle, voit bien un déficit de couverture (FPU non couverts) :
  // c'est justement ce chiffre qu'il ne faut pas prescrire.
  assert.equal(cob.status, "deficit");
  assert.ok(cob.balanceU < -1, `déficit de couverture attendu, reçu ${cob.balanceU}`);

  const delta: CarbDelta = {
    injectionId: "pates",
    extraCarbsG: 100 - 100,
    gramsPerU: 10,
    uncertain: false,
  };
  assert.equal(suggestTopUp(delta, OK_CTX), null);
});

// ─── resolveCarbDelta : extraction depuis app/diabete/page.tsx (re-revue) ──
//
// Avant, `carbDelta` était construit à la main en JSX dans la page — hors de
// portée de `npm test`. Le test C1 ci-dessus construisait son `CarbDelta` à
// la main, donc ne pouvait pas se rendre compte d'une régression dans le
// calcul RÉEL de l'écart. Ces tests appellent `resolveCarbDelta` directement.

test("resolveCarbDelta : l'écart ne porte que sur les glucides (gros FPU, aucun écart carbs → aucun appoint)", () => {
  // Pâtes 100 g confirmées à l'identique + 24 g lip / 40 g prot. Le FPU est
  // couvert par le split (2e injection), pas par l'appoint — ce test échoue
  // si `resolveCarbDelta` se met à intégrer fat/protein dans `extraCarbsG`.
  const l = log(10, {
    carbsGrams: 100,
    carbsConfirmedGrams: 100,
    carbsConfirmedAt: new Date().toISOString(),
    fatGrams: 24,
    proteinGrams: 40,
    units: 10,
  });
  const delta = resolveCarbDelta([l], Date.now(), RATIOS);
  assert.ok(delta, "une injection confirmée doit produire un CarbDelta");
  assert.equal(delta?.extraCarbsG, 0);
  // Bout en bout : la chaîne complète ne doit proposer aucun appoint.
  assert.equal(suggestTopUp(delta, OK_CTX), null);
});

test("resolveCarbDelta : gros FPU MAIS écart de glucides réel → le delta suit les glucides, pas le FPU", () => {
  const l = log(10, {
    carbsGrams: 100,
    carbsConfirmedGrams: 130, // +30 g de glucides confirmés
    carbsConfirmedAt: new Date().toISOString(),
    fatGrams: 24,
    proteinGrams: 40,
    units: 10,
  });
  const delta = resolveCarbDelta([l], Date.now(), RATIOS);
  // 30 g d'écart, pas influencé par 24 g lip / 40 g prot.
  assert.equal(delta?.extraCarbsG, 30);
});

test("resolveCarbDelta : injection non confirmée → aucun delta", () => {
  const l = log(10, { carbsGrams: 50, units: 5 }); // pas de carbsConfirmedAt
  assert.equal(resolveCarbDelta([l], Date.now(), RATIOS), null);
});

test("resolveCarbDelta : injection split → ignorée (une 2e dose FPU n'est pas un repas à mesurer)", () => {
  const l = log(10, {
    carbsGrams: 100,
    carbsConfirmedGrams: 130,
    carbsConfirmedAt: new Date().toISOString(),
    isSplitDose: true,
    units: 4,
  });
  assert.equal(resolveCarbDelta([l], Date.now(), RATIOS), null);
});

test("resolveCarbDelta : appoint enfant déjà servi → l'injection parent est ignorée", () => {
  const parent = log(30, {
    id: "parent",
    carbsGrams: 100,
    carbsConfirmedGrams: 130,
    carbsConfirmedAt: new Date().toISOString(),
    units: 10,
  });
  const child = log(5, {
    id: "child",
    parentInjectionId: "parent",
    units: 3,
  });
  // Ordre le plus récent → le plus ancien, comme le store.
  assert.equal(resolveCarbDelta([child, parent], Date.now(), RATIOS), null);
});

test("resolveCarbDelta : un split enfant du parent ne compte PAS comme appoint déjà servi", () => {
  // Un split FPU (`isSplitDose: true`) est une dose PLANIFIÉE dès le bolus
  // initial, pas un appoint sur un écart confirmé. Il ne doit pas masquer
  // un vrai delta de glucides sur son injection parent.
  const parent = log(30, {
    id: "parent",
    carbsGrams: 100,
    carbsConfirmedGrams: 130,
    carbsConfirmedAt: new Date().toISOString(),
    units: 10,
  });
  const split = log(5, {
    id: "split-child",
    parentInjectionId: "parent",
    isSplitDose: true,
    units: 4,
  });
  const delta = resolveCarbDelta([split, parent], Date.now(), RATIOS);
  assert.equal(delta?.injectionId, "parent");
  assert.equal(delta?.extraCarbsG, 30);
});

test("resolveCarbDelta : la fenêtre temporelle est respectée", () => {
  const base = {
    carbsGrams: 100,
    carbsConfirmedGrams: 130,
    carbsConfirmedAt: new Date().toISOString(),
    units: 10,
  };
  // Dans la fenêtre (180 min) : delta produit.
  const inWindow = log(TOPUP_DELTA_WINDOW_MIN - 1, base);
  assert.ok(resolveCarbDelta([inWindow], Date.now(), RATIOS));
  // Hors fenêtre : le repas est trop loin dans la digestion pour un appoint.
  const outOfWindow = log(TOPUP_DELTA_WINDOW_MIN + 1, base);
  assert.equal(resolveCarbDelta([outOfWindow], Date.now(), RATIOS), null);
});

test("resolveCarbDelta : horodatage dans le futur (dérive d'horloge) → aucun delta fantôme", () => {
  const l = log(-5, {
    carbsGrams: 100,
    carbsConfirmedGrams: 130,
    carbsConfirmedAt: new Date().toISOString(),
    units: 10,
  });
  assert.equal(resolveCarbDelta([l], Date.now(), RATIOS), null);
});

test("appoint : ne re-propose pas tant que l'écart ne s'est pas creusé d'1 U", () => {
  const ctx: TopUpContext = { ...OK_CTX, lastOfferedDeficitU: 4 };
  assert.equal(suggestTopUp(deltaWith({ extraCarbsG: 45 }), ctx), null);
  const s = suggestTopUp(deltaWith({ extraCarbsG: 52 }), ctx);
  assert.equal(s?.units, 4);
});

// ─── Garde-fous de fraîcheur / présence de la glycémie (C4) ───────────

test("appoint : bloqué si aucune lecture de glycémie", () => {
  assert.equal(suggestTopUp(deltaWith(), { currentGlucose: null }), null);
  assert.equal(
    suggestTopUp(deltaWith(), { currentGlucose: undefined, glucoseAgeMin: 2 }),
    null,
  );
});

test("appoint : bloqué si la lecture a plus de 15 min", () => {
  assert.equal(
    suggestTopUp(deltaWith(), { currentGlucose: 150, glucoseAgeMin: 20 }),
    null,
  );
  // Âge inconnu = traité comme absent (on ne dose pas sur une lecture
  // dont on ignore la fraîcheur).
  assert.equal(suggestTopUp(deltaWith(), { currentGlucose: 150 }), null);
});

test("appoint : lecture fraîche à 150 → suggestion", () => {
  const s = suggestTopUp(deltaWith(), { currentGlucose: 150, glucoseAgeMin: 5 });
  assert.equal(s?.units, 4);
});

test("filterLearnableNightLogs : écarte les nuits précédées d'un repas incertain", () => {
  const nightAt = new Date("2026-09-01T22:00:00Z").getTime();
  const logs = [{ createdAt: new Date(nightAt).toISOString() }];

  const uncertainDinner = log(0, {
    id: "d1",
    carbsGrams: 90,
    carbsUncertain: true,
    injectedAt: new Date(nightAt - 2 * 3_600_000),
  });
  assert.equal(filterLearnableNightLogs(logs, [uncertainDinner]).length, 0);

  const cleanDinner = log(0, {
    id: "d2",
    carbsGrams: 90,
    injectedAt: new Date(nightAt - 2 * 3_600_000),
  });
  assert.equal(filterLearnableNightLogs(logs, [cleanDinner]).length, 1);

  // Un repas incertain vieux de 12 h ne pollue pas la nuit.
  const oldDinner = log(0, {
    id: "d3",
    carbsGrams: 90,
    carbsUncertain: true,
    injectedAt: new Date(nightAt - 12 * 3_600_000),
  });
  assert.equal(filterLearnableNightLogs(logs, [oldDinner]).length, 1);
});
