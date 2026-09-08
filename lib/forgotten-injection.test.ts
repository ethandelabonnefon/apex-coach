import test from "node:test";
import assert from "node:assert/strict";
import {
  buildForgottenInjectionDate,
  normalizeForgottenUnits,
} from "./forgotten-injection";

/** Mardi 8 septembre 2026, 22h00 locales. */
const NOW = new Date(2026, 8, 8, 22, 0, 0).getTime();

test("une heure passée du jour est acceptée et datée correctement", () => {
  const r = buildForgottenInjectionDate("today", "07:00", NOW);
  assert.ok(r.ok, `attendu accepté, reçu ${JSON.stringify(r)}`);
  if (!r.ok) return;
  assert.equal(r.at.getHours(), 7);
  assert.equal(r.at.getMinutes(), 0);
  assert.equal(r.at.getDate(), 8, "même jour");
  assert.equal(r.at.getSeconds(), 0, "secondes remises à zéro");
});

test("« hier » recule bien d'un jour", () => {
  const r = buildForgottenInjectionDate("yesterday", "19:30", NOW);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.at.getDate(), 7);
  assert.equal(r.at.getHours(), 19);
});

test("une heure du jour pas encore atteinte est refusée", () => {
  // Il est 22h00 : 23h30 n'est pas encore passée.
  const r = buildForgottenInjectionDate("today", "23:30", NOW);
  assert.equal(r.ok, false, "une injection dans le futur n'a aucun sens");
  if (!r.ok) assert.match(r.error, /pas encore passée/);
});

test("le format de l'heure est validé strictement", () => {
  for (const bad of ["7:00", "25:00", "12:60", "", "abc", "12h30", "12:0"]) {
    const r = buildForgottenInjectionDate("today", bad, NOW);
    assert.equal(r.ok, false, `« ${bad} » doit être refusé`);
  }
});

test("le choix fermé aujourd'hui/hier borne l'ancienneté à moins de 48 h", () => {
  // C'est le choix fermé du jour — et lui seul — qui borne l'ancienneté :
  // le jour est toujours calculé relativement à l'instant courant. Ce test
  // documente cette propriété et échouera si quelqu'un remplace le toggle
  // par un sélecteur de date libre sans ajouter de limite explicite.
  for (let h = 0; h < 24; h++) {
    for (const day of ["today", "yesterday"] as const) {
      const now = new Date(2026, 8, 8, h, 30, 0).getTime();
      const r = buildForgottenInjectionDate(day, "00:00", now);
      if (!r.ok) continue; // heure future refusée, cas légitime
      const ageHours = (now - r.at.getTime()) / 3_600_000;
      assert.ok(
        ageHours < 48,
        `${day} à 00:00 depuis ${h}h30 donne ${ageHours}h — la borne implicite saute`,
      );
    }
  }
});

test("les unités sont arrondies à la demi-unité et bornées", () => {
  assert.equal(normalizeForgottenUnits(1), 1);
  assert.equal(normalizeForgottenUnits(1.2), 1);
  assert.equal(normalizeForgottenUnits(1.3), 1.5);
  assert.equal(normalizeForgottenUnits(0), null, "zéro unité n'est pas une injection");
  assert.equal(normalizeForgottenUnits(-2), null);
  assert.equal(normalizeForgottenUnits(31), null, "au-delà du plafond, refus");
  assert.equal(normalizeForgottenUnits(Number.NaN), null);
});
