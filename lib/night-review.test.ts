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
