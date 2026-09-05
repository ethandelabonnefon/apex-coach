import test from "node:test";
import assert from "node:assert/strict";
import { syncInsulinRatios } from "./ratio-sync";
import { calculateBolus } from "./insulin-calculator";
import type { InsulinRatio, DiabetesConfig } from "@/types";

const ratio = (mealKey: string, value: number): InsulinRatio => ({
  id: `r-${mealKey}-copy-abc`,
  label: mealKey,
  mealKey,
  timeStart: "12:00",
  timeEnd: "14:00",
  ratio: value,
});

test("syncInsulinRatios reporte la nouvelle valeur dans le tableau", () => {
  const existing = [ratio("morning", 10), ratio("lunch", 9.09), ratio("snack", 8.33), ratio("dinner", 7.69)];
  const out = syncInsulinRatios(existing, {
    morning: 10,
    lunch: 10.1,
    snack: 8.33,
    dinner: 7.69,
  });
  assert.equal(out.find((r) => r.mealKey === "lunch")?.ratio, 10.1);
  assert.equal(out.find((r) => r.mealKey === "morning")?.ratio, 10, "les autres créneaux ne bougent pas");
});

test("syncInsulinRatios préserve l'identité et les métadonnées existantes", () => {
  const existing = [ratio("lunch", 9.09)];
  const out = syncInsulinRatios(existing, { lunch: 10.1 });
  const lunch = out.find((r) => r.mealKey === "lunch")!;
  assert.equal(lunch.id, "r-lunch-copy-abc", "l'id ne doit pas être régénéré (collision cross-profils)");
  assert.equal(lunch.timeStart, "12:00");
});

test("syncInsulinRatios ignore une valeur inutilisable et garde l'ancienne", () => {
  const existing = [ratio("lunch", 9.09)];
  for (const bad of [0, -3, NaN, Infinity]) {
    const out = syncInsulinRatios(existing, { lunch: bad });
    assert.equal(
      out.find((r) => r.mealKey === "lunch")?.ratio,
      9.09,
      `un ratio ${bad} doit être refusé — il ferait diverger le calcul de dose`,
    );
  }
});

test("syncInsulinRatios conserve les ratios personnalisés hors des quatre créneaux", () => {
  const existing = [ratio("lunch", 9.09), ratio("nuit", 12)];
  const out = syncInsulinRatios(existing, { lunch: 10.1 });
  assert.equal(out.find((r) => r.mealKey === "nuit")?.ratio, 12);
});

// ─────────────────────────────────────────────────────────────────────
// Le test qui compte : la reproduction du bug terrain de septembre 2026.
// Écrire le ratio SANS synchroniser le tableau ne changeait aucune dose,
// alors que la confirmation à l'écran affirmait le contraire.
// ─────────────────────────────────────────────────────────────────────

test("appliquer un nouveau ratio du midi change réellement la dose calculée", () => {
  const base = {
    ratios: { morning: 10, lunch: 9.09090909090909, snack: 8.333333333333334, dinner: 7.692307692307692 },
    insulinRatios: [
      ratio("morning", 10),
      ratio("lunch", 9.09090909090909),
      ratio("snack", 8.333333333333334),
      ratio("dinner", 7.692307692307692),
    ],
    insulinSensitivityFactor: 100,
    targetGlucose: 110,
    targetRange: { min: 70, max: 180 },
    insulinActiveDuration: 195,
  } as unknown as DiabetesConfig;

  const before = calculateBolus(60, "lunch", 120, false, null, 0, base, 0);

  // Ce que fait « Valider » : nouveau ratio du midi, puis synchronisation.
  const newRatios = { ...base.ratios, lunch: 10.1 };
  const after = calculateBolus(60, "lunch", 120, false, null, 0, {
    ...base,
    ratios: newRatios,
    insulinRatios: syncInsulinRatios(base.insulinRatios, newRatios),
  } as DiabetesConfig, 0);

  assert.ok(
    after.carbBolus < before.carbBolus,
    `la dose doit baisser : avant ${before.carbBolus} U, après ${after.carbBolus} U`,
  );
  assert.equal(Math.round(before.carbBolus * 10) / 10, 6.6);
  assert.equal(Math.round(after.carbBolus * 10) / 10, 5.9);
});
