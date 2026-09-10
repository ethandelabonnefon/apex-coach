import test from "node:test";
import assert from "node:assert/strict";
import {
  computePostSessionAppoint,
  isAppointBlockedByGlucose,
  isAppointStillRelevant,
  POST_SESSION_DELAY_MIN,
  POST_SESSION_MAX_UNITS,
} from "./post-session-insulin";
import type { CarbEntry, DeclaredSportSession } from "@/types";

/** Ratio goûter réel d'Ethan (profil Maintien), en grammes par unité. */
const SNACK_RATIO = 8.333;

const END = new Date("2026-09-10T16:00:00.000Z").getTime();

/** Course de 39 min terminée à 16 h, confirmée par Whoop. */
function session(over: Partial<DeclaredSportSession> = {}): DeclaredSportSession {
  return {
    id: "s1",
    sportKey: "course",
    family: "running",
    startAt: new Date(END - 39 * 60_000).toISOString(),
    plannedDurationMin: 45,
    actualDurationMin: 39,
    endedAt: new Date(END).toISOString(),
    createdAt: new Date(END - 60 * 60_000).toISOString(),
    ...over,
  };
}

function carb(minutesBeforeEnd: number, grams: number, over: Partial<CarbEntry> = {}): CarbEntry {
  return {
    id: `c-${minutesBeforeEnd}`,
    carbsGrams: grams,
    eatenAt: new Date(END - minutesBeforeEnd * 60_000).toISOString(),
    sportSessionId: "s1",
    ...over,
  };
}

/** Les glucides du 10 septembre : 66 g avant la course, 10 g pendant. */
const THAT_AFTERNOON = [carb(75, 66), carb(20, 10)];

test("LE test central — l'après-midi du 10 septembre donne 4 U", () => {
  // 66 g pris 75 min avant la fin (34 g encore en absorption) + 10 g pris
  // 20 min avant (9 g restants) = 43 g → 5,2 U au ratio goûter. Zéro
  // insuline active. Running 39 min, strain Whoop 11,6 → sensibilité ↑ 25 %.
  // Ethan, indépendamment : « là tu me fais un quatre unités et on est
  // parfait. » Sans cet appoint, il est monté de 68 à 210 mg/dL.
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.units, 4, `attendu 4 U, reçu ${r.units} (brut ${r.rawUnits.toFixed(2)})`);
  assert.ok(
    Math.abs(r.remainingCarbsG - 43) < 1,
    `attendu ~43 g en absorption, reçu ${r.remainingCarbsG.toFixed(1)}`,
  );
  assert.equal(r.skipReason, undefined);
});

test("le rappel tombe 30 min après la fin, jamais tout de suite", () => {
  // À la fin de sa course Ethan était à 68 mg/dL : proposer 4 U à cet
  // instant serait dangereux.
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.sessionEndMs, END);
  assert.equal(r.dueAtMs, END + POST_SESSION_DELAY_MIN * 60_000);
});

test("l'heure de fin mesurée par Whoop prime sur la durée annoncée", () => {
  // Séance annoncée 45 min mais terminée en 39 : les glucides ont 6 min
  // d'absorption en moins, donc il en reste plus à couvrir.
  const mesuree = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  const annoncee = computePostSessionAppoint({
    session: session({ actualDurationMin: undefined, endedAt: undefined }),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.ok(
    mesuree.remainingCarbsG > annoncee.remainingCarbsG,
    "une séance plus courte laisse plus de glucides à couvrir",
  );
  assert.equal(annoncee.dueAtMs, mesuree.sessionEndMs + 6 * 60_000 + POST_SESSION_DELAY_MIN * 60_000);
});

test("seuls les glucides de CETTE séance comptent", () => {
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: [
      carb(75, 66),
      carb(20, 10),
      // Une autre séance, et un repas ordinaire déjà bolussé.
      carb(30, 90, { id: "autre-seance", sportSessionId: "s2" }),
      carb(30, 90, { id: "repas", sportSessionId: undefined }),
    ],
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.units, 4, "les 180 g étrangers ne doivent rien ajouter");
});

test("sans glucides de sport, aucun appoint", () => {
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: [carb(30, 60, { id: "repas", sportSessionId: undefined })],
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.units, 0);
  assert.equal(r.skipReason, "no-carbs");
});

test("insuline active suffisante → aucun appoint", () => {
  // Le cas dangereux : Ethan bolusse un goûter entre la fin de séance et le
  // rappel. L'appoint doit disparaître, pas s'empiler.
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 6,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.units, 0);
  assert.equal(r.skipReason, "covered-by-iob");
});

test("l'insuline active se retranche avant l'arrondi", () => {
  const sans = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  const avec = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 2,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.ok(avec.units < sans.units, `${avec.units} U doit être < ${sans.units} U`);
});

test("sous une unité, pas de rappel — et pas d'arrondi vers le haut", () => {
  // 10 g seuls : ~0,9 U brut, encore moins après réduction. Arrondir
  // donnerait 1 U, soit deux tiers de trop pour quelqu'un qui vient de
  // courir.
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: [carb(20, 10)],
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.units, 0);
  assert.equal(r.skipReason, "below-minimum");
});

test("le strain agit réellement : plus de réduction, moins d'unités", () => {
  const doux = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 0,
  });
  const dur = computePostSessionAppoint({
    session: session(),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 50,
  });
  assert.ok(dur.units < doux.units, `${dur.units} U doit être < ${doux.units} U`);
  assert.equal(doux.units, 5, "sans réduction, les 43 g valent 5 U");
});

test("le plafond tient sur une saisie aberrante", () => {
  // 300 g tapés au lieu de 30.
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: [carb(10, 300)],
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.units, POST_SESSION_MAX_UNITS);
  assert.equal(r.capped, true);
});

test("une séance illisible ne produit jamais de dose", () => {
  const r = computePostSessionAppoint({
    session: session({ startAt: "pas une date", endedAt: undefined }),
    carbEntries: THAT_AFTERNOON,
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 25,
  });
  assert.equal(r.units, 0);
  assert.equal(r.skipReason, "no-session-end");
});

test("les entrées aberrantes ne produisent jamais de dose", () => {
  for (const bad of [NaN, -10, Infinity]) {
    const r = computePostSessionAppoint({
      session: session(),
      carbEntries: [carb(75, bad)],
      iobUnits: bad,
      ratioGramsPerU: bad,
      reductionPct: bad,
    });
    assert.equal(r.units, 0, `carbs=${bad} ne doit produire aucune dose`);
  }
});

test("des glucides pris après la fin comptent en entier", () => {
  // Whoop raccourcit la séance : la compote de la 30ᵉ minute peut se
  // retrouver postérieure à la fin mesurée. Elle est intégralement devant
  // nous, pas « négativement absorbée ».
  const r = computePostSessionAppoint({
    session: session(),
    carbEntries: [carb(-10, 20)],
    iobUnits: 0,
    ratioGramsPerU: SNACK_RATIO,
    reductionPct: 0,
  });
  assert.ok(
    Math.abs(r.remainingCarbsG - 20) < 0.01,
    `attendu 20 g intacts, reçu ${r.remainingCarbsG.toFixed(2)}`,
  );
});

test("un appoint trop en retard n'est plus proposé", () => {
  // L'app peut rester fermée des heures. Rouvrir à 21 h en ordonnant 4 U
  // pour une course finie à 16 h, c'est injecter sur un calcul périmé.
  const due = END + POST_SESSION_DELAY_MIN * 60_000;
  assert.equal(isAppointStillRelevant(due, due - 10 * 60_000), true, "pas encore dû");
  assert.equal(isAppointStillRelevant(due, due), true, "pile à l'heure");
  assert.equal(isAppointStillRelevant(due, due + 40 * 60_000), true, "40 min de retard : encore bon");
  assert.equal(isAppointStillRelevant(due, due + 50 * 60_000), false, "50 min : trop tard");
  assert.equal(isAppointStillRelevant(due, due + 5 * 3_600_000), false, "5 h : trop tard");
  assert.equal(isAppointStillRelevant(NaN, due), false, "séance illisible : jamais pertinent");
});

test("le bouton est refusé sous 90 mg/dL — et quand la glycémie est inconnue", () => {
  // À la fin de sa course Ethan était à 68 mg/dL. C'est l'heure du risque
  // d'hypoglycémie tardive : le rappel informe, il n'ordonne pas.
  assert.equal(isAppointBlockedByGlucose(68, true), true, "68 mg/dL : bloqué");
  assert.equal(isAppointBlockedByGlucose(89, true), true, "89 : bloqué");
  assert.equal(isAppointBlockedByGlucose(90, true), false, "90 : passe");
  assert.equal(isAppointBlockedByGlucose(103, true), false, "103 (sa courbe à 16h30) : passe");
  assert.equal(isAppointBlockedByGlucose(210, true), false, "210 : passe");

  // Capteur en panne : l'absence de mesure n'est pas une mesure rassurante.
  assert.equal(isAppointBlockedByGlucose(null, true), true);
  assert.equal(isAppointBlockedByGlucose(undefined, true), true);
  assert.equal(isAppointBlockedByGlucose(NaN, true), true);

  // Pas encore dû : la glycémie qui compte est celle de l'heure du rappel.
  assert.equal(isAppointBlockedByGlucose(68, false), false);
  assert.equal(isAppointBlockedByGlucose(null, false), false);
});
