/**
 * Tests des nuits exclues : clé de nuit locale et filtrage des points.
 *
 * Dates construites avec le constructeur local (mois 9 = octobre) pour que
 * les tests passent quel que soit le fuseau de la machine.
 *
 * Run: npm test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  nightKeyFor,
  excludedNightKeys,
  filterExcludedNightPoints,
  pendingMorningReview,
  shouldWriteNightLog,
} from "./night-review";

const ms = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

test("nightKeyFor : le soir et la nuit appartiennent au même jour, l'après-midi au sien", () => {
  assert.equal(nightKeyFor(ms(27, 23, 30)), "2026-10-27");
  assert.equal(nightKeyFor(ms(28, 1, 30)), "2026-10-27");
  assert.equal(nightKeyFor(ms(28, 13, 0)), "2026-10-28");
});

test("nightKeyFor : zéro-padding sur les jours et mois à un chiffre", () => {
  assert.equal(nightKeyFor(new Date(2026, 0, 5, 20, 0).getTime()), "2026-01-05");
  assert.equal(nightKeyFor(new Date(2026, 0, 1, 3, 0).getTime()), "2025-12-31");
});

test("excludedNightKeys : ne garde que les nuits non comptées", () => {
  const set = excludedNightKeys([
    { night: "2026-10-27", counted: false },
    { night: "2026-10-26", counted: true },
  ]);
  assert.deepEqual([...set], ["2026-10-27"]);
});

test("filterExcludedNightPoints : retire 18h-12h de la nuit exclue seulement", () => {
  const pts = [
    { t: ms(27, 22, 0) },
    { t: ms(28, 6, 0) },
    { t: ms(27, 15, 0) },
    { t: ms(28, 14, 0) },
  ];
  const out = filterExcludedNightPoints(pts, new Set(["2026-10-27"]));
  assert.deepEqual(
    out.map((p) => p.t),
    [ms(27, 15, 0), ms(28, 14, 0)],
  );
});

test("filterExcludedNightPoints : aucune exclusion = identique", () => {
  const pts = [{ t: ms(27, 22, 0) }];
  assert.deepEqual(filterExcludedNightPoints(pts, new Set()), pts);
});

import { upsertNightLog, NIGHT_LOG_VERSION } from "./night-review";
import type { NightPredictionRecord } from "./night-calibration";

// ── upsertNightLog ──

function rec(id: string, createdAt: Date, extra: Partial<NightPredictionRecord> = {}): NightPredictionRecord {
  return {
    id,
    createdAt: createdAt.toISOString(),
    predictedWakeupGlucose: 110,
    wakeupAtMs: createdAt.getTime() + 8 * 3600_000,
    ...extra,
  };
}

test("même nuit non résolue : remplacée, une seule entrée", () => {
  const a = rec("a", new Date(2026, 9, 27, 21, 0));
  const b = rec("b", new Date(2026, 9, 27, 23, 30), { version: NIGHT_LOG_VERSION });
  const out = upsertNightLog([a], b);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "b");
});

test("nuit différente : ajoutée en tête", () => {
  const a = rec("a", new Date(2026, 9, 26, 23, 0));
  const b = rec("b", new Date(2026, 9, 27, 23, 0));
  const out = upsertNightLog([a], b);
  assert.deepEqual(out.map((r) => r.id), ["b", "a"]);
});

test("entrée résolue jamais écrasée", () => {
  const a = rec("a", new Date(2026, 9, 27, 21, 0), { actualWakeupGlucose: 100, errorMgDl: -10 });
  const b = rec("b", new Date(2026, 9, 27, 23, 30));
  const out = upsertNightLog([a], b);
  assert.equal(out.length, 2);
  assert.equal(out.find((r) => r.id === "a")?.actualWakeupGlucose, 100);
});

test("passé minuit : même nuit que le soir", () => {
  const a = rec("a", new Date(2026, 9, 27, 22, 0));
  const b = rec("b", new Date(2026, 9, 28, 0, 30));
  assert.equal(upsertNightLog([a], b).length, 1);
});

test("plafond à 60", () => {
  const logs = Array.from({ length: 60 }, (_, i) => rec(`n${i}`, new Date(2026, 7, 1 + i, 23, 0)));
  const out = upsertNightLog(logs, rec("new", new Date(2026, 11, 1, 23, 0)));
  assert.equal(out.length, 60);
  assert.equal(out[0].id, "new");
});

test("pendingMorningReview : 5h-12h, nuit de la veille sans avis", () => {
  assert.equal(pendingMorningReview(ms(28, 8, 0), []), "2026-10-27");
  assert.equal(pendingMorningReview(ms(28, 5, 0), []), "2026-10-27");
  assert.equal(pendingMorningReview(ms(28, 11, 59), []), "2026-10-27");
  assert.equal(pendingMorningReview(ms(28, 4, 59), []), null);
  assert.equal(pendingMorningReview(ms(28, 12, 0), []), null);
  assert.equal(
    pendingMorningReview(ms(28, 8, 0), [{ night: "2026-10-27", counted: false }]),
    null,
  );
  assert.equal(
    pendingMorningReview(ms(28, 8, 0), [{ night: "2026-10-26", counted: true }]),
    "2026-10-27",
  );
});

// ─── shouldWriteNightLog (throttle du log de réveil) ──────────────────

const wlog = (createdMs: number, predicted: number, actual?: number) => ({
  id: `r${createdMs}`,
  createdAt: new Date(createdMs).toISOString(),
  predictedWakeupGlucose: predicted,
  wakeupAtMs: createdMs + 7 * 3_600_000,
  version: 2,
  ...(actual !== undefined ? { actualWakeupGlucose: actual } : {}),
});

test("shouldWriteNightLog : aucun log pour la nuit en cours -> écrire", () => {
  assert.equal(shouldWriteNightLog([], 120, ms(28, 22)), true);
  // Log non résolu d'une AUTRE nuit : ne compte pas.
  assert.equal(shouldWriteNightLog([wlog(ms(27, 22), 120)], 120, ms(28, 22)), true);
  // Log de cette nuit déjà résolu : ne compte pas non plus.
  assert.equal(shouldWriteNightLog([wlog(ms(28, 21, 55), 120, 118)], 120, ms(28, 22)), true);
});

test("shouldWriteNightLog : dernière écriture ≥ 15 min -> écrire", () => {
  assert.equal(shouldWriteNightLog([wlog(ms(28, 21, 45), 120)], 120, ms(28, 22)), true);
  assert.equal(shouldWriteNightLog([wlog(ms(28, 21, 46), 120)], 120, ms(28, 22)), false);
});

test("shouldWriteNightLog : prédiction bougée de ≥ 5 mg/dL -> écrire, sinon non", () => {
  const logs = [wlog(ms(28, 21, 55), 120)];
  assert.equal(shouldWriteNightLog(logs, 125, ms(28, 22)), true);
  assert.equal(shouldWriteNightLog(logs, 115, ms(28, 22)), true);
  assert.equal(shouldWriteNightLog(logs, 124, ms(28, 22)), false);
  assert.equal(shouldWriteNightLog(logs, 116, ms(28, 22)), false);
  assert.equal(shouldWriteNightLog(logs, 120, ms(28, 22)), false);
});

test("shouldWriteNightLog : prédiction non finie -> jamais", () => {
  assert.equal(shouldWriteNightLog([], NaN, ms(28, 22)), false);
  assert.equal(shouldWriteNightLog([], Infinity, ms(28, 22)), false);
  assert.equal(shouldWriteNightLog([wlog(ms(28, 21), 120)], NaN, ms(28, 22)), false);
});

// ─── Coucher confirmé (« Je vais me coucher ») ─────────────────────────

import { confirmedBedtimeFor } from "./night-review";

const clog = (createdMs: number, predicted: number, extra: Partial<NightPredictionRecord> = {}) => ({
  ...wlog(createdMs, predicted),
  bedtimeConfirmed: true,
  ...extra,
});

test("shouldWriteNightLog : log confirmé de la nuit -> jamais réécrit par l'automatique", () => {
  // Même à +60 min et avec 50 mg/dL d'écart.
  assert.equal(shouldWriteNightLog([clog(ms(28, 22), 120)], 170, ms(28, 23)), false);
  // Passé minuit : toujours la même nuit.
  assert.equal(shouldWriteNightLog([clog(ms(28, 23), 120)], 70, ms(29, 0, 30)), false);
  // Confirmé d'une AUTRE nuit : ne bloque pas.
  assert.equal(shouldWriteNightLog([clog(ms(27, 23), 120)], 120, ms(28, 22)), true);
  // Confirmé déjà résolu : ne bloque pas non plus.
  assert.equal(
    shouldWriteNightLog([clog(ms(28, 21), 120, { actualWakeupGlucose: 110 })], 120, ms(28, 22)),
    true,
  );
});

test("upsertNightLog : un clic remplace le log automatique de la nuit", () => {
  const auto = rec("auto", new Date(2026, 9, 27, 21, 0));
  const click = rec("click", new Date(2026, 9, 27, 22, 30), { bedtimeConfirmed: true });
  const out = upsertNightLog([auto], click);
  assert.deepEqual(out.map((r) => r.id), ["click"]);
});

test("upsertNightLog : un nouveau clic remplace le précédent (dernier clic gagne)", () => {
  const c1 = rec("c1", new Date(2026, 9, 27, 22, 30), { bedtimeConfirmed: true });
  const c2 = rec("c2", new Date(2026, 9, 28, 0, 15), { bedtimeConfirmed: true });
  const out = upsertNightLog([c1], c2);
  assert.deepEqual(out.map((r) => r.id), ["c2"]);
});

test("upsertNightLog : l'automatique ne remplace jamais un clic", () => {
  const c1 = rec("c1", new Date(2026, 9, 27, 22, 30), { bedtimeConfirmed: true });
  const auto = rec("auto", new Date(2026, 9, 27, 23, 0));
  const other = rec("other", new Date(2026, 9, 26, 23, 0));
  const out = upsertNightLog([c1, other], auto);
  assert.deepEqual(out.map((r) => r.id), ["c1", "other"]);
});

test("confirmedBedtimeFor : le clic de la nuit en cours, y compris après minuit", () => {
  const c = clog(ms(28, 22, 40), 115);
  assert.equal(confirmedBedtimeFor([c], ms(28, 23))?.id, c.id);
  assert.equal(confirmedBedtimeFor([c], ms(29, 1, 30))?.id, c.id);
  // Log automatique de la nuit : pas un coucher confirmé.
  assert.equal(confirmedBedtimeFor([wlog(ms(28, 22), 115)], ms(28, 23)), undefined);
});

test("confirmedBedtimeFor : un clic d'une autre nuit -> undefined", () => {
  assert.equal(confirmedBedtimeFor([clog(ms(27, 23), 115)], ms(28, 22)), undefined);
  assert.equal(confirmedBedtimeFor([], ms(28, 22)), undefined);
});

// ─── Décision du clic + expiration du plan figé ───────────────────────

import {
  bedtimeDecision,
  isBedtimePlanDisplayable,
  BEDTIME_MAX_READING_AGE_MIN,
  BEDTIME_PLAN_DISPLAY_MIN,
} from "./night-review";

test("bedtimeDecision : lecture fraîche -> plan + enregistrement officiel", () => {
  assert.deepEqual(bedtimeDecision({ liveValue: 132, liveAgeMin: 3 }), {
    ok: true,
    saveOfficial: true,
  });
  // Pile 15 min : encore acceptée.
  assert.equal(bedtimeDecision({ liveValue: 132, liveAgeMin: 15 }).saveOfficial, true);
});

test("bedtimeDecision : lecture > 15 min -> plan indicatif, non enregistré", () => {
  const d = bedtimeDecision({ liveValue: 132, liveAgeMin: 22.4 });
  assert.equal(d.ok, true);
  assert.equal(d.saveOfficial, false);
  assert.equal(
    d.message,
    "Lecture capteur trop ancienne (22 min) : plan indicatif, non enregistré pour la nuit.",
  );
});

test("bedtimeDecision : lecture absente ou invalide -> pas de plan", () => {
  for (const input of [
    { liveValue: undefined, liveAgeMin: 2 },
    { liveValue: 0, liveAgeMin: 2 },
    { liveValue: NaN, liveAgeMin: 2 },
    { liveValue: 120, liveAgeMin: undefined },
    { liveValue: 120, liveAgeMin: NaN },
  ]) {
    const d = bedtimeDecision(input);
    assert.equal(d.ok, false);
    assert.equal(d.saveOfficial, false);
    assert.match(d.message ?? "", /^Pas de lecture capteur/);
  }
});

test("isBedtimePlanDisplayable : au plus 20 min après le clic", () => {
  const click = ms(28, 22, 0);
  assert.equal(BEDTIME_PLAN_DISPLAY_MIN, 20);
  assert.equal(isBedtimePlanDisplayable(click, 0, click), true);
  // Lecture du clic à 0 min : la limite des 15 min tombe avant les 20 min.
  assert.equal(isBedtimePlanDisplayable(click, 0, click + 15 * 60_000), true);
  assert.equal(isBedtimePlanDisplayable(click, 0, click + 16 * 60_000), false);
  // Le plafond de 20 min ne mord qu'en cas d'horloge décalée (âge négatif).
  assert.equal(isBedtimePlanDisplayable(click, -10, click + 20 * 60_000), true);
  assert.equal(isBedtimePlanDisplayable(click, -10, click + 21 * 60_000), false);
  // Horloge antérieure au clic : rien.
  assert.equal(isBedtimePlanDisplayable(click, 0, click - 60_000), false);
});

test("isBedtimePlanDisplayable : jusqu'à ce que la lecture ait > 15 min", () => {
  const click = ms(28, 22, 0);
  assert.equal(BEDTIME_MAX_READING_AGE_MIN, 15);
  // Lecture de 10 min au clic : expire 5 min plus tard (avant les 20 min).
  assert.equal(isBedtimePlanDisplayable(click, 10, click + 5 * 60_000), true);
  assert.equal(isBedtimePlanDisplayable(click, 10, click + 6 * 60_000), false);
  // Lecture déjà trop ancienne au clic : jamais affiché comme plan figé.
  assert.equal(isBedtimePlanDisplayable(click, 16, click), false);
  // Âge invalide : jamais.
  assert.equal(isBedtimePlanDisplayable(click, NaN, click), false);
});
