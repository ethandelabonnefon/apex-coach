import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildBackupPayload,
  isStoreEmpty,
  wouldWipeInsulinLogs,
  mergeRestoredState,
  backupFingerprint,
  summarizeState,
} from "./payload";

const log = (id: string) => ({ id, units: 4, injectedAt: "2026-09-19T18:00:00.000Z", mealType: "dinner" });

test("buildBackupPayload garde les données, retire GPS et photos, ignore les fonctions", () => {
  const state = {
    insulinLogs: [log("a")],
    addInsulinLog: () => {},
    completedRunningSessions: [{ id: "r1", actualDistance: 5, gpsPoints: [{ lat: 1, lon: 2 }] }],
    diagnosticHistory: [{ id: "d1", photos: ["data:image/png;base64,AAAA"], mensurations: {} }],
    diagnosticData: { photos: ["x"], completedAt: "2026-08-12" },
    muscuProgram: { sessions: [] },
  };
  const p = buildBackupPayload(state, 3, new Date("2026-09-19T20:00:00Z"));
  assert.equal(p.storeVersion, 3);
  assert.equal(p.savedAt, "2026-09-19T20:00:00.000Z");
  assert.deepEqual(p.state.insulinLogs, [log("a")]);
  assert.equal("addInsulinLog" in p.state, false);
  assert.equal("muscuProgram" in p.state, false);
  const run = (p.state.completedRunningSessions as Record<string, unknown>[])[0];
  assert.equal("gpsPoints" in run, false);
  assert.equal(run.actualDistance, 5);
  const diag = (p.state.diagnosticHistory as Record<string, unknown>[])[0];
  assert.deepEqual(diag.photos, []);
  assert.deepEqual((p.state.diagnosticData as Record<string, unknown>).photos, []);
  // l'entrée n'est pas mutée
  assert.equal(state.completedRunningSessions[0].gpsPoints.length, 1);
  assert.equal(p.summary.insulinLogs, 1);
  assert.equal(p.summary.runningSessions, 1);
});

test("isStoreEmpty : vide seulement sans injection, glucide ni hypo", () => {
  assert.equal(isStoreEmpty({}), true);
  assert.equal(isStoreEmpty({ insulinLogs: [], carbEntries: [], hypoEvents: [] }), true);
  assert.equal(isStoreEmpty({ insulinLogs: [log("a")] }), false);
  assert.equal(isStoreEmpty({ carbEntries: [{ id: "c" }] }), false);
  assert.equal(isStoreEmpty({ hypoEvents: [{ id: "h" }] }), false);
  // des ratios par défaut ne suffisent pas à conclure
  assert.equal(isStoreEmpty({ diabetesConfig: { ratios: { morning: 6.7 } }, insulinLogs: [log("a")] }), false);
});

test("wouldWipeInsulinLogs bloque 5 → 0, laisse passer 1 → 0 et 0 → 0", () => {
  const raw = (n: number) =>
    JSON.stringify({ state: { insulinLogs: Array.from({ length: n }, (_, i) => log(String(i))) }, version: 3 });
  assert.equal(wouldWipeInsulinLogs(raw(5), raw(0)), true);
  assert.equal(wouldWipeInsulinLogs(raw(2), raw(0)), true);
  assert.equal(wouldWipeInsulinLogs(raw(1), raw(0)), false);
  assert.equal(wouldWipeInsulinLogs(raw(0), raw(0)), false);
  assert.equal(wouldWipeInsulinLogs(null, raw(0)), false);
  // écriture normale (les injections restent) → jamais bloquée
  assert.equal(wouldWipeInsulinLogs(raw(5), raw(4)), false);
  assert.equal(wouldWipeInsulinLogs(raw(5), raw(6)), false);
  // prev illisible → on ne bloque pas (on ne peut rien affirmer)
  assert.equal(wouldWipeInsulinLogs("{oops", raw(0)), false);
});

test("mergeRestoredState : la sauvegarde prime sur les clés protégées, le reste est conservé", () => {
  const current = { insulinLogs: [], addInsulinLog: () => 1, uiOnly: "x", diabetesConfig: { ratios: { morning: 6.7 } } };
  const backup = { insulinLogs: [log("a")], diabetesConfig: { ratios: { morning: 10 } }, ignored: "y" };
  const merged = mergeRestoredState(current, backup);
  assert.deepEqual(merged.insulinLogs, [log("a")]);
  assert.deepEqual(merged.diabetesConfig, { ratios: { morning: 10 } });
  assert.equal(merged.uiOnly, "x");
  assert.equal(typeof merged.addInsulinLog, "function");
  assert.equal("ignored" in merged, false);
});

test("backupFingerprint change quand les données changent, pas quand la date change", () => {
  const a = buildBackupPayload({ insulinLogs: [log("a")] }, 3, new Date("2026-09-19T20:00:00Z"));
  const b = buildBackupPayload({ insulinLogs: [log("a")] }, 3, new Date("2026-09-19T21:00:00Z"));
  const c = buildBackupPayload({ insulinLogs: [log("a"), log("b")] }, 3, new Date("2026-09-19T20:00:00Z"));
  assert.equal(backupFingerprint(a), backupFingerprint(b));
  assert.notEqual(backupFingerprint(a), backupFingerprint(c));
  assert.deepEqual(summarizeState(c.state).insulinLogs, 2);
});
