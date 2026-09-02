/**
 * Tests de la règle « pic post-repas » du pattern engine.
 *
 * Cette règle produit une suggestion de DOSE (« pré-doser 15 min avant, ou
 * +0,1U/10g ») qui remonte au Docteur via `detectedPatterns`. Elle ne doit
 * donc compter que des repas dont la quantité est connue : un pic après un
 * repas de quantité inconnue ne prouve pas que le ratio est trop faible.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import { detectPatterns } from "./pattern-engine";
import type { ArchivedPoint } from "./store";
import type { DiabetesConfig, InsulinLog } from "@/types";

const NOW = new Date("2026-09-02T12:00:00").getTime();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const CONFIG = {} as DiabetesConfig;

function meal(daysAgo: number, over: Partial<InsulinLog> = {}): InsulinLog {
  return {
    id: `m-${daysAgo}`,
    units: 8,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams: 80,
    glucoseBefore: 120,
    notes: "",
    injectedAt: new Date(NOW - daysAgo * DAY),
    ...over,
  };
}

/** Un pic à 260 mg/dL une heure après chaque repas. */
function spikes(meals: InsulinLog[]): ArchivedPoint[] {
  return meals.map((m) => ({
    t: new Date(m.injectedAt).getTime() + HOUR,
    value: 260,
    trend: "Flat",
    isHigh: true,
    isLow: false,
  }));
}

const THREE = [meal(1), meal(2), meal(3)];

test("post-meal-spike : 3 repas connus avec pic > 220 → pattern détecté", () => {
  const found = detectPatterns(spikes(THREE), THREE, CONFIG, NOW).find(
    (p) => p.type === "post-meal-spike",
  );
  assert.ok(found, "le pattern doit être détecté sur des repas connus");
  assert.equal(found.occurrences, 3);
});

test("post-meal-spike : les repas à quantité incertaine ne comptent pas", () => {
  // Même série, mais déclarée « je ne sais pas combien j'ai mangé » :
  // le pic ne dit rien du ratio, il dit peut-être juste qu'Ethan a mangé
  // plus que ce pour quoi il s'est injecté. Ce test échoue si le filtre
  // `isLearnable` disparaît.
  const uncertain = THREE.map((m) => ({ ...m, carbsUncertain: true }));
  const found = detectPatterns(spikes(uncertain), uncertain, CONFIG, NOW).find(
    (p) => p.type === "post-meal-spike",
  );
  assert.equal(found, undefined);
});

test("post-meal-spike : les glucides confirmés font foi", () => {
  // Injection loggée à 0 g estimé puis confirmée à 80 g : le repas doit
  // entrer dans la règle (il en sortait avec `inj.carbsGrams > 0`).
  const confirmed = THREE.map((m) => ({
    ...m,
    carbsGrams: 0,
    carbsConfirmedGrams: 80,
  }));
  const found = detectPatterns(spikes(confirmed), confirmed, CONFIG, NOW).find(
    (p) => p.type === "post-meal-spike",
  );
  assert.ok(found, "un repas confirmé après coup doit compter");
});
