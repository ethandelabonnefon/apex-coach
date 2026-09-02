# Validation des doses par créneau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Détecter, créneau par créneau, si le ratio d'insuline sur-dose — en comptant les hypoglycémies post-repas sur les repas débarrassés de leurs facteurs de confusion — et proposer un pas de correction de −10 % sous validation explicite.

**Architecture:** Un module pur `lib/dose-validation.ts` sépare la **sélection** (quels repas sont analysables) du **verdict** (que disent-ils), pour que chaque moitié soit testable sans fabriquer les données de l'autre. Le calcul tourne côté client — les injections vivent en localStorage, les points capteur viennent de `/api/glucose/archive`. Un composant présentationnel rend le résultat dans `/diabete/historique`, et la page est le seul endroit qui écrit un ratio.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Zustand persist · Vercel KV (lecture archive) · `node:test` via `tsx`

**Spec de référence:** `docs/superpowers/specs/2026-09-02-validation-doses-creneaux-design.md`

## Global Constraints

- **Langue** : interface 100 % français, code en anglais, commentaires mixtes.
- **Zéro emoji dans l'UI.** Icônes `lucide-react` uniquement.
- **Tokens de couleur uniquement**, aucun hex codé en dur (bi-thème clair/sombre par variables CSS).
- **Aucune écriture de ratio sans clic explicite + `confirm()` natif.** Règle établie du projet.
- **Seuils figés par la spec** : hypo = point capteur < **70 mg/dL** · fenêtre d'observation = **5 h** · minimum **3** repas éligibles pour un verdict · `over-bolus` = **≥ 2** repas avec hypo **et** taux **≥ 25 %** · pas de correction = **−10 % sur l'insuline par gramme** · IOB d'exclusion > **1,0 U** · fenêtre plafonnée à **90 jours**, plancher **7 jours**.
- **Un seul pas par évaluation.** L'app ne propose jamais plus de −10 %, quelle que soit la sévérité.
- **Tests** : `node:test` + `assert/strict`, fichiers `lib/**/*.test.ts`, runner `npm test`.
- **Vérification** : `npx tsc --noEmit`, `npm test` et `npm run build` doivent passer avant chaque commit. Ne pas lancer de serveur de dev — le contrôleur fait la vérification navigateur.
- **Ne pas modifier** `lib/glucose-prediction.ts`, `lib/insulin-calculator.ts`, ni `lib/carbs-on-board.ts` : ce projet ne touche à aucune courbe d'absorption ni à aucun calcul de dose existant.

---

### Task 1: Sélection des repas éligibles

**Files:**
- Create: `lib/dose-validation.ts`
- Test: `lib/dose-validation.test.ts`

**Interfaces:**
- Consumes: `resolveCarbs`, `isLearnable` (`lib/insulin-log-values.ts`) ; `activeIOB`, type `ActiveBolus` (`lib/glucose-prediction.ts`) ; type `InsulinLog` (`@/types`)
- Produces: types `ArchivePoint`, `SportSession`, `EligibleMeal`, `ExclusionReason`, `DoseValidationInput`, `SlotSelection` ; constantes `HYPO_THRESHOLD`, `OBSERVATION_WINDOW_MIN`, `MIN_ELIGIBLE_MEALS`, `IOB_EXCLUSION_U`, `SPORT_BEFORE_MIN`, `MIN_WINDOW_DAYS`, `MAX_WINDOW_DAYS` ; fonction `selectEligibleMeals(input, mealType)`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/dose-validation.test.ts` :

```ts
/**
 * Tests de la sélection des repas analysables (projet « validation des doses »).
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  selectEligibleMeals,
  HYPO_THRESHOLD,
  type ArchivePoint,
  type DoseValidationInput,
  type SportSession,
} from "./dose-validation";
import type { InsulinLog } from "@/types";

const NOW = new Date("2026-09-02T12:00:00Z").getTime();
const DAY = 86_400_000;
const MIN = 60_000;

/** InsulinLog minimal, injecté il y a `daysAgo` jours à 12h00. */
function meal(
  daysAgo: number,
  over: Partial<InsulinLog> = {},
): InsulinLog {
  return {
    id: over.id ?? `meal-${daysAgo}`,
    units: 6,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams: 60,
    glucoseBefore: 130,
    notes: "",
    injectedAt: new Date(NOW - daysAgo * DAY),
    ...over,
  };
}

/** Points capteur plats à `value`, toutes les 15 min sur `days` jours. */
function flatPoints(value: number, days = 95): ArchivePoint[] {
  const pts: ArchivePoint[] = [];
  for (let t = NOW - days * DAY; t <= NOW; t += 15 * MIN) {
    pts.push({ t, value });
  }
  return pts;
}

function input(over: Partial<DoseValidationInput> = {}): DoseValidationInput {
  return {
    insulinLogs: [],
    archivePoints: flatPoints(130),
    workouts: [],
    ratios: { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 },
    ratioChangedAt: {},
    nowMs: NOW,
    ...over,
  };
}

test("repas sans glucides et secondes doses de split sont écartés", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(1, { id: "a", carbsGrams: 0 }),
        meal(2, { id: "b", isSplitDose: true }),
        meal(3, { id: "c" }),
      ],
    }),
    "lunch",
  );
  assert.deepEqual(sel.meals.map((m) => m.injectionId), ["c"]);
});

test("exclusion sport : séance dans la fenêtre d'observation", () => {
  const workouts: SportSession[] = [
    // séance 2 h APRÈS le repas de J-1 → dans la fenêtre de 5 h
    { date: new Date(NOW - 1 * DAY + 120 * MIN).toISOString(), durationMin: 60 },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3), meal(4)], workouts }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport, 1);
});

test("exclusion sport : séance dans les 4 h AVANT le repas", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY - 180 * MIN).toISOString(), durationMin: 45 },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3), meal(4)], workouts }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport, 1);
});

test("exclusion sport : séance hors fenêtre ne disqualifie pas", () => {
  const workouts: SportSession[] = [
    { date: new Date(NOW - 1 * DAY + 8 * 60 * MIN).toISOString(), durationMin: 60 },
  ];
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1, { id: "a" }), meal(2), meal(3)], workouts }),
    "lunch",
  );
  assert.ok(sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.sport ?? 0, 0);
});

test("exclusion IOB : injection récente au moment du bolus", () => {
  const base = NOW - 1 * DAY;
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        // 8 U une heure avant le repas → IOB largement > 1 U
        meal(0, { id: "prev", units: 8, injectedAt: new Date(base - 60 * MIN) }),
        meal(0, { id: "a", injectedAt: new Date(base) }),
        meal(5), meal(6), meal(7),
      ],
    }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.iob, 1);
});

test("exclusion quantité incertaine", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(1, { id: "a", carbsUncertain: true }), meal(2), meal(3), meal(4)],
    }),
    "lunch",
  );
  assert.ok(!sel.meals.some((m) => m.injectionId === "a"));
  assert.equal(sel.excluded.uncertain, 1);
});

test("exclusion correction intercalée, mais PAS le split du repas lui-même", () => {
  const base = NOW - 1 * DAY;
  const other = NOW - 2 * DAY;
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(0, { id: "a", injectedAt: new Date(base) }),
        // correction 2 h après le repas "a" → disqualifie "a"
        meal(0, {
          id: "corr", units: 2, carbsGrams: 0, mealType: "correction",
          injectedAt: new Date(base + 120 * MIN),
        }),
        meal(0, { id: "b", injectedAt: new Date(other) }),
        // split appartenant à "b" → ne disqualifie PAS "b"
        meal(0, {
          id: "split-b", units: 3, carbsGrams: 0, isSplitDose: true,
          parentInjectionId: "b", injectedAt: new Date(other + 150 * MIN),
        }),
        meal(5), meal(6),
      ],
    }),
    "lunch",
  );
  const ids = sel.meals.map((m) => m.injectionId);
  assert.ok(!ids.includes("a"), "le repas suivi d'une correction est écarté");
  assert.ok(ids.includes("b"), "le repas suivi de son propre split est gardé");
  assert.equal(sel.excluded.correction, 1);
});

test("fenêtre : 7 jours si elle contient déjà 3 repas éligibles", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(2), meal(3), meal(20)] }),
    "lunch",
  );
  assert.equal(sel.windowDays, 7);
  assert.equal(sel.meals.length, 3);
});

test("fenêtre : s'étend en arrière jusqu'à réunir 3 repas éligibles", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(10), meal(12), meal(40)] }),
    "lunch",
  );
  assert.equal(sel.meals.length, 3);
  assert.equal(sel.windowDays, 12);
  assert.ok(!sel.meals.some((m) => m.injectionId === "meal-40"));
});

test("fenêtre : plafonnée à 90 jours", () => {
  const sel = selectEligibleMeals(
    input({ insulinLogs: [meal(1), meal(95), meal(100)] }),
    "lunch",
  );
  assert.equal(sel.meals.length, 1);
  assert.ok(sel.windowDays <= 90);
});

test("fenêtre : ne remonte jamais avant ratioChangedAt", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(1), meal(5), meal(20), meal(30)],
      ratioChangedAt: { lunch: new Date(NOW - 10 * DAY).toISOString() },
    }),
    "lunch",
  );
  assert.equal(sel.meals.length, 2);
  assert.ok(sel.meals.every((m) => m.injectedAt >= NOW - 10 * DAY));
});

test("hypo : détectée dans les 5 h, une seule fois par repas", () => {
  const base = NOW - 1 * DAY;
  const pts = flatPoints(130).map((p) => {
    // deux creux distincts dans la fenêtre du repas
    const dt = p.t - base;
    if (dt > 60 * MIN && dt < 90 * MIN) return { ...p, value: 62 };
    if (dt > 200 * MIN && dt < 230 * MIN) return { ...p, value: 65 };
    return p;
  });
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), meal(5), meal(6)],
      archivePoints: pts,
    }),
    "lunch",
  );
  const a = sel.meals.find((m) => m.injectionId === "a");
  assert.equal(a?.hadHypo, true);
  assert.equal(sel.meals.filter((m) => m.hadHypo).length, 1);
});

test("hypo : un creux APRÈS la fenêtre de 5 h ne compte pas", () => {
  const base = NOW - 1 * DAY;
  const pts = flatPoints(130).map((p) => {
    const dt = p.t - base;
    return dt > 330 * MIN && dt < 360 * MIN ? { ...p, value: 60 } : p;
  });
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [meal(0, { id: "a", injectedAt: new Date(base) }), meal(5), meal(6)],
      archivePoints: pts,
    }),
    "lunch",
  );
  assert.equal(sel.meals.find((m) => m.injectionId === "a")?.hadHypo, false);
});

test("glycémie avant / à T+5h renseignées, glucides confirmés prioritaires", () => {
  const sel = selectEligibleMeals(
    input({
      insulinLogs: [
        meal(1, { id: "a", carbsGrams: 60, carbsConfirmedGrams: 90, carbsConfirmedAt: "x" }),
        meal(2), meal(3),
      ],
    }),
    "lunch",
  );
  const a = sel.meals.find((m) => m.injectionId === "a");
  assert.equal(a?.carbsGrams, 90);
  assert.equal(a?.confirmed, true);
  assert.equal(a?.glucoseBefore, 130);
  assert.equal(a?.glucoseAfter5h, 130);
});

test("le seuil d'hypo est bien 70", () => {
  assert.equal(HYPO_THRESHOLD, 70);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './dose-validation'`

- [ ] **Step 3: Implémenter la sélection**

Créer `lib/dose-validation.ts` :

```ts
/**
 * Validation des doses par créneau — sélection des repas analysables.
 *
 * Ce module ne modélise AUCUNE physiologie. Il compte des événements réels
 * (hypoglycémies) sur des repas dont on a écarté les facteurs de confusion.
 * C'est l'inverse de la démarche du prédicteur : on part des résultats
 * observés pour juger les doses, au lieu de simuler pour les dériver.
 *
 * La sélection (ici) et le verdict (analyzeSlot) sont volontairement
 * séparés : on peut tester les règles d'exclusion sans fabriquer de courbe
 * de glycémie, et le critère sans fabriquer de séances de sport.
 */

import { activeIOB, type ActiveBolus } from "./glucose-prediction";
import { resolveCarbs } from "./insulin-log-values";
import type { InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Constantes — figées par la spec, ne pas ajuster sans décision produit
// ───────────────────────────────────────────────────────────────────────

/** Un point sous ce seuil dans la fenêtre = repas fautif (mg/dL). */
export const HYPO_THRESHOLD = 70;
/** Fenêtre d'observation après le bolus (min). */
export const OBSERVATION_WINDOW_MIN = 300;
/** En dessous, aucun verdict n'est rendu. */
export const MIN_ELIGIBLE_MEALS = 3;
/** IOB au moment du bolus au-delà duquel le repas est écarté (U). */
export const IOB_EXCLUSION_U = 1.0;
/** Une séance dans les N min précédant le repas l'écarte (sensibilité post-exercice). */
export const SPORT_BEFORE_MIN = 240;
/** Plancher de la fenêtre d'analyse (jours). */
export const MIN_WINDOW_DAYS = 7;
/** Plafond de la fenêtre (jours) — rétention de l'archive. */
export const MAX_WINDOW_DAYS = 90;

const MIN_MS = 60_000;
const DAY_MS = 86_400_000;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

export interface ArchivePoint {
  t: number;
  value: number;
}

/** Séance de sport, muscu ou running confondus. */
export interface SportSession {
  /** ISO du début de séance. */
  date: string;
  durationMin: number;
}

export type ExclusionReason = "sport" | "iob" | "uncertain" | "correction";

export interface EligibleMeal {
  injectionId: string;
  mealType: string;
  injectedAt: number;
  /** Glucides retenus : confirmés si disponibles, sinon estimés. */
  carbsGrams: number;
  units: number;
  confirmed: boolean;
  glucoseBefore: number | null;
  glucoseAfter5h: number | null;
  hadHypo: boolean;
}

export interface DoseValidationInput {
  insulinLogs: InsulinLog[];
  archivePoints: ArchivePoint[];
  workouts: SportSession[];
  ratios: { morning: number; lunch: number; snack: number; dinner: number };
  /** Créneau → ISO du dernier changement de ratio. La fenêtre ne remonte jamais avant. */
  ratioChangedAt: Partial<Record<string, string>>;
  nowMs?: number;
}

export interface SlotSelection {
  meals: EligibleMeal[];
  excluded: Partial<Record<ExclusionReason, number>>;
  /** Profondeur réellement atteinte par la fenêtre (jours). */
  windowDays: number;
}

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function toMs(v: Date | string | number): number {
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/** Point capteur le plus proche de `target`, dans une tolérance de ±15 min. */
function glucoseAt(points: ArchivePoint[], target: number): number | null {
  let best: ArchivePoint | null = null;
  let bestDelta = Infinity;
  for (const p of points) {
    const d = Math.abs(p.t - target);
    if (d < bestDelta) {
      bestDelta = d;
      best = p;
    }
  }
  return best !== null && bestDelta <= 15 * MIN_MS ? best.value : null;
}

/** Une séance chevauche-t-elle la zone [repas − 4 h, repas + 5 h] ? */
function hasSportAround(workouts: SportSession[], mealMs: number): boolean {
  const from = mealMs - SPORT_BEFORE_MIN * MIN_MS;
  const to = mealMs + OBSERVATION_WINDOW_MIN * MIN_MS;
  return workouts.some((w) => {
    const start = toMs(w.date);
    if (!Number.isFinite(start)) return false;
    return start >= from && start <= to;
  });
}

/**
 * IOB au moment du bolus, hors le bolus lui-même. Modèle bi-exponentiel,
 * le même que la prédiction et les glucides actifs — pas un 4e modèle.
 */
function iobBefore(logs: InsulinLog[], mealMs: number, selfId: string): number {
  const boluses: ActiveBolus[] = [];
  for (const l of logs) {
    if (l.id === selfId || !(l.units > 0)) continue;
    const minutesAgo = (mealMs - toMs(l.injectedAt)) / MIN_MS;
    if (!Number.isFinite(minutesAgo) || minutesAgo <= 0 || minutesAgo > 360) continue;
    boluses.push({ units: l.units, minutesAgo });
  }
  return activeIOB(boluses);
}

/**
 * Une injection non planifiée (correction, appoint) tombe-t-elle dans la
 * fenêtre ? Le split du repas lui-même n'en est pas une : il fait partie du
 * dosage prévu pour ce repas, et l'exclure viderait le créneau du soir.
 */
function hasInterveningCorrection(
  logs: InsulinLog[],
  mealMs: number,
  mealId: string,
): boolean {
  const to = mealMs + OBSERVATION_WINDOW_MIN * MIN_MS;
  return logs.some((l) => {
    if (l.id === mealId) return false;
    if (!(l.units > 0)) return false;
    if (resolveCarbs(l) > 0) return false;
    if (l.parentInjectionId === mealId) return false;
    const t = toMs(l.injectedAt);
    return Number.isFinite(t) && t > mealMs && t <= to;
  });
}

// ───────────────────────────────────────────────────────────────────────
// Sélection
// ───────────────────────────────────────────────────────────────────────

export function selectEligibleMeals(
  input: DoseValidationInput,
  mealType: string,
): SlotSelection {
  const now = input.nowMs ?? Date.now();
  const changedAt = input.ratioChangedAt?.[mealType];
  const changedMs = changedAt ? toMs(changedAt) : null;
  const floor = Math.max(
    now - MAX_WINDOW_DAYS * DAY_MS,
    Number.isFinite(changedMs as number) && changedMs !== null ? changedMs : -Infinity,
  );

  const excluded: Partial<Record<ExclusionReason, number>> = {};
  const bump = (r: ExclusionReason) => {
    excluded[r] = (excluded[r] ?? 0) + 1;
  };

  const candidates = (input.insulinLogs ?? [])
    .filter((l) => {
      if (!l || l.mealType !== mealType) return false;
      if (l.isSplitDose) return false;
      if (resolveCarbs(l) <= 0) return false;
      const t = toMs(l.injectedAt);
      return Number.isFinite(t) && t >= floor && t <= now;
    })
    .sort((a, b) => toMs(b.injectedAt) - toMs(a.injectedAt));

  const eligible: EligibleMeal[] = [];

  for (const log of candidates) {
    const t = toMs(log.injectedAt);

    // Ordre des exclusions : le premier motif rencontré est celui compté,
    // pour que la somme des motifs égale le nombre de repas écartés.
    if (log.carbsUncertain === true) {
      bump("uncertain");
      continue;
    }
    if (hasSportAround(input.workouts ?? [], t)) {
      bump("sport");
      continue;
    }
    if (iobBefore(input.insulinLogs ?? [], t, log.id) > IOB_EXCLUSION_U) {
      bump("iob");
      continue;
    }
    if (hasInterveningCorrection(input.insulinLogs ?? [], t, log.id)) {
      bump("correction");
      continue;
    }

    const windowEnd = t + OBSERVATION_WINDOW_MIN * MIN_MS;
    const hadHypo = (input.archivePoints ?? []).some(
      (p) => p.t > t && p.t <= windowEnd && p.value < HYPO_THRESHOLD,
    );

    eligible.push({
      injectionId: log.id,
      mealType,
      injectedAt: t,
      carbsGrams: resolveCarbs(log),
      units: log.units,
      confirmed: log.carbsConfirmedAt !== undefined,
      glucoseBefore: glucoseAt(input.archivePoints ?? [], t),
      glucoseAfter5h: glucoseAt(input.archivePoints ?? [], windowEnd),
      hadHypo,
    });
  }

  // Fenêtre : 7 jours si elle suffit, sinon on remonte jusqu'au 3e repas.
  const sevenAgo = now - MIN_WINDOW_DAYS * DAY_MS;
  const inSeven = eligible.filter((m) => m.injectedAt >= sevenAgo);
  if (inSeven.length >= MIN_ELIGIBLE_MEALS) {
    return { meals: inSeven, excluded, windowDays: MIN_WINDOW_DAYS };
  }
  if (eligible.length < MIN_ELIGIBLE_MEALS) {
    const oldest = eligible.length > 0 ? eligible[eligible.length - 1].injectedAt : now;
    const span = Math.ceil((now - oldest) / DAY_MS);
    return {
      meals: eligible,
      excluded,
      windowDays: Math.min(MAX_WINDOW_DAYS, Math.max(MIN_WINDOW_DAYS, span)),
    };
  }
  const third = eligible[MIN_ELIGIBLE_MEALS - 1].injectedAt;
  return {
    meals: eligible.filter((m) => m.injectedAt >= third),
    excluded,
    windowDays: Math.min(MAX_WINDOW_DAYS, Math.ceil((now - third) / DAY_MS)),
  };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test 2>&1 | tail -20`
Expected: PASS — les tests de `dose-validation.test.ts` passent, et les tests préexistants restent verts.

Si « fenêtre : s'étend en arrière » échoue sur `windowDays`, vérifier l'arrondi : un repas à J-12 pile donne `Math.ceil(12) = 12`.

- [ ] **Step 5: Typecheck et commit**

```bash
npx tsc --noEmit
git add lib/dose-validation.ts lib/dose-validation.test.ts
git commit -m "feat(diabete): sélection des repas analysables pour la validation des doses"
```

---

### Task 2: Verdict et proposition de ratio

**Files:**
- Modify: `lib/dose-validation.ts`
- Test: `lib/dose-validation.test.ts`

**Interfaces:**
- Consumes: `selectEligibleMeals`, types `EligibleMeal`, `SlotSelection`, `DoseValidationInput` (Task 1)
- Produces: types `SlotVerdict`, `SlotConfidence`, `SlotAnalysis` ; constantes `OVER_BOLUS_MIN_HYPOS`, `OVER_BOLUS_MIN_RATE`, `RATIO_STEP` ; fonctions `analyzeSlot(selection, currentRatio, mealType)`, `analyzeAllSlots(input)`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à `lib/dose-validation.test.ts` (fusionner les symboles dans l'import existant en tête de fichier, ne pas ajouter un second `import` du même module) :

```ts
// ─── Verdict ────────────────────────────────────────────────────────────

import {
  analyzeSlot,
  analyzeAllSlots,
  RATIO_STEP,
  type EligibleMeal,
  type SlotSelection,
} from "./dose-validation";

/** Sélection synthétique : `n` repas, dont `hypos` avec hypo. */
function selection(n: number, hypos: number, over: Partial<EligibleMeal> = {}): SlotSelection {
  const meals: EligibleMeal[] = [];
  for (let i = 0; i < n; i++) {
    meals.push({
      injectionId: `m${i}`,
      mealType: "lunch",
      injectedAt: NOW - (i + 1) * 3_600_000,
      carbsGrams: 60,
      units: 6,
      confirmed: false,
      glucoseBefore: 130,
      glucoseAfter5h: 130,
      hadHypo: i < hypos,
      ...over,
    });
  }
  return { meals, excluded: {}, windowDays: 7 };
}

test("verdict : moins de 3 repas éligibles → insufficient-data, même avec des hypos", () => {
  const a = analyzeSlot(selection(2, 2), 10, "lunch");
  assert.equal(a.verdict, "insufficient-data");
  assert.equal(a.proposedRatio, null);
});

test("verdict : 2 hypos sur 4 repas (50 %) → over-bolus", () => {
  const a = analyzeSlot(selection(4, 2), 10, "lunch");
  assert.equal(a.verdict, "over-bolus");
});

test("verdict : 1 hypo sur 3 repas → ok (le seuil de 2 événements protège)", () => {
  assert.equal(analyzeSlot(selection(3, 1), 10, "lunch").verdict, "ok");
});

test("verdict : 2 hypos sur 30 repas (6,7 %) → ok (le taux de 25 % protège)", () => {
  assert.equal(analyzeSlot(selection(30, 2), 10, "lunch").verdict, "ok");
});

test("proposition : −10 % sur l'insuline par gramme, seulement sur over-bolus", () => {
  const a = analyzeSlot(selection(4, 2), 10, "lunch");
  assert.equal(a.proposedRatio?.current, 10);
  // 0,10 U/g → 0,09 U/g ⇒ 11,1 g/U
  assert.ok(
    Math.abs((a.proposedRatio?.proposed ?? 0) - 11.1) < 0.05,
    `attendu ~11,1 g/U, reçu ${a.proposedRatio?.proposed}`,
  );
  assert.equal(analyzeSlot(selection(4, 0), 10, "lunch").proposedRatio, null);
});

test("proposition : un seul pas, quelle que soit la sévérité", () => {
  const modere = analyzeSlot(selection(4, 2), 10, "lunch");
  const severe = analyzeSlot(selection(4, 4), 10, "lunch");
  assert.equal(modere.proposedRatio?.proposed, severe.proposedRatio?.proposed);
});

test("confiance : bascule à « confirmé » à la moitié des repas confirmés", () => {
  const s = selection(4, 0);
  s.meals[0].confirmed = true;
  s.meals[1].confirmed = true;
  assert.equal(analyzeSlot(s, 10, "lunch").confidence, "confirmé");
  s.meals[1].confirmed = false;
  assert.equal(analyzeSlot(s, 10, "lunch").confidence, "provisoire");
});

test("atterrissage : moyenne sur les seuls repas ayant les deux mesures", () => {
  const s = selection(3, 0);
  s.meals[0].glucoseBefore = 130; s.meals[0].glucoseAfter5h = 85;   // −45
  s.meals[1].glucoseBefore = 140; s.meals[1].glucoseAfter5h = 95;   // −45
  s.meals[2].glucoseBefore = null; s.meals[2].glucoseAfter5h = 100; // ignoré
  assert.equal(analyzeSlot(s, 10, "lunch").avgLandingDelta, -45);
});

test("atterrissage : null si aucun repas n'a les deux mesures", () => {
  const s = selection(3, 0, { glucoseBefore: null });
  assert.equal(analyzeSlot(s, 10, "lunch").avgLandingDelta, null);
});

test("analyzeAllSlots rend les 4 créneaux, même vides", () => {
  const all = analyzeAllSlots(input());
  assert.deepEqual(
    all.map((a) => a.mealType),
    ["morning", "lunch", "snack", "dinner"],
  );
  assert.ok(all.every((a) => a.verdict === "insufficient-data"));
});

test("le pas de correction est bien de 10 %", () => {
  assert.equal(RATIO_STEP, 0.1);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `analyzeSlot is not a function`

- [ ] **Step 3: Implémenter le verdict**

Ajouter à la fin de `lib/dose-validation.ts` :

```ts
// ───────────────────────────────────────────────────────────────────────
// Verdict
// ───────────────────────────────────────────────────────────────────────

/** Nombre minimal de repas avec hypo pour parler de sur-dosage. */
export const OVER_BOLUS_MIN_HYPOS = 2;
/** Taux minimal de repas avec hypo pour parler de sur-dosage. */
export const OVER_BOLUS_MIN_RATE = 0.25;
/** Pas de correction : −10 % sur l'insuline par gramme. */
export const RATIO_STEP = 0.1;

/** Créneaux analysés, dans l'ordre d'affichage. */
export const MEAL_SLOTS = ["morning", "lunch", "snack", "dinner"] as const;

export type SlotVerdict = "insufficient-data" | "ok" | "over-bolus";
export type SlotConfidence = "provisoire" | "confirmé";

export interface SlotAnalysis {
  mealType: string;
  verdict: SlotVerdict;
  eligibleCount: number;
  hypoCount: number;
  hypoRate: number;
  confidence: SlotConfidence;
  windowDays: number;
  excluded: Partial<Record<ExclusionReason, number>>;
  /** Écart moyen glycémie à T+5h − glycémie avant repas (mg/dL). */
  avgLandingDelta: number | null;
  /** Ratios en g par U. `null` hors verdict `over-bolus`. */
  proposedRatio: { current: number; proposed: number } | null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function analyzeSlot(
  selection: SlotSelection,
  currentRatio: number,
  mealType: string,
): SlotAnalysis {
  const meals = selection.meals;
  const eligibleCount = meals.length;
  const hypoCount = meals.filter((m) => m.hadHypo).length;
  const hypoRate = eligibleCount > 0 ? hypoCount / eligibleCount : 0;

  const confirmedCount = meals.filter((m) => m.confirmed).length;
  const confidence: SlotConfidence =
    eligibleCount > 0 && confirmedCount / eligibleCount >= 0.5 ? "confirmé" : "provisoire";

  const landings = meals
    .filter((m) => m.glucoseBefore !== null && m.glucoseAfter5h !== null)
    .map((m) => (m.glucoseAfter5h as number) - (m.glucoseBefore as number));
  const avgLandingDelta =
    landings.length > 0
      ? Math.round(landings.reduce((s, v) => s + v, 0) / landings.length)
      : null;

  let verdict: SlotVerdict;
  if (eligibleCount < MIN_ELIGIBLE_MEALS) {
    verdict = "insufficient-data";
  } else if (hypoCount >= OVER_BOLUS_MIN_HYPOS && hypoRate >= OVER_BOLUS_MIN_RATE) {
    verdict = "over-bolus";
  } else {
    verdict = "ok";
  }

  // Le ratio est stocké en grammes par unité. Retirer 10 % d'insuline par
  // gramme revient à AUGMENTER les grammes par unité : 10 g/U → 11,1 g/U.
  const proposedRatio =
    verdict === "over-bolus" && currentRatio > 0
      ? { current: currentRatio, proposed: round1(currentRatio / (1 - RATIO_STEP)) }
      : null;

  return {
    mealType,
    verdict,
    eligibleCount,
    hypoCount,
    hypoRate: round1(hypoRate * 100) / 100,
    confidence,
    windowDays: selection.windowDays,
    excluded: selection.excluded,
    avgLandingDelta,
    proposedRatio,
  };
}

export function analyzeAllSlots(input: DoseValidationInput): SlotAnalysis[] {
  return MEAL_SLOTS.map((slot) =>
    analyzeSlot(selectEligibleMeals(input, slot), input.ratios[slot], slot),
  );
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Typecheck et commit**

```bash
npx tsc --noEmit
git add lib/dose-validation.ts lib/dose-validation.test.ts
git commit -m "feat(diabete): verdict de sur-dosage par créneau et proposition de ratio"
```

---

### Task 3: Tampon `ratioChangedAt` dans le store

**Files:**
- Modify: `types/index.ts`
- Modify: `lib/store.ts:245-277` (corps de `updateRatioProfile`)

**Interfaces:**
- Produces: `UserProfile.ratioChangedAt?: Partial<Record<string, string>>` (même type que `DoseValidationInput.ratioChangedAt`, pour éviter une incompatibilité d'index à l'assignation), alimenté automatiquement par `updateRatioProfile`

- [ ] **Step 1: Ajouter le champ au type**

Dans `types/index.ts`, dans l'interface `UserProfile`, juste après `basalDoseChangedAt?: string;` (ligne 16), ajouter :

```ts
  /**
   * Créneau → ISO du dernier changement de son ratio. La validation des
   * doses (lib/dose-validation.ts) ne remonte jamais avant ce tampon :
   * mélanger des repas d'avant et d'après un changement reviendrait à
   * mesurer deux réglages dans le même échantillon.
   */
  ratioChangedAt?: Partial<Record<string, string>>;
```

- [ ] **Step 2: Tamponner dans `updateRatioProfile`**

Dans `lib/store.ts`, dans `updateRatioProfile`, à l'intérieur du bloc `if (isActive && active) {`, juste après la déclaration de `basalChanged` (~ligne 258), ajouter :

```ts
          // Créneaux dont le ratio change réellement (comparé à la valeur
          // AVANT cette mise à jour), pour repartir d'une base propre.
          const slots = ['morning', 'lunch', 'snack', 'dinner'] as const;
          const stampedAt = new Date().toISOString();
          const ratioStamps: Record<string, string> = {};
          for (const slot of slots) {
            const next = updates.ratios?.[slot];
            if (next !== undefined && next !== s.diabetesConfig.ratios[slot]) {
              ratioStamps[slot] = stampedAt;
            }
          }
```

Puis, dans l'objet `profile` retourné, juste après la ligne `...(basalChanged ? { basalDoseChangedAt: new Date().toISOString() } : {}),`, ajouter :

```ts
              ...(Object.keys(ratioStamps).length > 0
                ? { ratioChangedAt: { ...s.profile.ratioChangedAt, ...ratioStamps } }
                : {}),
```

Le spread de l'existant est essentiel : sans lui, changer le ratio du midi effacerait le tampon du soir.

- [ ] **Step 3: Vérifier**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -6
```

Expected: aucune erreur de typage, tests inchangés (le store n'a pas de tests unitaires dans ce projet).

- [ ] **Step 4: Commit**

```bash
git add types/index.ts lib/store.ts
git commit -m "feat(store): tampon ratioChangedAt par créneau"
```

---

### Task 4: Affichage et validation dans /diabete/historique

**Files:**
- Create: `components/diabete/DoseValidation.tsx`
- Modify: `app/diabete/historique/page.tsx`

**Interfaces:**
- Consumes: `analyzeAllSlots`, types `SlotAnalysis`, `DoseValidationInput`, `SportSession` (Tasks 1-2) ; `updateRatioProfile` (store) ; `ratioChangedAt` (Task 3)
- Produces: composant `<DoseValidation analyses={…} onApply={…} loading={…} />`

- [ ] **Step 1: Créer le composant présentationnel**

Créer `components/diabete/DoseValidation.tsx` :

```tsx
"use client";

/**
 * Validation des doses par créneau — présentation pure.
 *
 * Reçoit les analyses, rend une carte par créneau, remonte l'intention de
 * validation par callback. Ne calcule rien, ne lit pas le store, n'écrit
 * jamais un ratio : c'est la page qui le fait, après confirmation.
 */

import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { SlotAnalysis } from "@/lib/dose-validation";

const SLOT_LABELS: Record<string, string> = {
  morning: "Matin",
  lunch: "Midi",
  snack: "Goûter",
  dinner: "Soir",
};

const EXCLUSION_LABELS: Record<string, string> = {
  sport: "suivis de sport",
  iob: "avec insuline résiduelle",
  uncertain: "à quantité incertaine",
  correction: "suivis d'une correction",
};

/** Ratio interne (g par U) → format naturel « 1 U / 10 g ». */
function formatRatio(gPerU: number): string {
  return `1 U / ${gPerU.toFixed(1).replace(".", ",").replace(",0", "")} g`;
}

function SlotCard({
  analysis,
  onApply,
}: {
  analysis: SlotAnalysis;
  onApply: (a: SlotAnalysis) => void;
}) {
  const label = SLOT_LABELS[analysis.mealType] ?? analysis.mealType;
  const excludedTotal = Object.values(analysis.excluded).reduce(
    (s, n) => s + (n ?? 0),
    0,
  );

  const tone =
    analysis.verdict === "over-bolus"
      ? { icon: AlertTriangle, color: "text-warning", badge: "warning" as const }
      : analysis.verdict === "ok"
        ? { icon: CheckCircle2, color: "text-success", badge: "success" as const }
        : { icon: HelpCircle, color: "text-text-tertiary", badge: "default" as const };
  const Icon = tone.icon;

  return (
    <div className="surface-2 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${tone.color}`} />
          <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        </div>
        <Badge variant={tone.badge} size="sm">
          {analysis.verdict === "over-bolus"
            ? "sur-dose"
            : analysis.verdict === "ok"
              ? "correct"
              : "pas assez de données"}
        </Badge>
      </div>

      {analysis.verdict === "insufficient-data" ? (
        <p className="text-xs text-text-secondary">
          {analysis.eligibleCount} repas analysable
          {analysis.eligibleCount > 1 ? "s" : ""} sur les {analysis.windowDays}{" "}
          derniers jours — il en faut 3.
          {excludedTotal > 0 && (
            <>
              {" "}
              {excludedTotal} écarté{excludedTotal > 1 ? "s" : ""} :{" "}
              {Object.entries(analysis.excluded)
                .filter(([, n]) => (n ?? 0) > 0)
                .map(([r, n]) => `${n} ${EXCLUSION_LABELS[r] ?? r}`)
                .join(", ")}
              .
            </>
          )}
        </p>
      ) : (
        <>
          <p className="num text-xs text-text-secondary">
            {analysis.hypoCount} hypo{analysis.hypoCount > 1 ? "s" : ""} sur{" "}
            {analysis.eligibleCount} repas · {analysis.windowDays} derniers jours ·{" "}
            {analysis.confidence}
          </p>
          {analysis.avgLandingDelta !== null && (
            <p className="num mt-1 text-[11px] text-text-tertiary">
              Tu atterris en moyenne {analysis.avgLandingDelta > 0 ? "+" : ""}
              {analysis.avgLandingDelta} mg/dL par rapport à ton point de départ.
            </p>
          )}
        </>
      )}

      {analysis.proposedRatio && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <p className="num text-xs text-text-secondary mb-2">
            {formatRatio(analysis.proposedRatio.current)} →{" "}
            <span className="text-warning font-semibold">
              {formatRatio(analysis.proposedRatio.proposed)}
            </span>
          </p>
          <Button size="sm" onClick={() => onApply(analysis)}>
            Valider
          </Button>
        </div>
      )}
    </div>
  );
}

export function DoseValidation({
  analyses,
  onApply,
  loading,
}: {
  analyses: SlotAnalysis[];
  onApply: (a: SlotAnalysis) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-tertiary py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Analyse des repas en cours…
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {analyses.map((a) => (
        <SlotCard key={a.mealType} analysis={a} onApply={onApply} />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Câbler dans la page historique**

Dans `app/diabete/historique/page.tsx`, ajouter les imports :

```ts
import { analyzeAllSlots, type SlotAnalysis, type SportSession } from "@/lib/dose-validation";
import { DoseValidation } from "@/components/diabete/DoseValidation";
```

La page a déjà `points` issus de `/api/glucose/archive?days=${days}`, mais `days` suit le sélecteur de l'utilisateur (7/14/30/90). La validation a besoin d'une fenêtre fixe de 90 jours, sinon le verdict changerait quand l'utilisateur change de vue. Ajouter donc un fetch dédié, une seule fois au montage :

```ts
  const [validationPoints, setValidationPoints] = useState<{ t: number; value: number }[]>([]);
  const [validationLoading, setValidationLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/glucose/archive?days=90")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setValidationPoints(d?.points ?? []);
      })
      .catch(() => {
        if (!cancelled) setValidationPoints([]);
      })
      .finally(() => {
        if (!cancelled) setValidationLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
```

Puis le calcul, à côté des autres memos de la page :

```ts
  const insulinLogs = useStore((s) => s.insulinLogs);
  const completedWorkouts = useStore((s) => s.completedWorkouts);
  const completedRunningSessions = useStore((s) => s.completedRunningSessions);
  const profile = useStore((s) => s.profile);
  const diabetesConfig = useStore((s) => s.diabetesConfig);
  const updateRatioProfile = useStore((s) => s.updateRatioProfile);

  const doseAnalyses = useMemo(() => {
    const workouts: SportSession[] = [
      ...completedWorkouts.map((w) => ({
        date: w.date,
        durationMin: Math.round(w.duration ?? 60),
      })),
      ...completedRunningSessions.map((r) => ({
        date: r.date,
        durationMin: Math.round(r.actualDuration ?? 45),
      })),
    ];
    return analyzeAllSlots({
      insulinLogs,
      archivePoints: validationPoints,
      workouts,
      ratios: diabetesConfig.ratios,
      ratioChangedAt: profile.ratioChangedAt ?? {},
    });
  }, [
    insulinLogs,
    validationPoints,
    completedWorkouts,
    completedRunningSessions,
    diabetesConfig.ratios,
    profile.ratioChangedAt,
  ]);
```

Vérifier au préalable comment la page accède déjà au store (`grep -n "useStore" app/diabete/historique/page.tsx`) et réutiliser les sélecteurs déjà présents plutôt que d'en déclarer des doublons.

- [ ] **Step 3: Ajouter le handler de validation**

```ts
  function handleApplyRatio(a: SlotAnalysis) {
    if (!a.proposedRatio) return;
    const slot = a.mealType as "morning" | "lunch" | "snack" | "dinner";
    const label = { morning: "matin", lunch: "midi", snack: "goûter", dinner: "soir" }[slot];
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `Passer le ratio du ${label} de 1 U / ${a.proposedRatio.current} g à 1 U / ${a.proposedRatio.proposed} g ?`,
      )
    ) {
      return;
    }
    const activeId = diabetesConfig.activeProfileId;
    const active = diabetesConfig.profiles.find((p) => p.id === activeId);
    if (!active) return;
    updateRatioProfile(activeId, {
      ratios: { ...active.ratios, [slot]: a.proposedRatio.proposed },
    });
  }
```

`updateRatioProfile` tamponne `ratioChangedAt` (Task 3), ce qui remet automatiquement le créneau en reconstitution — l'utilisateur ne peut donc pas enchaîner deux baisses sur le même échantillon.

- [ ] **Step 4: Rendre la section**

Dans le JSX, à côté des autres analyses long terme (chercher `<GlucoseCalendar` pour situer la zone), insérer :

```tsx
        <section className="surface-1 rounded-2xl p-5 mb-4">
          <div className="mb-1">
            <h2 className="text-base font-semibold text-text-primary">
              Validation des doses
            </h2>
            <p className="text-xs text-text-tertiary mt-0.5">
              Hypoglycémies dans les 5 h suivant chaque repas, hors repas suivis de
              sport, avec insuline résiduelle, à quantité incertaine ou suivis d&apos;une
              correction.
            </p>
          </div>
          <div className="mt-4">
            <DoseValidation
              analyses={doseAnalyses}
              onApply={handleApplyRatio}
              loading={validationLoading}
            />
          </div>
        </section>
```

- [ ] **Step 5: Vérifier**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -6
npm run build 2>&1 | tail -15
```

Expected: aucune erreur, build compilé. Le `build` est important ici : il attrape le JSX mal imbriqué que le typecheck laisse passer.

- [ ] **Step 6: Commit**

```bash
git add components/diabete/DoseValidation.tsx app/diabete/historique/page.tsx
git commit -m "feat(diabete): section validation des doses dans l'historique"
```

---

## Vérification d'ensemble

| Section de la spec | Task |
|---|---|
| 1. Où le calcul tourne, fenêtre, amorçage, confiance | 1 (fenêtre), 2 (confiance), 4 (client, fetch 90 j) |
| 1. Remise à zéro après changement de ratio | 3 (tampon), 1 (plancher de fenêtre), 4 (déclenchement) |
| 2. Éligibilité — les 4 exclusions et leur comptage | 1 |
| 3. Critère et verdict | 2 |
| 4. Proposition −10 % sous validation explicite | 2 (calcul), 4 (UI + `confirm()`) |
| 5. Point d'atterrissage en information secondaire | 2 (calcul), 4 (affichage) |
| 6. Architecture (lib pure / composant présentationnel / page) | 1, 2, 4 |
| 7. Tests | 1, 2 |
