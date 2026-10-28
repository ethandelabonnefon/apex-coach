# Glucides restants lus sur la courbe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le plan de nuit lit sur la courbe les glucides encore à digérer, en déduit la montée nocturne avec un facteur appris, et propose la dose entière qui garde la nuit ≤ 130 sans passer sous 80.

**Architecture:** Un module pur (`lib/observed-carbs.ts`) fait le bilan de masse glucides ; le moteur `predictGlucoseCurve` accepte une part glucides « observée » par événement ; un chercheur de dose pur (`lib/bedtime-dose.ts`) rejoue la courbe pour 0, 1, 2… U ; `night-brain.ts` présente le résultat. La calibration ajoute un facteur appris et respecte les nuits exclues (`lib/night-review.ts`). Le log de réveil est réécrit jusqu'à 2h.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Zustand persist, tests `node --test` via tsx (`npm test`).

**Spec:** `docs/superpowers/specs/2026-10-28-glucides-restants-nuit-design.md`

## Global Constraints

- Travailler sur la branche `feat/glucides-restants-nuit` (pas sur `main`).
- Interface 100 % français, tutoiement, aucun emoji (BRAND.md).
- Jamais d'auto-apply : toute dose passe par le bouton de l'étape (`log-correction`).
- Ne jamais passer un défaut de champ (`currentGlucose` = `useState(120)`) à un garde-fou : lecture absente ou > 15 min = pas de dose.
- Doses proposées : entiers uniquement (stylo au pas de 1 U).
- Pic de nuit cible : `NIGHT_CEILING = 130` ; plancher : `NIGHT_FLOOR = 80` (mg/dL).
- Facteur glucides tardifs : défaut `1.5`, borné `[0.5, 4]`, défaut tant que < `5` nuits utilisables.
- Fenêtre de lecture observée : `[90, 240]` min après le repas ; point repas à ±20 min ; lecture actuelle ≤ 15 min.
- Étalement des glucides restants : linéaire sur `180` min.
- Ne PAS toucher : dose du repas, `laterUnits`/split lipides, tuile COB en journée, `suggestTopUp`.
- Pas de nouvelle requête LibreLink : réutiliser `useGlucose({ mode: "history" })` (cache partagé avec `GlucoseChart`). Ouvrir `/diabete` en rafale en dev coupe la glycémie live d'Ethan (429 Abbott).
- Toute nouvelle clé de store persistée → `BACKED_UP_KEYS` (`lib/store-backup/payload.ts`).

## Review Focus

- **Glycémie déjà > 130 au coucher** (ex. 200) : le plafond s'applique à la courbe à partir de T+2h, pas aux premiers points qu'aucune dose ne peut ramener ; on attend une dose, pas « impossible ». → test dans Task 4.
- **Repas surestimé (incertain)** : `remainingG` est borné à la saisie, jamais négatif, et la dose reste soumise au plancher 80. → tests Tasks 1 et 4.
- **Deux repas rapprochés ou resucrage** dans la fenêtre : aucune lecture observée, retour au modèle actuel, jamais un mélange. → test Task 1.
- **Nuit 0 h – 2 h** (`isEveningHours` jusqu'à 2h) : la clé de nuit d'un instant à 1h du matin est la veille ; le log de réveil et l'exclusion visent la même nuit. → test Task 3.
- **Flèche ↓↓** ou glycémie < 80 au coucher : aucune dose, même si un pic est prédit plus tard. → test Task 4.

---

### Task 1: Bilan de masse des glucides observés

**Files:**
- Create: `lib/observed-carbs.ts`
- Test: `lib/observed-carbs.test.ts`

**Interfaces:**
- Consumes: `iobRemainingFraction(minutesAgo, dia, peak)` (`lib/night-calibration.ts`).
- Produces:
  ```ts
  export const OBS_WINDOW_MIN = 90, OBS_WINDOW_MAX = 240;
  export const OBS_MEAL_POINT_TOLERANCE_MIN = 20, OBS_MAX_GLUCOSE_AGE_MIN = 15;
  export interface ObservedCarbsInput {
    carbsGrams: number;          // saisie (resolveCarbs)
    mealMinutesAgo: number;
    carbSensitivity: number;     // ISF / ratio du repas (mg/dL/g)
    boluses: { units: number; minutesAgo: number }[]; // injections de [repas−240, maintenant]
    glucoseAtMeal: number | null;
    glucoseNow: number | null;
    glucoseNowAgeMin: number | null;
    isf: number; dia?: number; peak?: number;
    otherMealsInWindow: number;  // autres repas ≥ 20 g dans la fenêtre
    rescueInWindow: boolean;
  }
  export interface ObservedCarbs { remainingG: number; absorbedG: number }
  export function observedCarbsRemaining(input: ObservedCarbsInput): ObservedCarbs | null;
  ```

- [ ] **Step 1: Write the failing tests** (style `node:test` + `assert/strict`, comme `lib/night-brain.test.ts`)

  - `dîner du 27/10 → ~57 g restants` : carbs 140, mealMinutesAgo 150, CSF 10, boluses `[{units: 9, minutesAgo: 150}]`, glucoseAtMeal 76, glucoseNow 90, age 3, isf 100 → `remainingG` entre 50 et 65.
  - `repas absorbé normalement → ~0` : carbs 60, 6 U, 150 min, glucoseAtMeal 110, glucoseNow 115 → `remainingG < 5`.
  - `bornes` : glycémie qui monte beaucoup plus que prévu → `remainingG === 0` ; glycémie qui chute avec peu d'insuline → `remainingG === carbsGrams` (jamais > saisie, jamais < 0).
  - `null` pour chacun : mealMinutesAgo 60 ; 300 ; glucoseAtMeal null ; glucoseNow null ; age 20 ; otherMealsInWindow 1 ; rescueInWindow true ; carbsGrams 0.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL, module introuvable.

- [ ] **Step 3: Implement `observedCarbsRemaining`**

  Pour chaque bolus : `remAtMeal = iobRemainingFraction(b.minutesAgo − mealMinutesAgo)` (argument ≤ 0 → 1, bolus postérieur au repas), `remNow = iobRemainingFraction(b.minutesAgo)`, `insulineUtilisée += units × (remAtMeal − remNow)`. `absorbedG = (glucoseNow − glucoseAtMeal + insulineUtilisée × isf) / carbSensitivity` ; `remainingG = clamp(carbsGrams − absorbedG, 0, carbsGrams)`. Défauts dia 195 / peak 75.

- [ ] **Step 4: Run** `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(nuit): bilan de masse des glucides observés sur la courbe`

---

### Task 2: Le moteur accepte une part glucides observée

**Files:**
- Modify: `lib/glucose-prediction.ts` (`PredictionEvent` ~l.400, `effectsAt` boucle événements ~l.630)
- Modify: `lib/prediction-inputs.ts` (`buildPredictionEvents`)
- Test: `lib/glucose-prediction.test.ts`, `lib/prediction-inputs.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // PredictionEvent — nouveaux champs optionnels
  sourceId?: string;            // id InsulinLog / CarbEntry
  observedRemainingG?: number;  // si défini, remplace la montée glucides future
  lateCarbMgPerG?: number;      // facteur appris (mg/dL/g)
  export const OBS_SPREAD_MIN = 180;
  // lib/prediction-inputs.ts
  export function withObservedCarbs(
    events: PredictionEvent[], sourceId: string, remainingG: number, mgPerG: number,
  ): PredictionEvent[];
  ```

- [ ] **Step 1: Write the failing tests**
  - `observedRemainingG remplace carbGlucoseRise` : un seul événement `{minutesAgo:150, carbsGrams:140, observedRemainingG:57, lateCarbMgPerG:1.5}`, isf 100, sans bolus, trend 3 → la courbe à 180 min vaut `current + 85.5 ± 1` ; à 90 min `current + 42.75 ± 1` ; à 360 min toujours `+85.5` (plateau).
  - `sans observedRemainingG, rien ne change` : la courbe existante d'un test de référence est identique.
  - `buildPredictionEvents renseigne sourceId` : `log.id` et `c.id`.
  - `withObservedCarbs` ne modifie que l'événement ciblé et ne mute pas l'entrée.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.

- [ ] **Step 3: Implement** — dans `effectsAt`, si `ev.observedRemainingG !== undefined` : `glucose += ev.observedRemainingG × (ev.lateCarbMgPerG ?? 1.5) × min(1, minutesAhead / OBS_SPREAD_MIN)` au lieu de `carbGlucoseRise` ; FPU et IOB inchangés. Mettre à jour le commentaire d'architecture en tête du fichier (COB : fixe 195 min OU observé).

- [ ] **Step 4: Run** `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(prédiction): part glucides observée par événement`

---

### Task 3: Nuits exclues + facteur glucides tardifs appris

**Files:**
- Create: `lib/night-review.ts`, test `lib/night-review.test.ts`
- Modify: `lib/night-calibration.ts` (ajout `estimateLateCarbFactor`), test `lib/night-calibration.test.ts` (créer si absent)

**Interfaces:**
- Consumes: `observedCarbsRemaining` (Task 1), `ArchivedPoint`, `NightInjection`.
- Produces:
  ```ts
  // lib/night-review.ts
  export interface NightReview { night: string; counted: boolean } // night = "YYYY-MM-DD" du soir
  export function nightKeyFor(ms: number): string;   // heure locale < 12 → veille
  export function excludedNightKeys(reviews: NightReview[]): Set<string>;
  export function filterExcludedNightPoints<T extends { t: number }>(points: T[], excluded: Set<string>): T[]; // retire les points 18h–12h des nuits exclues
  // lib/night-calibration.ts
  export const LATE_CARB_DEFAULT = 1.5, LATE_CARB_MIN = 0.5, LATE_CARB_MAX = 4, LATE_CARB_MIN_NIGHTS = 5;
  export interface LateCarbMeal { injectedAt: string; carbsGrams: number; carbSensitivity: number }
  export interface LateCarbFactorResult { mgPerGram: number; sampleNights: number; isDefault: boolean }
  export function estimateLateCarbFactor(
    points: ArchivedPoint[], meals: LateCarbMeal[], injections: NightInjection[],
    isf: number, excluded: Set<string>,
  ): LateCarbFactorResult;
  ```

- [ ] **Step 1: Write the failing tests**
  - `nightKeyFor` : 27/10 23:30 → `"2026-10-27"` ; 28/10 01:30 → `"2026-10-27"` ; 28/10 13:00 → `"2026-10-28"`.
  - `filterExcludedNightPoints` : nuit 27 exclue → retire 27/10 22:00 et 28/10 06:00, garde 27/10 15:00 et 28/10 14:00.
  - `estimateLateCarbFactor` : 4 nuits utilisables → `{mgPerGram: 1.5, isDefault: true}` ; 6 nuits synthétiques où montée = 30 + 2 × restant → `mgPerGram ≈ 2` ; pente 10 → `4` (borne) ; nuit avec injection dans les 5h après la lecture ignorée ; nuit exclue ignorée.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.

- [ ] **Step 3: Implement** — repas retenus : carbs ≥ 60, heure locale de l'injection entre 18h et 23h59. Lecture à `t + 150` min ; glycémies repas/lecture = point archive le plus proche à ±20 min ; `boluses` = injections de `[t − 240, lecture]` ; nuit ignorée si une injection tombe dans `(lecture, lecture + 300]` ou si `nightKeyFor(t)` est exclue. Montée réelle = max des points de `(lecture, lecture + 300]` − glycémie lecture. Pente par moindres carrés avec ordonnée (seule la pente sert) ; variance nulle ou < 5 nuits → défaut ; clamp `[0.5, 4]`.

- [ ] **Step 4: Run** `npm test` — Expected: PASS.

- [ ] **Step 5: Commit** `feat(calibration): facteur glucides tardifs + nuits exclues`

---

### Task 4: Dose du coucher « pic ≤ 130, plancher 80 »

**Files:**
- Create: `lib/bedtime-dose.ts`, test `lib/bedtime-dose.test.ts`
- Modify: `lib/night-brain.ts` (input, étape C ~l.292-330, étape couverture ~l.173)
- Modify: `components/diabete/NightBrain.tsx` (rendu de `step.warning`)
- Test: `lib/night-brain.test.ts` (mettre à jour les cas « 120 / 0,5 U / plafond 2 U » devenus faux)

**Interfaces:**
- Consumes: `computeBedtimeAdvice` (renvoie `curve: PredictionPoint[]` en mode `events`).
- Produces:
  ```ts
  // lib/bedtime-dose.ts
  export const NIGHT_CEILING = 130, NIGHT_FLOOR = 80;
  export const CEILING_FROM_MIN = 120;   // le plafond s'applique à partir de T+2h
  export const DOSE_SEARCH_LIMIT_U = 10; // borne de recherche, pas un plafond de dose
  export interface CurveSummary { max: number; maxAtMs: number; min: number; minAtMs: number }
  export type BedtimeDose =
    | { kind: "none"; base: CurveSummary }                       // 0 U tient déjà
    | { kind: "fits"; units: number; base: CurveSummary; withDose: CurveSummary }
    | { kind: "compromise"; units: number; base: CurveSummary; withDose: CurveSummary; nextUp: CurveSummary };
  export function summarizeCurve(curve: PredictionPoint[], nowMs: number): CurveSummary; // max sur minute ≥ 120, min sur minute > 0
  export function findBedtimeDose(simulate: (units: number) => CurveSummary): BedtimeDose;
  // lib/night-brain.ts — NightBrainInput, nouveaux champs
  observedCarbs?: { remainingG: number; enteredG: number; uncertain: boolean };
  glucoseAgeMin?: number;
  // NightStep — nouveau champ
  warning?: string;
  // NightStepKind — ajout "digesting"
  ```

- [ ] **Step 1: Write the failing tests**
  - `findBedtimeDose` (simulate synthétique : chaque U = −100 sur max et min) : base max 230 min 120 → `fits`, 1 U ; base max 250 / min 180 → `fits`, 2 U ; base max 170 / min 95 → `compromise` units 0, `nextUp.min === -5` (0 U dépasse 130, 1 U passe sous 80) ; base max 125 → `none` ; entiers uniquement ; jamais au-delà de 10.
  - `summarizeCurve` : un point à 200 à la minute 15 ne compte pas dans `max` ; un point à 75 à la minute 15 compte dans `min`.
  - `computeNightPlan` :
    - cas 27/10 (events avec `observedRemainingG` 57, facteur 1,5, glycémie 94, ISF 100) → étape `correction` en unités entières, action `log-correction`, `quantity` ∈ {1, 2} ; le texte cite le pic avec et sans dose.
    - glycémie 200 au coucher, rien d'autre → une dose est proposée (pas « impossible »).
    - `observedCarbs.uncertain = true` → même `quantity` que certain, et `warning === "Quantité incertaine : cette dose part des 140 g que tu as saisis. Si tu as moins mangé, elle peut te faire descendre."`.
    - glycémie 75 → aucune étape `correction` ; `trendArrow = 1` → aucune ; `glucoseAgeMin` absent ou 20 → aucune.
    - `observedCarbs` présent → étape `digesting` « Il reste ~57 g de ton repas à digérer » et plus d'étape `coverage` déficit ; l'étape `coverage` excès reste possible.

- [ ] **Step 2: Run** `npm test` — Expected: FAIL.

- [ ] **Step 3: Implement**
  - `findBedtimeDose` : `u = 0, 1, …, 10` ; premier `u` avec `max ≤ 130 && min ≥ 80` → `none` si u = 0 sinon `fits` ; sinon plus grand `u` avec `min ≥ 80` → `compromise` (avec `nextUp = simulate(u + 1)`).
  - `computeNightPlan`, étape C : si `input.events` présent et ni `liveLow`, ni `trendArrow === 1`, ni `glucoseAgeMin` absent / > 15 → `simulate(u)` = `summarizeCurve(computeBedtimeAdvice({...input, events: [...input.events, {units: u, minutesAgo: 0}]}).curve, nowMs)`. Mode legacy (sans `events`) : étape C inchangée.
  - Textes (heures formatées `fr-FR` `HH:MM`) :
    - fits — headline `Fais ${u}U pour rester sous 130 cette nuit`, detail `Sans rien, pic prévu ~${base.max} mg/dL vers ${hh}. Avec ${u}U : pic ~${withDose.max}, point bas ~${withDose.min}.`
    - compromise u ≥ 1 — headline `Fais ${u}U : impossible de rester sous 130 sans risque d'hypo`, detail `Avec ${u}U tu montes à ~${withDose.max} ; ${u + 1}U te ferait descendre à ~${nextUp.min} vers ${hh}.`
    - compromise u = 0 — pas d'action, headline `Pas de correction possible sans risque d'hypo`, detail `Pic prévu ~${base.max} vers ${hh} ; 1U te ferait descendre à ~${nextUp.min} vers ${hh2}.`
    - digesting — headline `Il reste ~${g} g de ton repas à digérer`, detail `Ça va monter jusqu'à ~${base.max} mg/dL vers ${hh} si tu ne fais rien.`
  - Supprimer `EVENING_TARGET` et l'arrondi 0,5 U / clamp 2 U de l'étape C.
  - `NightBrain.tsx` : si `step.warning`, l'afficher au-dessus du headline dans un bloc `.alert` (rôle erreur, BRAND v5).

- [ ] **Step 4: Run** `npm test` — Expected: PASS (y compris `night-brain.test.ts` mis à jour).

- [ ] **Step 5: Commit** `feat(nuit): dose du coucher pic ≤ 130 / plancher 80 en unités entières`

---

### Task 5: Store — avis de nuit + log de réveil réécrit

**Files:**
- Modify: `lib/store.ts` (state + actions), `types/index.ts` si les types y vivent
- Modify: `lib/night-calibration.ts` (`NightPredictionRecord.version?: number`)
- Modify: `lib/store-backup/payload.ts` (`BACKED_UP_KEYS` += `"nightReviews"`)
- Test: `lib/night-review.test.ts` (fonction pure d'upsert)

**Interfaces:**
- Consumes: `NightReview`, `nightKeyFor` (Task 3).
- Produces:
  ```ts
  // lib/night-review.ts
  export const NIGHT_LOG_VERSION = 2;
  export function upsertNightLog(logs: NightPredictionRecord[], rec: NightPredictionRecord): NightPredictionRecord[];
  // store
  nightReviews: NightReview[];
  setNightReview: (night: string, counted: boolean) => void;   // remplace l'avis existant
  upsertNightPredictionLog: (record: NightPredictionRecord) => void; // via upsertNightLog, cap 60
  ```

- [ ] **Step 1: Write the failing tests** — `upsertNightLog` : même `nightKeyFor(createdAt)` et non résolu → remplacé (une seule entrée) ; nuit différente → ajouté en tête ; entrée déjà résolue (`actualWakeupGlucose` défini) jamais écrasée.
- [ ] **Step 2: Run** `npm test` — Expected: FAIL.
- [ ] **Step 3: Implement** `upsertNightLog`, les deux actions, `nightReviews: []` par défaut (le merge persist suffit, pas de bump de version), clé de sauvegarde.
- [ ] **Step 4: Run** `npm test` puis `npx tsc --noEmit` — Expected: PASS, 0 erreur.
- [ ] **Step 5: Commit** `feat(store): avis de nuit + log de réveil réécrit jusqu'au coucher`

---

### Task 6: Câblage `/diabete` + carte du matin

**Files:**
- Modify: `app/diabete/page.tsx` (memo `nightCalibration` ~l.1603, `bedtimeInput` ~l.1665, effet de log ~l.1793)
- Create: `components/diabete/NightReviewCard.tsx`
- Modify: `components/diabete/NightBrain.tsx` (`CalibrationLine` : facteur + nuits exclues réintégrables)

**Interfaces:**
- Consumes: Tasks 1–5.

- [ ] **Step 1: Glucides observés dans `bedtimeInput`**
  - Historique : `useGlucose({ mode: "history" }).history` (pas de nouvel endpoint).
  - Repas visé : dernier `InsulinLog` hors correction/split avec `resolveCarbs ≥ 20` dans `[90, 240]` min. `glucoseAtMeal` = `log.glucoseBefore` si > 0, sinon point d'historique ou d'archive à ±20 min. `glucoseNow` = `liveGlucose?.value` et `glucoseNowAgeMin` depuis `liveGlucose.date` — **jamais `currentGlucose`**. `otherMealsInWindow` / `rescueInWindow` depuis `insulinLogs` + `carbEntries` (`hypoEventId`).
  - Si résultat non nul : `events = withObservedCarbs(events, log.id, remainingG, nightCalibration.lateCarb.mgPerGram)` et `observedCarbs = { remainingG, enteredG: resolveCarbs(log), uncertain: !isLearnable(log) }`. Passer aussi `glucoseAgeMin`.
- [ ] **Step 2: Calibration** — `excluded = excludedNightKeys(nightReviews)` ; points filtrés par `filterExcludedNightPoints` avant `estimateNightDrift` / `estimateDawnCurve` / `estimateLateCarbFactor` ; logs filtrés `version === NIGHT_LOG_VERSION` et nuit non exclue avant `resolveNightLogs` / `estimateWakeupBias` ; règle `basalDoseChangedAt` conservée. Exposer `lateCarb` dans le memo.
- [ ] **Step 3: Log de réveil** — remplacer la dédup 12 h par `upsertNightPredictionLog({ …, version: NIGHT_LOG_VERSION })` tant que `isEveningHours`, en n'écrivant que si la valeur prédite a changé ou si la dernière écriture date de ≥ 15 min.
- [ ] **Step 4: `NightReviewCard`** — affichée de 5h à 12h si `nightKeyFor(now − 12 h)` n'a pas d'avis : « Compter cette nuit dans les algorithmes ? » + boutons Oui / Non → `setNightReview`. Classes du kit (`.panel`, `.seg` ou boutons existants).
- [ ] **Step 5: `CalibrationLine`** — ligne « Glucides tardifs : X mg/dL par gramme (N nuits) » ou « valeur par défaut » ; liste des nuits exclues avec action « Réintégrer » (`setNightReview(night, true)`).
- [ ] **Step 6: Vérifier** — `npm test`, `npx tsc --noEmit`, `npm run lint` : 0 erreur. Une seule ouverture de `/diabete` en preview (pas de rechargements en rafale) : pas d'erreur console, carte du matin visible avant midi.
- [ ] **Step 7: Commit** `feat(diabète): plan de nuit branché sur les glucides observés + avis du matin`

---

### Task 7: Rejeu sur les vrais dîners

**Files:**
- Create: `scripts/replay-night-carbs.ts` (hors CI, non importé par l'app)

- [ ] **Step 1: Écrire le script** — lit `--archive <json>` (`/api/glucose/archive?days=90`) et `--backup <json>` (`/api/store-backup?full=1`) passés en argument ; pour chaque dîner ≥ 80 g, à T+2h30 : prédiction actuelle vs nouvelle (facteur appris), montée réelle sur 5h, dose proposée et min prédit avec cette dose.
- [ ] **Step 2: Run** `npx tsx scripts/replay-night-carbs.ts --archive <a> --backup <b>` — Expected : erreur moyenne de prédiction plus faible que l'actuelle ; aucune dose dont le min prédit < 80 ; le 27/10 donne 1 ou 2 U (noter la valeur pour Ethan).
- [ ] **Step 3: Commit** `chore(nuit): script de rejeu des dîners`
