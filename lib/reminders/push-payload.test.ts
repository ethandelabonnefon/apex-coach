/**
 * Tests du constructeur de payload push par nature de rappel.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { buildReminderPush } from "./push-payload";
import type { Reminder } from "@/types";

function reminder(over: Partial<Reminder> = {}): Reminder {
  return {
    id: "r1",
    parentInjectionId: "inj1",
    units: 4,
    triggerAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: "pending",
    ...over,
  };
}

test("split : titre et corps de rappel de 2e dose", () => {
  const p = buildReminderPush(reminder({ kind: "split", mealLabel: "pâtes" }));
  assert.equal(p.type, "split");
  assert.match(p.title, /split/i);
  assert.match(p.body, /4U/);
  assert.match(p.body, /pâtes/);
  assert.equal(p.tag, "split-r1");
  assert.equal(p.url, "/diabete");
});

test("kind absent (rappel legacy) → traité comme un split", () => {
  const p = buildReminderPush(reminder());
  assert.equal(p.type, "split");
});

test("meal-confirm : demande de confirmation des glucides", () => {
  const p = buildReminderPush(
    reminder({ kind: "meal-confirm", carbsEstimated: 100, units: 10 }),
  );
  assert.equal(p.type, "meal-confirm");
  assert.match(p.body, /100/);
  assert.equal(p.tag, "meal-confirm-r1");
});

test("retard : mentionné si le rappel a plus de 5 min", () => {
  const late = new Date(Date.now() - 20 * 60_000).toISOString();
  const p = buildReminderPush(reminder({ kind: "split", triggerAt: late }));
  assert.match(p.body, /20 min/);
});

// ───────────────────────────────────────────────────────────────────────
// Appoint post-séance (sept. 2026)
// ───────────────────────────────────────────────────────────────────────

test("appoint post-séance : la notif nomme le sport et renvoie à l'app", () => {
  const push = buildReminderPush({
    id: "ps-s1",
    kind: "post-session",
    parentInjectionId: "s1",
    units: 4,
    triggerAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    mealLabel: "course à pied",
    status: "pending",
  });
  assert.equal(push.type, "post-session");
  assert.equal(push.value, 4);
  assert.match(push.body, /course à pied/);
  assert.match(push.body, /4U/);
  // Le corps ne doit PAS dire « injecte » sèchement : la glycémie est
  // relue dans l'app, et sous 90 mg/dL le bouton n'est pas offert.
  assert.match(push.body, /vérifie ta glycémie/i);
  assert.equal(push.tag, "post-session-ps-s1");
});

test("appoint post-séance sans nom de sport : le corps reste lisible", () => {
  const push = buildReminderPush({
    id: "ps-s2",
    kind: "post-session",
    parentInjectionId: "s2",
    units: 2,
    triggerAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    status: "pending",
  });
  assert.match(push.body, /ta séance/);
  assert.doesNotMatch(push.body, /undefined/);
});
