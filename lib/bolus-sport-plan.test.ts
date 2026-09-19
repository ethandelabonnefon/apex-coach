import test from "node:test";
import assert from "node:assert/strict";
import {
  computeBolusSportPlan,
  curveValueAt,
  curveMinBetween,
  START_TARGET_AEROBIC,
  START_TARGET_OTHER,
  MIN_ADVISED_CARBS_G,
} from "./bolus-sport-plan";
import {
  predictGlucoseCurve,
  upcomingExerciseImpactMgDl,
  type PredictionPoint,
} from "./glucose-prediction";

/** Courbe plate à `value`, 0 → 240 min au pas de 15. */
function flat(value: number): PredictionPoint[] {
  const pts: PredictionPoint[] = [];
  for (let m = 0; m <= 240; m += 15) pts.push({ minute: m, at: m * 60_000, value });
  return pts;
}

test("prédite au départ au-dessus de la cible → 0 g, même avec de l'IOB", () => {
  const r = computeBolusSportPlan({
    family: "running",
    minutesUntilWorkout: 40,
    durationMin: 45,
    curveWithReducedDose: flat(160),
    iobAfterDoseU: 0.5,
  });
  assert.equal(r.predictedAtStart, 160);
  assert.equal(r.startGapCarbsG, 0, "au-dessus de 150 : aucun écart au départ");
  assert.equal(r.carbsG, 0, "courbe plate à 160 : rien à manger, la dose réduite suffit");
  assert.equal(r.carbsReason, "none");
});

test("prédite au départ sous la cible → l'écart, au moins 15 g", () => {
  const r = computeBolusSportPlan({
    family: "running",
    minutesUntilWorkout: 40,
    durationMin: 0,
    curveWithReducedDose: flat(114),
    iobAfterDoseU: 0,
  });
  assert.equal(r.predictedAtStart, 114);
  // (126 − 114) / 4 = 3 g → plancher 15 g.
  assert.equal(r.startGapCarbsG, 3, "l'écart brut : 3 g");
  assert.equal(r.carbsG, MIN_ADVISED_CARBS_G, "relevé au plancher de 15 g");
  assert.equal(r.carbsReason, "start");
});

test("écart franc : 100 → 7 g relevé à 15 ; 90 → 15 ; 70 → 15 ; 50 → 19 g", () => {
  const at = (v: number) =>
    computeBolusSportPlan({
      family: "running",
      minutesUntilWorkout: 30,
      durationMin: 0,
      curveWithReducedDose: flat(v),
      iobAfterDoseU: 0,
    }).carbsG;
  assert.equal(at(100), 15);
  assert.equal(at(90), 15);
  assert.equal(at(70), 15);
  assert.equal(at(50), 19);
});

test("creux pendant l'effort : la courbe qui plonge sous 80 réclame des glucides même si le départ est bon", () => {
  const curve: PredictionPoint[] = [];
  for (let m = 0; m <= 240; m += 15) {
    // 160 au départ (min 40), puis chute à 50 entre 60 et 85, remontée.
    const v = m < 40 ? 150 : m <= 55 ? 160 : m <= 85 ? 50 : 110;
    curve.push({ minute: m, at: 0, value: v });
  }
  const r = computeBolusSportPlan({
    family: "running", minutesUntilWorkout: 40, durationMin: 45,
    curveWithReducedDose: curve, iobAfterDoseU: 4,
  });
  assert.equal(r.startGapCarbsG, 0, "160 au départ : rien pour le départ");
  assert.equal(r.predictedDuringMin, 50);
  assert.equal(r.duringGapCarbsG, 8, "(80 − 50) / 4");
  assert.equal(r.carbsG, MIN_ADVISED_CARBS_G, "relevé au plancher");
  assert.equal(r.carbsReason, "during");
});

test("les deux écarts ne s'additionnent pas : on retient le plus exigeant", () => {
  const r = computeBolusSportPlan({
    family: "running", minutesUntilWorkout: 30, durationMin: 45,
    curveWithReducedDose: flat(60), iobAfterDoseU: 0,
  });
  // départ : (126 − 60)/4 = 17 ; pendant : (80 − 60)/4 = 5 → max = 17, pas 22.
  assert.equal(r.startGapCarbsG, 17);
  assert.equal(r.duringGapCarbsG, 5);
  assert.equal(r.carbsG, 17);
  assert.equal(r.carbsReason, "start+during");
});

test("Riddell : départ entre 126 et 180 → on part, rien avant (aérobie 126, intermittent 130)", () => {
  const run140 = computeBolusSportPlan({
    family: "running", minutesUntilWorkout: 30, durationMin: 0,
    curveWithReducedDose: flat(140), iobAfterDoseU: 0,
  });
  const run120 = computeBolusSportPlan({
    family: "running", minutesUntilWorkout: 30, durationMin: 0,
    curveWithReducedDose: flat(120), iobAfterDoseU: 0,
  });
  const padel128 = computeBolusSportPlan({
    family: "intermittent", minutesUntilWorkout: 30, durationMin: 0,
    curveWithReducedDose: flat(128), iobAfterDoseU: 0,
  });
  assert.equal(run140.startTarget, START_TARGET_AEROBIC);
  assert.equal(padel128.startTarget, START_TARGET_OTHER);
  assert.equal(run140.carbsG, 0, "140 ≥ 126 : on part sans manger");
  assert.ok(run120.carbsG > 0, "120 < 126 : 10-20 g avant");
  assert.ok(padel128.carbsG > 0, "128 < 130 : l'intermittent garde sa cible à 130");
});

test("la muscu ne conseille jamais de glucides préventifs", () => {
  const r = computeBolusSportPlan({
    family: "muscu", minutesUntilWorkout: 30, durationMin: 60,
    curveWithReducedDose: flat(90), iobAfterDoseU: 3,
  });
  assert.equal(r.carbsG, 0);
  assert.equal(r.carbsReason, "none");
  assert.equal(r.predictedAtStart, 90, "la lecture de la courbe reste disponible pour l'affichage");
});

test("sans courbe : seule la règle de durée s'applique, et la raison le dit", () => {
  const r = computeBolusSportPlan({
    family: "running", minutesUntilWorkout: 30, durationMin: 60,
    curveWithReducedDose: null, iobAfterDoseU: 2,
  });
  assert.equal(r.predictedAtStart, null);
  assert.ok(r.carbsG > 0, "60 min avec 2 U actives : la règle de durée justifie un apport");
  assert.equal(r.carbsReason, "no-curve");
});

test("le total est plafonné", () => {
  const r = computeBolusSportPlan({
    family: "running", minutesUntilWorkout: 30, durationMin: 180,
    curveWithReducedDose: flat(40), iobAfterDoseU: 6,
  });
  assert.ok(r.carbsG <= 80, `plafond 80 g, reçu ${r.carbsG}`);
});

test("lecture de courbe : point le plus proche, minimum sur l'intervalle", () => {
  const curve: PredictionPoint[] = [
    { minute: 0, at: 0, value: 120 },
    { minute: 15, at: 0, value: 130 },
    { minute: 30, at: 0, value: 110 },
    { minute: 45, at: 0, value: 95 },
    { minute: 60, at: 0, value: 105 },
  ];
  assert.equal(curveValueAt(curve, 40), 95, "40 → point 45");
  assert.equal(curveValueAt(curve, 22), 130, "22 → point 15 (plus proche que 30)");
  assert.equal(curveMinBetween(curve, 30, 60), 95);
  assert.equal(curveMinBetween(curve, 100, 200), null);
});

test("le scénario d'Ethan, bout en bout : 70 g à 19 h, course à +40 min, dose réduite 4 U", () => {
  // Glycémie 120, ISF 100, ratio dîner 10 g/U. Dose réduite (−50 %) : 4 U.
  // La courbe intègre le repas, la dose réduite et la course (−60 sur 45 min).
  // CSF = ISF / ratio = 100 / 10 = 10 mg/dL par gramme.
  const impact = upcomingExerciseImpactMgDl("running", 45, 4);
  const prediction = predictGlucoseCurve({
    currentGlucose: 120,
    isf: 100,
    events: [{ minutesAgo: 0, units: 4, carbsGrams: 70, carbSensitivity: 10 }],
    upcomingExercise: { startMinute: 40, durationMin: 45, impactMgDl: impact },
    horizonMinutes: 240,
    stepMinutes: 5,
    nowMs: Date.UTC(2026, 8, 14, 17, 0, 0),
  });
  const plan = computeBolusSportPlan({
    family: "running",
    minutesUntilWorkout: 40,
    durationMin: 45,
    curveWithReducedDose: prediction.curve,
    iobAfterDoseU: 4,
  });
  assert.ok(plan.predictedAtStart !== null && plan.predictedAtStart > 120,
    `à +40 min le repas a fait monter la glycémie (reçu ${plan.predictedAtStart})`);
  assert.ok(plan.predictedDuringMin !== null && plan.predictedDuringMin < plan.predictedAtStart!,
    "pendant la course, la glycémie descend");
  // Riddell pour une course modérée de 45 min à −50 % : la réduction est
  // le levier principal ; l'apport, s'il y en a un, reste petit. Pas le
  // double airbag « −50 % + 56 g ».
  assert.ok(plan.carbsG <= 30,
    `avec la dose déjà réduite de moitié, l'appoint doit rester modeste (reçu ${plan.carbsG} g)`);
});

test("courbe au plancher (40) : la règle de durée reprend la main, le creux étant masqué", () => {
  // 30 g à 95 mg/dL, 0 U, course de 60 min : la courbe touche 40 et ne dit
  // plus combien il manque. La seule course prélève ~40 g.
  const curve: PredictionPoint[] = [];
  for (let m = 0; m <= 240; m += 15) {
    curve.push({ minute: m, at: 0, value: m < 30 ? 110 : m <= 90 ? 40 : 60 });
  }
  const r = computeBolusSportPlan({
    family: "running", minutesUntilWorkout: 30, durationMin: 60,
    curveWithReducedDose: curve, iobAfterDoseU: 0,
  });
  assert.equal(r.predictedDuringMin, 40);
  assert.ok(r.carbsG >= 30, `au plancher, la durée doit imposer ≥ 30 g (reçu ${r.carbsG})`);
});
