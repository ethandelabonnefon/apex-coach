# Plafonnement prédictif de la dose — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empêcher le calculateur de proposer une dose que le prédicteur de la même app juge hypoglycémiante, en rabotant la dose candidate tant que la trajectoire prédite descend sous 80 mg/dL après la première heure.

**Architecture:** Une fonction pure `capDoseByPrediction` dans un module dédié prend la dose candidate produite par `calculateBolus` (inchangé), simule la trajectoire avec le moteur existant `predictGlucoseCurve`, et décrémente d'une unité entière jusqu'à ce que le minimum au-delà de la 60ᵉ minute tienne. La page insère cet appel entre le calcul et l'affichage ; l'override manuel existant reste prioritaire.

**Tech Stack:** TypeScript strict · `node:test` via `tsx` · React 19 / Next.js 16

**Spec de référence :** `docs/superpowers/specs/2026-09-03-plafonnement-predictif-dose-design.md`

## Global Constraints

- **Langue** : interface 100 % français, code en anglais, commentaires mixtes.
- **Zéro emoji.** Icônes `lucide-react`. **Tokens de couleur uniquement, aucun hex codé en dur.**
- **Valeurs figées par la spec** : `PREDICTION_SAFETY_LIMIT = 80` mg/dL · `CAPPING_GRACE_MIN = 60` min · `CAPPING_HORIZON_MIN = 300` min · pas de décrément = **1 unité entière** (le stylo n'a pas de demi-unités).
- **Le plafond ne peut que RÉDUIRE, jamais augmenter.** Une trajectoire prédite en hyperglycémie laisse la dose candidate intacte. Invariant à tester.
- **Jamais silencieusement** : la dose d'origine et la raison sont toujours disponibles pour l'affichage.
- **Pas de mesure capteur réelle → pas de plafonnement**, avec une raison explicite. Ne jamais simuler depuis une valeur par défaut : ce dépôt a corrigé deux fois le motif inverse (un `useState(120)` passé à un garde-fou de sécurité).
- **Ne pas modifier** `lib/insulin-calculator.ts`, `lib/glucose-prediction.ts`, `lib/prediction-inputs.ts`, `lib/carbs-on-board.ts`, `lib/dose-validation.ts`.
- **Aucun formatage d'heure dans la lib.** Elle renvoie un décalage en minutes ; c'est le composant qui formate. Une régression connue de ce dépôt venait d'une heure formatée côté serveur, donc en UTC.
- `npx tsc --noEmit`, `npm test` et `npm run build` verts avant chaque commit. Ne pas lancer de serveur de dev.

---

### Task 1: Le moteur de plafonnement

**Files:**
- Create: `lib/dose-capping.ts`
- Test: `lib/dose-capping.test.ts`

**Interfaces:**
- Consumes: `predictGlucoseCurve`, `carbSensitivity`, type `PredictionEvent` (`lib/glucose-prediction.ts`) ; `buildPredictionEvents`, `ratioForMeal`, type `MealRatios` (`lib/prediction-inputs.ts`) ; type `RecentExercise` (`lib/exercise-insulin-adjustment.ts`) ; types `InsulinLog`, `CarbEntry` (`@/types`)
- Produces: constantes `PREDICTION_SAFETY_LIMIT`, `CAPPING_GRACE_MIN`, `CAPPING_HORIZON_MIN` ; types `PendingMeal`, `DoseCappingContext`, `CappedDose` ; fonction `capDoseByPrediction(candidateUnits, ctx)`

- [ ] **Step 1: Écrire les tests qui échouent**

Créer `lib/dose-capping.test.ts` :

```ts
/**
 * Tests du plafonnement prédictif de la dose.
 *
 * Run: npm test
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  capDoseByPrediction,
  PREDICTION_SAFETY_LIMIT,
  CAPPING_GRACE_MIN,
  type DoseCappingContext,
} from "./dose-capping";
import type { InsulinLog } from "@/types";

const NOW = new Date("2026-09-03T12:00:00Z").getTime();
const ISF = 100;
const RATIOS = { morning: 6.7, lunch: 10, snack: 8.3, dinner: 10 };

/** Injection passée, `minutesAgo` minutes avant NOW. */
function pastBolus(minutesAgo: number, units: number, carbsGrams = 0): InsulinLog {
  return {
    id: `b-${minutesAgo}`,
    units,
    insulinType: "Novorapid",
    mealType: "lunch",
    carbsGrams,
    glucoseBefore: 120,
    notes: "",
    injectedAt: new Date(NOW - minutesAgo * 60_000),
  };
}

function ctx(over: Partial<DoseCappingContext> = {}): DoseCappingContext {
  return {
    currentGlucose: 120,
    insulinLogs: [],
    carbEntries: [],
    pendingMeal: { carbsGrams: 0, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
    isf: ISF,
    ratios: RATIOS,
    nowMs: NOW,
    ...over,
  };
}

test("le cas réel d'Ethan : 56 mg/dL, 100 g, 2,5 U actives → 10 U ramenées à 8 U", () => {
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 8, `attendu 8 U, reçu ${r.units}`);
  assert.equal(r.originalUnits, 10);
  assert.equal(r.capped, true);
  assert.ok(
    r.predictedMinBefore !== null && r.predictedMinBefore < PREDICTION_SAFETY_LIMIT,
    `le minimum avant plafonnement doit être sous la limite, reçu ${r.predictedMinBefore}`,
  );
  assert.ok(
    r.predictedMinAfter !== null && r.predictedMinAfter >= PREDICTION_SAFETY_LIMIT,
    `le minimum après plafonnement doit tenir, reçu ${r.predictedMinAfter}`,
  );
  assert.ok(r.reason && r.reason.length > 0);
});

test("la fenêtre de grâce est nécessaire : on ne tombe pas à 0 U en partant de 56", () => {
  // Sans la fenêtre de grâce, le minimum absolu resterait proche de 56
  // quelle que soit la dose → la boucle descendrait jusqu'à 0.
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.ok(r.units > 0, "la dose ne doit pas être ramenée à zéro");
});

test("trajectoire saine : la dose candidate passe inchangée", () => {
  const r = capDoseByPrediction(6, ctx({
    currentGlucose: 140,
    pendingMeal: { carbsGrams: 60, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 6);
  assert.equal(r.capped, false);
  assert.equal(r.reason, null);
});

test("le plafond ne monte JAMAIS la dose, même si l'app prédit une hyperglycémie", () => {
  // 100 g avec seulement 2 U : trajectoire franchement haute.
  const r = capDoseByPrediction(2, ctx({
    currentGlucose: 180,
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 2, "la dose candidate doit rester intacte");
  assert.equal(r.capped, false);
});

test("la dose retenue est toujours un entier", () => {
  const r = capDoseByPrediction(9, ctx({
    currentGlucose: 60,
    insulinLogs: [pastBolus(60, 3)],
    pendingMeal: { carbsGrams: 80, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(Number.isInteger(r.units), true, `dose non entière : ${r.units}`);
});

test("sans mesure capteur : aucun plafonnement, raison explicite", () => {
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: null,
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(r.units, 10);
  assert.equal(r.capped, false);
  assert.ok(r.reason && /capteur|mesure/i.test(r.reason), `raison attendue sur l'absence de mesure, reçu : ${r.reason}`);
  assert.equal(r.predictedMinBefore, null);
});

test("dose candidate nulle ou négative : renvoyée telle quelle sans simuler", () => {
  const r = capDoseByPrediction(0, ctx({ currentGlucose: 56 }));
  assert.equal(r.units, 0);
  assert.equal(r.capped, false);
});

test("les glucides de resucrage en cours font monter, donc autorisent une dose plus élevée", () => {
  const base = {
    currentGlucose: 70,
    insulinLogs: [pastBolus(60, 2)],
    pendingMeal: { carbsGrams: 60, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  };
  const sansResucrage = capDoseByPrediction(6, ctx(base));
  const avecResucrage = capDoseByPrediction(6, ctx({
    ...base,
    carbEntries: [{
      id: "r1", label: "Resucrage", carbsGrams: 20, insulinUnits: 0,
      eatenAt: new Date(NOW - 5 * 60_000).toISOString(), hypoEventId: "e1",
    }],
  }));
  assert.ok(
    avecResucrage.units >= sansResucrage.units,
    `le resucrage doit autoriser au moins autant d'insuline (sans: ${sansResucrage.units}, avec: ${avecResucrage.units})`,
  );
});

test("le décalage du minimum est renvoyé en minutes, jamais formaté en heure", () => {
  const r = capDoseByPrediction(10, ctx({
    currentGlucose: 56,
    insulinLogs: [pastBolus(90, 2.5)],
    pendingMeal: { carbsGrams: 100, fatGrams: 0, proteinGrams: 0, mealType: "lunch" },
  }));
  assert.equal(typeof r.predictedMinMinute, "number");
  assert.ok((r.predictedMinMinute as number) >= CAPPING_GRACE_MIN);
});

test("les constantes valent bien celles de la spec", () => {
  assert.equal(PREDICTION_SAFETY_LIMIT, 80);
  assert.equal(CAPPING_GRACE_MIN, 60);
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils échouent**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './dose-capping'`

- [ ] **Step 3: Implémenter `lib/dose-capping.ts`**

```ts
/**
 * Plafonnement prédictif de la dose (septembre 2026).
 *
 * ─── Pourquoi ce module existe ───────────────────────────────────────
 * Le calculateur de bolus et le prédicteur glycémique vivaient dans la
 * même app sans se parler. Cas mesuré : 56 mg/dL, 100 g à midi, 2,5 U
 * encore actives → `calculateBolus` propose 10 U, et `predictGlucoseCurve`
 * annonce que ces 10 U mènent à 40 mg/dL.
 *
 * On garde le calculateur tel quel — il produit une dose CANDIDATE — et on
 * la fait valider par le prédicteur : tant que la trajectoire plonge sous
 * la limite de sécurité, on rabote d'une unité.
 *
 * C'est le principe de Loop : « calculer le bolus de telle sorte que la
 * glycémie prédite ne descende jamais sous la limite de sécurité ; cela
 * peut aboutir à une glycémie future au-dessus de la cible, mais évitera
 * une hypoglycémie peu après le repas. » On accepte de finir haut plutôt
 * que de risquer de finir bas.
 *
 * ─── Deux invariants ─────────────────────────────────────────────────
 *  • Le plafond ne peut que RÉDUIRE. Si la prédiction annonce une hyper,
 *    la dose n'est pas relevée : c'est un garde-fou, pas un optimiseur.
 *  • Sans mesure capteur réelle, on ne plafonne pas. Simuler depuis une
 *    valeur par défaut serait pire que ne rien faire — ce dépôt a corrigé
 *    deux fois ce motif exact.
 */

import {
  carbSensitivity,
  predictGlucoseCurve,
  type PredictionEvent,
} from "./glucose-prediction";
import {
  buildPredictionEvents,
  ratioForMeal,
  type MealRatios,
} from "./prediction-inputs";
import type { RecentExercise } from "./exercise-insulin-adjustment";
import type { CarbEntry, InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Constantes — figées par la spec
// ───────────────────────────────────────────────────────────────────────

/** La trajectoire prédite ne doit pas descendre sous ce seuil (mg/dL). */
export const PREDICTION_SAFETY_LIMIT = 80;

/**
 * Fenêtre de grâce (min) : la limite s'applique au minimum AU-DELÀ de ce
 * délai, pas sur toute la courbe.
 *
 * Nécessaire, pas confortable : en partant de 56 mg/dL, les premières
 * minutes de la trajectoire restent proches du point de départ QUELLE QUE
 * SOIT la dose — aucune dose, même nulle, ne remonte instantanément. Une
 * règle sur le minimum absolu serait insatisfiable et ramènerait la dose
 * à zéro.
 *
 * 60 min = pic d'absorption des glucides du modèle (`CARB_PEAK_MIN`,
 * glucose-prediction.ts) : avant, le point de départ domine ; après, la
 * dose commande.
 */
export const CAPPING_GRACE_MIN = 60;

/** Horizon de simulation (min) : DIA 195 + absorption glucides 195. */
export const CAPPING_HORIZON_MIN = 300;

/** Pas de simulation (min) — même granularité que le reste du moteur. */
const CAPPING_STEP_MIN = 15;

// ───────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────

/** Repas en cours de saisie, pas encore enregistré dans le store. */
export interface PendingMeal {
  carbsGrams: number;
  fatGrams: number;
  proteinGrams: number;
  mealType: string;
}

export interface DoseCappingContext {
  /** Lecture capteur RÉELLE. `null`/`undefined` = pas de mesure → pas de plafonnement. */
  currentGlucose: number | null | undefined;
  insulinLogs: InsulinLog[];
  carbEntries: CarbEntry[];
  pendingMeal: PendingMeal;
  isf: number;
  ratios: MealRatios;
  /**
   * Séance récente : la sensibilité post-exercice amplifie l'effet de
   * l'insuline. Ce n'est PAS un double comptage avec la réduction
   * pré-sport du calculateur — celle-ci réduit la dose, celle-là modélise
   * le fait qu'elle agit plus fort.
   */
  sport?: RecentExercise;
  nowMs?: number;
}

export interface CappedDose {
  /** Dose retenue (unités entières). */
  units: number;
  /** Dose candidate avant plafonnement. */
  originalUnits: number;
  capped: boolean;
  /** Minimum au-delà de la fenêtre de grâce, avec la dose candidate. */
  predictedMinBefore: number | null;
  /** Idem, avec la dose retenue. */
  predictedMinAfter: number | null;
  /** Décalage (min) du minimum d'avant plafonnement. Le composant formate l'heure. */
  predictedMinMinute: number | null;
  /** `null` si aucun plafonnement n'a eu lieu et qu'il n'y a rien à signaler. */
  reason: string | null;
}

// ───────────────────────────────────────────────────────────────────────
// Simulation
// ───────────────────────────────────────────────────────────────────────

interface SimResult {
  min: number;
  minute: number;
}

/**
 * Minimum de la trajectoire au-delà de la fenêtre de grâce, pour une dose
 * donnée. `null` si la courbe ne couvre pas la fenêtre.
 */
function simulateMinAfterGrace(
  units: number,
  ctx: DoseCappingContext,
  baseEvents: PredictionEvent[],
): SimResult | null {
  const meal = ctx.pendingMeal;
  const events: PredictionEvent[] = [
    ...baseEvents,
    {
      minutesAgo: 0,
      units: units > 0 ? units : undefined,
      carbsGrams: meal.carbsGrams,
      fatGrams: meal.fatGrams,
      proteinGrams: meal.proteinGrams,
      carbSensitivity: carbSensitivity(ctx.isf, ratioForMeal(ctx.ratios, meal.mealType)),
    },
  ];

  const prediction = predictGlucoseCurve({
    currentGlucose: ctx.currentGlucose as number,
    events,
    isf: ctx.isf,
    sport: ctx.sport,
    horizonMinutes: CAPPING_HORIZON_MIN,
    stepMinutes: CAPPING_STEP_MIN,
    nowMs: ctx.nowMs,
  });

  const afterGrace = prediction.curve.filter((p) => p.minute >= CAPPING_GRACE_MIN);
  if (afterGrace.length === 0) return null;

  let best = afterGrace[0];
  for (const p of afterGrace) {
    if (p.value < best.value) best = p;
  }
  return { min: best.value, minute: best.minute };
}

// ───────────────────────────────────────────────────────────────────────
// Plafonnement
// ───────────────────────────────────────────────────────────────────────

function unchanged(
  units: number,
  reason: string | null,
  min: SimResult | null = null,
): CappedDose {
  return {
    units,
    originalUnits: units,
    capped: false,
    predictedMinBefore: min?.min ?? null,
    predictedMinAfter: min?.min ?? null,
    predictedMinMinute: min?.minute ?? null,
    reason,
  };
}

export function capDoseByPrediction(
  candidateUnits: number,
  ctx: DoseCappingContext,
): CappedDose {
  // Rien à plafonner.
  if (!(candidateUnits > 0)) {
    return unchanged(Math.max(0, candidateUnits), null);
  }

  // Pas de mesure capteur → pas de point de départ crédible pour simuler.
  const glucose = ctx.currentGlucose;
  if (typeof glucose !== "number" || !Number.isFinite(glucose)) {
    return unchanged(
      candidateUnits,
      "Pas de mesure capteur — dose non vérifiée par la prédiction.",
    );
  }

  const baseEvents = buildPredictionEvents({
    insulinLogs: ctx.insulinLogs,
    carbEntries: ctx.carbEntries,
    isf: ctx.isf,
    ratios: ctx.ratios,
    nowMs: ctx.nowMs,
  });

  const before = simulateMinAfterGrace(candidateUnits, ctx, baseEvents);
  if (before === null || before.min >= PREDICTION_SAFETY_LIMIT) {
    return unchanged(candidateUnits, null, before);
  }

  // La trajectoire plonge : on rabote d'une unité entière à la fois.
  for (let units = candidateUnits - 1; units >= 0; units--) {
    const after = simulateMinAfterGrace(units, ctx, baseEvents);
    if (after !== null && after.min >= PREDICTION_SAFETY_LIMIT) {
      return {
        units,
        originalUnits: candidateUnits,
        capped: true,
        predictedMinBefore: before.min,
        predictedMinAfter: after.min,
        predictedMinMinute: before.minute,
        reason: `À ${candidateUnits} U, ta glycémie descendrait à ${before.min} mg/dL.`,
      };
    }
  }

  // Aucune dose ne tient : on ne propose rien.
  return {
    units: 0,
    originalUnits: candidateUnits,
    capped: true,
    predictedMinBefore: before.min,
    predictedMinAfter: null,
    predictedMinMinute: before.minute,
    reason: `Aucune dose ne garde ta glycémie au-dessus de ${PREDICTION_SAFETY_LIMIT} mg/dL. Traite d'abord, mange ensuite.`,
  };
}
```

- [ ] **Step 4: Lancer les tests**

Run: `npm test 2>&1 | tail -20`
Expected: PASS

Si le test du cas d'Ethan ne rend pas exactement 8 U, **ne modifie ni la limite ni la fenêtre de grâce** : ce sont des valeurs de spec. Vérifie d'abord que les événements passés sont bien construits (`buildPredictionEvents` filtre au-delà de 360 min) et que `carbSensitivity` reçoit le bon ratio. Si l'écart persiste, signale-le avec la valeur obtenue et la trajectoire simulée.

- [ ] **Step 5: Typecheck et commit**

```bash
npx tsc --noEmit
git add lib/dose-capping.ts lib/dose-capping.test.ts
git commit -m "feat(diabete): plafonnement de la dose par la trajectoire prédite"
```

---

### Task 2: Câblage et affichage

**Files:**
- Modify: `app/diabete/page.tsx`

**Interfaces:**
- Consumes: `capDoseByPrediction`, type `CappedDose` (Task 1)

- [ ] **Step 1: Rendre la séance récente disponible avant le calcul**

La page construit déjà un `RecentExercise` — mais **trop tard** : c'est fait dans le memo `bedtimeInput`, vers la ligne 1118, alors que le calcul du bolus vit vers la ligne 451. Le plafonnement en a besoin : sans lui, la prédiction ignore que l'insuline agit plus fort après une séance, et le plafond serait trop indulgent précisément quand le risque d'hypoglycémie est le plus élevé.

`resolveRecentExercise` est déjà importé (ligne ~56). Extraire un memo dédié, **avant** le memo `bolusResult` :

```ts
  // La sensibilité post-exercice amplifie l'effet de l'insuline. Le
  // plafonnement en a besoin ; le memo du plan de nuit le construisait
  // 600 lignes plus bas, donc trop tard pour le calculateur.
  const recentExercise = useMemo(
    () =>
      resolveRecentExercise({
        nowMs: nowTick,
        lastWhoopWorkout: whoop.connected ? whoop.snapshot?.lastWorkout ?? null : null,
        completedWorkouts: completedWorkouts.map((w) => ({
          id: w.id,
          date: w.date,
          duration: w.duration,
        })),
        completedRunningSessions: completedRunningSessions.map((r) => ({
          id: r.id,
          date: r.date,
          actualDuration: r.actualDuration,
          glucoseCheckpoints: r.glucoseCheckpoints,
        })),
      }),
    [nowTick, whoop.connected, whoop.snapshot, completedWorkouts, completedRunningSessions],
  );
```

Puis **remplacer** la construction locale de `sportExercise` dans le memo `bedtimeInput` (vers la ligne 1118) par une simple référence à `recentExercise`, pour qu'il n'existe qu'une seule définition. Vérifier que `bedtimeInput` liste `recentExercise` dans ses dépendances et retire celles qui ne lui servaient que pour ce calcul.

⚠️ Ce n'est **pas** un double comptage avec la réduction pré-sport du calculateur : celle-ci réduit la dose, la sensibilité post-exercice modélise le fait qu'elle agit plus fort. Deux mécanismes distincts, tous deux réels.

- [ ] **Step 2: Calculer la dose plafonnée**

Dans `app/diabete/page.tsx`, ajouter l'import :

```ts
import { capDoseByPrediction } from "@/lib/dose-capping";
```

Puis, **après** le memo `bolusResult` (il se termine vers la ligne 480) et **avant** la ligne `const finalUnits = ...` (vers 501), insérer :

```ts
  // Le calculateur produit une dose candidate ; le prédicteur la valide.
  // Sans ce garde-fou, l'app propose des doses que son propre moteur
  // annonce comme hypoglycémiantes (cas mesuré : 10 U → 40 mg/dL prédits).
  const cappedDose = useMemo(
    () =>
      capDoseByPrediction(bolusResult.totalBolus, {
        currentGlucose: liveGlucose?.value,
        insulinLogs,
        carbEntries,
        pendingMeal: {
          carbsGrams,
          fatGrams,
          proteinGrams,
          mealType: mealTime,
        },
        isf: diabetesConfig.insulinSensitivityFactor,
        ratios: diabetesConfig.ratios,
        sport: recentExercise ?? undefined,
        nowMs: nowTick,
      }),
    [
      bolusResult.totalBolus,
      recentExercise,
      liveGlucose,
      insulinLogs,
      carbEntries,
      carbsGrams,
      fatGrams,
      proteinGrams,
      mealTime,
      diabetesConfig,
      nowTick,
    ],
  );
```

**Ne passe que `liveGlucose?.value`** — jamais l'état `currentGlucose` du champ, qui vaut 120 par défaut. C'est le motif exact corrigé deux fois dans ce dépôt.

- [ ] **Step 3: Faire porter l'override et l'enregistrement sur la dose plafonnée**

Ligne ~501, remplacer :

```ts
  const finalUnits = unitsOverride ?? bolusResult.totalBolus;
```

par :

```ts
  const finalUnits = unitsOverride ?? cappedDose.units;
```

L'override manuel reste prioritaire : l'utilisateur peut toujours saisir la dose qu'il veut, et cette saisie est déjà tracée dans les notes de l'injection.

Vérifier ensuite les autres usages de `bolusResult.totalBolus` (`grep -n "bolusResult.totalBolus" app/diabete/page.tsx`) et décider au cas par cas :
- la comparaison qui détecte un override (lignes ~524 et ~2450) doit désormais comparer à `cappedDose.units`, sinon un override égal à la dose plafonnée serait signalé à tort comme manuel ;
- la note `manuel (calc proposait XU)` doit citer `cappedDose.units`, la dose réellement proposée à l'utilisateur.

- [ ] **Step 4: Afficher le plafonnement**

Dans le bloc de résultat du calculateur, sous le chiffre hero, ajouter :

```tsx
      {cappedDose.capped && (
        <div className="mt-3 rounded-xl border border-warning/25 bg-warning/5 p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert className="w-4 h-4 text-warning" />
            <p className="text-sm font-semibold text-text-primary">
              Ramenée de {cappedDose.originalUnits} U à {cappedDose.units} U
            </p>
          </div>
          <p className="text-xs text-text-secondary">
            {cappedDose.reason}
            {cappedDose.predictedMinMinute !== null && (
              <>
                {" "}
                Minimum prévu vers{" "}
                {new Date(nowTick + cappedDose.predictedMinMinute * 60_000).toLocaleTimeString(
                  "fr-FR",
                  { hour: "2-digit", minute: "2-digit" },
                )}
                .
              </>
            )}
          </p>
        </div>
      )}
```

Ajouter `ShieldAlert` à l'import `lucide-react` du fichier.

L'heure est formatée **ici**, côté client, à partir du décalage en minutes renvoyé par la lib — jamais dans la lib. Une régression connue de ce dépôt venait d'une heure formatée côté serveur, donc en UTC.

- [ ] **Step 5: Afficher aussi l'absence de vérification**

Quand il n'y a pas de mesure capteur, la dose n'est pas vérifiée — l'utilisateur doit le savoir. Sous le même bloc :

```tsx
      {!cappedDose.capped && cappedDose.reason && (
        <p className="mt-3 text-xs text-text-tertiary">{cappedDose.reason}</p>
      )}
```

- [ ] **Step 6: Vérifier**

```bash
npx tsc --noEmit
npm test 2>&1 | tail -6
npm run build 2>&1 | grep -E "Compiled|Error" | head -3
```

Expected: aucune erreur, build compilé. Le build est important : il attrape le JSX mal imbriqué que le typecheck laisse passer.

- [ ] **Step 7: Commit**

```bash
git add app/diabete/page.tsx
git commit -m "feat(diabete): la dose proposée est plafonnée par la trajectoire prédite"
```

---

## Vérification d'ensemble

| Section de la spec | Task |
|---|---|
| 1. Limite de sécurité et fenêtre de grâce | 1 |
| 2. Algorithme (simulation, décrément entier, pas de plancher) | 1 |
| 3. Le split à venir n'est pas modélisé — limitation acceptée | 1 (aucun code : `buildPredictionEvents` ne lit que les injections faites) |
| 4. Architecture, glycémie absente, câblage | 1 (lib), 2 (page) |
| 5. Interface — dose d'origine et raison toujours visibles | 2 |
| 6. Tests | 1 |
| 7. Risque assumé — chiffre prédit affiché, réduction seule | 1 (invariant testé), 2 (affichage) |
