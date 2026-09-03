/**
 * Tests de la sélection des repas analysables (projet « validation des doses »).
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  selectEligibleMeals,
  analyzeSlot,
  analyzeAllSlots,
  HYPO_THRESHOLD,
  RATIO_STEP,
  type ArchivePoint,
  type DoseValidationInput,
  type EligibleMeal,
  type SlotSelection,
  type SportSession,
} from "./dose-validation";
import type { InsulinLog } from "@/types";

const NOW = new Date("2026-09-02T12:00:00Z").getTime();
const DAY = 86_400_000;
const MIN = 60_000;

/** InsulinLog minimal, injecté il y a `daysAgo` jours à 12h00. */
function meal(
  daysAgo: number,
  over: Partial<InsulinLog> = {},
): InsulinLog {
  return {
    id: over.id ?? `meal-${daysAgo}`,
    units: 6,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams: 60,
    glucoseBefore: 130,
    notes: "",
    injectedAt: new Date(NOW - daysAgo * DAY),
    ...over,
  };
}

/** Points capteur plats à `value`, toutes les 15 min sur `days` jours. */
function flatPoints(value: number, days = 95): ArchivePoint[] {
  const pts: ArchivePoint[] = [];
  for (let t = NOW - days * DAY; t <= NOW; t += 15 * MIN) {
    pts.push({ t, value });
  }
  return pts;
}

function input(over: Partial<DoseValidationInput> = {}): DoseValidationInput {
  return {
    insulinLogs: [],
    archivePoints: flatPoints(130),
    workouts: [],
    ratios: { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 },
    ratioChangedAt: {},
    nowMs: NOW,
    ...over,
  };
}

test("repas sans glucides et secondes doses de split sont écartés", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(1, { id: "a", carbsGrams: 0 }),
        meal(2, { id: "b", isSplitDose: true }),
        meal(3, { id: "c" }),
      ],
    }),
    "lunch",
  );
  assert.deepEqual(sel.meals.map((m) => m.injectionId), ["c"]);
});

test("exclusion sport : séance dans la fenêtre d'observation", () => {
  const workouts: SportSession[] = [
    // séance 2 h APRÈS le repas de J-1 → dans la fenêtre de 5 h
    { date: new Date(NOW - 1 * DAY + 120 * MIN).toISOString(), durationMin: 60 },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3), meal(4)], workouts }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport, 1);
});

test("exclusion sport : séance dans les 4 h AVANT le repas", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY - 180 * MIN).toISOString(), durationMin: 45 },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3), meal(4)], workouts }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport, 1);
});

test("exclusion sport : séance hors fenêtre ne disqualifie pas", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY + 8 * 60 * MIN).toISOString(), durationMin: 60 },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3)], workouts }),
    "lunch",
  );
  assert.ok(sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport ?? 0, 0);
});

test("exclusion IOB : injection récente au moment du bolus", () => {
  const base = NOW - 1 * DAY;
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        // 8 U une heure avant le repas → IOB largement > 1 U
        meal(0, { id: "prev", units: 8, injectedAt: new Date(base - 60 * MIN) }),
        meal(0, { id: "a", injectedAt: new Date(base) }),
        meal(5), meal(6), meal(7),
      ],
    }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.iob, 1);
});

test("exclusion quantité incertaine", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(1, { id: "a", carbsUncertain: true }), meal(2), meal(3), meal(4)],
    }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.uncertain, 1);
});

test("exclusion correction intercalée, mais PAS le split du repas lui-même", () => {
  const base = NOW - 1 * DAY;
  const other = NOW - 2 * DAY;
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(0, { id: "a", injectedAt: new Date(base) }),
        // correction 2 h après le repas "a" → disqualifie "a"
        meal(0, {
          id: "corr", units: 2, carbsGrams: 0, mealType: "correction",
          injectedAt: new Date(base + 120 * MIN),
        }),
        meal(0, { id: "b", injectedAt: new Date(other) }),
        // split appartenant à "b" → ne disqualifie PAS "b"
        meal(0, {
          id: "split-b", units: 3, carbsGrams: 0, isSplitDose: true,
          parentInjectionId: "b", injectedAt: new Date(other + 150 * MIN),
        }),
        meal(5), meal(6),
      ],
    }),
    "lunch",
  );
  const ids = sel.meals.map((m) => m.injectionId);
  assert.ok(!ids.includes("a"), "le repas suivi d'une correction est écarté");
  assert.ok(ids.includes("b"), "le repas suivi de son propre split est gardé");
  assert.equal(sel.excluded.correction, 1);
});

test("fenêtre : 7 jours si elle contient déjà 3 repas éligibles", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(2), meal(3), meal(20)] }),
    "lunch",
  );
  assert.equal(sel.windowDays, 7);
  assert.equal(sel.meals.length, 3);
});

test("fenêtre : s'étend en arrière jusqu'à réunir 3 repas éligibles", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(10), meal(12), meal(40)] }),
    "lunch",
  );
  assert.equal(sel.meals.length, 3);
  assert.equal(sel.windowDays, 12);
  assert.ok(!sel.meals.some((m) => m.injectionId === "meal-40"));
});

test("fenêtre : plafonnée à 90 jours", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(95), meal(100)] }),
    "lunch",
  );
  assert.equal(sel.meals.length, 1);
  assert.ok(sel.windowDays <= 90);
});

test("fenêtre : ne remonte jamais avant ratioChangedAt", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(1), meal(5), meal(20), meal(30)],
      ratioChangedAt: { lunch: new Date(NOW - 10 * DAY).toISOString() },
    }),
    "lunch",
  );
  assert.equal(sel.meals.length, 2);
  assert.ok(sel.meals.every((m) => m.injectedAt >= NOW - 10 * DAY));
});

test("hypo : détectée dans les 5 h, une seule fois par repas", () => {
  const base = NOW - 1 * DAY;
  const pts = flatPoints(130).map((p) => {
    // deux creux distincts dans la fenêtre du repas
    const dt = p.t - base;
    if (dt > 60 * MIN && dt < 90 * MIN) return { ...p, value: 62 };
    if (dt > 200 * MIN && dt < 230 * MIN) return { ...p, value: 65 };
    return p;
  });
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), meal(5), meal(6)],
      archivePoints: pts,
    }),
    "lunch",
  );
  const a = sel.meals.find((m) => m.injectionId === "a");
  assert.equal(a?.hadHypo, true);
  assert.equal(sel.meals.filter((m) => m.hadHypo).length, 1);
});

test("hypo : un creux APRÈS la fenêtre de 5 h ne compte pas", () => {
  const base = NOW - 1 * DAY;
  const pts = flatPoints(130).map((p) => {
    const dt = p.t - base;
    return dt > 330 * MIN && dt < 360 * MIN ? { ...p, value: 60 } : p;
  });
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), meal(5), meal(6)],
      archivePoints: pts,
    }),
    "lunch",
  );
  assert.equal(sel.meals.find((m) => m.injectionId === "a")?.hadHypo, false);
});

test("glycémie avant / à T+5h renseignées, glucides confirmés prioritaires", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(1, { id: "a", carbsGrams: 60, carbsConfirmedGrams: 90, carbsConfirmedAt: "x" }),
        meal(2), meal(3),
      ],
    }),
    "lunch",
  );
  const a = sel.meals.find((m) => m.injectionId === "a");
  assert.equal(a?.carbsGrams, 90);
  assert.equal(a?.confirmed, true);
  assert.equal(a?.glucoseBefore, 130);
  assert.equal(a?.glucoseAfter5h, 130);
});

test("le seuil d'hypo est bien 70", () => {
  assert.equal(HYPO_THRESHOLD, 70);
});

// ─── Verdict ────────────────────────────────────────────────────────────

/** Sélection synthétique : `n` repas, dont `hypos` avec hypo. */
function selection(n: number, hypos: number, over: Partial<EligibleMeal> = {}): SlotSelection {
  const meals: EligibleMeal[] = [];
  for (let i = 0; i < n; i++) {
    meals.push({
      injectionId: `m${i}`,
      mealType: "lunch",
      injectedAt: NOW - (i + 1) * 3_600_000,
      carbsGrams: 60,
      units: 6,
      confirmed: false,
      glucoseBefore: 130,
      glucoseAfter5h: 130,
      hadHypo: i < hypos,
      ...over,
    });
  }
  return { meals, excluded: {}, windowDays: 7 };
}

test("verdict : moins de 3 repas éligibles → insufficient-data, même avec des hypos", () => {
  const a = analyzeSlot(selection(2, 2), 10, "lunch");
  assert.equal(a.verdict, "insufficient-data");
  assert.equal(a.proposedRatio, null);
});

test("verdict : 2 hypos sur 4 repas (50 %) → over-bolus", () => {
  const a = analyzeSlot(selection(4, 2), 10, "lunch");
  assert.equal(a.verdict, "over-bolus");
});

test("verdict : 1 hypo sur 3 repas → ok (le seuil de 2 événements protège)", () => {
  assert.equal(analyzeSlot(selection(3, 1), 10, "lunch").verdict, "ok");
});

test("verdict : 2 hypos sur 30 repas (6,7 %) → ok (le taux de 25 % protège)", () => {
  assert.equal(analyzeSlot(selection(30, 2), 10, "lunch").verdict, "ok");
});

test("proposition : −10 % sur l'insuline par gramme, seulement sur over-bolus", () => {
  const a = analyzeSlot(selection(4, 2), 10, "lunch");
  assert.equal(a.proposedRatio?.current, 10);
  // 0,10 U/g → 0,09 U/g ⇒ 11,1 g/U
  assert.ok(
    Math.abs((a.proposedRatio?.proposed ?? 0) - 11.1) < 0.05,
    `attendu ~11,1 g/U, reçu ${a.proposedRatio?.proposed}`,
  );
  assert.equal(analyzeSlot(selection(4, 0), 10, "lunch").proposedRatio, null);
});

test("proposition : un seul pas, quelle que soit la sévérité", () => {
  const modere = analyzeSlot(selection(4, 2), 10, "lunch");
  const severe = analyzeSlot(selection(4, 4), 10, "lunch");
  assert.equal(modere.proposedRatio?.proposed, severe.proposedRatio?.proposed);
});

test("confiance : bascule à « confirmé » à la moitié des repas confirmés", () => {
  const s = selection(4, 0);
  s.meals[0].confirmed = true;
  s.meals[1].confirmed = true;
  assert.equal(analyzeSlot(s, 10, "lunch").confidence, "confirmé");
  s.meals[1].confirmed = false;
  assert.equal(analyzeSlot(s, 10, "lunch").confidence, "provisoire");
});

test("atterrissage : moyenne sur les seuls repas ayant les deux mesures", () => {
  const s = selection(3, 0);
  s.meals[0].glucoseBefore = 130; s.meals[0].glucoseAfter5h = 85;   // −45
  s.meals[1].glucoseBefore = 140; s.meals[1].glucoseAfter5h = 95;   // −45
  s.meals[2].glucoseBefore = null; s.meals[2].glucoseAfter5h = 100; // ignoré
  assert.equal(analyzeSlot(s, 10, "lunch").avgLandingDelta, -45);
});

test("atterrissage : null si aucun repas n'a les deux mesures", () => {
  const s = selection(3, 0, { glucoseBefore: null });
  assert.equal(analyzeSlot(s, 10, "lunch").avgLandingDelta, null);
});

test("analyzeAllSlots rend les 4 créneaux, même vides", () => {
  const all = analyzeAllSlots(input());
  assert.deepEqual(
    all.map((a) => a.mealType),
    ["morning", "lunch", "snack", "dinner"],
  );
  assert.ok(all.every((a) => a.verdict === "insufficient-data"));
});

test("le pas de correction est bien de 10 %", () => {
  assert.equal(RATIO_STEP, 0.1);
});
