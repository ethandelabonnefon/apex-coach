import test from "node:test";
import assert from "node:assert/strict";
import {
  reconcileWithWhoop,
  unconfirmedSessions,
  RECONCILE_TOLERANCE_MIN,
  UNCONFIRMED_AFTER_MIN,
  type WhoopWorkoutSummary,
} from "./whoop-reconcile";
import type { DeclaredSportSession } from "@/types";

// Note : la forme réelle de `lastWorkout` (hooks/useWhoop.ts) utilise
// `startedAt`/`endedAt`, pas `start`/`end` comme le plan l'imaginait — les
// tests suivent le code réel.

const start = Date.UTC(2026, 8, 7, 18, 0, 0);

function session(over: Partial<DeclaredSportSession> = {}): DeclaredSportSession {
  return {
    id: "s1",
    sportKey: "padel",
    family: "intermittent",
    startAt: new Date(start).toISOString(),
    plannedDurationMin: 90,
    createdAt: new Date(start - 3600_000).toISOString(),
    ...over,
  };
}

function whoop(over: Partial<WhoopWorkoutSummary> = {}): WhoopWorkoutSummary {
  return {
    id: "w1",
    startedAt: new Date(start + 5 * 60_000).toISOString(),
    endedAt: new Date(start + 70 * 60_000).toISOString(),
    ...over,
  };
}

test("une séance Whoop recouvrant la fenêtre déclarée la complète", () => {
  const r = reconcileWithWhoop([session()], whoop(), start + 3 * 3600_000);
  assert.equal(r?.sessionId, "s1");
  assert.equal(r?.updates.actualDurationMin, 65);
  assert.equal(r?.updates.whoopWorkoutId, "w1");
});

test("une séance Whoop trop éloignée ne rapproche rien (tolérance temporelle)", () => {
  const farWhoop = whoop({
    startedAt: new Date(start + 8 * 3600_000).toISOString(),
    endedAt: new Date(start + 9 * 3600_000).toISOString(),
  });
  assert.equal(reconcileWithWhoop([session()], farWhoop, start + 10 * 3600_000), null);
});

test("discriminance tolérance : juste dans la fenêtre passe, juste hors fenêtre échoue", () => {
  const nowMs = start + 5 * 3600_000;
  const justInside = whoop({
    startedAt: new Date(start + RECONCILE_TOLERANCE_MIN * 60_000).toISOString(),
    endedAt: new Date(start + (RECONCILE_TOLERANCE_MIN + 30) * 60_000).toISOString(),
  });
  const justOutside = whoop({
    startedAt: new Date(start + (RECONCILE_TOLERANCE_MIN + 1) * 60_000).toISOString(),
    endedAt: new Date(start + (RECONCILE_TOLERANCE_MIN + 31) * 60_000).toISOString(),
  });
  assert.ok(reconcileWithWhoop([session()], justInside, nowMs) !== null, "dans la tolérance : rapproché");
  assert.equal(reconcileWithWhoop([session()], justOutside, nowMs), null, "hors tolérance : jamais rapproché");
});

test("idempotence : une séance déjà réconciliée n'est pas rapprochée deux fois", () => {
  const already = session({ whoopWorkoutId: "w-old", actualDurationMin: 65 });
  const r = reconcileWithWhoop([already], whoop(), start + 3 * 3600_000);
  assert.equal(r, null, "une séance avec whoopWorkoutId ne doit plus jamais être candidate");
});

test("discriminance idempotence : rejouer reconcileWithWhoop sur le résultat précédent ne change rien", () => {
  // Simule le useEffect qui tourne toutes les 5min avec le même snapshot.
  let current = session();
  const w = whoop();
  const first = reconcileWithWhoop([current], w, start + 3 * 3600_000);
  assert.ok(first !== null);
  current = { ...current, ...first!.updates };
  const second = reconcileWithWhoop([current], w, start + 4 * 3600_000);
  assert.equal(second, null, "le rejeu ne doit produire aucune 2e écriture");
});

test("une séance annulée n'est jamais rapprochée, même si les heures collent", () => {
  const cancelled = session({ cancelledAt: new Date(start).toISOString() });
  const r = reconcileWithWhoop([cancelled], whoop(), start + 3 * 3600_000);
  assert.equal(r, null, "une séance annulée reste hors-jeu pour Whoop aussi");
});

test("pas de workout Whoop → rien à rapprocher, pas de crash", () => {
  assert.equal(reconcileWithWhoop([session()], null, start), null);
  assert.equal(reconcileWithWhoop([session()], undefined, start), null);
});

test("dates invalides gérées sans planter (côté séance déclarée)", () => {
  const bad = session({ startAt: "n'importe-quoi" });
  assert.equal(reconcileWithWhoop([bad], whoop(), start + 3600_000), null);
});

test("dates invalides gérées sans planter (côté Whoop)", () => {
  const badWhoop = whoop({ startedAt: "pas-une-date" });
  assert.equal(reconcileWithWhoop([session()], badWhoop, start + 3600_000), null);
});

test("workout Whoop dont la fin est dans le futur est ignoré (skew d'horloge)", () => {
  const futureEnd = whoop({ endedAt: new Date(start + 24 * 3600_000).toISOString() });
  assert.equal(reconcileWithWhoop([session()], futureEnd, start), null);
});

test("choisit la séance déclarée la plus proche quand plusieurs sont candidates", () => {
  const near = session({ id: "near", startAt: new Date(start + 5 * 60_000).toISOString() });
  const far = session({ id: "far", startAt: new Date(start + 40 * 60_000).toISOString() });
  const r = reconcileWithWhoop([far, near], whoop(), start + 3 * 3600_000);
  assert.equal(r?.sessionId, "near");
});

// ─── unconfirmedSessions ────────────────────────────────────────────────

test("discriminance non-suppression : une séance non confirmée est SIGNALÉE, jamais retirée de la liste source", () => {
  const s = session();
  const sessions = [s];
  const flagged = unconfirmedSessions(sessions, true, start + (s.plannedDurationMin + UNCONFIRMED_AFTER_MIN + 10) * 60_000);
  assert.equal(flagged.length, 1);
  assert.equal(flagged[0].id, s.id);
  // La fonction ne mute jamais le tableau d'entrée — la séance existe encore.
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].id, s.id);
});

test("une séance encore récente (< 180min après la fin) n'est pas signalée", () => {
  const nowMs = start + (90 + 60) * 60_000; // 60min après la fin prévue (90min)
  const flagged = unconfirmedSessions([session()], true, nowMs);
  assert.equal(flagged.length, 0);
});

test("Whoop non connecté : jamais de signalement, même vieille séance", () => {
  const nowMs = start + 24 * 3600_000;
  assert.equal(unconfirmedSessions([session()], false, nowMs).length, 0);
});

test("une séance annulée n'est jamais signalée comme non confirmée", () => {
  const cancelled = session({ cancelledAt: new Date(start).toISOString() });
  const nowMs = start + 24 * 3600_000;
  assert.equal(unconfirmedSessions([cancelled], true, nowMs).length, 0);
});

test("une séance déjà confirmée par Whoop n'est jamais signalée", () => {
  const confirmed = session({ whoopWorkoutId: "w1", actualDurationMin: 65 });
  const nowMs = start + 24 * 3600_000;
  assert.equal(unconfirmedSessions([confirmed], true, nowMs).length, 0);
});

test("unconfirmedSessions gère une date de début invalide sans planter", () => {
  const bad = session({ startAt: "invalide" });
  assert.equal(unconfirmedSessions([bad], true, start + 24 * 3600_000).length, 0);
});

test("la durée réelle (Whoop) prime sur la durée prévue pour juger si la séance est terminée depuis longtemps", () => {
  // Séance déclarée 90min mais sans whoopWorkoutId (edge case théorique :
  // actualDurationMin renseigné sans confirmation Whoop) — le calcul de fin
  // doit utiliser actualDurationMin comme le fait findMostRecentExercise.
  const s = session({ actualDurationMin: 30 });
  const nowMs = start + (30 + UNCONFIRMED_AFTER_MIN + 5) * 60_000;
  assert.equal(unconfirmedSessions([s], true, nowMs).length, 1);
});
