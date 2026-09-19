import test from "node:test";
import assert from "node:assert/strict";
import { computePreSportBriefingOnCurve, type PreSportBriefingInput } from "./pre-sport-briefing";
import type { InsulinLog } from "@/types";

const NOW = Date.UTC(2026, 9, 19, 17, 0, 0); // 19 h locale (CEST) — créneau dîner
const RATIOS = { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 };

/** Bolus de `units` U injecté il y a `minutesAgo` min (repas de 60 g couvert). */
function bolus(units: number, minutesAgo: number, carbs = 60): InsulinLog {
  return {
    id: `b-${minutesAgo}`,
    units,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams: carbs,
    glucoseBefore: 120,
    notes: "",
    injectedAt: new Date(NOW - minutesAgo * 60_000),
  };
}

function briefing(over: Partial<PreSportBriefingInput> = {}) {
  return computePreSportBriefingOnCurve({
    currentGlucose: 130,
    glucoseAgeMin: 2,
    trendArrow: 3,
    insulinLogs: [],
    carbEntries: [],
    isf: 100,
    ratios: RATIOS,
    dia: 195,
    family: "running",
    minutesUntilWorkout: 30,
    durationMin: 30,
    nowMs: NOW,
    ...over,
  });
}

const carbsOf = (r: ReturnType<typeof briefing>) =>
  r.recommendations.find((x) => x.type === "eat-carbs")?.quantity ?? 0;

// ─── Les cinq cas du tableau d'Ethan (19 sept.) ─────────────────────────

test("cas 1 — 30 min de course dans 30 min, 130 stable, zéro insuline → rien à manger", () => {
  // Riddell : départ entre 126 et 180, on part. Le foie compense le
  // prélèvement quand l'insuline est basse (k = 0,3).
  const r = briefing();
  assert.equal(r.status, "ok");
  assert.equal(r.iobFactor, 0.3);
  assert.equal(carbsOf(r), 0, `attendu 0 g, reçu ${carbsOf(r)} (départ ${r.predictedAtStart}, creux ${r.predictedDuringMin})`);
  assert.ok(r.recommendations.some((x) => x.type === "safe"));
});

test("cas 2 — même course avec de l'insuline active → des glucides", () => {
  // Un dîner de 60 g bolussé à 6 U il y a 60 min : ~4 U encore actives au
  // départ, mais 60 g dont une bonne part reste à absorber. Ce qui compte :
  // l'insuline à bord rend l'effort dangereux, la courbe doit le montrer.
  const withIob = briefing({ insulinLogs: [bolus(6, 60, 20)] }); // 6 U pour 20 g : franchement sur-dosé
  const without = briefing();
  assert.ok(withIob.iobAtStartU > 1.5, `IOB au départ attendue > 1,5 U, reçue ${withIob.iobAtStartU.toFixed(2)}`);
  assert.equal(withIob.iobFactor, 1);
  assert.ok(carbsOf(withIob) > carbsOf(without), `avec insuline (${carbsOf(withIob)} g) > sans (${carbsOf(without)} g)`);
});

test("cas 3 — « dans 90 min » ne réclame pas PLUS que « dans 30 min » (défaut n° 3 corrigé)", () => {
  // 1 U active maintenant. À +90 min il en restera ~0,45 : moins d'effort
  // sur la glycémie, pas plus. L'ancien moteur donnait 50 g contre 33 g.
  const logs = [bolus(1, 0, 10)];
  const in30 = briefing({ insulinLogs: logs, minutesUntilWorkout: 30 });
  const in90 = briefing({ insulinLogs: logs, minutesUntilWorkout: 90 });
  assert.ok(in90.iobAtStartU < in30.iobAtStartU, "moins d'insuline au départ à +90 qu'à +30");
  assert.ok(carbsOf(in90) <= carbsOf(in30), `dans 90 min (${carbsOf(in90)} g) doit être ≤ dans 30 min (${carbsOf(in30)} g)`);
});

test("cas 4 — 180 mg/dL, 30 min de course, 1 U active → rien avant", () => {
  const r = briefing({ currentGlucose: 180, insulinLogs: [bolus(1, 0, 10)] });
  assert.equal(carbsOf(r), 0, `attendu 0 g, reçu ${carbsOf(r)} (départ ${r.predictedAtStart}, creux ${r.predictedDuringMin})`);
});

test("cas 5 — 2 h de course → un apport, plafonné", () => {
  const r = briefing({ durationMin: 120, insulinLogs: [bolus(1, 0, 10)] });
  assert.ok(carbsOf(r) > 0, "2 h d'effort avec de l'insuline à bord : il faut un apport");
  assert.ok(carbsOf(r) <= 80, `plafond 80 g, reçu ${carbsOf(r)}`);
});

// ─── Garde-fous ─────────────────────────────────────────────────────────

test("Riddell : départ sous 126 → 10-20 g avant, même sans insuline", () => {
  const r = briefing({ currentGlucose: 110 });
  assert.ok(carbsOf(r) >= 15 && carbsOf(r) <= 25, `attendu 15-25 g, reçu ${carbsOf(r)}`);
});

test("sans lecture capteur : aucun chiffre, un message", () => {
  const r = briefing({ currentGlucose: null });
  assert.equal(r.status, "no-glucose");
  assert.equal(r.predictedAtStart, null);
  assert.equal(carbsOf(r), 0);
  assert.ok(r.recommendations.some((x) => /rafraîchis/i.test(x.headline)));
});

test("lecture périmée : aucun chiffre, un message", () => {
  const r = briefing({ glucoseAgeMin: 40 });
  assert.equal(r.status, "stale-glucose");
  assert.equal(carbsOf(r), 0);
});

test("fenêtre > 120 min : aucun grammage, jamais", () => {
  const r = briefing({ minutesUntilWorkout: 150, currentGlucose: 70 });
  assert.equal(r.status, "window-too-long");
  assert.equal(carbsOf(r), 0);
  assert.ok(r.recommendations.some((x) => /30 min avant/.test(x.headline)));
});

test("la muscu ne réclame jamais de glucides et la courbe monte", () => {
  const r = briefing({ family: "muscu", durationMin: 60 });
  assert.equal(carbsOf(r), 0);
  assert.ok(r.exerciseImpactMgDl > 0);
  assert.ok(r.predictedAtEnd !== null && r.predictedAtStart !== null && r.predictedAtEnd >= r.predictedAtStart);
});

test("l'intermittent garde son avertissement décalé, même sans grammage", () => {
  const r = briefing({ family: "intermittent", currentGlucose: 150 });
  assert.ok(r.recommendations.some((x) => /à la fin/.test(x.headline)));
  assert.ok(!r.recommendations.some((x) => x.type === "safe"), "jamais « rien à ajuster » pour l'intermittent");
});

test("split qui tombe pendant la course → réduire / décaler, si la courbe le justifie", () => {
  const r = briefing({
    insulinLogs: [bolus(6, 60, 20)],
    pendingSplit: { units: 4, minutesUntil: 20 },
  });
  assert.ok(r.recommendations.some((x) => x.type === "reduce-split" && x.quantity === 2));
  assert.ok(r.recommendations.some((x) => x.type === "delay-split"));
});

test("hyper au départ → cétones (aérobie) ou attendre (muscu)", () => {
  const run = briefing({ currentGlucose: 280 });
  const muscu = briefing({ currentGlucose: 280, family: "muscu" });
  assert.ok(run.recommendations.some((x) => /cétones/.test(x.headline)));
  assert.ok(muscu.recommendations.some((x) => x.type === "delay-workout"));
});

test("un effort LONG reste couvert même sans insuline active", () => {
  // 2 h de course à 130, zéro insuline : même avec le foie qui compense
  // (k = 0,3), le glycogène s'épuise — un apport doit sortir.
  const r = briefing({ durationMin: 120 });
  assert.ok(carbsOf(r) > 0, `attendu un apport, reçu ${carbsOf(r)} g`);
});

test("durées absurdes : pas de crash, comportement sain", () => {
  const zero = briefing({ durationMin: 0 });
  assert.equal(zero.status, "ok");
  const tenHours = briefing({ durationMin: 600 });
  assert.equal(tenHours.status, "ok");
  assert.ok(carbsOf(tenHours) <= 80, "le plafond tient même sur 10 h");
  const neg = briefing({ durationMin: -30 });
  assert.equal(neg.status, "ok");
});

test("le calculateur n'est pas cassé : la même modulation par l'IOB, avec 4 U fraîches, reste à plein effet", () => {
  // Le flux au bolus passe iob = IOB actuel + dose : à 4 U, k = 1.
  const full = briefing({ insulinLogs: [bolus(4, 0, 40)], currentGlucose: 150 });
  assert.equal(full.iobFactor, 1);
});
