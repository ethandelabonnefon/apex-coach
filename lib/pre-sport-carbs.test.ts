/**
 * Tests — règle de durée des glucides pré-sport (`exerciseCarbsForDuration`).
 *
 * Depuis le 19 sept. 2026, cette règle n'est plus qu'un REPLI : le briefing
 * lit la courbe prédite (lib/pre-sport-briefing.ts) et ne retombe sur les
 * g/h du consensus que sans lecture capteur, ou quand la courbe touche son
 * plancher. Le plafond absolu (MAX_PRE_SPORT_CARBS_G), né de l'incident de
 * mai 2026 (« 191 g conseillés »), reste testé ici ; la règle des 120 min
 * l'est dans pre-sport-briefing.test.ts.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { exerciseCarbsForDuration, MAX_PRE_SPORT_CARBS_G } from "./insulin-calculator";

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
