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
