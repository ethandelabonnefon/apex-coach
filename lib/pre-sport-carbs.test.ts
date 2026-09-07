/**
 * Tests — glucides pré-sport par famille et durée (Task 2, sept. 2026).
 *
 * Deux garde-fous nés d'un incident réel (mai 2026 : une formule non bornée
 * a un jour conseillé "191g de glucides" avec une glycémie prédite à
 * -633 mg/dL) doivent survivre intacts et sont testés ici en cassant /
 * constatant / restaurant, pas seulement en les affirmant :
 *   - le plafond absolu sur les grammes (MAX_PRE_SPORT_CARBS_G)
 *   - la règle "au-delà de 120min avant le départ, on ne chiffre pas"
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  exerciseCarbsForDuration,
  computePreSportBriefing,
  MAX_PRE_SPORT_CARBS_G,
} from "./insulin-calculator";

// ─── exerciseCarbsForDuration (fonction pure) ───────────────────────────

test("résistance : jamais de glucides, quelles que soient durée et IOB", () => {
  for (const dur of [30, 90, 180]) {
    for (const iob of [0, 1, 3]) {
      assert.equal(exerciseCarbsForDuration("muscu", dur, iob), 0);
    }
  }
});

test("intermittent : strictement moins d'apport que l'aérobie, à conditions égales", () => {
  const aero = exerciseCarbsForDuration("running", 90, 2);
  const inter = exerciseCarbsForDuration("intermittent", 90, 2);
  assert.ok(inter < aero, `intermittent ${inter} doit être < aérobie ${aero}`);
  assert.ok(inter > 0, "intermittent ne doit pas être nul");
});

test("cardio-other suit le même barème que running (aérobie continu)", () => {
  assert.equal(
    exerciseCarbsForDuration("cardio-other", 60, 1),
    exerciseCarbsForDuration("running", 60, 1),
  );
});

test("IOB élevé : plus de glucides qu'IOB faible, même sport et durée", () => {
  const low = exerciseCarbsForDuration("running", 60, 0);
  const high = exerciseCarbsForDuration("running", 60, 3);
  assert.ok(high > low, `IOB élevé ${high} doit dépasser IOB faible ${low}`);
  assert.equal(low, 45, "45 g/h à IOB nul, sur une heure");
  assert.equal(high, 75, "75 g/h au-delà du seuil d'IOB élevé");
});

test("la durée est plafonnée à 180 min", () => {
  assert.equal(
    exerciseCarbsForDuration("running", 600, 3),
    exerciseCarbsForDuration("running", 180, 3),
  );
});

test("le total ne dépasse jamais le plafond absolu", () => {
  assert.ok(exerciseCarbsForDuration("running", 180, 5) <= MAX_PRE_SPORT_CARBS_G);
});

test("durée absurde (0, négative) : jamais de glucides ni de crash", () => {
  assert.equal(exerciseCarbsForDuration("running", 0, 2), 0);
  assert.equal(exerciseCarbsForDuration("running", -30, 2), 0);
  assert.equal(exerciseCarbsForDuration("intermittent", 0, 2), 0);
});

// ─── Discriminance : preuve que chaque garde-fou casse quand on le retire ─
//
// Ces tests documentent, en langage clair, ce qui échouerait si un garde-fou
// disparaissait — utilisés pendant le développement pour casser le code
// (retirer temporairement le Math.min/le floor) et constater l'échec avant
// de restaurer. Laissés en place : ils échoueraient de nouveau si quelqu'un
// réintroduisait la régression.

test("discriminance plafond absolu : IOB et durée extrêmes cumulées restent sous 80g", () => {
  // Sans Math.min(MAX_PRE_SPORT_CARBS_G, ...), 75 g/h × 3h = 225g — le type
  // même de chiffre absurde qui a causé l'incident de mai 2026.
  const worstCase = exerciseCarbsForDuration("running", 100_000, 999);
  assert.ok(
    worstCase <= MAX_PRE_SPORT_CARBS_G,
    `le plafond doit tenir même sur des entrées extrêmes, reçu ${worstCase}`,
  );
});

test("discriminance famille résistance : un durationCarbs non nul pour muscu serait une hyperglycémie garantie", () => {
  // La muscu FAIT MONTER la glycémie (adrénaline + glycogénolyse hépatique,
  // Yardley 2013) — lui recommander des glucides pour "l'effort" serait le
  // contraire de ce qu'il faut. Testé sur le pire cas (durée max, IOB max).
  assert.equal(exerciseCarbsForDuration("muscu", 180, 10), 0);
});

// ─── computePreSportBriefing — intégration ──────────────────────────────

test("intermittent : le briefing avertit du risque décalé", () => {
  const r = computePreSportBriefing({
    currentGlucose: 140,
    iobUnits: 2,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "intermittent",
    minutesUntilWorkout: 30,
    workoutDurationMinutes: 90,
  });
  assert.ok(
    r.recommendations.some((x) => /chute après|décalé/i.test(x.detail)),
    `avertissement de risque décalé attendu, reçu ${JSON.stringify(r.recommendations)}`,
  );
});

test("intermittent : l'avertissement décalé apparaît même quand tout le reste est calme", () => {
  const r = computePreSportBriefing({
    currentGlucose: 160,
    iobUnits: 0,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "intermittent",
    minutesUntilWorkout: 10,
    workoutDurationMinutes: 60,
  });
  assert.ok(
    r.recommendations.some((x) => /décalé/i.test(x.detail)),
    "même en l'absence de risque immédiat, le message décalé doit être présent",
  );
});

test("discriminance règle des 120min : au delà, jamais de grammage chiffré", () => {
  const r = computePreSportBriefing({
    currentGlucose: 100,
    iobUnits: 3,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "running",
    minutesUntilWorkout: 150,
    workoutDurationMinutes: 90,
  });
  const hasQuantity = r.recommendations.some((x) => typeof x.quantity === "number");
  assert.equal(hasQuantity, false, "aucune recommandation ne doit porter de quantité au delà de 120min");
  assert.ok(
    r.recommendations.some((x) => /re-vérifie/i.test(x.headline)),
    "doit rediriger vers une re-vérification plutôt qu'un chiffre",
  );
});

test("discriminance plafond total (briefing) : écart + durée cumulés restent sous le plafond absolu", () => {
  // IOB très élevé + running long → gapCarbs ET durationCarbs sont tous les
  // deux élevés. Sans le Math.min sur le TOTAL, leur somme dépasserait 80g.
  const r = computePreSportBriefing({
    currentGlucose: 70,
    iobUnits: 5,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "running",
    minutesUntilWorkout: 20,
    workoutDurationMinutes: 120,
  });
  const eatCarbs = r.recommendations.find((x) => x.type === "eat-carbs");
  assert.ok(eatCarbs, "une recommandation eat-carbs est attendue dans ce scénario à risque");
  assert.ok(
    (eatCarbs?.quantity ?? 0) <= MAX_PRE_SPORT_CARBS_G,
    `le total combiné ne doit jamais dépasser ${MAX_PRE_SPORT_CARBS_G}g, reçu ${eatCarbs?.quantity}`,
  );
});

test("muscu : jamais de recommandation eat-carbs déclenchée par la durée ou l'IOB seuls", () => {
  // Glycémie confortable (pas de risque "avant l'effort") + IOB élevé +
  // séance longue : si la composante durée fuitait vers la muscu, une
  // recommandation eat-carbs apparaîtrait ici alors qu'elle ne devrait pas.
  const r = computePreSportBriefing({
    currentGlucose: 160,
    iobUnits: 3,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "muscu",
    minutesUntilWorkout: 10,
    workoutDurationMinutes: 180,
  });
  assert.ok(
    !r.recommendations.some((x) => x.type === "eat-carbs"),
    `aucune reco eat-carbs attendue pour la muscu ici, reçu ${JSON.stringify(r.recommendations)}`,
  );
});

test("muscu : quand le comblement avant l'effort se déclenche, la composante durée n'y ajoute rien", () => {
  // Ici le comblement AVANT l'effort (gapCarbs) se déclenche bien (glycémie
  // basse avant la muscu) — donc exerciseCarbsForDuration("muscu", ...) est
  // réellement appelé dans ce chemin. La quantité recommandée doit être
  // strictement égale à ce que gapCarbs seul donnerait : 19g (glycémie
  // estimée 55, cible muscu 130, floor 15 → ceil((130-55)/4) = 19).
  const r = computePreSportBriefing({
    currentGlucose: 70,
    iobUnits: 3,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "muscu",
    minutesUntilWorkout: 10,
    workoutDurationMinutes: 180,
  });
  const eatCarbs = r.recommendations.find((x) => x.type === "eat-carbs");
  assert.ok(eatCarbs, "le comblement avant l'effort doit bien se déclencher ici");
  assert.equal(
    eatCarbs?.quantity,
    19,
    "durationCarbs doit être 0 pour la muscu même dans ce chemin — la quantité ne doit pas dépasser le seul gapCarbs",
  );
});

test("durée absurde côté briefing (0min) : pas de crash, comportement sain", () => {
  const r = computePreSportBriefing({
    currentGlucose: 70,
    iobUnits: 2,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "running",
    minutesUntilWorkout: 15,
    workoutDurationMinutes: 0,
  });
  assert.ok(Number.isFinite(r.estimatedAtWorkoutStart));
  const eatCarbs = r.recommendations.find((x) => x.type === "eat-carbs");
  assert.ok(eatCarbs, "le comblement de l'écart avant l'effort reste dû même à durée 0");
  assert.ok((eatCarbs?.quantity ?? 0) <= MAX_PRE_SPORT_CARBS_G);
});

test("durée absurde côté briefing (10h) : plafonnée, pas de crash", () => {
  const r = computePreSportBriefing({
    currentGlucose: 100,
    iobUnits: 4,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "running",
    minutesUntilWorkout: 15,
    workoutDurationMinutes: 600, // 10h
  });
  assert.ok(Number.isFinite(r.estimatedAtWorkoutStart));
  for (const reco of r.recommendations) {
    if (typeof reco.quantity === "number") {
      assert.ok(reco.quantity <= MAX_PRE_SPORT_CARBS_G, `quantité ${reco.quantity} dépasse le plafond`);
    }
  }
});

test("intermittent + fenêtre > 120min : le message décalé n'introduit pas de chiffre caché", () => {
  const r = computePreSportBriefing({
    currentGlucose: 140,
    iobUnits: 2,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType: "intermittent",
    minutesUntilWorkout: 150,
    workoutDurationMinutes: 90,
  });
  const hasQuantity = r.recommendations.some((x) => typeof x.quantity === "number");
  assert.equal(hasQuantity, false, "même avec l'avertissement intermittent, aucun chiffre au delà de 120min");
  assert.ok(r.recommendations.some((x) => /décalé/i.test(x.detail)));
  assert.ok(r.recommendations.some((x) => /re-vérifie/i.test(x.headline)));
});

// ─────────────────────────────────────────────────────────────────────
// Revue finale F2 (sept. 2026) : l'apport PRÉVENTIF sur la durée se
// déclenchait sur la seule condition « glycémie < 180 », sans plancher
// d'insuline active ni vérification de la trajectoire. Mesuré avant
// correctif : randonnée 120 min à 179 mg/dL avec IOB 0 → « Prévois 80 g ».
// Même classe d'absurdité que le « mange 191 g » de mai 2026.
// ─────────────────────────────────────────────────────────────────────

const briefing = (
  workoutType: "running" | "muscu" | "cardio-other" | "intermittent",
  currentGlucose: number,
  iobUnits: number,
  workoutDurationMinutes: number,
) =>
  computePreSportBriefing({
    currentGlucose,
    iobUnits,
    isfMgPerU: 100,
    insulinActiveMinutes: 195,
    workoutType,
    minutesUntilWorkout: 20,
    workoutDurationMinutes,
  });

const carbsOf = (r: ReturnType<typeof briefing>) =>
  r.recommendations.find((x) => x.type === "eat-carbs")?.quantity ?? 0;

test("F2 : aucun glucide conseillé à glycémie confortable sans insuline active", () => {
  for (const [fam, g, dur] of [
    ["cardio-other", 179, 120],
    ["cardio-other", 175, 60],
    ["intermittent", 170, 90],
  ] as const) {
    const grams = carbsOf(briefing(fam, g, 0, dur));
    assert.equal(
      grams,
      0,
      `${fam} ${dur}min à ${g} mg/dL sans IOB ne doit conseiller aucun glucide, reçu ${grams} g`,
    );
  }
});

test("F2 : l'apport préventif reste actif quand de l'insuline travaille encore", () => {
  const grams = carbsOf(briefing("intermittent", 160, 2, 90));
  assert.ok(grams > 0, "un padel de 90 min avec 2 U actives doit conseiller des glucides");
});

test("F2 : le message n'affirme jamais une insuline active inexistante", () => {
  for (const iob of [0, 0.2]) {
    const r = briefing("cardio-other", 175, iob, 90);
    for (const reco of r.recommendations) {
      assert.ok(
        !/encore active/i.test(reco.detail),
        `avec IOB ${iob}, aucun message ne doit parler d'insuline encore active — reçu « ${reco.detail} »`,
      );
    }
  }
});

test("F2 : un vrai risque de chute reste détecté, sans insuline active", () => {
  // Running à 110 : le modèle prédit une chute bien sous 80 pendant l'effort.
  // Le durcissement ne doit PAS avoir supprimé cette alerte-là.
  const r = briefing("running", 110, 0, 45);
  assert.ok(carbsOf(r) > 0, "une chute prédite sous 80 doit toujours déclencher un apport");
  assert.equal(r.risk, "risk");
});
