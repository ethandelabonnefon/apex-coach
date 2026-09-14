import test from "node:test";
import assert from "node:assert/strict";
import { SPORTS, getSport } from "./sports";

test("chaque sport a une famille connue et une durée par défaut positive", () => {
  const families = new Set(["running", "cardio-other", "intermittent", "muscu"]);
  assert.ok(SPORTS.length >= 12, `attendu au moins 12 sports, reçu ${SPORTS.length}`);
  for (const s of SPORTS) {
    assert.ok(families.has(s.family), `${s.key} : famille inconnue ${s.family}`);
    assert.ok(s.defaultDurationMin > 0, `${s.key} : durée par défaut invalide`);
    assert.ok(s.label.length > 0, `${s.key} : libellé manquant`);
  }
});

test("les sports nommés par Ethan sont présents et bien classés", () => {
  assert.equal(getSport("football")?.family, "intermittent");
  assert.equal(getSport("padel")?.family, "intermittent");
  assert.equal(getSport("course")?.family, "running");
  assert.equal(getSport("musculation")?.family, "muscu");
});

test("les clés sont uniques", () => {
  assert.equal(new Set(SPORTS.map((s) => s.key)).size, SPORTS.length);
});

// ───────────────────────────────────────────────────────────────────────
// État du briefing : quelle séance afficher, peut-on en déclarer une autre
// (bug du 14 sept. 2026)
// ───────────────────────────────────────────────────────────────────────

import { resolveBriefingSessionState, BRIEFING_CARD_WINDOW_MS } from "./sports";
import type { DeclaredSportSession } from "@/types";

const NOW = Date.UTC(2026, 8, 14, 18, 0, 0);

/** Séance de 45 min dont la fin est à `endOffsetMin` minutes de NOW (négatif = passée). */
function sess(endOffsetMin: number, over: Partial<DeclaredSportSession> = {}): DeclaredSportSession {
  const end = NOW + endOffsetMin * 60_000;
  return {
    id: over.id ?? `s${endOffsetMin}`,
    sportKey: "course",
    family: "running",
    startAt: new Date(end - 45 * 60_000).toISOString(),
    plannedDurationMin: 45,
    createdAt: new Date(end - 60 * 60_000).toISOString(),
    ...over,
  };
}

test("LE bug du 14 septembre : une séance confirmée et finie ne bloque plus le formulaire", () => {
  // Course confirmée par Whoop, terminée il y a 1 h. La carte doit rester
  // (info « prise en compte »), mais Ethan doit pouvoir déclarer la suivante.
  const done = sess(-60, { whoopWorkoutId: "w1", actualDurationMin: 39 });
  const r = resolveBriefingSessionState([done], NOW);
  assert.equal(r.shown?.id, done.id, "la carte reste visible pendant la fenêtre d'ajustement");
  assert.equal(r.canDeclare, true, "le formulaire doit être disponible : la séance est finie");
});

test("une séance non confirmée mais finie libère aussi le formulaire — et garde son annulation", () => {
  const done = sess(-60);
  const r = resolveBriefingSessionState([done], NOW);
  assert.equal(r.shown?.id, done.id);
  assert.equal(r.canDeclare, true);
});

test("une séance encore en cours bloque la déclaration d'une autre", () => {
  const running = sess(+20); // finit dans 20 min
  const r = resolveBriefingSessionState([running], NOW);
  assert.equal(r.shown?.id, running.id);
  assert.equal(r.canDeclare, false, "on ne déclare pas une 2e séance pendant la 1re");
});

test("une séance à venir bloque aussi — elle s'annule d'abord", () => {
  const upcoming = sess(+120); // commence dans 75 min
  const r = resolveBriefingSessionState([upcoming], NOW);
  assert.equal(r.shown?.id, upcoming.id);
  assert.equal(r.canDeclare, false);
});

test("sans séance, ou séance annulée : rien à afficher, déclaration libre", () => {
  assert.deepEqual(resolveBriefingSessionState([], NOW), { shown: null, canDeclare: true });
  const cancelled = sess(-60, { cancelledAt: new Date(NOW - 30 * 60_000).toISOString() });
  assert.deepEqual(resolveBriefingSessionState([cancelled], NOW), { shown: null, canDeclare: true });
});

test("au-delà de la fenêtre d'ajustement, la carte disparaît", () => {
  const old = sess(-(BRIEFING_CARD_WINDOW_MS / 60_000) - 1);
  const r = resolveBriefingSessionState([old], NOW);
  assert.equal(r.shown, null);
  assert.equal(r.canDeclare, true);
});

test("deux séances le même jour : la plus récente est affichée (store trié du plus récent au plus ancien)", () => {
  const morning = sess(-8 * 60, { id: "matin", whoopWorkoutId: "w-am" });
  const evening = sess(+30, { id: "soir" });
  // Le store insère en tête : [soir, matin].
  const r = resolveBriefingSessionState([evening, morning], NOW);
  assert.equal(r.shown?.id, "soir");
  assert.equal(r.canDeclare, false, "la séance du soir est en cours");
});

test("une séance illisible est ignorée sans planter", () => {
  const broken = sess(-60, { startAt: "pas une date" });
  const r = resolveBriefingSessionState([broken], NOW);
  assert.equal(r.shown, null);
  assert.equal(r.canDeclare, true);
});
