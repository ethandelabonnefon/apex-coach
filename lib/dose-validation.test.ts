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
  computeRatioStamps,
  hasNewRatioStamps,
  formatRatio,
  HYPO_THRESHOLD,
  HYPO_LATENCY_MIN,
  LOW_AT_MEAL_THRESHOLD,
  MIN_COVERAGE_RATIO,
  MIN_ELIGIBLE_MEALS,
  MIN_TRUNCATED_WINDOW_MIN,
  MUSCU_EXCLUSION_MIN_DURATION,
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

/** Cinq repas de contrôle anciens, sans interaction avec le cas testé. */
function filler(): InsulinLog[] {
  return [meal(30), meal(31), meal(32), meal(33), meal(34)];
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

// ─── Exclusion sport (décision produit D1 : la muscu courte n'exclut plus) ──

test("exclusion sport : running dans la fenêtre d'observation", () => {
  const workouts: SportSession[] = [
    // séance 2 h APRÈS le repas de J-1 → dans la fenêtre de 5 h
    { date: new Date(NOW - 1 * DAY + 120 * MIN).toISOString(), durationMin: 30, type: "running" },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3), meal(4)], workouts }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport, 1);
});

test("exclusion sport : running dans les 4 h AVANT le repas", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY - 180 * MIN).toISOString(), durationMin: 45, type: "running" },
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
    { date: new Date(NOW - 1 * DAY + 8 * 60 * MIN).toISOString(), durationMin: 60, type: "running" },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3)], workouts }),
    "lunch",
  );
  assert.ok(sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport ?? 0, 0);
});

test("D1 — une muscu de 60 min n'écarte PAS le repas", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY + 120 * MIN).toISOString(), durationMin: 60, type: "muscu" },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), ...filler()], workouts }),
    "lunch",
  );
  assert.ok(
    sel.meals.some((m) => m.injectionId === "a"),
    "la muscu ne fait pas chuter la glycémie : la donnée reste valide",
  );
  assert.equal(sel.excluded.sport ?? 0, 0);
});

test("D1 — une muscu de 90 min écarte le repas", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY + 120 * MIN).toISOString(), durationMin: 90, type: "muscu" },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), ...filler()], workouts }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport, 1);
});

test("D1 — le seuil muscu est bien 75 min", () => {
  assert.equal(MUSCU_EXCLUSION_MIN_DURATION, 75);
  const at = new Date(NOW - 1 * DAY + 120 * MIN).toISOString();
  const kept = selectEligibleMeals(
    input({
      insulinLogs: [meal(1, { id: "a" }), ...filler()],
      workouts: [{ date: at, durationMin: 75, type: "muscu" }],
    }),
    "lunch",
  );
  assert.ok(kept.meals.some((m) => m.injectionId === "a"), "75 min pile : gardé");
  const dropped = selectEligibleMeals(
    input({
      insulinLogs: [meal(1, { id: "a" }), ...filler()],
      workouts: [{ date: at, durationMin: 76, type: "muscu" }],
    }),
    "lunch",
  );
  assert.ok(!dropped.meals.some((m) => m.injectionId === "a"), "76 min : écarté");
});

test("D1 — un running de 30 min écarte toujours", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY + 60 * MIN).toISOString(), durationMin: 30, type: "running" },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), ...filler()], workouts }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport, 1);
});

test("D1 — chevauchement : séance à H−260 min durant 60 min écarte le repas", () => {
  // Le seul instant de DÉBUT est hors des 4 h précédentes (H−260), mais la
  // séance déborde jusqu'à H−200 : elle chevauche bien la zone sensible.
  const start = new Date(NOW - 1 * DAY - 260 * MIN).toISOString();
  const overlapping = selectEligibleMeals(
    input({
      insulinLogs: [meal(1, { id: "a" }), ...filler()],
      workouts: [{ date: start, durationMin: 60, type: "running" }],
    }),
    "lunch",
  );
  assert.ok(!overlapping.meals.some((m) => m.injectionId === "a"));
  assert.equal(overlapping.excluded.sport, 1);

  // Contrôle : même début, séance de 5 min → aucun chevauchement.
  const short = selectEligibleMeals(
    input({
      insulinLogs: [meal(1, { id: "a" }), ...filler()],
      workouts: [{ date: start, durationMin: 5, type: "running" }],
    }),
    "lunch",
  );
  assert.ok(short.meals.some((m) => m.injectionId === "a"));
});

// ─── Point 1 (re-revue) : bornes AVANT/APRÈS des prédicats d'exclusion ──
//
// La fenêtre de jugement d'un repas est tronquée au prochain bolus repas
// (cf. C3 plus haut). `hasSportAround` et `hasInterveningCorrection`
// doivent chercher vers l'AVANT sur `windowEnd` (tronqué) : un événement
// tombé après la fin réellement jugée n'a pas pu influencer les hypos
// mesurées pour CE repas. La borne ARRIÈRE du sport (SPORT_BEFORE_MIN),
// elle, reste pleine — asymétrie à préserver.

test("Point 1 — running APRÈS la fin tronquée de la fenêtre n'exclut plus le repas", () => {
  const base = NOW - 1 * DAY;
  const logs = [
    meal(0, { id: "snack-a", mealType: "snack", injectedAt: new Date(base) }),
    meal(0, { id: "dinner-a", mealType: "dinner", injectedAt: new Date(base + 240 * MIN) }),
  ];
  // Fenêtre du goûter tronquée à H+240 (dîner). Running à H+260 : après la
  // fin tronquée, mais toujours dans les 300 min pleines d'OBSERVATION_WINDOW_MIN
  // — c'est exactement le cas que l'ancien code excluait à tort.
  const workouts: SportSession[] = [
    { date: new Date(base + 260 * MIN).toISOString(), durationMin: 20, type: "running" },
  ];
  const sel = selectEligibleMeals(input({ insulinLogs: logs, workouts }), "snack");
  assert.ok(
    sel.meals.some((m) => m.injectionId === "snack-a"),
    "un running tombé après la fin tronquée du goûter n'a pas pu causer les hypos qu'on lui impute",
  );
  assert.equal(sel.excluded.sport ?? 0, 0);
});

test("Point 1 — running DANS la fenêtre tronquée exclut toujours le repas", () => {
  const base = NOW - 1 * DAY;
  const logs = [
    meal(0, { id: "snack-a", mealType: "snack", injectedAt: new Date(base) }),
    meal(0, { id: "dinner-a", mealType: "dinner", injectedAt: new Date(base + 240 * MIN) }),
  ];
  // Running à H+200 : avant la fin tronquée (H+240) → exclusion toujours due.
  const workouts: SportSession[] = [
    { date: new Date(base + 200 * MIN).toISOString(), durationMin: 20, type: "running" },
  ];
  const sel = selectEligibleMeals(input({ insulinLogs: logs, workouts }), "snack");
  assert.ok(!sel.meals.some((m) => m.injectionId === "snack-a"));
  assert.equal(sel.excluded.sport, 1);
});

test("Point 1 — correction injectée APRÈS la fin tronquée n'exclut plus le repas", () => {
  const base = NOW - 1 * DAY;
  const logs = [
    meal(0, { id: "snack-a", mealType: "snack", injectedAt: new Date(base) }),
    meal(0, { id: "dinner-a", mealType: "dinner", injectedAt: new Date(base + 240 * MIN) }),
    meal(0, {
      id: "corr",
      units: 1,
      carbsGrams: 0,
      mealType: "correction",
      injectedAt: new Date(base + 260 * MIN),
    }),
  ];
  const sel = selectEligibleMeals(input({ insulinLogs: logs }), "snack");
  assert.ok(
    sel.meals.some((m) => m.injectionId === "snack-a"),
    "une correction tombée après la fin tronquée du goûter n'a pas pu causer les hypos qu'on lui impute",
  );
  assert.equal(sel.excluded.correction ?? 0, 0);
});

test("Point 1 — correction DANS la fenêtre tronquée exclut toujours le repas", () => {
  const base = NOW - 1 * DAY;
  const logs = [
    meal(0, { id: "snack-a", mealType: "snack", injectedAt: new Date(base) }),
    meal(0, { id: "dinner-a", mealType: "dinner", injectedAt: new Date(base + 240 * MIN) }),
    meal(0, {
      id: "corr",
      units: 1,
      carbsGrams: 0,
      mealType: "correction",
      injectedAt: new Date(base + 200 * MIN),
    }),
  ];
  const sel = selectEligibleMeals(input({ insulinLogs: logs }), "snack");
  assert.ok(!sel.meals.some((m) => m.injectionId === "snack-a"));
  assert.equal(sel.excluded.correction, 1);
});

test("Point 1 — la borne arrière du sport reste SPORT_BEFORE_MIN plein malgré la troncature", () => {
  const base = NOW - 1 * DAY;
  const logs = [
    meal(0, { id: "snack-a", mealType: "snack", injectedAt: new Date(base) }),
    // Fenêtre du goûter tronquée très court (H+130), sans rapport avec la
    // borne arrière du sport.
    meal(0, { id: "dinner-a", mealType: "dinner", injectedAt: new Date(base + 130 * MIN) }),
  ];
  // Running débutant 235 min avant le repas : dans les 240 min pleines de
  // SPORT_BEFORE_MIN, qui ne dépendent jamais de la troncature avant.
  const workouts: SportSession[] = [
    { date: new Date(base - 235 * MIN).toISOString(), durationMin: 10, type: "running" },
  ];
  const sel = selectEligibleMeals(input({ insulinLogs: logs, workouts }), "snack");
  assert.ok(!sel.meals.some((m) => m.injectionId === "snack-a"));
  assert.equal(sel.excluded.sport, 1);
});

// ─── Autres exclusions ─────────────────────────────────────────────────

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

test("C4 — un APPOINT (parentInjectionId sans isSplitDose) disqualifie son repas", () => {
  const base = NOW - 1 * DAY;
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(0, { id: "a", injectedAt: new Date(base) }),
        // Appoint tel que le crée handleAcceptTopUp : mealType correction,
        // 0 g de glucides, parentInjectionId renseigné, PAS de isSplitDose.
        meal(0, {
          id: "topup", units: 1, carbsGrams: 0, mealType: "correction",
          parentInjectionId: "a", injectedAt: new Date(base + 100 * MIN),
        }),
        ...filler(),
      ],
    }),
    "lunch",
  );
  assert.ok(
    !sel.meals.some((m) => m.injectionId === "a"),
    "l'appoint est une dose décidée après coup : il disqualifie le repas",
  );
  assert.equal(sel.excluded.correction, 1);
});

// ─── C3 : troncature de la fenêtre au prochain bolus repas ──────────────

test("C3 — goûter à H, dîner à H+90 min → fenêtre trop courte, exclu", () => {
  const base = NOW - 1 * DAY;
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(0, { id: "snack-a", mealType: "snack", injectedAt: new Date(base) }),
        meal(0, { id: "dinner-a", mealType: "dinner", injectedAt: new Date(base + 90 * MIN) }),
      ],
    }),
    "snack",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "snack-a"));
  assert.equal(sel.excluded["short-window"], 1);
  assert.equal(MIN_TRUNCATED_WINDOW_MIN, 120);
});

test("C3 — goûter à H, dîner à H+240 min → retenu, et l'hypo post-dîner ne compte pas", () => {
  const base = NOW - 1 * DAY;
  // Creux à H+280 min : APRÈS le bolus du dîner (H+240), donc imputable au
  // dîner, pas au goûter.
  const pts = flatPoints(130).map((p) => {
    const dt = p.t - base;
    return dt > 275 * MIN && dt < 295 * MIN ? { ...p, value: 60 } : p;
  });
  const logs = [
    meal(0, { id: "snack-a", mealType: "snack", injectedAt: new Date(base) }),
    meal(0, { id: "dinner-a", mealType: "dinner", injectedAt: new Date(base + 240 * MIN) }),
  ];
  const sel = selectEligibleMeals(input({ insulinLogs: logs, archivePoints: pts }), "snack");
  const a = sel.meals.find((m) => m.injectionId === "snack-a");
  assert.ok(a, "fenêtre de 240 min : le goûter reste analysable");
  assert.equal(a?.windowMin, 240);
  assert.equal(a?.hadHypo, false, "l'hypo post-dîner ne compte pas contre le goûter");

  // Contrôle : sans le dîner, la fenêtre va jusqu'à H+300 et l'hypo compte.
  const noDinner = selectEligibleMeals(
    input({ insulinLogs: [logs[0]], archivePoints: pts }),
    "snack",
  );
  assert.equal(noDinner.meals.find((m) => m.injectionId === "snack-a")?.hadHypo, true);
});

// ─── C2 : couverture capteur ───────────────────────────────────────────

/** Six repas par créneau, décalés de 4 h, sur les six derniers jours. */
function fourSlotsSample(): InsulinLog[] {
  const slots = ["morning", "lunch", "snack", "dinner"];
  const logs: InsulinLog[] = [];
  for (let d = 1; d <= 6; d++) {
    slots.forEach((slot, i) => {
      logs.push(
        meal(0, {
          id: `${slot}-${d}`,
          mealType: slot,
          injectedAt: new Date(NOW - d * DAY + i * 240 * MIN),
        }),
      );
    });
  }
  return logs;
}

test("C2 — archive VIDE : aucun créneau en « ok », tous en insufficient-data", () => {
  const all = analyzeAllSlots(
    input({ insulinLogs: fourSlotsSample(), archivePoints: [] }),
  );
  assert.equal(all.length, 4);
  assert.ok(
    all.every((a) => a.verdict === "insufficient-data"),
    `aucun verdict ok sans mesure, reçu ${all.map((a) => a.verdict).join(", ")}`,
  );
  assert.ok(all.every((a) => (a.excluded["no-coverage"] ?? 0) > 0));
});

test("C2 — le MÊME échantillon avec capteur produit bien des verdicts", () => {
  // Contre-preuve du test précédent : le silence vient de l'absence de
  // mesure, pas d'un échantillon trop maigre.
  const all = analyzeAllSlots(input({ insulinLogs: fourSlotsSample() }));
  assert.ok(all.every((a) => a.verdict === "ok"), all.map((a) => a.verdict).join(", "));
});

test("C2 — couverture à 50 % de la fenêtre → exclu (no-coverage)", () => {
  const base = NOW - 1 * DAY;
  // On garde la première moitié de la fenêtre (10 points sur 20 attendus).
  const pts = flatPoints(130).filter(
    (p) => !(p.t > base + 150 * MIN && p.t <= base + 300 * MIN),
  );
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) })],
      archivePoints: pts,
    }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded["no-coverage"], 1);
});

test("C2 — couverture à 80 % de la fenêtre → repas retenu", () => {
  const base = NOW - 1 * DAY;
  const pts = flatPoints(130).filter(
    (p) => !(p.t > base + 240 * MIN && p.t <= base + 300 * MIN),
  );
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) })],
      archivePoints: pts,
    }),
    "lunch",
  );
  assert.ok(sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded["no-coverage"] ?? 0, 0);
  assert.equal(MIN_COVERAGE_RATIO, 0.6);
});

test("C2 — glycémie avant repas non mesurée → exclu (no-coverage)", () => {
  const base = NOW - 1 * DAY;
  // Trou capteur de ±20 min autour du bolus : glucoseBefore reste null.
  const pts = flatPoints(130).filter((p) => Math.abs(p.t - base) > 20 * MIN);
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) })],
      archivePoints: pts,
    }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded["no-coverage"], 1);
});

// ─── I5 : latence d'hypo et repas pris en hypo ─────────────────────────

test("hypo : détectée dans la fenêtre, une seule fois par repas", () => {
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

test("I5 — un creux AVANT 45 min ne compte pas (un bolus ne fait pas ça)", () => {
  const base = NOW - 1 * DAY;
  const early = flatPoints(130).map((p) => {
    const dt = p.t - base;
    return dt > 10 * MIN && dt < 40 * MIN ? { ...p, value: 62 } : p;
  });
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), ...filler()],
      archivePoints: early,
    }),
    "lunch",
  );
  assert.equal(sel.meals.find((m) => m.injectionId === "a")?.hadHypo, false);
  assert.equal(HYPO_LATENCY_MIN, 45);

  // Contrôle : le même creux 30 min plus tard compte.
  const late = flatPoints(130).map((p) => {
    const dt = p.t - base;
    return dt > 50 * MIN && dt < 80 * MIN ? { ...p, value: 62 } : p;
  });
  const sel2 = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), ...filler()],
      archivePoints: late,
    }),
    "lunch",
  );
  assert.equal(sel2.meals.find((m) => m.injectionId === "a")?.hadHypo, true);
});

test("I5 — repas pris en dessous de 80 mg/dL → exclu (low-at-meal)", () => {
  const base = NOW - 1 * DAY;
  const pts = flatPoints(130).map((p) =>
    Math.abs(p.t - base) < 8 * MIN ? { ...p, value: 75 } : p,
  );
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), ...filler()],
      archivePoints: pts,
    }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded["low-at-meal"], 1);
  assert.equal(LOW_AT_MEAL_THRESHOLD, 80);

  // Contrôle : à 85 mg/dL le repas est gardé.
  const ok = flatPoints(130).map((p) =>
    Math.abs(p.t - base) < 8 * MIN ? { ...p, value: 85 } : p,
  );
  const sel2 = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), ...filler()],
      archivePoints: ok,
    }),
    "lunch",
  );
  assert.ok(sel2.meals.some((m) => m.injectionId === "a"));
});

// ─── Fenêtre ───────────────────────────────────────────────────────────

test("fenêtre : 7 jours si elle contient déjà assez de repas éligibles", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(2), meal(3), meal(4), meal(5), meal(20)] }),
    "lunch",
  );
  assert.equal(sel.windowDays, 7);
  assert.equal(sel.meals.length, MIN_ELIGIBLE_MEALS);
});

test("fenêtre : s'étend en arrière jusqu'à réunir MIN_ELIGIBLE_MEALS repas", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(10), meal(11), meal(12), meal(13), meal(40)] }),
    "lunch",
  );
  assert.equal(sel.meals.length, 5);
  assert.equal(sel.windowDays, 13);
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

test("I3 — les exclusions sont comptées sur la MÊME fenêtre que les repas retenus", () => {
  const old: InsulinLog[] = [];
  for (let d = 60; d < 70; d++) {
    old.push(meal(d, { id: `old-${d}`, carbsUncertain: true }));
  }
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(1), meal(2), meal(3), meal(4), meal(5), ...old],
    }),
    "lunch",
  );
  assert.equal(sel.windowDays, 7);
  assert.equal(sel.meals.length, 5);
  assert.equal(
    sel.excluded.uncertain ?? 0,
    0,
    "10 repas écartés il y a deux mois ne s'affichent pas à côté d'une fenêtre de 7 jours",
  );
});

test("glycémie avant / en fin de fenêtre, glucides confirmés prioritaires", () => {
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
  assert.equal(a?.glucoseAtWindowEnd, 130);
  assert.equal(a?.windowMin, 300);
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
      glucoseAtWindowEnd: 130,
      windowMin: 300,
      hadHypo: i < hypos,
      ...over,
    });
  }
  return { meals, excluded: {}, windowDays: 7 };
}

test("D2 — le minimum de repas éligibles est bien 5", () => {
  assert.equal(MIN_ELIGIBLE_MEALS, 5);
});

test("verdict : moins de 5 repas éligibles → insufficient-data, même avec des hypos", () => {
  const a = analyzeSlot(selection(4, 4), 10, "lunch");
  assert.equal(a.verdict, "insufficient-data");
  assert.equal(a.proposedRatio, null);
});

test("borne — exactement MIN_ELIGIBLE_MEALS repas : le verdict est rendu", () => {
  assert.equal(analyzeSlot(selection(5, 2), 10, "lunch").verdict, "over-bolus");
  assert.equal(analyzeSlot(selection(5, 0), 10, "lunch").verdict, "ok");
  // Un repas de moins et le créneau se tait.
  assert.equal(analyzeSlot(selection(4, 2), 10, "lunch").verdict, "insufficient-data");
});

test("borne — taux exactement à 25 % (2 hypos sur 8) → over-bolus", () => {
  const a = analyzeSlot(selection(8, 2), 10, "lunch");
  assert.equal(a.hypoRate, 0.25);
  assert.equal(a.verdict, "over-bolus");
  // Juste en dessous du seuil (2 sur 9 ≈ 22 %) → ok
  assert.equal(analyzeSlot(selection(9, 2), 10, "lunch").verdict, "ok");
});

test("verdict : 1 hypo sur 5 repas → ok (le seuil de 2 événements protège)", () => {
  assert.equal(analyzeSlot(selection(5, 1), 10, "lunch").verdict, "ok");
});

test("verdict : 2 hypos sur 30 repas (6,7 %) → ok (le taux de 25 % protège)", () => {
  assert.equal(analyzeSlot(selection(30, 2), 10, "lunch").verdict, "ok");
});

test("proposition : −10 % sur l'insuline par gramme, seulement sur over-bolus", () => {
  const a = analyzeSlot(selection(8, 2), 10, "lunch");
  assert.equal(a.proposedRatio?.current, 10);
  // 0,10 U/g → 0,09 U/g ⇒ 11,1 g/U
  assert.ok(
    Math.abs((a.proposedRatio?.proposed ?? 0) - 11.1) < 0.05,
    `attendu ~11,1 g/U, reçu ${a.proposedRatio?.proposed}`,
  );
  assert.equal(analyzeSlot(selection(8, 0), 10, "lunch").proposedRatio, null);
});

test("borne — currentRatio = 0 : aucune proposition, même sur over-bolus", () => {
  const a = analyzeSlot(selection(8, 4), 0, "lunch");
  assert.equal(a.verdict, "over-bolus");
  assert.equal(a.proposedRatio, null, "ne jamais diviser un ratio nul");
});

test("proposition : un seul pas, quelle que soit la sévérité", () => {
  const modere = analyzeSlot(selection(8, 2), 10, "lunch");
  const severe = analyzeSlot(selection(8, 8), 10, "lunch");
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
  s.meals[0].glucoseBefore = 130; s.meals[0].glucoseAtWindowEnd = 85;   // −45
  s.meals[1].glucoseBefore = 140; s.meals[1].glucoseAtWindowEnd = 95;   // −45
  s.meals[2].glucoseBefore = null; s.meals[2].glucoseAtWindowEnd = 100; // ignoré
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

// ───────────────────────────────────────────────────────────────────────
// C1 — tampons de changement de ratio (fonction pure appelée par les
// trois setters du store)
// ───────────────────────────────────────────────────────────────────────

const ISO = "2026-09-02T12:00:00.000Z";

test("C1 — un seul créneau change → un seul tampon", () => {
  const stamps = computeRatioStamps(
    { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 },
    { morning: 6.7, lunch: 11.1, snack: 8.3, dinner: 10 },
    ISO,
  );
  assert.deepEqual(stamps, { lunch: ISO });
});

test("C1 — aucun changement → objet vide", () => {
  const ratios = { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 };
  assert.deepEqual(computeRatioStamps(ratios, { ...ratios }, ISO), {});
  assert.equal(hasNewRatioStamps(ratios, { ...ratios }), false);
});

test("C1 — les tampons existants des autres créneaux survivent", () => {
  const stamps = computeRatioStamps(
    { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 },
    { morning: 6.7, lunch: 11.1, snack: 8.3, dinner: 10 },
    ISO,
    { dinner: "2026-08-01T00:00:00.000Z", snack: "2026-07-01T00:00:00.000Z" },
  );
  assert.deepEqual(stamps, {
    dinner: "2026-08-01T00:00:00.000Z",
    snack: "2026-07-01T00:00:00.000Z",
    lunch: ISO,
  });
});

test("C1 — bascule de profil changeant les quatre ratios → quatre tampons", () => {
  const stamps = computeRatioStamps(
    { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 },
    { morning: 7.4, lunch: 11.1, snack: 9.1, dinner: 11.1 },
    ISO,
    { lunch: "2026-08-01T00:00:00.000Z" },
  );
  assert.deepEqual(stamps, {
    morning: ISO, lunch: ISO, snack: ISO, dinner: ISO,
  });
  assert.equal(hasNewRatioStamps({ morning: 6.7 }, { morning: 7.4 }), true);
});

test("C1 — un tampon remet effectivement le créneau en reconstitution", () => {
  // Bout-en-bout : les repas d'avant le tampon sortent de la fenêtre, donc
  // le créneau ne peut pas proposer une seconde baisse sur les mêmes hypos.
  const logs = [meal(1), meal(2), meal(3), meal(4), meal(5), meal(6)];
  const before = analyzeSlot(
    selectEligibleMeals(input({ insulinLogs: logs }), "lunch"), 10, "lunch",
  );
  assert.notEqual(before.verdict, "insufficient-data");

  const stamps = computeRatioStamps({ lunch: 10 }, { lunch: 11.1 }, new Date(NOW).toISOString());
  const after = analyzeSlot(
    selectEligibleMeals(input({ insulinLogs: logs, ratioChangedAt: stamps }), "lunch"),
    11.1,
    "lunch",
  );
  assert.equal(after.verdict, "insufficient-data");
  assert.equal(after.eligibleCount, 0);
});

// ───────────────────────────────────────────────────────────────────────
// formatRatio — Round de correction 1 (trouvaille reviewer, contre-preuve
// coordinateur) : fige le comportement pour ne plus dépendre d'une
// relecture de l'idiome de formatage.
// ───────────────────────────────────────────────────────────────────────

test("formatRatio : entiers, pas de virgule orpheline", () => {
  assert.equal(formatRatio(20), "1 U / 20 g");
  assert.equal(formatRatio(10), "1 U / 10 g");
  assert.equal(formatRatio(100), "1 U / 100 g");
  assert.equal(formatRatio(1), "1 U / 1 g");
  assert.equal(formatRatio(0), "1 U / 0 g");
});

test("formatRatio : décimales, virgule française", () => {
  assert.equal(formatRatio(11.1), "1 U / 11,1 g");
  assert.equal(formatRatio(20.5), "1 U / 20,5 g");
  assert.equal(formatRatio(0.5), "1 U / 0,5 g");
  assert.equal(formatRatio(200.1), "1 U / 200,1 g");
});

test("formatRatio : ratios réels du profil (6,7 / 8,3 / 10 / 11,1)", () => {
  assert.equal(formatRatio(6.7), "1 U / 6,7 g");
  assert.equal(formatRatio(8.3), "1 U / 8,3 g");
  assert.equal(formatRatio(10), "1 U / 10 g");
  assert.equal(formatRatio(11.1), "1 U / 11,1 g");
});
