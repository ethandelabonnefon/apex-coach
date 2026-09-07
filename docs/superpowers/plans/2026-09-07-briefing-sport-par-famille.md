# Briefing pré-sport par famille d'effort — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le briefing pré-sport connaît douze sports rangés en trois familles d'effort, chiffre les glucides selon la famille et la durée, tague ces glucides pour qu'ils ne polluent pas l'apprentissage, et enregistre la séance pour que l'ajustement post-exercice s'applique au repas suivant.

**Architecture:** Un catalogue de sports pur (`lib/sports.ts`) étend l'`ExerciseSource` existant d'une quatrième valeur `intermittent`. Le calcul de glucides gagne une composante « durée × famille » qui s'ajoute au comblement d'écart déjà en place. Une nouvelle collection `declaredSportSessions` dans le store alimente `findMostRecentExercise`, et un tag `sportSessionId` sur `CarbEntry` reproduit exactement le traitement déjà validé des glucides de resucrage.

**Tech Stack:** TypeScript strict, Next.js 16 App Router, Zustand persist, `node:test` via `tsx` (`npm test`), Tailwind 4 avec tokens light/dark, icônes `lucide-react`.

## Global Constraints

- Interface 100 % français, code en anglais, commentaires mixtes. **Aucun emoji** dans l'interface (règle de marque).
- **Aucun ajustement automatique de dose.** Tout conseil s'affiche ; l'utilisateur décide. Rien qui touche une dose ou un ratio ne s'applique sans validation explicite.
- **Ne pas modifier** `lib/glucose-prediction.ts`, `lib/prediction-inputs.ts`, `lib/dose-capping.ts`, `lib/night-calibration.ts`, `lib/ratio-sync.ts`, ni les fichiers de `lib/backtest/`.
- **Ne pas toucher** à la quantité du split dose (`laterUnits`, `FPU_CARB_EQUIVALENT_FACTOR`, `LATER_DOSE_RELATIVE_CAP`, `LATER_DOSE_ABSOLUTE_CAP` dans `lib/insulin-calculator.ts`) : validée sur le terrain.
- Constantes exactes : `HIGH_IOB_THRESHOLD_U = 1.5` · `AEROBIC_CARBS_PER_HOUR_LOW_IOB = 45` · `AEROBIC_CARBS_PER_HOUR_HIGH_IOB = 75` · `INTERMITTENT_CARBS_PER_HOUR_LOW_IOB = 20` · `INTERMITTENT_CARBS_PER_HOUR_HIGH_IOB = 40` · `MAX_PRE_SPORT_CARBS_G = 80` · `MAX_PLANNED_DURATION_MIN = 180`.
- `npx tsc --noEmit`, `npm test` et `npm run build` verts avant chaque commit.
- Ne pas lancer de serveur de dev.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `lib/sports.ts` (créer) | Catalogue des sports, familles, durées par défaut |
| `lib/exercise-insulin-adjustment.ts` (modifier) | `ExerciseSource` + `intermittent`, `getSportFactor`, `classifySport`, `findMostRecentExercise` |
| `lib/insulin-calculator.ts` (modifier) | `computePreSportBriefing` : composante glucides par famille × durée |
| `types/index.ts` (modifier) | `CarbEntry.sportSessionId`, `DeclaredSportSession` |
| `lib/store.ts` (modifier) | Collection `declaredSportSessions` + actions |
| `lib/carbs-on-board.ts` (modifier) | Exclusion des glucides sport de `insulinNeededU` |
| `lib/dose-validation.ts` (modifier) | Exclusion des glucides sport de l'apprentissage |
| `app/diabete/page.tsx` (modifier) | UI du briefing : grille de sports, durée, création/annulation de séance |
| `lib/whoop-reconcile.ts` (créer) | Rapprochement séance déclarée ↔ séance Whoop |

---

## Task 1 : Catalogue des sports et quatrième famille

**Files:**
- Create: `lib/sports.ts`
- Modify: `lib/exercise-insulin-adjustment.ts`
- Test: `lib/sports.test.ts`

**Interfaces:**
- Consomme : `ExerciseSource` (`lib/exercise-insulin-adjustment.ts`).
- Produit : `SPORTS`, `SportDefinition`, `getSport(key)`, `SPORT_KEYS` ; `ExerciseSource` gagne `"intermittent"`.

- [ ] **Step 1 : écrire le test du catalogue**

```ts
// lib/sports.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { SPORTS, getSport } from "./sports";

test("chaque sport a une famille connue et une durée par défaut positive", () => {
  const families = new Set(["running", "cardio-other", "intermittent", "muscu"]);
  assert.ok(SPORTS.length >= 12, `attendu au moins 12 sports, reçu ${SPORTS.length}`);
  for (const s of SPORTS) {
    assert.ok(families.has(s.family), `${s.key} : famille inconnue ${s.family}`);
    assert.ok(s.defaultDurationMin > 0, `${s.key} : durée par défaut invalide`);
    assert.ok(s.label.length > 0, `${s.key} : libellé manquant`);
  }
});

test("les sports nommés par Ethan sont présents et bien classés", () => {
  assert.equal(getSport("football")?.family, "intermittent");
  assert.equal(getSport("padel")?.family, "intermittent");
  assert.equal(getSport("course")?.family, "running");
  assert.equal(getSport("musculation")?.family, "muscu");
});

test("les clés sont uniques", () => {
  assert.equal(new Set(SPORTS.map((s) => s.key)).size, SPORTS.length);
});
```

- [ ] **Step 2 : lancer le test, le voir échouer**

```bash
npx tsx --test lib/sports.test.ts
```

Attendu : ÉCHEC — module `./sports` absent.

- [ ] **Step 3 : ajouter `"intermittent"` à `ExerciseSource`**

Dans `lib/exercise-insulin-adjustment.ts`, ligne 34 :

```ts
export type ExerciseSource = "running" | "muscu" | "cardio-other" | "intermittent";
```

Le compilateur va signaler tous les `switch` / conditions à compléter. Traiter chacun explicitement — ne pas ajouter de `default` fourre-tout qui masquerait un oubli.

- [ ] **Step 4 : écrire `lib/sports.ts`**

```ts
import type { ExerciseSource } from "./exercise-insulin-adjustment";

export interface SportDefinition {
  key: string;
  label: string;
  family: ExerciseSource;
  /** Durée typique (min), pré-remplie dans le briefing, modifiable. */
  defaultDurationMin: number;
}

/**
 * Les familles viennent du consensus Riddell et al. (Lancet Diabetes &
 * Endocrinology, 2017) : l'aérobie fait baisser la glycémie, l'anaérobie la
 * fait monter, le mixte la laisse stable pendant l'effort puis elle chute
 * après. Le nom du sport ne sert qu'à choisir sa famille.
 */
export const SPORTS: SportDefinition[] = [
  // Aérobie continu — baisse pendant l'effort
  { key: "course", label: "Course à pied", family: "running", defaultDurationMin: 45 },
  { key: "velo", label: "Vélo", family: "cardio-other", defaultDurationMin: 60 },
  { key: "natation", label: "Natation", family: "cardio-other", defaultDurationMin: 45 },
  { key: "rameur", label: "Rameur", family: "cardio-other", defaultDurationMin: 30 },
  { key: "randonnee", label: "Randonnée", family: "cardio-other", defaultDurationMin: 120 },
  // Intermittent — stable pendant, chute après
  { key: "football", label: "Football", family: "intermittent", defaultDurationMin: 90 },
  { key: "padel", label: "Padel", family: "intermittent", defaultDurationMin: 90 },
  { key: "tennis", label: "Tennis", family: "intermittent", defaultDurationMin: 90 },
  { key: "basket", label: "Basket", family: "intermittent", defaultDurationMin: 90 },
  { key: "crossfit", label: "CrossFit", family: "intermittent", defaultDurationMin: 60 },
  // Résistance — neutre ou en hausse
  { key: "musculation", label: "Musculation", family: "muscu", defaultDurationMin: 60 },
  { key: "sprint", label: "Sprint", family: "muscu", defaultDurationMin: 30 },
];

export const SPORT_KEYS = SPORTS.map((s) => s.key);

export function getSport(key: string | null | undefined): SportDefinition | null {
  if (!key) return null;
  return SPORTS.find((s) => s.key === key) ?? null;
}
```

- [ ] **Step 5 : traiter `intermittent` dans `getSportFactor`**

`getSportFactor` (`lib/exercise-insulin-adjustment.ts`) module l'ampleur de la réduction d'insuline post-exercice. Ajouter le cas :

```ts
// Intermittent (foot, padel, tennis, basket, CrossFit) : la glycémie tient
// pendant l'effort, mais les hypos sont PLUS fréquentes après les séances à
// intervalles les plus intenses (Scientific Reports 2018). On applique donc
// l'effet plein, comme le cardio continu — sous-estimer ici, c'est laisser
// tomber Ethan une heure après le match.
if (source === "intermittent") return 1.0;
```

- [ ] **Step 6 : reclasser CrossFit et Hyrox dans `classifySport`**

Aujourd'hui `/crossfit|functional|hyrox/` tombe dans `muscu`. Les sortir vers `intermittent` :

```ts
// Intermittent : efforts mixtes à pics d'intensité. CrossFit et Hyrox
// étaient auparavant classés `muscu` — changement de comportement VOULU
// (sept. 2026) : ce sont des efforts intermittents, et le facteur passe de
// 0,1-0,5 à 1,0, donc la réduction d'insuline post-séance augmente. Sens
// anti-hypo, mais il modifie l'ajustement des séances CrossFit remontées
// par Whoop.
if (/crossfit|functional|hyrox|circuit/.test(s)) return "intermittent";
if (/soccer|football|tennis|padel|squash|badminton|basket|handball|rugby/.test(s)) {
  return "intermittent";
}
```

Placer ces deux tests **avant** la règle `muscu` existante, sinon `functional` y sera capté d'abord.

- [ ] **Step 7 : relancer les tests**

```bash
npx tsc --noEmit && npm test
```

Attendu : tout vert. Si un test existant sur `classifySport("CrossFit")` attendait `muscu`, le mettre à jour — c'est le changement voulu, pas une régression.

- [ ] **Step 8 : commit**

```bash
git add lib/sports.ts lib/sports.test.ts lib/exercise-insulin-adjustment.ts
git commit -m "feat(sport): catalogue de 12 sports et famille intermittente"
```

---

## Task 2 : Glucides par famille et durée

**Files:**
- Modify: `lib/insulin-calculator.ts` (`computePreSportBriefing`)
- Test: `lib/pre-sport-carbs.test.ts`

**Interfaces:**
- Consomme : `ExerciseSource` (Task 1).
- Produit : `computePreSportBriefing` accepte `workoutType: ExerciseSource` (au lieu de `'muscu' | 'running'`) et `workoutDurationMinutes`. Export de `exerciseCarbsForDuration` et des constantes.

- [ ] **Step 1 : écrire les tests**

```ts
// lib/pre-sport-carbs.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { exerciseCarbsForDuration, MAX_PRE_SPORT_CARBS_G } from "./insulin-calculator";

test("résistance : jamais de glucides, quelles que soient durée et IOB", () => {
  for (const dur of [30, 90, 180]) {
    for (const iob of [0, 1, 3]) {
      assert.equal(exerciseCarbsForDuration("muscu", dur, iob), 0);
    }
  }
});

test("intermittent : strictement moins d'apport que l'aérobie, à conditions égales", () => {
  const aero = exerciseCarbsForDuration("running", 90, 2);
  const inter = exerciseCarbsForDuration("intermittent", 90, 2);
  assert.ok(inter < aero, `intermittent ${inter} doit être < aérobie ${aero}`);
  assert.ok(inter > 0, "intermittent ne doit pas être nul");
});

test("IOB élevé : plus de glucides qu'IOB faible, même sport et durée", () => {
  const low = exerciseCarbsForDuration("running", 60, 0);
  const high = exerciseCarbsForDuration("running", 60, 3);
  assert.ok(high > low, `IOB élevé ${high} doit dépasser IOB faible ${low}`);
  assert.equal(low, 45, "45 g/h à IOB nul, sur une heure");
  assert.equal(high, 75, "75 g/h au-delà du seuil d'IOB élevé");
});

test("la durée est plafonnée à 180 min", () => {
  assert.equal(
    exerciseCarbsForDuration("running", 600, 3),
    exerciseCarbsForDuration("running", 180, 3),
  );
});

test("le total ne dépasse jamais le plafond absolu", () => {
  assert.ok(exerciseCarbsForDuration("running", 180, 5) <= MAX_PRE_SPORT_CARBS_G);
});
```

- [ ] **Step 2 : lancer, voir échouer**

```bash
npx tsx --test lib/pre-sport-carbs.test.ts
```

Attendu : ÉCHEC — `exerciseCarbsForDuration` non exportée.

- [ ] **Step 3 : implémenter**

Dans `lib/insulin-calculator.ts` :

```ts
// ─── Glucides pré-sport par famille d'effort (sept. 2026) ───────────────
// Consensus Riddell et al. 2017 : 30-60 g/h quand l'insuline circulante est
// faible, jusqu'à 75 g/h quand elle est élevée, pour un aérobie de 60-150
// min. Les valeurs intermittentes sont posées à environ la moitié —
// cohérentes avec la stabilité glycémique observée PENDANT l'effort — et
// sont des AMORCES à recalibrer sur les données réelles d'Ethan, pas des
// constantes établies.
export const HIGH_IOB_THRESHOLD_U = 1.5;
export const AEROBIC_CARBS_PER_HOUR_LOW_IOB = 45;
export const AEROBIC_CARBS_PER_HOUR_HIGH_IOB = 75;
export const INTERMITTENT_CARBS_PER_HOUR_LOW_IOB = 20;
export const INTERMITTENT_CARBS_PER_HOUR_HIGH_IOB = 40;
export const MAX_PRE_SPORT_CARBS_G = 80;
export const MAX_PLANNED_DURATION_MIN = 180;

const CARB_RATES: Record<ExerciseSource, { low: number; high: number }> = {
  running: { low: AEROBIC_CARBS_PER_HOUR_LOW_IOB, high: AEROBIC_CARBS_PER_HOUR_HIGH_IOB },
  "cardio-other": { low: AEROBIC_CARBS_PER_HOUR_LOW_IOB, high: AEROBIC_CARBS_PER_HOUR_HIGH_IOB },
  intermittent: {
    low: INTERMITTENT_CARBS_PER_HOUR_LOW_IOB,
    high: INTERMITTENT_CARBS_PER_HOUR_HIGH_IOB,
  },
  muscu: { low: 0, high: 0 },
};

/**
 * Glucides (g) à prévoir pour couvrir la baisse PENDANT l'effort. Distinct du
 * comblement de l'écart AVANT l'effort, que computePreSportBriefing calcule
 * déjà depuis l'IOB et la tendance : les deux s'additionnent, sous plafond.
 */
export function exerciseCarbsForDuration(
  family: ExerciseSource,
  durationMin: number,
  iobUnits: number,
): number {
  const rates = CARB_RATES[family];
  if (!rates || (rates.low === 0 && rates.high === 0)) return 0;
  if (!Number.isFinite(durationMin) || durationMin <= 0) return 0;
  const iob = Number.isFinite(iobUnits) ? Math.max(0, iobUnits) : 0;
  const t = Math.min(1, iob / HIGH_IOB_THRESHOLD_U);
  const perHour = rates.low + (rates.high - rates.low) * t;
  const hours = Math.min(durationMin, MAX_PLANNED_DURATION_MIN) / 60;
  return Math.min(MAX_PRE_SPORT_CARBS_G, Math.round(perHour * hours));
}
```

- [ ] **Step 4 : élargir le type de `workoutType` et brancher la composante**

`computePreSportBriefing` prend `workoutType: 'muscu' | 'running'` : le passer à `ExerciseSource`. Puis, dans la recommandation `eat-carbs`, additionner les deux composantes et plafonner le total :

```ts
const durationCarbs = exerciseCarbsForDuration(
  workoutType,
  workoutDurationMinutes ?? 60,
  iobUnits,
);
const totalCarbs = Math.min(MAX_PRE_SPORT_CARBS_G, gapCarbs + durationCarbs);
```

Conserver intacte la règle existante « au-delà de 120 min avant le départ, on ne chiffre pas, on affiche re-vérifie » : elle a été ajoutée après un « mange 191 g » absurde et reste le garde-fou principal.

- [ ] **Step 5 : ajouter le message du risque décalé**

Pour `workoutType === "intermittent"`, ajouter une recommandation dédiée, en plus des glucides :

```ts
recommendations.push({
  type: "check-glucose",
  headline: "Re-vérifie ta glycémie à la fin",
  detail:
    "Au foot, au padel ou en CrossFit, la glycémie tient pendant l'effort puis chute après : l'adrénaline la soutient tant que tu joues. Le risque d'hypo est décalé, pas absent.",
});
```

- [ ] **Step 6 : test du message spécifique**

```ts
test("intermittent : le briefing avertit du risque décalé", () => {
  const r = computePreSportBriefing({
    currentGlucose: 140, iobUnits: 2, isfMgPerU: 100,
    insulinActiveMinutes: 195, workoutType: "intermittent",
    minutesUntilWorkout: 30, workoutDurationMinutes: 90,
  });
  assert.ok(
    r.recommendations.some((x) => /chute après|décalé/i.test(x.detail)),
    `avertissement de risque décalé attendu, reçu ${JSON.stringify(r.recommendations)}`,
  );
});
```

- [ ] **Step 7 : vérifier et commiter**

```bash
npx tsc --noEmit && npm test && npm run build
git add lib/insulin-calculator.ts lib/pre-sport-carbs.test.ts
git commit -m "feat(sport): glucides pré-sport calculés par famille et durée"
```

---

## Task 3 : Séance déclarée — type, store, et effet sur l'ajustement

**Files:**
- Modify: `types/index.ts`, `lib/store.ts`, `lib/exercise-insulin-adjustment.ts`
- Test: `lib/declared-session.test.ts`

**Interfaces:**
- Consomme : `SPORTS` (Task 1), `ExerciseSource`.
- Produit : `DeclaredSportSession` (types) ; store `declaredSportSessions`, `addDeclaredSportSession`, `updateDeclaredSportSession`, `cancelDeclaredSportSession` ; `findMostRecentExercise` gagne un 4ᵉ paramètre.

- [ ] **Step 1 : ajouter le type**

Dans `types/index.ts` :

```ts
/**
 * Séance déclarée depuis le briefing pré-sport (sept. 2026). Créée quand
 * l'utilisateur accepte la recommandation, ce qui vaut déclaration
 * d'intention — pas de bouton de confirmation supplémentaire. Complétée
 * ensuite par la réconciliation Whoop quand le bracelet remonte la séance.
 */
export interface DeclaredSportSession {
  id: string;
  /** Clé de `SPORTS` (lib/sports.ts). */
  sportKey: string;
  /** Famille d'effort, dupliquée pour rester lisible sans le catalogue. */
  family: "running" | "muscu" | "cardio-other" | "intermittent";
  /** ISO du début prévu. */
  startAt: string;
  plannedDurationMin: number;
  actualDurationMin?: number;
  endedAt?: string;
  whoopWorkoutId?: string;
  cancelledAt?: string;
  createdAt: string;
}
```

- [ ] **Step 2 : ajouter la collection au store**

Sur le modèle exact de `carbEntries` (`lib/store.ts:436-441`) :

```ts
declaredSportSessions: [],
addDeclaredSportSession: (session) => set((s) => ({
  declaredSportSessions: [session, ...s.declaredSportSessions].slice(0, 200),
})),
updateDeclaredSportSession: (id, updates) => set((s) => ({
  declaredSportSessions: s.declaredSportSessions.map((x) =>
    x.id === id ? { ...x, ...updates } : x,
  ),
})),
cancelDeclaredSportSession: (id) => set((s) => ({
  declaredSportSessions: s.declaredSportSessions.map((x) =>
    x.id === id ? { ...x, cancelledAt: new Date().toISOString() } : x,
  ),
})),
```

Déclarer les quatre entrées dans l'interface du store. **Ne pas toucher au numéro de version du persist** : ajouter une collection absente est déjà géré (Zustand fusionne avec l'état initial), et une migration inutile risquerait les données existantes.

- [ ] **Step 3 : écrire les tests d'intégration à l'ajustement**

```ts
// lib/declared-session.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { findMostRecentExercise } from "./exercise-insulin-adjustment";
import type { DeclaredSportSession } from "@/types";

const now = Date.UTC(2026, 8, 7, 20, 0, 0);
const session = (over: Partial<DeclaredSportSession> = {}): DeclaredSportSession => ({
  id: "s1", sportKey: "padel", family: "intermittent",
  startAt: new Date(now - 120 * 60_000).toISOString(),
  plannedDurationMin: 90, createdAt: new Date(now - 150 * 60_000).toISOString(),
  ...over,
});

test("une séance déclarée et terminée alimente l'ajustement post-exercice", () => {
  const r = findMostRecentExercise([], [], undefined, now, [session()]);
  assert.equal(r?.source, "intermittent");
  assert.equal(r?.durationMin, 90);
});

test("une séance annulée est ignorée", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ cancelledAt: new Date(now - 10 * 60_000).toISOString() }),
  ]);
  assert.equal(r, null, "une séance annulée ne doit jamais réduire un bolus");
});

test("une séance qui n'est pas encore terminée est ignorée", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ startAt: new Date(now - 10 * 60_000).toISOString(), plannedDurationMin: 90 }),
  ]);
  assert.equal(r, null, "l'effet de sensibilité commence après l'effort, pas pendant");
});

test("la durée réelle Whoop prend le pas sur la durée prévue", () => {
  const r = findMostRecentExercise([], [], undefined, now, [
    session({ plannedDurationMin: 90, actualDurationMin: 40 }),
  ]);
  assert.equal(r?.durationMin, 40);
});
```

- [ ] **Step 4 : lancer, voir échouer, puis implémenter**

`findMostRecentExercise` gagne un 5ᵉ paramètre `declaredSessions: DeclaredSportSession[] = []`. Pour chacune : ignorer si `cancelledAt` ; calculer `endedAtMs = startAt + (actualDurationMin ?? plannedDurationMin) × 60000` ; appliquer les mêmes filtres que les autres sources (`endedAtMs >= cutoff && endedAtMs <= nowMs`) ; pousser un candidat `{ source: family, endedAtMs, durationMin, strain: estimateStrain(family, durationMin), strainSource: "estimated" }`.

`estimateStrain` prend un `ExerciseSource` : vérifier qu'elle traite `intermittent` après Task 1, sinon compléter.

- [ ] **Step 5 : brancher le site d'appel**

Dans `app/diabete/page.tsx`, le `useMemo` `recentExercise` passe `declaredSportSessions` du store en 5ᵉ argument. **Un seul memo `recentExercise` existe et doit le rester** — une passe précédente a corrigé des divergences entre deux calculs concurrents.

- [ ] **Step 6 : vérifier et commiter**

```bash
npx tsc --noEmit && npm test && npm run build
git add types/index.ts lib/store.ts lib/exercise-insulin-adjustment.ts lib/declared-session.test.ts app/diabete/page.tsx
git commit -m "feat(sport): séance déclarée persistée et branchée sur l'ajustement post-exercice"
```

---

## Task 4 : Glucides tagués sport, exclus de la couverture et de l'apprentissage

**Files:**
- Modify: `types/index.ts`, `lib/carbs-on-board.ts`, `lib/dose-validation.ts`
- Test: `lib/carbs-on-board.test.ts` (existant), `lib/dose-validation.test.ts` (existant)

**Interfaces:**
- Consomme : `DeclaredSportSession` (Task 3).
- Produit : `CarbEntry.sportSessionId?: string` et son traitement.

- [ ] **Step 1 : ajouter le champ**

Dans `types/index.ts`, `CarbEntry`, juste après `hypoEventId` :

```ts
/**
 * Traçabilité vers la `DeclaredSportSession` quand ces glucides ont été pris
 * pour couvrir un effort (sept. 2026). Même traitement que `hypoEventId` :
 * comptés dans les glucides actifs, mais exclus de la couverture insuline et
 * de l'apprentissage — ils compensent une baisse due au sport, ce n'est pas
 * un repas à couvrir.
 */
sportSessionId?: string;
```

- [ ] **Step 2 : écrire le test de la couverture**

Dans `lib/carbs-on-board.test.ts`, sur le modèle du test existant des glucides de resucrage :

```ts
test("les glucides pris pour le sport ne réclament pas d'insuline", () => {
  const now = Date.now();
  const sportCarbs = {
    id: "c1", carbsGrams: 40, eatenAt: new Date(now - 10 * 60_000).toISOString(),
    sportSessionId: "s1",
  };
  const cob = computeCarbsOnBoard({
    insulinLogs: [], carbEntries: [sportCarbs], nowMs: now,
    ratios: { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 },
    isf: 100, currentGlucose: 120,
  });
  assert.ok(cob.carbsRemainingG > 0, "les grammes doivent bien compter dans le COB");
  assert.equal(cob.insulinNeededU, 0, "aucune insuline ne doit être réclamée pour eux");
});
```

Adapter la forme exacte de l'appel à la signature réelle de `computeCarbsOnBoard`.

- [ ] **Step 3 : implémenter l'exclusion**

`lib/carbs-on-board.ts` dérive déjà `isRescue` depuis `hypoEventId`. Généraliser : une entrée est « non couvrante » si elle porte `hypoEventId` **ou** `sportSessionId`. Ces sources comptent dans les grammes restants mais n'entrent pas dans `insulinNeededU`.

- [ ] **Step 4 : exclure de l'apprentissage des doses**

`lib/dose-validation.ts` analyse les repas pour détecter les sur-dosages par créneau. Un `CarbEntry` de sport ne doit jamais être compté comme repas analysable, et une hypo survenant dans une fenêtre où une séance sport a été déclarée doit être écartée avec un motif dédié (`sport-carbs`), au même titre que les exclusions existantes.

- [ ] **Step 5 : test de l'exclusion d'apprentissage**

Un test qui construit un créneau avec 5 repas dont l'un est suivi de glucides sport, et vérifie que ce repas est écarté avec le motif attendu — et que le motif figure bien dans le décompte affiché à l'utilisateur.

- [ ] **Step 6 : vérifier et commiter**

```bash
npx tsc --noEmit && npm test && npm run build
git add types/index.ts lib/carbs-on-board.ts lib/carbs-on-board.test.ts lib/dose-validation.ts lib/dose-validation.test.ts
git commit -m "feat(sport): glucides tagués sport, hors couverture et hors apprentissage"
```

---

## Task 5 : Interface du briefing

**Files:**
- Modify: `app/diabete/page.tsx`

**Interfaces:**
- Consomme : `SPORTS`, `getSport` (Task 1) ; `computePreSportBriefing` élargi (Task 2) ; actions du store (Task 3) ; `CarbEntry.sportSessionId` (Task 4).

- [ ] **Step 1 : remplacer le sélecteur à deux boutons**

L'état `const [briefingType, setBriefingType] = useState<"muscu" | "running">(...)` devient une clé de sport. Le sélecteur passe d'une grille de deux boutons à une grille de chips (3 colonnes sur mobile), groupées par famille avec un intitulé de groupe : « Aérobie — la glycémie baisse », « Intermittent — elle chute après », « Résistance — elle monte plutôt ».

Icônes `lucide-react` uniquement, aucun emoji. Réutiliser les tokens existants : `running` pour l'aérobie, `diabete` pour l'intermittent, `muscu` pour la résistance.

- [ ] **Step 2 : ajouter le champ durée**

Sous le curseur « dans combien de temps », un second champ pré-rempli avec `getSport(key).defaultDurationMin`, modifiable. Il doit se **réinitialiser à la valeur par défaut du nouveau sport** quand l'utilisateur change de sport, sauf s'il l'a lui-même modifié — même motif que `macrosManuallyEdited` dans le calculateur de bolus, déjà en place dans ce fichier.

- [ ] **Step 3 : créer la séance à l'acceptation**

Le bouton d'acceptation de la recommandation `eat-carbs` fait deux écritures liées :

```ts
const sessionId = crypto.randomUUID();
addDeclaredSportSession({
  id: sessionId,
  sportKey,
  family: getSport(sportKey)!.family,
  startAt: new Date(Date.now() + minutesUntilWorkout * 60_000).toISOString(),
  plannedDurationMin,
  createdAt: new Date().toISOString(),
});
addCarbEntry({
  id: crypto.randomUUID(),
  carbsGrams: recommendedCarbs,
  eatenAt: new Date().toISOString(),
  sportSessionId: sessionId,
  label: `Avant ${getSport(sportKey)!.label.toLowerCase()}`,
});
```

Pour la famille `muscu`, aucun glucide n'est recommandé : un bouton « Je pars » explicite crée la séance seule.

- [ ] **Step 4 : carte de séance en cours avec annulation**

Quand une `DeclaredSportSession` non annulée et non terminée existe, afficher une carte : sport, heure de début, durée prévue, et un bouton d'annulation. Le libellé doit dire ce que l'annulation évite : « Annuler — sinon ton prochain bolus sera réduit pour une séance qui n'a pas eu lieu ». Confirmation native avant d'annuler.

- [ ] **Step 5 : vérifier**

```bash
npx tsc --noEmit && npm run build && npm test
```

- [ ] **Step 6 : commit**

```bash
git add app/diabete/page.tsx
git commit -m "feat(sport): sélecteur de sport, durée et création de séance dans le briefing"
```

---

## Task 6 : Réconciliation Whoop

**Files:**
- Create: `lib/whoop-reconcile.ts`
- Test: `lib/whoop-reconcile.test.ts`
- Modify: `app/diabete/page.tsx`

**Interfaces:**
- Consomme : `DeclaredSportSession` (Task 3), snapshot Whoop (`hooks/useWhoop`, champ `lastWorkout`).
- Produit : `reconcileWithWhoop(sessions, whoopWorkout, nowMs)` → `{ sessionId, updates } | null` et `unconfirmedSessions(sessions, whoopConnected, nowMs)`.

- [ ] **Step 1 : écrire les tests**

```ts
test("une séance Whoop recouvrant la fenêtre déclarée la complète", () => {
  const start = Date.UTC(2026, 8, 7, 18, 0, 0);
  const sessions = [{
    id: "s1", sportKey: "padel", family: "intermittent" as const,
    startAt: new Date(start).toISOString(), plannedDurationMin: 90,
    createdAt: new Date(start - 3600_000).toISOString(),
  }];
  const whoop = {
    id: "w1",
    start: new Date(start + 5 * 60_000).toISOString(),
    end: new Date(start + 70 * 60_000).toISOString(),
  };
  const r = reconcileWithWhoop(sessions, whoop, start + 3 * 3600_000);
  assert.equal(r?.sessionId, "s1");
  assert.equal(r?.updates.actualDurationMin, 65);
  assert.equal(r?.updates.whoopWorkoutId, "w1");
});

test("une séance Whoop trop éloignée ne rapproche rien", () => {
  const start = Date.UTC(2026, 8, 7, 18, 0, 0);
  const sessions = [{
    id: "s1", sportKey: "padel", family: "intermittent" as const,
    startAt: new Date(start).toISOString(), plannedDurationMin: 90,
    createdAt: new Date(start).toISOString(),
  }];
  const whoop = {
    id: "w1",
    start: new Date(start + 8 * 3600_000).toISOString(),
    end: new Date(start + 9 * 3600_000).toISOString(),
  };
  assert.equal(reconcileWithWhoop(sessions, whoop, start + 10 * 3600_000), null);
});

test("une séance déjà réconciliée n'est pas rapprochée deux fois", () => {
  // même jeu que le premier test, mais la séance porte déjà whoopWorkoutId
  // → reconcileWithWhoop doit renvoyer null (idempotence).
});
```

- [ ] **Step 2 : implémenter**

Rapprochement par recouvrement temporel : la séance Whoop doit commencer dans une fenêtre de `RECONCILE_TOLERANCE_MIN = 45` minutes autour du début déclaré. `actualDurationMin` = durée Whoop arrondie à la minute. Idempotent : une séance portant déjà `whoopWorkoutId` est ignorée.

`unconfirmedSessions` renvoie les séances terminées depuis plus de `UNCONFIRMED_AFTER_MIN = 180` minutes, sans `whoopWorkoutId`, alors que Whoop est connecté.

- [ ] **Step 3 : brancher et signaler**

Dans `app/diabete/page.tsx`, un `useEffect` applique la réconciliation quand le snapshot Whoop change. Les séances non confirmées apparaissent dans une note discrète : « Whoop n'a pas retrouvé cette séance — elle reste prise en compte, annule-la si elle n'a pas eu lieu. » **Ne pas supprimer d'office** : Ethan peut avoir fait du sport sans son bracelet.

- [ ] **Step 4 : vérifier et commiter**

```bash
npx tsc --noEmit && npm test && npm run build
git add lib/whoop-reconcile.ts lib/whoop-reconcile.test.ts app/diabete/page.tsx
git commit -m "feat(sport): réconciliation des séances déclarées avec Whoop"
```

---

## Auto-revue du plan

**Couverture de la spec** — Trois familles → Task 1. Catalogue et durées par défaut → Task 1. Reclassement CrossFit → Task 1 Step 6. Calcul des glucides par famille et durée, plafonds → Task 2. Message du risque décalé → Task 2 Step 5. Tag `sportSessionId` et ses trois conséquences → Task 4. Type `DeclaredSportSession`, création à l'acceptation, effet immédiat sur l'ajustement → Task 3. Bouton « Je pars » pour la résistance → Task 5 Step 3. Annulation en un geste → Task 5 Step 4. Réconciliation Whoop et signalement des non confirmées → Task 6. Tests exigés par la spec → répartis sur les Tasks 1, 2, 3, 4 et 6.

**Cohérence des types** — `ExerciseSource` élargie en Task 1 et utilisée sous ce nom en Tasks 2, 3, 6. `DeclaredSportSession` définie en Task 3, consommée en Tasks 4, 5, 6. `SPORTS` / `getSport` définis en Task 1, consommés en Tasks 3 et 5. `sportSessionId` défini en Task 4, écrit en Task 5.

**Point de vigilance pour l'exécutant** — Task 1 Step 3 élargit une union de types consommée à plusieurs endroits. Le compilateur signalera les sites à compléter : les traiter un par un, sans `default` fourre-tout, qui masquerait un oubli sur une famille dont l'effet glycémique est justement différent.
