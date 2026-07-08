/**
 * Tests du garde-fou "action" (bouton Valider en un clic).
 *
 * Ce module ne s'occupe QUE de la validation structurée
 * { currentValue, proposedValue, unit } — le texte libre reste géré par
 * dose-guard.ts. Ici on vérifie que les incréments T1D (±1U basal, ±10%
 * ratio, ±10mg/dL ISF) sont bien imposés indépendamment de ce que Claude
 * a renvoyé, et que currentValue n'est jamais celle de Claude.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeActions, type ActionableSuggestion } from "./actionable";

function suggestion(
  area: string,
  currentValue: number,
  proposedValue: number,
): ActionableSuggestion {
  return {
    area,
    suggestion: "test",
    rationale: "test",
    confidence: "medium",
    action: { currentValue, proposedValue, unit: "?" },
  };
}

test("basal : clampe à ±1U (26 → 30 devient 26 → 27)", () => {
  const { suggestions, warnings } = sanitizeActions(
    [suggestion("basal", 999 /* valeur Claude — ignorée */, 30)],
    { basal: 26 },
  );
  assert.equal(suggestions[0].action?.currentValue, 26, "currentValue réel, pas celle de Claude");
  assert.equal(suggestions[0].action?.proposedValue, 27, "clampé à +1U max");
  assert.ok(warnings.length > 0, "warning de plafonnement émis");
});

test("basal : proposition sous le plafond (26 → 26.5) n'est pas modifiée", () => {
  const { suggestions, warnings } = sanitizeActions(
    [suggestion("basal", 26, 26.5)],
    { basal: 26 },
  );
  assert.equal(suggestions[0].action?.proposedValue, 26.5);
  assert.equal(warnings.length, 0);
});

test("ratio : clampe à ±10% (1.0 → 1.5 devient 1.0 → 1.1)", () => {
  const { suggestions, warnings } = sanitizeActions(
    [suggestion("ratio-midi", 1.0, 1.5)],
    { "ratio-midi": 1.0 },
  );
  assert.equal(suggestions[0].action?.currentValue, 1);
  assert.equal(suggestions[0].action?.proposedValue, 1.1);
  assert.ok(warnings.length > 0);
});

test("isf : clampe à ±10 mg/dL (100 → 130 devient 100 → 110)", () => {
  const { suggestions } = sanitizeActions(
    [suggestion("isf", 100, 130)],
    { isf: 100 },
  );
  assert.equal(suggestions[0].action?.currentValue, 100);
  assert.equal(suggestions[0].action?.proposedValue, 110);
});

test("zone non actionnable (timing) : l'action est retirée, le texte reste", () => {
  const s: ActionableSuggestion = {
    area: "timing",
    suggestion: "Injecte 15 min avant",
    rationale: "Pattern stable",
    confidence: "low",
    action: { currentValue: 1, proposedValue: 2, unit: "U" },
  };
  const { suggestions } = sanitizeActions([s], { basal: 26 });
  assert.equal(suggestions[0].action, undefined);
  assert.equal(suggestions[0].suggestion, "Injecte 15 min avant");
});

test("currentSettings ne connaît pas la zone → action retirée", () => {
  const { suggestions } = sanitizeActions(
    [suggestion("ratio-soir", 1, 1.1)],
    { basal: 26 }, // pas de ratio-soir
  );
  assert.equal(suggestions[0].action, undefined);
});

test("pas de currentSettings du tout → toutes les actions retirées", () => {
  const { suggestions } = sanitizeActions(
    [suggestion("basal", 26, 27), suggestion("isf", 100, 105)],
    undefined,
  );
  assert.equal(suggestions[0].action, undefined);
  assert.equal(suggestions[1].action, undefined);
});

test("suggestion sans action n'est pas modifiée", () => {
  const s: ActionableSuggestion = {
    area: "regularite",
    suggestion: "Essaie de manger à heures fixes",
    rationale: "CV élevé",
    confidence: "low",
  };
  const { suggestions, warnings } = sanitizeActions([s], { basal: 26 });
  assert.deepEqual(suggestions[0], s);
  assert.equal(warnings.length, 0);
});

test("proposedValue absurde (négatif) est plancher à 0.1", () => {
  // current=0.3 → plage clampée [-0.7, 1.3], mais le plancher physiologique
  // (jamais 0 ou négatif) doit quand même s'appliquer.
  const { suggestions } = sanitizeActions(
    [suggestion("basal", 0.3, -50)],
    { basal: 0.3 },
  );
  assert.ok(suggestions[0].action!.proposedValue >= 0.1);
});
