import { test } from "node:test";
import assert from "node:assert/strict";
import { assessGoal, estimatedA1c, meanForA1c, type GoalPoint } from "./glycemic-goal";

const MIN = 60_000;
const DAY = 86_400_000;
const NOW = new Date(2026, 10, 9, 12, 0, 0, 0).getTime();

function curve(days: number, valueAt: (t: number) => number): GoalPoint[] {
  const out: GoalPoint[] = [];
  for (let t = NOW - days * DAY; t <= NOW; t += 15 * MIN) out.push({ t, value: valueAt(t) });
  return out;
}

test("GMI : 112 mg/dL ≈ 6,0 % et l'inverse", () => {
  assert.equal(Math.round(estimatedA1c(112.5) * 10) / 10, 6.0);
  assert.equal(Math.round(meanForA1c(6.0)), 112);
  assert.equal(Math.round(estimatedA1c(154) * 10) / 10, 7.0);
});

test("trop peu de points → aucune lecture", () => {
  const a = assessGoal({ points: curve(2, () => 120), nowMs: NOW });
  assert.equal(a.priority, "insufficient");
  assert.equal(a.estimatedA1c, null);
});

test("moyenne 110, aucune hypo → objectif tenu", () => {
  const a = assessGoal({ points: curve(14, () => 110), nowMs: NOW });
  assert.equal(a.priority, "on-target");
  assert.equal(a.estimatedA1c, 5.9);
});

test("moyenne basse MAIS 8 % du temps sous 70 → les hypos passent d'abord", () => {
  // 2 h par jour à 60 (8,3 %), le reste à 105 : moyenne ≈ 101 → GMI 5,7.
  const a = assessGoal({
    points: curve(14, (t) => {
      const h = new Date(t).getHours();
      return h >= 15 && h < 17 ? 60 : 105;
    }),
    nowMs: NOW,
  });
  assert.equal(a.priority, "hypos-first");
  assert.ok((a.timeBelow70Pct ?? 0) >= 8);
  assert.equal(a.worstLowSlot?.startHour, 15);
  assert.match(a.detail, /15 h-18 h/);
});

test("peu de temps sous 70 mais 1,5 % sous 54 → les hypos passent d'abord", () => {
  let i = 0;
  const a = assessGoal({
    points: curve(14, () => (i++ % 66 === 0 ? 50 : 130)),
    nowMs: NOW,
  });
  assert.equal(a.priority, "hypos-first");
});

test("moyenne 150 sans hypo → baisser la moyenne, et dire où", () => {
  const a = assessGoal({
    points: curve(14, (t) => {
      const h = new Date(t).getHours();
      return h >= 12 && h < 15 ? 210 : 141;
    }),
    nowMs: NOW,
  });
  assert.equal(a.priority, "lower-mean");
  assert.equal(a.worstHighSlot?.startHour, 12);
  assert.match(a.detail, /12 h-15 h/);
  assert.ok((a.estimatedA1c ?? 0) > 6.0);
});

test("la fenêtre ignore les points plus vieux que `days`", () => {
  const old = curve(30, (t) => (t < NOW - 14 * DAY ? 300 : 110));
  const a = assessGoal({ points: old, nowMs: NOW, days: 14 });
  assert.equal(a.mean, 110);
});
