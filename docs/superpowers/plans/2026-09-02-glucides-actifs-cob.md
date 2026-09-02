# Glucides actifs (COB) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher les glucides actifs (COB) à côté de l'insuline active sur `/diabete`, demander confirmation des glucides réellement mangés à T+20 min, et proposer un appoint d'insuline sous garde-fous quand la couverture est déficitaire.

**Architecture:** Un module pur `lib/carbs-on-board.ts` calcule le COB en réutilisant les primitives d'absorption existantes de `lib/glucose-prediction.ts` (aucun nouveau modèle physiologique). Le pipeline de rappels serveur `lib/split-reminders/` est généralisé en `lib/reminders/` avec un champ `kind` pour porter aussi les rappels de confirmation. La carte de confirmation est de l'**état dérivé** des `insulinLogs` — aucun nouvel état client persistant n'est introduit.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Zustand persist · Vercel KV · web-push · `node:test` via `tsx`

**Spec de référence:** `docs/superpowers/specs/2026-09-02-glucides-actifs-cob-design.md`

## Global Constraints

- **Langue** : interface 100 % français, code en anglais, commentaires mixtes.
- **Zéro emoji dans l'UI.** Icônes `lucide-react` uniquement.
- **Aucune dose d'insuline auto-appliquée.** Toute proposition = affichage + bouton « Valider » + `confirm()` natif avant écriture dans le store.
- **Tokens de couleur uniquement** (`var(--nutrition)`, `text-warning`, …). Aucun hex codé en dur, sous peine de casser le bi-thème light/dark.
- **Tests** : `node:test` + `assert/strict`, fichiers `lib/**/*.test.ts`, runner `npm test`.
- **Typecheck** : `npx tsc --noEmit` doit passer sans erreur avant chaque commit.
- **Seuils figés par la spec** : appoint proposé si déficit ≥ 1,0 U · dose arrondie à l'entier inférieur · plafond 4 U · bloqué si glycémie < 90 mg/dL ou trend ↓↓ (`trendArrow === 1`) · bloqué si une source est incertaine.
- **Fenêtre d'activité** : 360 min (`EVENT_ACTIVE_WINDOW_MIN`, déjà exporté par `lib/prediction-inputs.ts`).
- **Ne jamais toucher** à `laterUnits` / `FPU_CARB_EQUIVALENT_FACTOR` dans `lib/insulin-calculator.ts` : la quantité du split est validée terrain par Ethan.

---

### Task 1: Moteur COB pur

**Files:**
- Modify: `types/index.ts` (ajout de champs optionnels à `InsulinLog`)
- Create: `lib/carbs-on-board.ts`
- Test: `lib/carbs-on-board.test.ts`

**Interfaces:**
- Consumes: `carbRemainingFraction`, `activeIOB`, `FPU_GLUCOSE_FACTOR`, `FPU_WINDOW_HOURS` (`lib/glucose-prediction.ts`) ; `ratioForMeal`, `EVENT_ACTIVE_WINDOW_MIN`, `type MealRatios` (`lib/prediction-inputs.ts`)
- Produces: `resolveCarbs(log)`, `resolveFat(log)`, `resolveProtein(log)`, `isLearnable(log)`, `fpuRemainingFraction(minutesAgo, windowHours?)`, `buildCarbSources(opts)`, `computeCarbsOnBoard(opts)`, types `ActiveCarbSource`, `CarbsOnBoard`, `CobStatus`

- [ ] **Step 1: Ajouter les champs de confirmation au type `InsulinLog`**

Dans `types/index.ts`, à la fin de l'interface `InsulinLog` (après `parentInjectionId`), ajouter :

```ts
  // ─── Confirmation des glucides réels (septembre 2026) ───────────────
  /** Glucides réellement mangés, confirmés après le repas. Prime sur carbsGrams. */
  carbsConfirmedGrams?: number;
  /** Lipides confirmés après le repas. Prime sur fatGrams. */
  fatConfirmedGrams?: number;
  /** Protéines confirmées après le repas. Prime sur proteinGrams. */
  proteinConfirmedGrams?: number;
  /** ISO du moment de la confirmation. */
  carbsConfirmedAt?: string;
  /**
   * Quantité de glucides déclarée non fiable (plat au resto, portion inconnue).
   * Rend l'app muette sur la dose et exclut le repas de l'apprentissage —
   * mais les glucides restent dans le calcul de couverture, sinon on
   * conclurait à tort « trop d'insuline, mange des glucides ».
   */
  carbsUncertain?: boolean;
```

- [ ] **Step 2: Écrire les tests qui échouent**

Créer `lib/carbs-on-board.test.ts` :

```ts
/**
 * Tests du moteur « glucides actifs » (COB).
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveCarbs,
  isLearnable,
  fpuRemainingFraction,
  computeCarbsOnBoard,
} from "./carbs-on-board";
import type { InsulinLog } from "@/types";

const ISF = 100;
const RATIOS = { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 };

/** InsulinLog minimal, injecté il y a `minutesAgo` minutes. */
function log(minutesAgo: number, over: Partial<InsulinLog> = {}): InsulinLog {
  return {
    id: over.id ?? `log-${minutesAgo}`,
    units: 0,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams: 0,
    glucoseBefore: 120,
    notes: "",
    injectedAt: new Date(Date.now() - minutesAgo * 60_000),
    ...over,
  };
}

test("resolveCarbs : le confirmé prime, sinon fallback sur l'estimation", () => {
  assert.equal(resolveCarbs(log(0, { carbsGrams: 100 })), 100);
  assert.equal(
    resolveCarbs(log(0, { carbsGrams: 100, carbsConfirmedGrams: 140 })),
    140,
  );
  // 0 g confirmé est une valeur légitime, pas un "absent"
  assert.equal(
    resolveCarbs(log(0, { carbsGrams: 100, carbsConfirmedGrams: 0 })),
    0,
  );
});

test("isLearnable : faux si incertain, vrai sinon", () => {
  assert.equal(isLearnable(log(0, { carbsGrams: 60 })), true);
  assert.equal(
    isLearnable(log(0, { carbsGrams: 60, carbsUncertain: true })),
    false,
  );
});

test("fpuRemainingFraction : décroissance linéaire sur 5h", () => {
  assert.equal(fpuRemainingFraction(0), 1);
  assert.equal(fpuRemainingFraction(150), 0.5);
  assert.equal(fpuRemainingFraction(300), 0);
  assert.equal(fpuRemainingFraction(400), 0);
});

test("repas bien dosé à T+30 : couvert, balance proche de 0", () => {
  // 60 g au ratio midi 10 g/U → 6 U. Rien d'autre en cours.
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(30, { carbsGrams: 60, units: 6 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "covered");
  assert.ok(
    Math.abs(cob.balanceU) < 1,
    `balance attendue < 1 U, reçue ${cob.balanceU}`,
  );
  assert.ok(cob.carbsRemainingG > 0, "des glucides restent à absorber à T+30");
});

test("sous-dosage : bolus pour 100 g, 140 g confirmés → déficit ~4 U", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(20, { carbsGrams: 100, carbsConfirmedGrams: 140, units: 10 }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "deficit");
  // 40 g non couverts au ratio 10 → ~4 U manquantes, atténué par la part
  // déjà absorbée à T+20. On vérifie l'ordre de grandeur et le signe.
  assert.ok(
    cob.balanceU <= -2 && cob.balanceU >= -4.5,
    `déficit attendu entre -2 et -4,5 U, reçu ${cob.balanceU}`,
  );
});

test("épuisement : à T+5h, plus rien d'actif → idle", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(300, { carbsGrams: 60, units: 6 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "idle");
  assert.ok(cob.totalRemainingG < 5);
});

test("ratios distincts : matin et soir ne se moyennent pas", () => {
  // 30 g le matin (6,7 g/U → 4,5 U) + 30 g le soir (10 g/U → 3 U)
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(10, { id: "m", carbsGrams: 30, units: 0, mealType: "morning" }),
      log(10, { id: "s", carbsGrams: 30, units: 0, mealType: "dinner" }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  // Sans insuline : besoin = 30/6,7 + 30/10 pondéré par la part restante.
  // La moyenne naïve (60 g / 8,35) donnerait un chiffre plus bas.
  const naive = (cob.carbsRemainingG + cob.fpuRemainingG) / 8.35;
  assert.ok(
    cob.insulinNeededU > naive,
    `besoin par source (${cob.insulinNeededU}) doit dépasser la moyenne naïve (${naive})`,
  );
});

test("FPU non couverts à T+3h → déficit détecté", () => {
  // Pizza : 80 g glucides bien bolussés, mais 40 g lip + 30 g prot non couverts.
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(180, {
        carbsGrams: 80,
        fatGrams: 40,
        proteinGrams: 30,
        units: 8,
        mealType: "dinner",
      }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.ok(cob.fpuRemainingG > 0, "les FPU sont encore en cours à T+3h");
  assert.equal(cob.status, "deficit");
});

test("glucides sans insuline (CarbEntry) comptés dans le besoin", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [],
    carbEntries: [
      { id: "c1", carbsGrams: 40, eatenAt: new Date(Date.now() - 10 * 60_000).toISOString() },
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.ok(cob.insulinNeededU > 2, "40 g au ratio 10 ≈ 4 U de besoin");
  assert.equal(cob.insulinActiveU, 0);
  assert.equal(cob.status, "deficit");
});

test("repas incertain : compté dans la couverture, mais flag uncertain levé", () => {
  const cob = computeCarbsOnBoard({
    insulinLogs: [
      log(20, { carbsGrams: 80, units: 8, carbsUncertain: true }),
    ],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.uncertain, true);
  // Les glucides ne sont PAS mis à zéro : sinon on verrait 8 U d'insuline
  // face à 0 g et on conclurait à tort à un excès → fausse alerte hypo.
  assert.ok(cob.carbsRemainingG > 0);
});

test("excès d'insuline : glucides épuisés, IOB encore présent", () => {
  // Bolus de 8 U il y a 30 min pour seulement 20 g de glucides.
  const cob = computeCarbsOnBoard({
    insulinLogs: [log(30, { carbsGrams: 20, units: 8 })],
    isf: ISF,
    ratios: RATIOS,
  });
  assert.equal(cob.status, "excess");
  assert.ok(cob.balanceU >= 1);
});

test("aucune donnée → idle, tous les compteurs à zéro", () => {
  const cob = computeCarbsOnBoard({ insulinLogs: [], isf: ISF, ratios: RATIOS });
  assert.equal(cob.status, "idle");
  assert.equal(cob.totalRemainingG, 0);
  assert.equal(cob.insulinNeededU, 0);
  assert.equal(cob.insulinActiveU, 0);
  assert.equal(cob.uncertain, false);
});
```

- [ ] **Step 3: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './carbs-on-board'`

- [ ] **Step 4: Implémenter `lib/carbs-on-board.ts`**

```ts
/**
 * Glucides actifs (COB) et couverture insuline — septembre 2026.
 *
 * Répond à une seule question : « qu'est-ce qu'il me reste à digérer, et
 * est-ce couvert par l'insuline encore active ? »
 *
 * ─── Décisions d'architecture ────────────────────────────────────────
 *  • Aucun nouveau modèle physiologique. On réutilise les primitives
 *    d'absorption de glucose-prediction.ts (`carbRemainingFraction`,
 *    `activeIOB`, facteur FPU 6). La tuile de l'écran et le plan de la
 *    nuit ne peuvent donc pas se contredire.
 *  • Le ratio est conservé SOURCE PAR SOURCE. Un repas du matin
 *    (1,5 U/10 g) et un repas du soir (1 U/10 g) simultanément actifs ne
 *    se moyennent pas — la moyenne sous-estimerait le besoin du matin.
 *  • Un repas « incertain » garde ses glucides dans le calcul. Les mettre
 *    à zéro ferait voir de l'insuline sans glucides en face, donc un faux
 *    « trop d'insuline, mange des glucides » : l'inverse exact du besoin.
 *    L'incertitude bloque la proposition de DOSE (cf. suggestTopUp), pas
 *    le calcul.
 */

import {
  activeIOB,
  carbRemainingFraction,
  FPU_GLUCOSE_FACTOR,
  FPU_WINDOW_HOURS,
  type ActiveBolus,
} from "./glucose-prediction";
import {
  EVENT_ACTIVE_WINDOW_MIN,
  ratioForMeal,
  type MealRatios,
} from "./prediction-inputs";
import type { CarbEntry, InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Seuils
// ───────────────────────────────────────────────────────────────────────

/** En dessous, on considère qu'il n'y a plus rien à digérer (g). */
export const IDLE_CARBS_G = 5;
/** En dessous, on considère qu'il n'y a plus d'insuline active (U). */
export const IDLE_INSULIN_U = 0.5;
/**
 * Écart minimal pour qualifier un déficit ou un excès (U).
 * Le stylo d'Ethan ne fait pas de demi-unités : sous 1 U, aucune action
 * n'est possible, donc aucun message.
 */
export const BALANCE_THRESHOLD_U = 1.0;
/** Au-delà de ce reliquat de glucides, on ne parle pas d'excès d'insuline (g). */
export const EXCESS_MAX_CARBS_G = 15;

// ───────────────────────────────────────────────────────────────────────
// Résolution estimé ↔ confirmé
// ───────────────────────────────────────────────────────────────────────

/** Glucides retenus pour une injection : le confirmé prime sur l'estimation. */
export function resolveCarbs(log: InsulinLog): number {
  return log.carbsConfirmedGrams ?? log.carbsGrams ?? 0;
}

/** Lipides retenus : le confirmé prime sur l'estimation. */
export function resolveFat(log: InsulinLog): number {
  return log.fatConfirmedGrams ?? log.fatGrams ?? 0;
}

/** Protéines retenues : le confirmé prime sur l'estimation. */
export function resolveProtein(log: InsulinLog): number {
  return log.proteinConfirmedGrams ?? log.proteinGrams ?? 0;
}

/**
 * Une injection peut-elle nourrir l'apprentissage (stats par type de repas,
 * backtest nuit, contexte du Docteur) ?
 *
 * Prédicat unique : un seul endroit à modifier si la règle évolue.
 */
export function isLearnable(log: InsulinLog): boolean {
  return log.carbsUncertain !== true;
}

// ───────────────────────────────────────────────────────────────────────
// Fractions restantes
// ───────────────────────────────────────────────────────────────────────

/**
 * Fraction de FPU encore à absorber. Décroissance linéaire sur la fenêtre,
 * cohérente avec le débit horaire constant de `fpuGlucoseRise()`.
 */
export function fpuRemainingFraction(
  minutesAgo: number,
  windowHours: number = FPU_WINDOW_HOURS,
): number {
  if (minutesAgo <= 0) return 1;
  const hoursAgo = minutesAgo / 60;
  if (hoursAgo >= windowHours) return 0;
  return 1 - hoursAgo / windowHours;
}

// ───────────────────────────────────────────────────────────────────────
// Sources actives
// ───────────────────────────────────────────────────────────────────────

export interface ActiveCarbSource {
  id: string;
  /** mealTag ("pates") ou label de CarbEntry ("Compote"). */
  label?: string;
  carbsGrams: number;
  fatGrams: number;
  proteinGrams: number;
  /** Bolus associé (U). 0 pour des glucides sans insuline. */
  insulinUnits: number;
  /** Ratio du créneau au moment du repas (g par U). */
  gramsPerU: number;
  minutesAgo: number;
  uncertain: boolean;
  confirmed: boolean;
  /** Glucides bruts encore à absorber (g). */
  carbsRemainingG: number;
  /** Équivalent-glucides FPU encore à absorber (g). */
  fpuRemainingG: number;
}

export interface BuildCarbSourcesOptions {
  insulinLogs: InsulinLog[];
  carbEntries?: CarbEntry[];
  ratios?: MealRatios;
  nowMs?: number;
  windowMin?: number;
}

/** Convertit un timestamp (Date | ISO | number) en ms. */
function toMs(v: Date | string | number): number {
  if (v instanceof Date) return v.getTime();
  return new Date(v).getTime();
}

/**
 * Construit les sources de glucides encore actives à partir du store.
 * Même filtrage temporel que `buildPredictionEvents` — les deux vues
 * partent exactement des mêmes événements.
 */
export function buildCarbSources(
  opts: BuildCarbSourcesOptions,
): ActiveCarbSource[] {
  const now = opts.nowMs ?? Date.now();
  const windowMin = opts.windowMin ?? EVENT_ACTIVE_WINDOW_MIN;
  const sources: ActiveCarbSource[] = [];

  const push = (s: Omit<ActiveCarbSource, "carbsRemainingG" | "fpuRemainingG">) => {
    const fpu = (s.fatGrams * 9 + s.proteinGrams * 4) / 100;
    const fpuTotalG = fpu >= 1 ? fpu * FPU_GLUCOSE_FACTOR : 0;
    sources.push({
      ...s,
      carbsRemainingG: s.carbsGrams * carbRemainingFraction(s.minutesAgo),
      fpuRemainingG: fpuTotalG * fpuRemainingFraction(s.minutesAgo),
    });
  };

  for (const log of opts.insulinLogs ?? []) {
    if (!log) continue;
    const minutesAgo = (now - toMs(log.injectedAt)) / 60_000;
    if (!Number.isFinite(minutesAgo) || minutesAgo < -5 || minutesAgo > windowMin) continue;
    const carbs = resolveCarbs(log);
    const fat = resolveFat(log);
    const prot = resolveProtein(log);
    if (carbs <= 0 && fat <= 0 && prot <= 0) continue;
    push({
      id: log.id,
      label: log.mealTag,
      carbsGrams: carbs,
      fatGrams: fat,
      proteinGrams: prot,
      insulinUnits: log.units > 0 ? log.units : 0,
      gramsPerU: ratioForMeal(opts.ratios, log.mealType),
      minutesAgo: Math.max(0, minutesAgo),
      uncertain: log.carbsUncertain === true,
      confirmed: log.carbsConfirmedAt !== undefined,
    });
  }

  for (const c of opts.carbEntries ?? []) {
    if (!c || typeof c.carbsGrams !== "number") continue;
    const minutesAgo = (now - toMs(c.eatenAt)) / 60_000;
    if (!Number.isFinite(minutesAgo) || minutesAgo < -5 || minutesAgo > windowMin) continue;
    push({
      id: c.id,
      label: c.label,
      carbsGrams: c.carbsGrams,
      fatGrams: c.fatGrams ?? 0,
      proteinGrams: c.proteinGrams ?? 0,
      insulinUnits: c.insulinUnits ?? 0,
      // Glucides sans bolus précis → ratio midi générique, comme
      // buildPredictionEvents.
      gramsPerU: ratioForMeal(opts.ratios, "lunch"),
      minutesAgo: Math.max(0, minutesAgo),
      uncertain: false,
      confirmed: true,
    });
  }

  return sources;
}

// ───────────────────────────────────────────────────────────────────────
// Assemblage
// ───────────────────────────────────────────────────────────────────────

export type CobStatus = "idle" | "covered" | "deficit" | "excess";

export interface CarbsOnBoard {
  carbsRemainingG: number;
  fpuRemainingG: number;
  totalRemainingG: number;
  /** Insuline requise pour ce qui reste à absorber (U). */
  insulinNeededU: number;
  /** IOB bi-exponentiel (U). */
  insulinActiveU: number;
  /** insulinActiveU − insulinNeededU. Négatif = il manque de l'insuline. */
  balanceU: number;
  status: CobStatus;
  /** Au moins une source à quantité incertaine. */
  uncertain: boolean;
  sources: ActiveCarbSource[];
}

export interface ComputeCarbsOnBoardOptions extends BuildCarbSourcesOptions {
  isf: number;
}

/** Arrondi à 1 décimale (évite les 3,0000000000004 dans l'UI). */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function computeCarbsOnBoard(
  opts: ComputeCarbsOnBoardOptions,
): CarbsOnBoard {
  const now = opts.nowMs ?? Date.now();
  const windowMin = opts.windowMin ?? EVENT_ACTIVE_WINDOW_MIN;
  const sources = buildCarbSources(opts);

  let carbsRemainingG = 0;
  let fpuRemainingG = 0;
  let insulinNeededU = 0;
  let uncertain = false;

  for (const s of sources) {
    carbsRemainingG += s.carbsRemainingG;
    fpuRemainingG += s.fpuRemainingG;
    // Ratio conservé source par source — pas de moyenne.
    if (s.gramsPerU > 0) {
      insulinNeededU += (s.carbsRemainingG + s.fpuRemainingG) / s.gramsPerU;
    }
    if (s.uncertain) uncertain = true;
  }

  const boluses: ActiveBolus[] = (opts.insulinLogs ?? [])
    .map((log) => ({
      units: log.units,
      minutesAgo: (now - toMs(log.injectedAt)) / 60_000,
    }))
    .filter(
      (b) =>
        b.units > 0 &&
        Number.isFinite(b.minutesAgo) &&
        b.minutesAgo >= 0 &&
        b.minutesAgo <= windowMin,
    );
  const insulinActiveU = activeIOB(boluses);

  const totalRemainingG = carbsRemainingG + fpuRemainingG;
  const balanceU = insulinActiveU - insulinNeededU;

  let status: CobStatus;
  if (totalRemainingG < IDLE_CARBS_G && insulinActiveU < IDLE_INSULIN_U) {
    status = "idle";
  } else if (balanceU <= -BALANCE_THRESHOLD_U) {
    status = "deficit";
  } else if (
    balanceU >= BALANCE_THRESHOLD_U &&
    totalRemainingG < EXCESS_MAX_CARBS_G
  ) {
    status = "excess";
  } else {
    status = "covered";
  }

  return {
    carbsRemainingG: round1(carbsRemainingG),
    fpuRemainingG: round1(fpuRemainingG),
    totalRemainingG: round1(totalRemainingG),
    insulinNeededU: round1(insulinNeededU),
    insulinActiveU: round1(insulinActiveU),
    balanceU: round1(balanceU),
    status,
    uncertain,
    sources,
  };
}
```

- [ ] **Step 5: Lancer les tests**

Run: `npm test 2>&1 | tail -20`
Expected: PASS — tous les tests de `carbs-on-board.test.ts` passent, et les 79 tests préexistants restent verts.

Si le test « ratios distincts » échoue, vérifier que `ratioForMeal` reçoit bien `mealType` et non `mealTime`. Si « excès d'insuline » échoue, vérifier `EXCESS_MAX_CARBS_G` : à T+30 min, 20 g laissent ~9 g à absorber, sous le seuil de 15 g.

- [ ] **Step 6: Typecheck et commit**

```bash
npx tsc --noEmit
git add types/index.ts lib/carbs-on-board.ts lib/carbs-on-board.test.ts
git commit -m "feat(diabete): moteur de calcul des glucides actifs (COB)"
```

---

### Task 2: Proposition d'appoint sous garde-fous

**Files:**
- Modify: `lib/carbs-on-board.ts`
- Test: `lib/carbs-on-board.test.ts`

**Interfaces:**
- Consumes: `CarbsOnBoard` (Task 1)
- Produces: `suggestTopUp(cob, ctx)` → `TopUpSuggestion | null`, type `TopUpSuggestion`, constantes `TOPUP_MIN_DEFICIT_U`, `TOPUP_MAX_UNITS`, `TOPUP_MIN_GLUCOSE`

- [ ] **Step 1: Écrire les tests qui échouent**

Ajouter à la fin de `lib/carbs-on-board.test.ts` :

```ts
import { suggestTopUp, type CarbsOnBoard } from "./carbs-on-board";

/** CarbsOnBoard synthétique pour tester les garde-fous isolément. */
function cobWith(over: Partial<CarbsOnBoard> = {}): CarbsOnBoard {
  return {
    carbsRemainingG: 40,
    fpuRemainingG: 0,
    totalRemainingG: 40,
    insulinNeededU: 4,
    insulinActiveU: 0,
    balanceU: -4,
    status: "deficit",
    uncertain: false,
    sources: [],
    ...over,
  };
}

test("appoint : déficit de 4 U à glycémie normale → 4 U proposées", () => {
  const s = suggestTopUp(cobWith(), { currentGlucose: 150 });
  assert.ok(s, "une suggestion est attendue");
  assert.equal(s.units, 4);
});

test("appoint : dose arrondie à l'entier inférieur (stylo sans demi-unités)", () => {
  const s = suggestTopUp(cobWith({ balanceU: -3.8 }), { currentGlucose: 150 });
  assert.equal(s?.units, 3);
});

test("appoint : plafonné à 4 U même sur un gros déficit", () => {
  const s = suggestTopUp(cobWith({ balanceU: -9 }), { currentGlucose: 200 });
  assert.equal(s?.units, 4);
  assert.equal(s?.capped, true);
});

test("appoint : rien sous le seuil de 1 U", () => {
  assert.equal(suggestTopUp(cobWith({ balanceU: -0.9 }), { currentGlucose: 150 }), null);
});

test("appoint : bloqué si glycémie < 90", () => {
  assert.equal(suggestTopUp(cobWith(), { currentGlucose: 85 }), null);
});

test("appoint : bloqué si trend en chute rapide", () => {
  assert.equal(
    suggestTopUp(cobWith(), { currentGlucose: 150, trendArrow: 1 }),
    null,
  );
});

test("appoint : bloqué si une source est incertaine", () => {
  assert.equal(
    suggestTopUp(cobWith({ uncertain: true }), { currentGlucose: 150 }),
    null,
  );
});

test("appoint : rien si le statut n'est pas 'deficit'", () => {
  assert.equal(
    suggestTopUp(cobWith({ status: "covered", balanceU: -0.2 }), { currentGlucose: 150 }),
    null,
  );
});

test("appoint : ne re-propose pas tant que le déficit ne s'est pas creusé d'1 U", () => {
  const ctx = { currentGlucose: 150, lastOfferedDeficitU: 4 };
  assert.equal(suggestTopUp(cobWith({ balanceU: -4.5 }), ctx), null);
  const s = suggestTopUp(cobWith({ balanceU: -5.2 }), ctx);
  assert.equal(s?.units, 5);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `suggestTopUp is not a function`

- [ ] **Step 3: Implémenter `suggestTopUp`**

Ajouter à la fin de `lib/carbs-on-board.ts` :

```ts
// ───────────────────────────────────────────────────────────────────────
// Proposition d'appoint
// ───────────────────────────────────────────────────────────────────────

/** Déficit minimal pour proposer un appoint (U). */
export const TOPUP_MIN_DEFICIT_U = BALANCE_THRESHOLD_U;
/** Plafond dur d'un appoint (U). */
export const TOPUP_MAX_UNITS = 4;
/** En dessous de cette glycémie, aucun appoint n'est proposé (mg/dL). */
export const TOPUP_MIN_GLUCOSE = 90;

export interface TopUpContext {
  /** Glycémie courante (mg/dL). */
  currentGlucose: number;
  /** Trend Libre numérique Abbott (1 = ↓↓ … 5 = ↑↑). */
  trendArrow?: number;
  /**
   * Déficit (valeur absolue, U) au moment de la dernière proposition.
   * Empêche de re-proposer en boucle tant que la situation n'a pas
   * matériellement empiré.
   */
  lastOfferedDeficitU?: number;
}

export interface TopUpSuggestion {
  /** Dose proposée (U entières — le stylo ne fait pas de demi-unités). */
  units: number;
  /** Déficit brut ayant motivé la proposition (U, valeur absolue). */
  deficitU: number;
  /** True si la dose a été rabotée par le plafond. */
  capped: boolean;
  /** Phrase prête à afficher. */
  reason: string;
}

/**
 * Propose un appoint d'insuline quand les glucides restants ne sont pas
 * couverts. Ce n'est pas du stacking : c'est le complément du bolus repas
 * (pratique MDI standard quand on a mangé plus que prévu).
 *
 * Renvoie null dès qu'un garde-fou s'oppose. Aucune application
 * automatique : l'appelant DOIT afficher la proposition et attendre un
 * clic explicite de l'utilisateur.
 */
export function suggestTopUp(
  cob: CarbsOnBoard,
  ctx: TopUpContext,
): TopUpSuggestion | null {
  if (cob.status !== "deficit") return null;

  // Quantité de glucides non fiable → on ne dose pas sur du vent.
  if (cob.uncertain) return null;

  // Garde-fous anti-hypo.
  if (ctx.currentGlucose < TOPUP_MIN_GLUCOSE) return null;
  if (ctx.trendArrow === 1) return null;

  const deficitU = Math.abs(cob.balanceU);
  if (deficitU < TOPUP_MIN_DEFICIT_U) return null;

  // Ne re-parle que si le déficit s'est creusé d'au moins 1 U de plus.
  if (
    ctx.lastOfferedDeficitU !== undefined &&
    deficitU < ctx.lastOfferedDeficitU + TOPUP_MIN_DEFICIT_U
  ) {
    return null;
  }

  const raw = Math.floor(deficitU);
  const units = Math.min(raw, TOPUP_MAX_UNITS);
  if (units < 1) return null;

  const capped = raw > TOPUP_MAX_UNITS;
  const grams = Math.round(cob.totalRemainingG);
  const reason = capped
    ? `Il reste ${grams} g à digérer et il manque environ ${deficitU.toFixed(1).replace(".", ",")} U. Proposition plafonnée à ${units} U par sécurité — re-vérifie ta glycémie dans 1 h.`
    : `Il reste ${grams} g à digérer et l'insuline active ne les couvre pas. Il manque environ ${units} U.`;

  return { units, deficitU: round1(deficitU), capped, reason };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Typecheck et commit**

```bash
npx tsc --noEmit
git add lib/carbs-on-board.ts lib/carbs-on-board.test.ts
git commit -m "feat(diabete): proposition d'appoint d'insuline sous garde-fous"
```

---

### Task 3: Généralisation du pipeline de rappels serveur

**Files:**
- Modify: `types/index.ts`
- Create: `lib/reminders/store.ts`, `lib/reminders/check.ts`, `lib/reminders/client.ts`, `lib/reminders/push-payload.ts`
- Create: `app/api/reminders/schedule/route.ts`, `app/api/reminders/cancel/route.ts`
- Modify: `app/api/split/schedule/route.ts`, `app/api/split/cancel/route.ts` (deviennent des alias)
- Modify: `app/api/cron/split-check/route.ts`, `app/api/cron/glucose-check/route.ts`
- Modify: `lib/push/alerts.ts` (nouveau type de push)
- Modify: `public/sw.js`
- Delete: `lib/split-reminders/store.ts`, `lib/split-reminders/check.ts`, `lib/split-reminders/client.ts`
- Test: `lib/reminders/push-payload.test.ts`

**Interfaces:**
- Consumes: `sendGlucosePush` (`lib/push/alerts.ts`)
- Produces: `buildReminderPush(reminder)` → `{ type, title, body, tag, url }` ; `scheduleReminderOnServer(reminder)`, `cancelReminderOnServer(id)` (`lib/reminders/client.ts`) ; `checkRemindersAndAlert()` (`lib/reminders/check.ts`) ; type `Reminder`, `ReminderKind`

- [ ] **Step 1: Étendre le type de rappel**

Dans `types/index.ts`, remplacer l'interface `SplitDoseReminder` par :

```ts
/** Nature d'un rappel serveur. */
export type ReminderKind = 'split' | 'meal-confirm';

/**
 * Rappel programmé côté serveur (KV) et tiré par le cron, donc reçu même
 * app fermée. Deux natures :
 *  - 'split'        : 2e injection d'un split dose (couverture FPU)
 *  - 'meal-confirm' : confirmation des glucides réellement mangés (T+20)
 */
export interface Reminder {
  id: string;
  /** Absent sur les rappels créés avant septembre 2026 → lire comme 'split'. */
  kind?: ReminderKind;
  parentInjectionId: string;
  /** split : dose à faire · meal-confirm : dose déjà faite (contexte). */
  units: number;
  triggerAt: string;        // ISO timestamp
  createdAt: string;        // ISO
  mealLabel?: string;       // ex: "pâtes", "pizza"
  /** meal-confirm uniquement : glucides estimés au moment du bolus. */
  carbsEstimated?: number;
  /** "pending" | "fired" | "dismissed" — pour ne pas re-tirer le rappel */
  status: 'pending' | 'fired' | 'dismissed';
}

/**
 * Alias historique. Le store Zustand ne persiste que des rappels de split ;
 * conservé pour ne pas casser les imports existants.
 */
export type SplitDoseReminder = Reminder;
```

- [ ] **Step 2: Écrire le test du constructeur de payload**

Créer `lib/reminders/push-payload.test.ts` :

```ts
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
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './push-payload'`

- [ ] **Step 4: Créer `lib/reminders/push-payload.ts`**

Fichier volontairement séparé de `check.ts` : pur, sans `server-only`, donc testable en node.

```ts
/**
 * Construction du payload push selon la nature du rappel.
 *
 * Pur et sans I/O (pas de "server-only") pour rester testable en node.
 */

import type { Reminder } from "@/types";

export interface ReminderPush {
  type: "split" | "meal-confirm";
  title: string;
  body: string;
  value?: number;
  url: string;
  tag: string;
}

export function buildReminderPush(reminder: Reminder): ReminderPush {
  // Rappels créés avant septembre 2026 : pas de kind → ce sont des splits.
  const kind = reminder.kind ?? "split";

  const minutesLate = Math.round(
    (Date.now() - new Date(reminder.triggerAt).getTime()) / 60_000,
  );
  const lateHint =
    minutesLate > 5 ? ` — programmé il y a ${minutesLate} min` : "";
  const mealHint = reminder.mealLabel ? ` (${reminder.mealLabel})` : "";

  if (kind === "meal-confirm") {
    const carbsHint =
      reminder.carbsEstimated !== undefined
        ? ` Tu avais estimé ${reminder.carbsEstimated} g.`
        : "";
    return {
      type: "meal-confirm",
      title: "Tu as mangé combien finalement ?",
      body: `Confirme les glucides de ton repas${mealHint} pour ajuster le suivi.${carbsHint}${lateHint}`,
      value: reminder.carbsEstimated,
      url: "/diabete",
      tag: `meal-confirm-${reminder.id}`,
    };
  }

  return {
    type: "split",
    title: "Rappel split dose",
    body: `Il est temps de faire ${reminder.units}U pour couvrir les graisses/protéines${mealHint}.${lateHint}`,
    value: reminder.units,
    url: "/diabete",
    tag: `split-${reminder.id}`,
  };
}
```

- [ ] **Step 5: Lancer le test**

Run: `npm test 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 6: Déplacer le store KV**

```bash
git mv lib/split-reminders/store.ts lib/reminders/store.ts
git mv lib/split-reminders/check.ts lib/reminders/check.ts
git mv lib/split-reminders/client.ts lib/reminders/client.ts
```

Dans `lib/reminders/store.ts` : remplacer les 2 occurrences de `SplitDoseReminder` par `Reminder` (import et signatures), et l'en-tête de commentaire `Split dose reminders — stockage KV serveur.` par `Rappels serveur (split dose + confirmation de repas) — stockage KV.`. **Ne pas changer la clé KV `"split:reminders"`** : les rappels déjà programmés doivent rester lisibles après déploiement.

- [ ] **Step 7: Réécrire `lib/reminders/check.ts` pour dispatcher sur `kind`**

Remplacer intégralement le contenu par :

```ts
/**
 * Checker de rappels — appelé par le cron (piggyback sur glucose-check).
 *
 * Pour chaque rappel dont triggerAt ≤ now et status === pending :
 *   1. Construit le payload selon sa nature (split / meal-confirm)
 *   2. Envoie un push VAPID
 *   3. Marque le rappel comme "fired" en KV
 *
 * Race tolérée : si l'utilisateur a agi dans l'app pile au moment du cron,
 * on peut envoyer une notif « fantôme ». Jugé acceptable (mieux 1 notif de
 * trop qu'aucune pour une question de santé).
 *
 * ⚠️ Server only.
 */

import "server-only";
import { sendGlucosePush } from "@/lib/push/alerts";
import { buildReminderPush } from "./push-payload";
import { getDueReminders, isKvConfigured, markFired } from "./store";

export type ReminderCheckResult = {
  ok: boolean;
  checked: number;
  fired: number;
  errors: string[];
};

export async function checkRemindersAndAlert(): Promise<ReminderCheckResult> {
  if (!isKvConfigured()) {
    return { ok: false, checked: 0, fired: 0, errors: ["kv_not_configured"] };
  }

  const due = await getDueReminders();
  if (due.length === 0) {
    return { ok: true, checked: 0, fired: 0, errors: [] };
  }

  let fired = 0;
  const errors: string[] = [];

  for (const reminder of due) {
    const res = await sendGlucosePush(buildReminderPush(reminder));

    if (res.sent) {
      await markFired(reminder.id);
      fired++;
    } else {
      errors.push(`reminder ${reminder.id}: ${res.reason ?? "unknown"}`);
      // Subscription expirée : on marque fired pour ne pas retenter en boucle.
      if (res.reason === "subscription_gone") {
        await markFired(reminder.id);
      }
    }
  }

  return { ok: errors.length === 0, checked: due.length, fired, errors };
}
```

- [ ] **Step 8: Réécrire `lib/reminders/client.ts`**

Remplacer intégralement le contenu par :

```ts
/**
 * Rappels serveur — helpers client (fire-and-forget).
 *
 * Synchronisent les rappels avec le KV serveur pour que le cron puisse
 * tirer le push même app fermée. Tous les appels sont silencieux pour ne
 * pas casser l'UX si le réseau est down.
 */

import type { Reminder } from "@/types";

export async function scheduleReminderOnServer(
  reminder: Reminder,
): Promise<boolean> {
  try {
    const res = await fetch("/api/reminders/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: reminder.id,
        kind: reminder.kind ?? "split",
        parentInjectionId: reminder.parentInjectionId,
        units: reminder.units,
        triggerAt: reminder.triggerAt,
        createdAt: reminder.createdAt,
        mealLabel: reminder.mealLabel,
        carbsEstimated: reminder.carbsEstimated,
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[reminders/client] schedule failed (silent):", err);
    return false;
  }
}

export async function cancelReminderOnServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/reminders/cancel?id=${encodeURIComponent(id)}`,
      { method: "DELETE" },
    );
    return res.ok;
  } catch (err) {
    console.warn("[reminders/client] cancel failed (silent):", err);
    return false;
  }
}
```

- [ ] **Step 9: Créer les nouvelles routes API**

```bash
mkdir -p app/api/reminders/schedule app/api/reminders/cancel
git mv app/api/split/schedule/route.ts app/api/reminders/schedule/route.ts
git mv app/api/split/cancel/route.ts app/api/reminders/cancel/route.ts
```

Dans `app/api/reminders/schedule/route.ts` :
- Remplacer l'import `@/lib/split-reminders/store` par `@/lib/reminders/store`
- Remplacer `SplitDoseReminder` par `Reminder` (import et annotation)
- Remplacer l'en-tête `POST /api/split/schedule` par `POST /api/reminders/schedule`
- Dans la construction de l'objet `reminder`, ajouter après `id: body.id,` :

```ts
    kind: body.kind === "meal-confirm" ? "meal-confirm" : "split",
```

et après `mealLabel: body.mealLabel,` :

```ts
    carbsEstimated: body.carbsEstimated,
```

Dans `app/api/reminders/cancel/route.ts` :
- Remplacer l'import `@/lib/split-reminders/store` par `@/lib/reminders/store`
- Remplacer l'en-tête `DELETE /api/split/cancel` par `DELETE /api/reminders/cancel`
- Remplacer les 2 préfixes de log `[split/cancel]` par `[reminders/cancel]`

- [ ] **Step 10: Recréer les anciennes routes comme alias**

Ces alias ne sont pas facultatifs : l'app est une PWA avec service worker, donc un client dont le JS est encore en cache appellera `/api/split/*` après le déploiement. Le client échoue en silence (`catch` vide, volontaire) — un 404 se traduirait par un rappel de split dose perdu, c'est-à-dire l'hyperglycémie tardive non couverte que le pipeline de juin corrigeait.

Créer `app/api/split/schedule/route.ts` :

```ts
/**
 * POST /api/split/schedule — ALIAS de compatibilité.
 *
 * Conservé pour les clients PWA dont le JS est encore en cache après le
 * renommage vers /api/reminders/* (septembre 2026). Supprimable une fois
 * que le service worker a rafraîchi le bundle chez l'utilisateur.
 */
export { POST, runtime, dynamic } from "@/app/api/reminders/schedule/route";
```

Créer `app/api/split/cancel/route.ts` :

```ts
/**
 * DELETE /api/split/cancel — ALIAS de compatibilité.
 *
 * Voir app/api/split/schedule/route.ts.
 */
export { DELETE, runtime, dynamic } from "@/app/api/reminders/cancel/route";
```

- [ ] **Step 11: Mettre à jour les crons**

Dans `app/api/cron/split-check/route.ts` et `app/api/cron/glucose-check/route.ts` :
- Remplacer `from "@/lib/split-reminders/check"` par `from "@/lib/reminders/check"`
- Remplacer `checkSplitsAndAlert` par `checkRemindersAndAlert` (import et appels)

Vérifier qu'aucune référence ne subsiste :

```bash
grep -rn "split-reminders\|checkSplitsAndAlert\|scheduleSplitOnServer\|cancelSplitOnServer" app lib components
```

Les seules occurrences restantes attendues sont dans `app/diabete/page.tsx` (traitées à la Task 7). Les corriger dès maintenant : remplacer l'import par `import { scheduleReminderOnServer, cancelReminderOnServer } from "@/lib/reminders/client";` et les 3 appels correspondants (`scheduleSplitOnServer(reminder)` → `scheduleReminderOnServer({ ...reminder, kind: "split" })`, et les 2 `cancelSplitOnServer(...)` → `cancelReminderOnServer(...)`).

- [ ] **Step 12: Autoriser le nouveau type de push**

Dans `lib/push/alerts.ts` ligne 44, remplacer :

```ts
  type: "hypo" | "hyper" | "split" | "test";
```

par :

```ts
  type: "hypo" | "hyper" | "split" | "meal-confirm" | "test";
```

- [ ] **Step 13: Adapter le service worker**

Dans `public/sw.js` :
- Ligne 2 : remplacer le commentaire de version par `// v5 : rappels génériques (split + meal-confirm)`
- Bumper la constante de version du cache (chercher `const CACHE` ou `CACHE_NAME` en tête de fichier et incrémenter le suffixe, ex. `apex-v4` → `apex-v5`), sinon le SW ne se met pas à jour chez l'utilisateur
- Ligne ~101 : `isUrgent` doit rester limité à hypo et split. Une demande de confirmation n'est pas urgente et ne doit pas exiger une interaction pour disparaître. Vérifier que la ligne est bien :

```js
  const isUrgent = payload.type === "hypo" || payload.type === "split";
```

(inchangée — `meal-confirm` n'y figure volontairement pas)

- [ ] **Step 14: Supprimer le dossier vidé et vérifier**

```bash
rmdir lib/split-reminders 2>/dev/null || true
npm test 2>&1 | tail -10
npx tsc --noEmit
```

Expected: tests PASS, typecheck sans erreur.

- [ ] **Step 15: Commit**

```bash
git add -A lib/reminders lib/split-reminders app/api/reminders app/api/split app/api/cron lib/push/alerts.ts public/sw.js types/index.ts app/diabete/page.tsx
git commit -m "refactor(diabete): pipeline de rappels générique (split + confirmation repas)"
```

---

### Task 4: Store — mise à jour d'une injection

**Files:**
- Modify: `lib/store.ts`

**Interfaces:**
- Produces: `updateInsulinLog(id: string, updates: Partial<InsulinLog>) => void` sur le store Zustand

- [ ] **Step 1: Ajouter l'action au type du store**

Dans `lib/store.ts`, après la ligne `removeInsulinLog: (id: string) => void;` (~ligne 85), ajouter :

```ts
  updateInsulinLog: (id: string, updates: Partial<InsulinLog>) => void;
```

- [ ] **Step 2: Implémenter l'action**

Chercher l'implémentation de `removeInsulinLog` dans le corps du `create(...)` et ajouter juste après :

```ts
      updateInsulinLog: (id, updates) =>
        set((state) => ({
          insulinLogs: state.insulinLogs.map((log) =>
            log.id === id ? { ...log, ...updates } : log,
          ),
        })),
```

- [ ] **Step 3: Vérifier**

Run: `npx tsc --noEmit`
Expected: aucune erreur.

- [ ] **Step 4: Commit**

```bash
git add lib/store.ts
git commit -m "feat(store): action updateInsulinLog"
```

---

### Task 5: Tuile « Glucides actifs » dans le header

**Files:**
- Create: `components/glucose/CarbsOnBoardTile.tsx`
- Modify: `app/diabete/page.tsx` (header, ~lignes 1106-1136)

**Interfaces:**
- Consumes: `computeCarbsOnBoard`, type `CarbsOnBoard` (Task 1)
- Produces: composant `<CarbsOnBoardTile cob={...} />` ; memo `cob` dans `DiabetePage`

- [ ] **Step 1: Créer le composant de tuile**

Créer `components/glucose/CarbsOnBoardTile.tsx` :

```tsx
"use client";

/**
 * Tuile « Glucides actifs » — pendant de la tuile Insuline active.
 *
 * Affiche ce qu'il reste à digérer et le verdict de couverture. Ne porte
 * JAMAIS de bouton d'action : les doses se valident dans la carte de
 * confirmation, pour qu'il n'y ait qu'un seul endroit où une dose part.
 */

import { Wheat } from "lucide-react";
import type { CarbsOnBoard } from "@/lib/carbs-on-board";

function fr(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export function CarbsOnBoardTile({ cob }: { cob: CarbsOnBoard }) {
  const tone =
    cob.status === "deficit"
      ? "warning"
      : cob.status === "excess"
        ? "info"
        : cob.status === "idle"
          ? "idle"
          : "nutrition";

  const colorClass =
    tone === "warning"
      ? "text-warning"
      : tone === "info"
        ? "text-info"
        : tone === "idle"
          ? "text-text-tertiary"
          : "text-nutrition";

  const iconBg =
    tone === "warning"
      ? "bg-warning/10"
      : tone === "info"
        ? "bg-info/10"
        : "bg-nutrition/10";

  let verdict: string;
  if (cob.status === "idle") {
    verdict = "Rien en cours";
  } else if (cob.uncertain) {
    verdict = "Quantité incertaine — pas de conseil de dose";
  } else if (cob.status === "deficit") {
    verdict = `Il manque ~${fr(Math.abs(cob.balanceU))} U`;
  } else if (cob.status === "excess") {
    verdict = `Insuline en excès ~${fr(cob.balanceU)} U`;
  } else {
    verdict = "Couvert";
  }

  return (
    <div className="surface-2 rounded-2xl p-5 flex items-center gap-5">
      <div
        className={`shrink-0 w-12 h-12 rounded-xl ${iconBg} flex items-center justify-center`}
      >
        <Wheat className={`w-5 h-5 ${colorClass}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="label mb-1">Glucides actifs</p>
        <div className="flex items-baseline gap-1.5">
          <span
            className={`num-hero text-4xl sm:text-5xl font-semibold leading-none ${colorClass}`}
          >
            {cob.uncertain ? "≈" : ""}
            {Math.round(cob.totalRemainingG)}
          </span>
          <span className="text-xs text-text-tertiary">g</span>
        </div>
        {cob.fpuRemainingG >= 1 && (
          <p className="mt-1 text-[11px] text-text-tertiary">
            dont {Math.round(cob.fpuRemainingG)} g de lipides/protéines
          </p>
        )}
        <p className="mt-1 text-xs text-text-secondary">{verdict}</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Calculer le COB dans la page**

Dans `app/diabete/page.tsx`, ajouter l'import en tête de fichier :

```ts
import { computeCarbsOnBoard } from "@/lib/carbs-on-board";
import { CarbsOnBoardTile } from "@/components/glucose/CarbsOnBoardTile";
```

Puis, juste après le memo `iob` (qui se termine ligne ~325 par `}, [insulinLogs, nowTick]);`), ajouter :

```ts
  // ─── Glucides actifs (COB) ────────────────────────────────────────
  // Même moteur d'absorption que la prédiction nuit → les deux vues ne
  // peuvent pas se contredire.
  const cob = useMemo(
    () =>
      computeCarbsOnBoard({
        insulinLogs,
        carbEntries,
        isf: diabetesConfig.insulinSensitivityFactor,
        ratios: diabetesConfig.ratios,
        nowMs: nowTick,
      }),
    [insulinLogs, carbEntries, diabetesConfig, nowTick],
  );
```

- [ ] **Step 3: Basculer la tuile IOB sur le modèle bi-exponentiel**

Le COB compare son besoin à `activeIOB` (bi-exponentiel). Laisser la tuile voisine sur le modèle linéaire afficherait deux chiffres contradictoires côte à côte.

Dans le memo `iob` (~ligne 312), remplacer l'appel à `getInsulinOnBoard(recentInjections)` par le calcul bi-exponentiel. Le memo doit désormais renvoyer la même forme (`{ totalIOB, details }`) pour ne rien casser en aval :

```ts
    const totalIOB = activeIOB(
      recentInjections.map((inj) => ({ units: inj.units, minutesAgo: inj.minutesAgo })),
    );
    return {
      totalIOB: Math.round(totalIOB * 10) / 10,
      details: recentInjections,
    };
```

Ajouter l'import correspondant : `import { activeIOB } from "@/lib/glucose-prediction";` (si `getInsulinOnBoard` n'est plus utilisé ailleurs dans le fichier, retirer son import — le vérifier avec `grep -n "getInsulinOnBoard" app/diabete/page.tsx`).

- [ ] **Step 4: Réorganiser le header**

Dans `app/diabete/page.tsx` (~ligne 1106), remplacer le bloc :

```tsx
        <div className="relative grid sm:grid-cols-2 gap-4">
          <GlucoseWidget
            fallbackValue={lastValue}
            fallbackRecordedAt={lastGlucose?.recordedAt}
          />
```

par :

```tsx
        <div className="relative space-y-4">
          <GlucoseWidget
            fallbackValue={lastValue}
            fallbackRecordedAt={lastGlucose?.recordedAt}
          />
          <div className="grid grid-cols-2 gap-4">
```

Puis, après la fermeture de la tuile « Insuline active » (le `</div>` qui suit le paragraphe `Rien d'actif` / `N injections en cours`), insérer la nouvelle tuile et fermer la grille :

```tsx
            <CarbsOnBoardTile cob={cob} />
          </div>
```

Résultat attendu : la glycémie occupe toute la largeur, puis Insuline active et Glucides actifs sont côte à côte en dessous, sur mobile comme sur desktop.

- [ ] **Step 5: Vérifier en preview**

```bash
npx tsc --noEmit
```

Puis démarrer le serveur de dev via l'outil de preview (jamais via Bash) et vérifier sur `/diabete` :
- trois tuiles visibles, glycémie pleine largeur au-dessus
- la tuile Glucides actifs affiche « 0 g · Rien en cours » sans données
- après avoir loggé une injection avec glucides depuis le calculateur, elle affiche des grammes décroissants et un verdict
- aucune erreur en console

- [ ] **Step 6: Commit**

```bash
git add components/glucose/CarbsOnBoardTile.tsx app/diabete/page.tsx
git commit -m "feat(diabete): tuile glucides actifs + IOB unifié sur le modèle bi-exponentiel"
```

---

### Task 6: Carte de confirmation des glucides + appoint

**Files:**
- Create: `components/diabete/MealConfirmCard.tsx`
- Create: `components/diabete/TopUpCard.tsx`
- Modify: `app/diabete/page.tsx`

**Interfaces:**
- Consumes: `suggestTopUp`, `computeCarbsOnBoard` (Tasks 1-2) ; `updateInsulinLog` (Task 4) ; `cancelReminderOnServer` (Task 3)
- Produces: composants `<MealConfirmCard />`, `<TopUpCard />`

**Props des composants UI existants (vérifiées, ne pas improviser) :**
- `Button` : `variant?: "primary" | "secondary" | "ghost" | "danger"`, `size?: "sm" | "md" | "lg" | "xl"`, `fullWidth?: boolean`, plus tous les attributs `<button>`.
- `NumberInput` : `value`, `onChange(n: number)`, `unit?: string` (**pas** `suffix`), `min`, `max`, `step`, `size?: "md" | "lg" | "xl"`, `ariaLabel?: string`. **N'accepte pas de prop `id`** → ne pas utiliser `<label htmlFor>`, mettre un `<p className="label">` au-dessus.
- `Badge` : `variant?: "default" | "success" | "warning" | "error" | "info" | "accent" | "muscu" | "running" | "nutrition" | "diabete"`, `size?: "sm" | "md"`.

- [ ] **Step 1: Créer la carte**

Créer `components/diabete/MealConfirmCard.tsx` :

```tsx
"use client";

/**
 * Carte de confirmation des glucides réellement mangés (T+15 min → T+3 h).
 *
 * État DÉRIVÉ des insulinLogs : aucun état persistant supplémentaire. La
 * carte disparaît dès que l'injection porte carbsConfirmedAt ou
 * carbsUncertain.
 *
 * Si la confirmation révèle un déficit, la carte se transforme en
 * proposition d'appoint plutôt que de disparaître. Aucune dose n'est
 * jamais appliquée sans clic explicite + confirm().
 */

import { useState } from "react";
import { Check, HelpCircle, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { NumberInput } from "@/components/ui/NumberInput";
import type { InsulinLog } from "@/types";

export interface MealConfirmCardProps {
  log: InsulinLog;
  onConfirm: (values: {
    carbs: number;
    fat: number;
    protein: number;
  }) => void;
  onUncertain: () => void;
}

export function MealConfirmCard({
  log,
  onConfirm,
  onUncertain,
}: MealConfirmCardProps) {
  const [carbs, setCarbs] = useState(log.carbsGrams);
  const [fat, setFat] = useState(log.fatGrams ?? 0);
  const [protein, setProtein] = useState(log.proteinGrams ?? 0);
  const [showMacros, setShowMacros] = useState(false);

  const injectedLabel = new Date(log.injectedAt).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="surface-1 rounded-2xl p-5 border border-accent-2/25 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <UtensilsCrossed className="w-4 h-4 text-accent-2" />
        <h2 className="text-base font-semibold text-text-primary">
          Tu as mangé combien finalement ?
        </h2>
      </div>
      <p className="text-sm text-text-secondary mb-4">
        Injection de {log.units} U à {injectedLabel} pour ~{log.carbsGrams} g
        estimés.
      </p>

      <Button
        className="w-full mb-3"
        onClick={() =>
          onConfirm({
            carbs: log.carbsGrams,
            fat: log.fatGrams ?? 0,
            protein: log.proteinGrams ?? 0,
          })
        }
      >
        <Check className="w-4 h-4 mr-1.5" />
        C&apos;était bien {log.carbsGrams} g
      </Button>

      <div className="mb-3">
        <p className="label mb-1">Corriger les glucides</p>
        <NumberInput
          value={carbs}
          onChange={setCarbs}
          step={5}
          min={0}
          unit="g"
          ariaLabel="Glucides réellement mangés"
        />
      </div>

      <button
        type="button"
        onClick={() => setShowMacros((v) => !v)}
        className="text-xs text-text-tertiary underline mb-3 tap-scale"
      >
        {showMacros ? "Masquer" : "Ajuster"} lipides & protéines
      </button>

      {showMacros && (
        <div className="grid grid-cols-2 gap-3 mb-3 animate-slide-up">
          <div>
            <p className="label mb-1">Lipides</p>
            <NumberInput
              value={fat}
              onChange={setFat}
              step={5}
              min={0}
              unit="g"
              size="md"
              ariaLabel="Lipides confirmés"
            />
          </div>
          <div>
            <p className="label mb-1">Protéines</p>
            <NumberInput
              value={protein}
              onChange={setProtein}
              step={5}
              min={0}
              unit="g"
              size="md"
              ariaLabel="Protéines confirmées"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={() => onConfirm({ carbs, fat, protein })}>
          Enregistrer
        </Button>
        <Button variant="ghost" onClick={onUncertain}>
          <HelpCircle className="w-4 h-4 mr-1.5" />
          Je ne sais pas
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Créer la carte d'appoint**

Composant séparé : la proposition de dose a un cycle de vie propre (elle peut apparaître sans qu'une confirmation soit en attente, typiquement quand les FPU dérapent à T+3 h).

Créer `components/diabete/TopUpCard.tsx` :

```tsx
"use client";

/**
 * Proposition d'appoint d'insuline quand les glucides restants ne sont pas
 * couverts. Rien n'est jamais appliqué sans clic explicite : la validation
 * repasse par un confirm() natif côté page.
 */

import { Syringe } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TopUpSuggestion } from "@/lib/carbs-on-board";

export interface TopUpCardProps {
  topUp: TopUpSuggestion;
  onAccept: (units: number) => void;
  onDismiss: () => void;
}

export function TopUpCard({ topUp, onAccept, onDismiss }: TopUpCardProps) {
  return (
    <section className="surface-1 rounded-2xl p-5 border border-warning/25 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Syringe className="w-4 h-4 text-warning" />
        <h2 className="text-base font-semibold text-text-primary">
          Appoint suggéré
        </h2>
      </div>
      <p className="text-sm text-text-secondary mb-4">{topUp.reason}</p>
      <div className="flex items-baseline gap-1.5 mb-4">
        <span className="num-hero text-5xl font-semibold text-warning leading-none">
          {topUp.units}
        </span>
        <span className="text-xs text-text-tertiary">U</span>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => onAccept(topUp.units)}>
          Valider {topUp.units} U
        </Button>
        <Button variant="ghost" onClick={onDismiss}>
          Plus tard
        </Button>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Câbler les cartes dans la page**

Dans `app/diabete/page.tsx`, ajouter les imports :

```ts
import { suggestTopUp } from "@/lib/carbs-on-board";
import { MealConfirmCard } from "@/components/diabete/MealConfirmCard";
import { TopUpCard } from "@/components/diabete/TopUpCard";
```

Récupérer l'action du store à côté des autres (`updateInsulinLog`) :

```ts
  const updateInsulinLog = useStore((s) => s.updateInsulinLog);
```

Après le memo `cob` (Task 5), ajouter la dérivation de la carte et de l'appoint :

```ts
  // ─── Confirmation des glucides (T+15 → T+3h) ──────────────────────
  // État dérivé : la première injection avec glucides, ni confirmée ni
  // marquée incertaine, dans la fenêtre.
  const [topUpDismissedDeficit, setTopUpDismissedDeficit] = useState<number | undefined>(undefined);

  // `insulinLogs` est trié du plus récent au plus ancien (addInsulinLog
  // insère en tête) → .find() retourne bien la dernière injection éligible.
  // Ne pas ajouter de tri.
  const pendingConfirm = useMemo(() => {
    return (
      insulinLogs.find((log) => {
        if (log.isSplitDose) return false;
        if (!log.carbsGrams || log.carbsGrams <= 0) return false;
        if (log.carbsConfirmedAt || log.carbsUncertain) return false;
        const minutesAgo = (nowTick - new Date(log.injectedAt).getTime()) / 60_000;
        return minutesAgo >= 15 && minutesAgo <= 180;
      }) ?? null
    );
  }, [insulinLogs, nowTick]);

  const topUp = useMemo(
    () =>
      suggestTopUp(cob, {
        currentGlucose: liveGlucose?.value ?? currentGlucose,
        trendArrow: trendStringToNumber(liveGlucose?.trend) ?? trendArrow,
        lastOfferedDeficitU: topUpDismissedDeficit,
      }),
    [cob, liveGlucose, currentGlucose, trendArrow, topUpDismissedDeficit],
  );
```

- [ ] **Step 4: Ajouter les handlers**

À côté de `handleConfirmSplitDose` dans la page :

```ts
  function handleConfirmCarbs(
    log: InsulinLog,
    values: { carbs: number; fat: number; protein: number },
  ) {
    updateInsulinLog(log.id, {
      carbsConfirmedGrams: values.carbs,
      fatConfirmedGrams: values.fat,
      proteinConfirmedGrams: values.protein,
      carbsConfirmedAt: new Date().toISOString(),
    });
    // Le rappel serveur n'a plus lieu d'être.
    cancelReminderOnServer(`mc-${log.id}`);
  }

  function handleMarkUncertain(log: InsulinLog) {
    updateInsulinLog(log.id, {
      carbsUncertain: true,
      carbsConfirmedAt: new Date().toISOString(),
    });
    cancelReminderOnServer(`mc-${log.id}`);
  }

  function handleAcceptTopUp(units: number) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Enregistrer un appoint de ${units} U ?`)
    ) {
      return;
    }
    addInsulinLog({
      id: crypto.randomUUID(),
      units,
      insulinType: profile.insulinRapid,
      mealType: "correction",
      carbsGrams: 0,
      glucoseBefore: liveGlucose?.value ?? currentGlucose,
      notes: "appoint (glucides non couverts)",
      injectedAt: new Date(),
      parentInjectionId: pendingConfirm?.id,
    });
    setTopUpDismissedDeficit(undefined);
  }
```

Note sur `handleAcceptTopUp` : l'appoint porte `parentInjectionId` mais **pas** `isSplitDose`. Ce n'est pas une couverture FPU différée — la liste des injections ne doit donc pas afficher le badge « split » (traité en Task 7).

- [ ] **Step 5: Rendre les cartes**

Dans le JSX, juste avant `{/* ── RAPPELS SPLIT DOSE en attente ── */}`, insérer :

```tsx
      {/* ── CONFIRMATION DES GLUCIDES (T+15 → T+3h) ── */}
      {pendingConfirm && (
        <MealConfirmCard
          log={pendingConfirm}
          onConfirm={(v) => handleConfirmCarbs(pendingConfirm, v)}
          onUncertain={() => handleMarkUncertain(pendingConfirm)}
        />
      )}

      {/* ── APPOINT SUGGÉRÉ (glucides restants non couverts) ── */}
      {topUp && (
        <TopUpCard
          topUp={topUp}
          onAccept={handleAcceptTopUp}
          onDismiss={() => setTopUpDismissedDeficit(topUp.deficitU)}
        />
      )}
```

Les deux cartes peuvent coexister : une confirmation en attente n'empêche pas un déficit déjà détecté d'être signalé.

- [ ] **Step 6: Vérifier en preview**

```bash
npx tsc --noEmit
```

Via l'outil de preview sur `/diabete`. Le temps ne pouvant pas être avancé depuis le navigateur, remplacer temporairement `minutesAgo >= 15` par `minutesAgo >= 0` dans `pendingConfirm` pour valider le rendu, **puis le remettre à 15 avant de commiter**.

- logger une injection avec 60 g de glucides → la carte affiche « C'était bien 60 g », le champ de correction et le bouton « Je ne sais pas »
- confirmer 140 g → la carte de confirmation disparaît, celle d'appoint apparaît avec une dose entière
- cliquer « Valider » → `confirm()` s'affiche, puis une nouvelle injection apparaît dans la liste et le déficit se résorbe
- cliquer « Je ne sais pas » → la carte disparaît et la tuile passe en « Quantité incertaine », sans proposition de dose

- [ ] **Step 7: Commit**

```bash
git add components/diabete/MealConfirmCard.tsx components/diabete/TopUpCard.tsx app/diabete/page.tsx
git commit -m "feat(diabete): confirmation des glucides à T+20 et appoint suggéré"
```

---

### Task 7: Toggle « quantité incertaine », programmation du rappel, badges

**Files:**
- Modify: `app/diabete/page.tsx`

**Interfaces:**
- Consumes: `scheduleReminderOnServer` (Task 3)
- Produces: état `carbsUncertain` dans le calculateur ; rappel `meal-confirm` programmé à l'injection

- [ ] **Step 1: Ajouter l'état du toggle**

Dans `app/diabete/page.tsx`, à côté des autres `useState` du calculateur (~ligne 235) :

```ts
  // Quantité de glucides non estimable (resto, cuisine de quelqu'un d'autre).
  const [carbsUncertain, setCarbsUncertain] = useState(false);
```

- [ ] **Step 2: Ajouter le toggle dans l'UI du calculateur**

Juste sous le champ glucides du calculateur, insérer :

```tsx
              <button
                type="button"
                onClick={() => setCarbsUncertain((v) => !v)}
                className={`mt-2 flex items-center gap-1.5 text-xs tap-scale ${
                  carbsUncertain ? "text-warning" : "text-text-tertiary"
                }`}
              >
                <HelpCircle className="w-3.5 h-3.5" />
                {carbsUncertain
                  ? "Quantité incertaine — aucun conseil de dose ne sera donné"
                  : "Je ne suis pas sûr de la quantité"}
              </button>
```

Ajouter `HelpCircle` à l'import `lucide-react` du fichier s'il n'y est pas déjà.

- [ ] **Step 3: Propager le drapeau et programmer le rappel**

Dans `handleSaveInjection`, ajouter à l'objet passé à `addInsulinLog` (après `mealSize`) :

```ts
      carbsUncertain: carbsUncertain || undefined,
```

Puis, après le bloc `if (bolusResult.splitDose) { … }`, ajouter :

```ts
    // ─── Rappel de confirmation des glucides (T+20 min) ──────────
    // Inutile si la quantité est déjà déclarée incertaine.
    if (carbsGrams > 0 && !carbsUncertain) {
      scheduleReminderOnServer({
        // ID déterministe : permet d'annuler le rappel à la confirmation
        // sans avoir à mémoriser son identifiant côté client.
        id: `mc-${injectionId}`,
        kind: "meal-confirm",
        parentInjectionId: injectionId,
        units: finalUnits,
        triggerAt: new Date(Date.now() + 20 * 60_000).toISOString(),
        createdAt: new Date().toISOString(),
        mealLabel: mealTag,
        carbsEstimated: carbsGrams,
        status: "pending",
      });
    }

    setCarbsUncertain(false);
```

- [ ] **Step 4: Ajouter les badges dans la liste des injections**

Dans le bloc de rendu de la liste (~ligne 2318), après le `{log.isSplitDose && (…)}` existant, ajouter :

```tsx
                      {log.parentInjectionId && !log.isSplitDose && (
                        <Badge variant="warning" size="sm">
                          appoint
                        </Badge>
                      )}
                      {log.carbsUncertain && (
                        <Badge variant="warning" size="sm">
                          incertain
                        </Badge>
                      )}
```

- [ ] **Step 5: Afficher les glucides confirmés dans la liste**

Dans la même carte, remplacer :

```tsx
                    <span>{log.carbsGrams}g gluc.</span>
```

par :

```tsx
                    <span>
                      {log.carbsConfirmedGrams ?? log.carbsGrams}g gluc.
                      {log.carbsConfirmedGrams !== undefined &&
                        log.carbsConfirmedGrams !== log.carbsGrams && (
                          <span className="text-text-tertiary">
                            {" "}
                            (estimé {log.carbsGrams})
                          </span>
                        )}
                    </span>
```

- [ ] **Step 6: Vérifier en preview**

```bash
npx tsc --noEmit
```

Sur `/diabete` :
- le toggle « Je ne suis pas sûr de la quantité » bascule et change de couleur
- une injection loggée avec le toggle actif porte le badge « incertain » et ne déclenche aucune carte de confirmation
- la tuile Glucides actifs affiche « ≈ » et le verdict « Quantité incertaine »
- un appoint validé porte le badge « appoint » et pas « split »

- [ ] **Step 7: Commit**

```bash
git add app/diabete/page.tsx
git commit -m "feat(diabete): repas à quantité incertaine + rappel de confirmation"
```

---

### Task 8: Branchements apprentissage et nettoyage

**Files:**
- Modify: `lib/meal-analytics.ts`
- Modify: `lib/carbs-on-board.ts` (helper de filtrage des nuits)
- Modify: `lib/night-brain.ts` (input `mealCoverage` : présente au lieu de recalculer)
- Test: `lib/carbs-on-board.test.ts`
- Modify: `app/diabete/page.tsx` (calibration nuit, night-brain)
- Modify: `app/diabete/docteur/page.tsx:268`, `app/diabete/historique/page.tsx:330`
- Modify: `types/index.ts`, `lib/store.ts` (suppression de `ManualDigestion`)

**Interfaces:**
- Consumes: `isLearnable` (Task 1), `computeCarbsOnBoard` (Task 1)
- Produces: `filterLearnableNightLogs(logs, insulinLogs)`

- [ ] **Step 1: Écrire le test du filtre de nuits**

Ajouter à `lib/carbs-on-board.test.ts` :

```ts
import { filterLearnableNightLogs } from "./carbs-on-board";

test("filterLearnableNightLogs : écarte les nuits précédées d'un repas incertain", () => {
  const nightAt = new Date("2026-09-01T22:00:00Z").getTime();
  const logs = [{ createdAt: new Date(nightAt).toISOString() }];

  const uncertainDinner = log(0, {
    id: "d1",
    carbsGrams: 90,
    carbsUncertain: true,
    injectedAt: new Date(nightAt - 2 * 3_600_000),
  });
  assert.equal(filterLearnableNightLogs(logs, [uncertainDinner]).length, 0);

  const cleanDinner = log(0, {
    id: "d2",
    carbsGrams: 90,
    injectedAt: new Date(nightAt - 2 * 3_600_000),
  });
  assert.equal(filterLearnableNightLogs(logs, [cleanDinner]).length, 1);

  // Un repas incertain vieux de 12 h ne pollue pas la nuit.
  const oldDinner = log(0, {
    id: "d3",
    carbsGrams: 90,
    carbsUncertain: true,
    injectedAt: new Date(nightAt - 12 * 3_600_000),
  });
  assert.equal(filterLearnableNightLogs(logs, [oldDinner]).length, 1);
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `filterLearnableNightLogs is not a function`

- [ ] **Step 3: Implémenter le filtre**

Ajouter à `lib/carbs-on-board.ts` :

```ts
/** Fenêtre avant une nuit pendant laquelle un repas peut la polluer (ms). */
const NIGHT_MEAL_WINDOW_MS = 6 * 3_600_000;

/**
 * Écarte du backtest nocturne les nuits précédées d'un repas à quantité
 * incertaine : leur erreur de prédiction ne mesure pas la qualité du
 * modèle, mais l'imprécision de la saisie.
 *
 * ⚠️ Ne PAS confondre avec la liste d'injections passée à
 * `estimateNightDrift` : celle-ci sert à repérer les fenêtres SANS
 * insuline. Y masquer une injection réelle ferait croire à une fenêtre à
 * jeun et fausserait la dérive basale. L'insuline injectée est réelle et
 * ne sort jamais des calculs.
 */
export function filterLearnableNightLogs<T extends { createdAt: string }>(
  nightLogs: T[],
  insulinLogs: InsulinLog[],
): T[] {
  const uncertainTimes = insulinLogs
    .filter((l) => !isLearnable(l))
    .map((l) => toMs(l.injectedAt))
    .filter((t) => Number.isFinite(t));
  if (uncertainTimes.length === 0) return nightLogs;

  return nightLogs.filter((log) => {
    const nightMs = new Date(log.createdAt).getTime();
    if (!Number.isFinite(nightMs)) return true;
    return !uncertainTimes.some(
      (t) => t <= nightMs && nightMs - t <= NIGHT_MEAL_WINDOW_MS,
    );
  });
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 5: Exclure les repas incertains des stats par type de repas**

Dans `lib/meal-analytics.ts` ligne 73, remplacer :

```ts
    .filter((log) => log.mealTag === mealTag && !log.isSplitDose)
```

par :

```ts
    .filter((log) => log.mealTag === mealTag && !log.isSplitDose && isLearnable(log))
```

et ajouter l'import `import { isLearnable, resolveCarbs } from "./carbs-on-board";`.

Dans le même fichier, remplacer toute lecture de `log.carbsGrams` servant à l'analyse par `resolveCarbs(log)` — les stats doivent porter sur ce qui a réellement été mangé. Les localiser avec :

```bash
grep -n "carbsGrams" lib/meal-analytics.ts
```

- [ ] **Step 6: Filtrer le backtest nocturne**

Dans `app/diabete/page.tsx`, memo `nightCalibration` (~ligne 802), remplacer :

```ts
    const logsSinceChange = basalChangeMs
      ? nightPredictionLogs.filter((l) => new Date(l.createdAt).getTime() >= basalChangeMs)
      : nightPredictionLogs;
```

par :

```ts
    const logsSinceChange = filterLearnableNightLogs(
      basalChangeMs
        ? nightPredictionLogs.filter((l) => new Date(l.createdAt).getTime() >= basalChangeMs)
        : nightPredictionLogs,
      insulinLogs,
    );
```

Ajouter `filterLearnableNightLogs` à l'import de `@/lib/carbs-on-board`.

**Ne pas toucher** au tableau `injections` construit juste au-dessus et passé à `estimateNightDrift` : il doit continuer à contenir toutes les injections.

- [ ] **Step 7: Exclure les repas incertains du contexte IA**

Dans `app/diabete/docteur/page.tsx` ligne 268, remplacer `injections: insulinLogs,` par :

```ts
        injections: insulinLogs.filter(isLearnable),
```

Dans `app/diabete/historique/page.tsx` ligne 330, appliquer le même remplacement.

Ajouter dans les deux fichiers : `import { isLearnable } from "@/lib/carbs-on-board";`

- [ ] **Step 8: Rebrancher `mealCoverage` du Night Brain sur le vrai COB**

`night-brain.ts` recalcule aujourd'hui le déficit lui-même (`expected = carbsGrams / gramsPerU`), avec un ratio unique. Lui passer des grammes bruts ferait coexister deux calculs de couverture concurrents et divergents. Le moteur COB devient la seule source : night-brain n'est plus qu'un présentateur.

Dans `lib/night-brain.ts`, remplacer la déclaration de l'input (~ligne 49) :

```ts
  /**
   * Couverture du repas en cours, calculée par le moteur COB
   * (lib/carbs-on-board.ts). Night Brain ne recalcule rien : il présente.
   */
  mealCoverage?: {
    /** Glucides encore à absorber (g). */
    carbsRemainingG: number;
    /** Balance insuline active − besoin (U). Négatif = sous-dosé. */
    balanceU: number;
  };
```

Puis remplacer le corps du bloc `if (input.mealCoverage …)` (~ligne 147) :

```ts
  let coverageStep: NightStep | undefined;
  if (input.mealCoverage) {
    const { carbsRemainingG, balanceU } = input.mealCoverage;
    const grams = Math.round(carbsRemainingG);
    if (balanceU <= -1.5) {
      coverageStep = {
        id: "coverage",
        order: 0,
        kind: "coverage",
        tone: "warning",
        headline: `Attention, tu as peut-être trop mangé pour ton insuline`,
        detail: `Il reste ~${grams}g de glucides à digérer et il manque ~${(-balanceU).toFixed(1).replace(".", ",")}U pour les couvrir → ça va te faire monter (vois le réveil prédit ci-dessous). Surveille, une correction sera peut-être conseillée plus bas.`,
      };
    } else if (balanceU >= 1.5) {
      coverageStep = {
        id: "coverage",
        order: 0,
        kind: "coverage",
        tone: "info",
        headline: `Tu as plus d'insuline active que nécessaire`,
        detail: `Surplus ~${balanceU.toFixed(1).replace(".", ",")}U pour les ~${grams}g qu'il te reste à digérer → risque de baisse. Garde du sucre à portée et surveille.`,
      };
    }
  }
```

Les seuils ±1,5 U sont conservés tels quels : le plan de la nuit reste volontairement plus prudent que la tuile (seuil 1,0 U), parce qu'une alerte nocturne engage plusieurs heures sans surveillance.

Enfin, dans `app/diabete/page.tsx`, dans l'objet retourné par le memo `bedtimeInput` (à côté de `pendingSplitUnits`, ~ligne 922), ajouter :

```ts
      mealCoverage:
        cob.status === "idle" || cob.uncertain
          ? undefined
          : { carbsRemainingG: cob.totalRemainingG, balanceU: cob.balanceU },
```

et ajouter `cob` au tableau de dépendances du memo. Un repas incertain ne produit pas d'étape `coverage` : le plan de la nuit ne conseille jamais de dose sur une quantité inconnue.

- [ ] **Step 9: Supprimer le code mort `ManualDigestion`**

Dans `types/index.ts` : supprimer l'interface `ManualDigestion` et son bloc de commentaire.

Dans `lib/store.ts` : supprimer `ManualDigestion` de l'import de types, les 2 lignes de déclaration (`manualDigestion` / `setManualDigestion`) et les 2 lignes d'implémentation.

Vérifier qu'il n'en reste rien :

```bash
grep -rn "ManualDigestion\|manualDigestion" app lib components types hooks
```

Expected: aucun résultat.

- [ ] **Step 10: Vérification finale**

```bash
npm test 2>&1 | tail -10
npx tsc --noEmit
npm run lint
```

Expected: tests PASS, typecheck sans erreur, lint sans nouvelle erreur.

Puis, via l'outil de preview, parcourir `/diabete`, `/diabete/historique` et `/diabete/docteur` : aucune erreur console, les cartes se rendent, le plan de la nuit s'affiche en soirée.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat(diabete): exclusion des repas incertains de l'apprentissage + purge ManualDigestion"
```

---

## Vérification d'ensemble

Après la Task 8, la spec est couverte :

| Section de la spec | Task |
|---|---|
| 1. Calcul `lib/carbs-on-board.ts` | 1 |
| 2. Unification du modèle d'IOB | 5 (step 3) |
| 3. Confirmation à T+20 (données, déclenchement, carte) | 1 (types), 3 (pipeline), 6 (carte), 7 (programmation) |
| 4. Appoint sous garde-fous + veille continue | 2, 6 |
| 5. Repas incertain (règle, surfaces, points d'entrée) | 1, 2, 6, 7, 8 |
| 6. UI (layout, tuile) | 5 |
| 7. Suppressions (`ManualDigestion`, `mealCoverage`) | 8 |
| 8. Tests | 1, 2, 3, 8 |
