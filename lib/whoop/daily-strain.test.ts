import { test } from "node:test";
import assert from "node:assert/strict";
import { cyclesToDailyStrain } from "./daily-strain";

test("un cycle qui démarre à 23 h 30 appartient à la journée du lendemain", () => {
  // 22 h 30 UTC le 8 = 23 h 30 à Paris le 8 → journée du 9.
  const days = cyclesToDailyStrain([{ start: "2026-11-08T22:30:00.000Z", strain: 14.26 }], "Europe/Paris");
  assert.deepEqual(days, [{ day: "2026-11-09", strain: 14.3 }]);
});

test("le même cycle se range dans un autre jour selon le fuseau", () => {
  // 14 h UTC le 8 = 23 h à Tokyo le 8 → journée du 9 là-bas, du 9 aussi
  // (15 h + 12 h) à Paris : on vérifie surtout que le fuseau est bien lu.
  const cycle = [{ start: "2026-11-08T03:00:00.000Z", strain: 10 }];
  assert.equal(cyclesToDailyStrain(cycle, "Europe/Paris")[0].day, "2026-11-08");
  assert.equal(cyclesToDailyStrain(cycle, "Asia/Tokyo")[0].day, "2026-11-09");
});

test("dates illisibles ignorées, jours triés", () => {
  const days = cyclesToDailyStrain(
    [
      { start: "2026-11-09T22:00:00.000Z", strain: 16 },
      { start: "n'importe quoi", strain: 12 },
      { start: "2026-11-07T22:00:00.000Z", strain: 9 },
    ],
    "Europe/Paris",
  );
  assert.deepEqual(days.map((d) => d.day), ["2026-11-08", "2026-11-10"]);
});
