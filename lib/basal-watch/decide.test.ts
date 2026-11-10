import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldNotify, adviceSignature } from "./decide";
import type { BasalAdvice } from "../basal-advisor";

const NOW = Date.UTC(2026, 10, 9, 12, 0);

function advice(status: BasalAdvice["status"], current = 24, proposed: number | null = 22): BasalAdvice {
  return {
    status,
    currentDose: current,
    proposedDose: proposed,
    headline: "",
    reasons: [],
    followUp: null,
    evidence: {
      recentEpisodes: 0,
      recentFasting: 0,
      longFasting: 0,
      recentSevereFasting: 0,
      cleanNights: 0,
      medianNightDelta: null,
      medianWakeGlucose: null,
      coverage: 1,
    },
    activity: null,
  };
}

test("rien d'actionnable → pas de notification", () => {
  for (const s of ["ok", "watch", "observing", "insufficient"] as const) {
    assert.equal(shouldNotify(advice(s, 24, null), {}, NOW, 12).notify, false);
  }
});

test("nouvelle proposition de baisse en journée → notification", () => {
  assert.equal(shouldNotify(advice("reduce"), {}, NOW, 12).notify, true);
});

test("jamais la nuit", () => {
  assert.equal(shouldNotify(advice("reduce"), {}, NOW, 3).notify, false);
  assert.equal(shouldNotify(advice("reduce"), {}, NOW, 22).notify, false);
  assert.equal(shouldNotify(advice("reduce"), {}, NOW, 7).notify, true);
});

test("même proposition déjà envoyée il y a 5 h → silence ; il y a 25 h → rappel", () => {
  const a = advice("reduce");
  const sig = adviceSignature(a);
  assert.equal(
    shouldNotify(a, { lastSignature: sig, lastNotifiedAt: NOW - 5 * 3_600_000 }, NOW, 12).notify,
    false,
  );
  assert.equal(
    shouldNotify(a, { lastSignature: sig, lastNotifiedAt: NOW - 25 * 3_600_000 }, NOW, 12).notify,
    true,
  );
});

test("la proposition change (dose appliquée puis nouvelle baisse) → notification immédiate", () => {
  const before = adviceSignature(advice("reduce", 24, 22));
  const after = advice("reduce", 22, 20);
  assert.equal(
    shouldNotify(after, { lastSignature: before, lastNotifiedAt: NOW - 3_600_000 }, NOW, 12).notify,
    true,
  );
});
