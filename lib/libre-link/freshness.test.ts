/**
 * Fraîcheur d'une mesure capteur — incident du 12/11/2026 : une glycémie
 * vieille de plusieurs dizaines de minutes était lue comme celle du moment.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { isReadingFresh, LIVE_MAX_AGE_MIN } from "./utils";

const NOW = Date.UTC(2026, 10, 12, 13, 30);
const iso = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

test("une mesure de 2 min est en direct", () => {
  assert.equal(isReadingFresh(iso(2), NOW), true);
});

test("une mesure de 15 min pile est encore en direct, 16 min ne l'est plus", () => {
  assert.equal(isReadingFresh(iso(LIVE_MAX_AGE_MIN), NOW), true);
  assert.equal(isReadingFresh(iso(LIVE_MAX_AGE_MIN + 1), NOW), false);
});

test("une mesure de 40 min — le cas de l'incident — n'est pas en direct", () => {
  assert.equal(isReadingFresh(iso(40), NOW), false);
});

test("horloges décalées : 3 min dans le futur toléré, 20 min non", () => {
  assert.equal(isReadingFresh(iso(-3), NOW), true);
  assert.equal(isReadingFresh(iso(-20), NOW), false);
});

test("date absente ou illisible → jamais « en direct »", () => {
  assert.equal(isReadingFresh(undefined, NOW), false);
  assert.equal(isReadingFresh(null, NOW), false);
  assert.equal(isReadingFresh("pas une date", NOW), false);
});
