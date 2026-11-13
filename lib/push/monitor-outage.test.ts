import { test } from "node:test";
import assert from "node:assert/strict";
import { assessMonitor } from "./monitor-outage";

const NOW = 1_800_000_000_000;
const MIN = 60_000;

test("tout va bien, rien n'avait été annoncé → silence", () => {
  const r = assessMonitor({}, true, NOW);
  assert.equal(r.action, "none");
  assert.deepEqual(r.next, {});
});

test("premier passage sans mesure : on note le début, on ne notifie pas encore", () => {
  const r = assessMonitor({}, false, NOW);
  assert.equal(r.action, "none");
  assert.equal(r.next.downSince, NOW);
});

test("un accroc de 10 minutes ne dérange personne", () => {
  const r = assessMonitor({ downSince: NOW - 10 * MIN }, false, NOW);
  assert.equal(r.action, "none");
});

test("30 minutes sans mesure → une notification", () => {
  const r = assessMonitor({ downSince: NOW - 30 * MIN }, false, NOW);
  assert.equal(r.action, "notify-down");
  assert.equal(r.next.notifiedAt, NOW);
  assert.equal(Math.round(r.downMinutes), 30);
});

test("déjà prévenu il y a 20 minutes → pas de rafale", () => {
  const r = assessMonitor({ downSince: NOW - 50 * MIN, notifiedAt: NOW - 20 * MIN }, false, NOW);
  assert.equal(r.action, "none");
  assert.equal(r.next.notifiedAt, NOW - 20 * MIN);
});

test("toujours en panne 3 h après la notification → un rappel", () => {
  const r = assessMonitor({ downSince: NOW - 210 * MIN, notifiedAt: NOW - 180 * MIN }, false, NOW);
  assert.equal(r.action, "notify-down");
});

test("retour après une panne annoncée → on le dit, et l'état repart de zéro", () => {
  const r = assessMonitor({ downSince: NOW - 60 * MIN, notifiedAt: NOW - 30 * MIN }, true, NOW);
  assert.equal(r.action, "notify-back");
  assert.deepEqual(r.next, {});
});

test("retour après un simple accroc non annoncé → silence", () => {
  const r = assessMonitor({ downSince: NOW - 10 * MIN }, true, NOW);
  assert.equal(r.action, "none");
  assert.deepEqual(r.next, {});
});

test("mesure qui vieillit : la panne commence à la dernière mesure, pas à sa découverte", () => {
  // Le cron découvre une mesure vieille de 35 min : on prévient tout de suite.
  const r = assessMonitor({}, false, NOW, NOW - 35 * MIN);
  assert.equal(r.action, "notify-down");
  assert.equal(r.next.downSince, NOW - 35 * MIN);
});

test("une date de mesure dans le futur est ignorée", () => {
  const r = assessMonitor({}, false, NOW, NOW + 60 * MIN);
  assert.equal(r.next.downSince, NOW);
});
