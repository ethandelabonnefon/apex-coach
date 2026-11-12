/**
 * Coordination LibreLink entre fonctions serveur — incident du 12/11/2026.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";
import { decide, newest, nextError, staleFallback, MAX_STALE_MS, type SharedEntry } from "./coordination";
import { backoffSecondsFor } from "./config";

const NOW = 1_800_000_000_000;
const TTL = 60_000;
const entry = (ageS: number, v = 120): SharedEntry<number> => ({ snapshot: v, fetchedAt: NOW - ageS * 1000 });
const base = { now: NOW, ttlMs: TTL, backoffSecondsFor };

test("une lecture partagée de 20 s sert une fonction qui démarre à froid — aucun appel Abbott", () => {
  const d = decide({ ...base, local: null, shared: entry(20), error: null });
  assert.equal(d.action, "serve");
  assert.equal(d.action === "serve" && d.stale, false);
});

test("lecture locale périmée + lecture partagée fraîche → c'est la partagée qui sert", () => {
  const d = decide({ ...base, local: entry(300, 90), shared: entry(10, 140), error: null });
  assert.equal(d.action === "serve" ? d.entry.snapshot : null, 140);
});

test("rien de frais, aucun échec en cours → on va chercher", () => {
  assert.equal(decide({ ...base, local: entry(90), shared: entry(120), error: null }).action, "fetch");
  assert.equal(decide({ ...base, local: null, shared: null, error: null }).action, "fetch");
});

test("LE test de l'incident : une fonction FROIDE respecte l'échec noté par une autre", () => {
  // Une autre fonction a échoué il y a 30 s. Celle-ci n'a rien en mémoire.
  // Avant : elle retentait un login (« échec n° 1 » à répétition).
  const error = { message: "430", status: 430, failedAt: NOW - 30_000, consecutiveFailures: 1 };
  const d = decide({ ...base, local: null, shared: null, error });
  assert.equal(d.action, "backoff");
  assert.equal(d.action === "backoff" && d.remainingS, 90);
});

test("pendant l'attente, une lecture de 5 min est resservie (signalée périmée)", () => {
  const error = { message: "430", status: 430, failedAt: NOW - 30_000, consecutiveFailures: 1 };
  const d = decide({ ...base, local: null, shared: entry(300), error });
  assert.equal(d.action, "serve");
  assert.equal(d.action === "serve" && d.stale, true);
});

test("pendant l'attente, une lecture de 40 min n'est PAS resservie", () => {
  const error = { message: "430", status: 430, failedAt: NOW - 30_000, consecutiveFailures: 1 };
  assert.equal(decide({ ...base, local: null, shared: entry(40 * 60), error }).action, "backoff");
});

test("le délai écoulé, on retente", () => {
  const error = { message: "430", status: 430, failedAt: NOW - 121_000, consecutiveFailures: 1 };
  assert.equal(decide({ ...base, local: null, shared: null, error }).action, "fetch");
});

test("le compteur monte d'une fonction à l'autre, donc le délai aussi", () => {
  const first = nextError(null, NOW, "430", 430);
  const second = nextError(first, NOW + 130_000, "430", 430);
  const third = nextError(second, NOW + 500_000, "430", 430);
  assert.deepEqual([first, second, third].map((e) => e.consecutiveFailures), [1, 2, 3]);
  // Au 3e échec, 2 min 10 après ne suffisent plus : il faut attendre 15 min.
  const d = decide({ ...base, now: third.failedAt + 130_000, local: null, shared: null, error: third });
  assert.equal(d.action, "backoff");
  assert.ok(backoffSecondsFor(third.consecutiveFailures) > 300, "au-delà de l'intervalle du cron");
});

test("un échec daté dans le futur (horloges décalées) ne bloque pas indéfiniment", () => {
  const error = { message: "x", failedAt: NOW + 60_000, consecutiveFailures: 4 };
  assert.equal(decide({ ...base, local: null, shared: null, error }).action, "fetch");
});

test("newest et staleFallback", () => {
  assert.equal(newest(entry(10, 1), entry(5, 2))?.snapshot, 2);
  assert.equal(newest(null, entry(5, 2))?.snapshot, 2);
  assert.equal(newest(null, null), null);
  assert.equal(staleFallback(entry(600), NOW)?.snapshot, 120);
  assert.equal(staleFallback(entry(MAX_STALE_MS / 1000 + 1), NOW), null);
  assert.equal(staleFallback(null, NOW), null);
});
