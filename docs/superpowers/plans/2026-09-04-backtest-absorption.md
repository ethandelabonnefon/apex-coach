# Backtest du modèle de prédiction — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mesurer l'erreur réelle de `predictGlucoseCurve` sur les 91 jours d'archive glycémique d'Ethan, sans jamais modifier le moteur mesuré.

**Architecture:** Trois modules purs dans `lib/backtest/` qui rejouent le passé en réutilisant tel quel le pipeline de production (`buildPredictionEvents` → `predictGlucoseCurve` → `capDoseByPrediction`), plus un bouton d'export dans l'app et un script local qui orchestre et rend le rapport. Aucune page de production.

**Tech Stack:** TypeScript strict, `node:test` via `tsx` (`npm test`), Next.js 16 App Router (bouton d'export uniquement), Recharts non requis (le rapport est produit hors app).

## Global Constraints

- Interface 100 % français, code en anglais, commentaires mixtes.
- **Interdiction absolue de modifier** `lib/glucose-prediction.ts`, `lib/prediction-inputs.ts`, `lib/dose-capping.ts`, `lib/night-calibration.ts`, `lib/insulin-calculator.ts`. Le backtest les observe ; les modifier invaliderait la mesure.
- **Aucune interpolation** de valeur capteur. Un point manquant est écarté, jamais inventé.
- **Étanchéité temporelle** : un instant rejoué à `t0` ne doit voir aucune donnée d'horodatage `>= t0`. C'est l'exigence n°1 du backtest.
- **Barrière du changement de basale** : aucune donnée antérieure à `userProfile.basalDoseChangedAt` ne nourrit une calibration postérieure.
- Tolérance d'appariement des points capteur : **±8 minutes**, strictement (9 min → écarté).
- Seuils d'honnêteté : **20** instants rejoués, **8** repas, **10** injections. En dessous, on renvoie l'effectif et `inconclusive: true`, jamais la valeur.
- `npx tsc --noEmit`, `npm test` et `npm run build` verts avant chaque commit.
- Ne pas lancer de serveur de dev.

---

## Structure des fichiers

| Fichier | Responsabilité |
|---|---|
| `app/diabete/parametres/page.tsx` (modif) | Bouton « Exporter mes données » — seul ajout à l'app |
| `lib/backtest/types.ts` | Types partagés des trois modules |
| `lib/backtest/replay.ts` | Contexte de rejeu (calibrations roulantes, index) + rejeu d'un instant + grille |
| `lib/backtest/metrics.ts` | Sections 1 et 2 : erreur de courbe, diagnostic d'absorption |
| `lib/backtest/cap-audit.ts` | Section 3 : audit du plafond |
| `scripts/backtest.ts` | Runner local : lit l'export, récupère l'archive, écrit le rapport JSON |
| `lib/backtest/*.test.ts` | Tests des modules purs |

---

## Task 1 : Bouton d'export des données

Livré en premier : il débloque Ethan immédiatement (il peut exporter pendant que le reste se construit) et lui donne la sauvegarde qui lui manque aujourd'hui.

**Files:**
- Modify: `app/diabete/parametres/page.tsx`

**Interfaces:**
- Consomme : rien des autres tâches.
- Produit : un fichier JSON `apex-coach-export-YYYY-MM-DD.json` dont la racine est `{ exportedAt: string, version: 3, state: <contenu de localStorage["apex-coach-storage"].state> }`. Task 5 lit exactement cette forme.

- [ ] **Step 1 : lire la page pour trouver un emplacement cohérent**

`app/diabete/parametres/page.tsx` contient déjà une section de bas de page avec « Réinitialiser mes ratios » et la suppression des hypos. Le bouton d'export va **au-dessus** de ces actions destructives : c'est une action sûre, elle ne doit pas être visuellement mêlée aux actions dangereuses.

- [ ] **Step 2 : ajouter le handler**

Le store Zustand persiste sous la clé `apex-coach-storage` sans `partialize` — tout l'état est donc dans `localStorage`. On l'exporte tel quel : c'est ce qui en fait une vraie sauvegarde.

```tsx
const handleExportData = () => {
  try {
    const raw = localStorage.getItem("apex-coach-storage");
    if (!raw) {
      alert("Aucune donnée à exporter sur cet appareil.");
      return;
    }
    const parsed = JSON.parse(raw) as { state?: unknown; version?: number };
    const payload = {
      exportedAt: new Date().toISOString(),
      version: parsed.version ?? 3,
      state: parsed.state ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apex-coach-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch {
    alert("Export impossible — les données locales sont illisibles.");
  }
};
```

- [ ] **Step 3 : ajouter le bouton**

Suivre le style des cartes existantes de la page (`surface-1`, `tap-scale`, icône lucide). Utiliser l'icône `Download` de `lucide-react` (vérifier qu'elle est bien importée dans le bloc d'import existant, l'ajouter sinon).

Le libellé et le sous-texte doivent dire à quoi ça sert :

- Titre : « Exporter mes données »
- Sous-texte : « Télécharge tout ton historique en un fichier : injections, glucides, hypos, séances, réglages. Ta seule sauvegarde — le stockage du navigateur peut être vidé. »

- [ ] **Step 4 : vérifier la compilation**

```bash
npx tsc --noEmit && npm run build
```

Attendu : aucune erreur.

- [ ] **Step 5 : commit**

```bash
git add app/diabete/parametres/page.tsx
git commit -m "feat(parametres): bouton d'export des données (sauvegarde + entrée du backtest)"
```

---

## Task 2 : Moteur de rejeu

**Files:**
- Create: `lib/backtest/types.ts`
- Create: `lib/backtest/replay.ts`
- Test: `lib/backtest/replay.test.ts`

**Interfaces:**
- Consomme : `predictGlucoseCurve`, `PredictionEvent` (`lib/glucose-prediction.ts`) ; `buildPredictionEvents`, `MealRatios` (`lib/prediction-inputs.ts`) ; `estimateNightDrift`, `estimateDawnCurve` (`lib/night-calibration.ts`) ; `findMostRecentExercise` (`lib/exercise-insulin-adjustment.ts`) ; `ArchivedPoint` (`lib/glucose-archive/store.ts`) ; `InsulinLog`, `CarbEntry` (`@/types`).
- Produit, consommé par Tasks 3, 4 et 5 :
  - `type ReplayContext`
  - `buildReplayContext(input: ReplayInput): ReplayContext`
  - `replayMoment(ctx: ReplayContext, t0: number): ReplayMoment | null`
  - `replayGrid(ctx: ReplayContext): ReplayMoment[]`
  - `findPointNear(points: ArchivedPoint[], targetMs: number): ArchivedPoint | null`
  - `PAIRING_TOLERANCE_MIN = 8`
  - `classifyContext(t0, insulinLogs): MomentContext`

- [ ] **Step 1 : écrire `lib/backtest/types.ts`**

```ts
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import type { InsulinLog, CarbEntry } from "@/types";
import type { MealRatios } from "@/lib/prediction-inputs";

/** Contexte physiologique d'un instant rejoué. Précédence : repas > nuit > jeûne. */
export type MomentContext = "post-meal" | "fasting" | "night";

/** Une paire (prédit, réel) à un horizon donné. */
export interface HorizonSample {
  /** Minutes après t0. */
  minute: number;
  predicted: number;
  actual: number;
}

export interface ReplayMoment {
  /** Instant rejoué (ms). */
  t0: number;
  context: MomentContext;
  /** Glycémie réelle à t0 (celle donnée en entrée au prédicteur). */
  glucoseAtT0: number;
  /** Paires appariées ; les horizons sans point capteur sont absents. */
  samples: HorizonSample[];
  /** Le prédicteur s'est lui-même déclaré peu fiable (repas très frais + IOB). */
  unreliableTooFresh: boolean;
}

/** Motifs pour lesquels un instant candidat a été écarté. */
export type SkipReason =
  | "no-glucose-at-t0"
  | "no-paired-horizon"
  | "before-basal-change";

export interface ReplayInput {
  points: ArchivedPoint[];
  insulinLogs: InsulinLog[];
  carbEntries: CarbEntry[];
  /** Séances, pour la modulation « sensibilité ↑ » post-exercice. */
  workouts?: { date: string; durationMin?: number }[];
  runningSessions?: { date: string; durationMin?: number }[];
  isf: number;
  ratios: MealRatios;
  /** Horodatage du changement de basale ; rien avant ne calibre après. */
  basalChangeMs: number | null;
  /** Pas de la grille (min). Défaut 15. */
  stepMinutes?: number;
  /** Horizon prédit (min). Défaut 240. */
  horizonMinutes?: number;
}
```

- [ ] **Step 2 : écrire le test d'appariement (échoue)**

```ts
// lib/backtest/replay.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { findPointNear, PAIRING_TOLERANCE_MIN } from "./replay";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";

const pt = (t: number, value: number): ArchivedPoint => ({
  t, value, trend: "Flat", isHigh: false, isLow: false,
});

test("appariement : 7 min d'écart est retenu, 9 min est écarté", () => {
  const base = Date.UTC(2026, 6, 10, 12, 0, 0);
  const points = [pt(base - 7 * 60_000, 120), pt(base + 40 * 60_000, 200)];

  const near = findPointNear(points, base);
  assert.equal(near?.value, 120, "un point à 7 min doit être apparié");

  const far = findPointNear([pt(base - 9 * 60_000, 120)], base);
  assert.equal(far, null, "un point à 9 min doit être écarté, pas interpolé");

  assert.equal(PAIRING_TOLERANCE_MIN, 8);
});
```

- [ ] **Step 3 : lancer le test pour le voir échouer**

```bash
npx tsx --test lib/backtest/replay.test.ts
```

Attendu : ÉCHEC — le module `./replay` n'existe pas.

- [ ] **Step 4 : écrire `findPointNear` et `classifyContext` dans `lib/backtest/replay.ts`**

```ts
export const PAIRING_TOLERANCE_MIN = 8;

/**
 * Point d'archive le plus proche de `targetMs`, dans la tolérance.
 * Renvoie null au-delà — on n'interpole JAMAIS une valeur capteur : un
 * backtest qui invente ses données mesure son inventeur.
 * `points` doit être trié par `t` croissant (garanti par buildReplayContext).
 */
export function findPointNear(
  points: ArchivedPoint[],
  targetMs: number,
): ArchivedPoint | null {
  if (points.length === 0) return null;
  const tolMs = PAIRING_TOLERANCE_MIN * 60_000;

  // Recherche dichotomique du premier point >= targetMs.
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < targetMs) lo = mid + 1;
    else hi = mid;
  }

  let best: ArchivedPoint | null = null;
  let bestDelta = Infinity;
  for (const idx of [lo - 1, lo]) {
    if (idx < 0 || idx >= points.length) continue;
    const delta = Math.abs(points[idx].t - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = points[idx];
    }
  }
  return best !== null && bestDelta <= tolMs ? best : null;
}

/** Fenêtre au-delà de laquelle un repas ne pèse plus (min). */
const POST_MEAL_WINDOW_MIN = 300;

/**
 * Précédence volontaire repas > nuit > jeûne : un dîner tardif à 00h30 est un
 * contexte post-repas, pas un contexte nocturne. Les mélanger noierait l'effet
 * de l'absorption dans les heures calmes.
 */
export function classifyContext(
  t0: number,
  insulinLogs: InsulinLog[],
): MomentContext {
  const windowMs = POST_MEAL_WINDOW_MIN * 60_000;
  const hasMeal = insulinLogs.some((l) => {
    const at = new Date(l.injectedAt).getTime();
    if (!Number.isFinite(at)) return false;
    const carbs = l.confirmedCarbsGrams ?? l.carbsGrams ?? 0;
    return carbs > 0 && at < t0 && t0 - at <= windowMs;
  });
  if (hasMeal) return "post-meal";
  const hour = new Date(t0).getHours();
  return hour >= 0 && hour < 6 ? "night" : "fasting";
}
```

Note pour l'implémenteur : vérifier le nom réel du champ de glucides confirmés dans `types/index.ts` (`resolveCarbs` dans `lib/insulin-log-values.ts` est la source de vérité — **réutiliser `resolveCarbs(log)` plutôt que réécrire la logique**).

- [ ] **Step 5 : relancer, voir passer**

```bash
npx tsx --test lib/backtest/replay.test.ts
```

Attendu : PASS.

- [ ] **Step 6 : écrire le test d'étanchéité temporelle (le test le plus important du plan)**

```ts
test("étanchéité : aucune donnée postérieure à t0 n'influence la prédiction", () => {
  const july = Date.UTC(2026, 6, 10, 12, 0, 0);
  const august = Date.UTC(2026, 7, 10, 12, 0, 0);

  // Archive : juillet plat à 120 ; août délibérément aberrant à 350.
  const points: ArchivedPoint[] = [];
  for (let i = -48; i <= 48; i++) points.push(pt(july + i * 15 * 60_000, 120));
  for (let i = 0; i < 400; i++) points.push(pt(august + i * 15 * 60_000, 350));

  const base = {
    points, carbEntries: [], isf: 100,
    ratios: { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 },
    basalChangeMs: null,
  };

  const withAugust = buildReplayContext({ ...base, insulinLogs: [] });
  const withoutAugust = buildReplayContext({
    ...base,
    points: points.filter((p) => p.t < august),
    insulinLogs: [],
  });

  const a = replayMoment(withAugust, july);
  const b = replayMoment(withoutAugust, july);

  assert.ok(a && b, "les deux rejeux doivent produire un instant");
  assert.deepEqual(
    a.samples.map((s) => s.predicted),
    b.samples.map((s) => s.predicted),
    "les données d'août ne doivent RIEN changer à une prédiction de juillet",
  );
});
```

- [ ] **Step 7 : lancer, voir échouer (fonctions absentes)**

```bash
npx tsx --test lib/backtest/replay.test.ts
```

Attendu : ÉCHEC — `buildReplayContext` / `replayMoment` non définis.

- [ ] **Step 8 : implémenter `buildReplayContext`**

Le contexte précalcule ce qui est coûteux : tri des points, et **une calibration par jour**, chacune ne voyant que les données antérieures à minuit ce jour-là.

```ts
interface DailyCalibration {
  driftPerHour: number;
  dawnCurve: Record<number, number>;
  sampleNights: number;
}

export interface ReplayContext {
  input: Required<Pick<ReplayInput, "stepMinutes" | "horizonMinutes">> & ReplayInput;
  /** Points triés par t croissant. */
  points: ArchivedPoint[];
  /** Clé "YYYY-MM-DD" (locale) → calibration bâtie sur les jours ANTÉRIEURS. */
  calibrationByDay: Map<string, DailyCalibration>;
  skipped: Record<SkipReason, number>;
}

function dayKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDayMs(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function buildReplayContext(input: ReplayInput): ReplayContext {
  const points = [...input.points].sort((a, b) => a.t - b.t);
  const stepMinutes = input.stepMinutes ?? 15;
  const horizonMinutes = input.horizonMinutes ?? 240;

  const calibrationByDay = new Map<string, DailyCalibration>();
  if (points.length > 0) {
    const firstDay = startOfDayMs(points[0].t);
    const lastDay = startOfDayMs(points[points.length - 1].t);
    const injections = input.insulinLogs.map((l) => ({
      injectedAt: new Date(l.injectedAt).toISOString(),
      units: l.units,
    }));

    for (let day = firstDay; day <= lastDay; day += 24 * 3600_000) {
      // Étanchéité : strictement AVANT minuit ce jour-là. Et jamais avant le
      // changement de basale, qui remet la calibration à zéro (la production
      // fait pareil — app/diabete/page.tsx, useMemo nightCalibration).
      const floor = input.basalChangeMs ?? -Infinity;
      const priorPoints = points.filter((p) => p.t < day && p.t >= floor);
      const priorInjections = injections.filter((i) => {
        const at = new Date(i.injectedAt).getTime();
        return at < day && at >= floor;
      });
      const drift = estimateNightDrift(priorPoints, priorInjections);
      const dawn = estimateDawnCurve(priorPoints);
      calibrationByDay.set(dayKey(day), {
        driftPerHour: drift.driftPerHour,
        dawnCurve: dawn.curve,
        sampleNights: drift.sampleNights,
      });
    }
  }

  return {
    input: { ...input, stepMinutes, horizonMinutes },
    points,
    calibrationByDay,
    skipped: {
      "no-glucose-at-t0": 0,
      "no-paired-horizon": 0,
      "before-basal-change": 0,
    },
  };
}
```

Attention performance : le `filter` par jour est O(jours × points) ≈ 91 × 8900 ≈ 810 k opérations — négligeable. Ne pas optimiser prématurément.

- [ ] **Step 9 : implémenter `replayMoment`**

```ts
/** Tendance Libre (chaîne archive) → flèche 1..5 attendue par le prédicteur. */
function trendArrowFromArchive(trend: string): number | undefined {
  switch (trend) {
    case "SingleDown": return 2;
    case "DoubleDown": return 1;
    case "Flat": return 3;
    case "SingleUp": return 4;
    case "DoubleUp": return 5;
    default: return undefined;
  }
}

export function replayMoment(ctx: ReplayContext, t0: number): ReplayMoment | null {
  const { input, points } = ctx;

  if (input.basalChangeMs !== null && t0 < input.basalChangeMs) {
    ctx.skipped["before-basal-change"]++;
    return null;
  }

  const at0 = findPointNear(points, t0);
  if (!at0) {
    ctx.skipped["no-glucose-at-t0"]++;
    return null;
  }

  // Événements actifs : pipeline de production, non réécrit.
  const events = buildPredictionEvents({
    insulinLogs: input.insulinLogs,
    carbEntries: input.carbEntries,
    isf: input.isf,
    ratios: input.ratios,
    nowMs: t0,
  });

  const cal = ctx.calibrationByDay.get(dayKey(t0));

  const prediction = predictGlucoseCurve({
    currentGlucose: at0.value,
    trendArrow: trendArrowFromArchive(at0.trend),
    events,
    isf: input.isf,
    basalDriftPerHour: cal?.driftPerHour ?? 0,
    dawnCurveByHour: cal?.dawnCurve,
    horizonMinutes: input.horizonMinutes,
    stepMinutes: 15,
    nowMs: t0,
  });

  const samples: HorizonSample[] = [];
  for (const p of prediction.curve) {
    if (p.minute === 0) continue; // t0 : trivialement exact, fausserait la moyenne
    const actual = findPointNear(points, p.at);
    if (!actual) continue;
    samples.push({ minute: p.minute, predicted: p.value, actual: actual.value });
  }

  if (samples.length === 0) {
    ctx.skipped["no-paired-horizon"]++;
    return null;
  }

  return {
    t0,
    context: classifyContext(t0, input.insulinLogs),
    glucoseAtT0: at0.value,
    samples,
    unreliableTooFresh: prediction.unreliableTooFresh,
  };
}
```

Note : `sport` n'est pas passé dans cette version. Motif à écrire en commentaire dans le code : reconstruire l'état sportif demande `findMostRecentExercise` sur des séances dont seule la date (sans heure fiable) est enregistrée pour une partie de l'historique ; l'inclure introduirait un bruit non mesurable. Le rapport doit signaler cette différence avec la production.

- [ ] **Step 10 : relancer les tests**

```bash
npx tsx --test lib/backtest/replay.test.ts
```

Attendu : les deux tests passent.

- [ ] **Step 11 : ajouter `replayGrid` et son test**

```ts
export function replayGrid(ctx: ReplayContext): ReplayMoment[] {
  const { points, input } = ctx;
  if (points.length === 0) return [];
  const stepMs = input.stepMinutes * 60_000;
  const horizonMs = input.horizonMinutes * 60_000;
  const first = points[0].t;
  const last = points[points.length - 1].t;

  const out: ReplayMoment[] = [];
  // On s'arrête un horizon avant la fin : au-delà, aucun réel à comparer.
  for (let t0 = first; t0 <= last - horizonMs; t0 += stepMs) {
    const m = replayMoment(ctx, t0);
    if (m) out.push(m);
  }
  return out;
}
```

```ts
test("la grille s'arrête un horizon avant la fin de l'archive", () => {
  const base = Date.UTC(2026, 6, 10, 0, 0, 0);
  const points: ArchivedPoint[] = [];
  for (let i = 0; i < 96; i++) points.push(pt(base + i * 15 * 60_000, 120));

  const ctx = buildReplayContext({
    points, insulinLogs: [], carbEntries: [], isf: 100,
    ratios: { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 },
    basalChangeMs: null, horizonMinutes: 240,
  });
  const grid = replayGrid(ctx);

  const last = points[points.length - 1].t;
  assert.ok(grid.length > 0, "la grille ne doit pas être vide");
  for (const m of grid) {
    assert.ok(
      m.t0 <= last - 240 * 60_000,
      `t0 ${new Date(m.t0).toISOString()} n'a pas 4h de réel devant lui`,
    );
  }
});
```

- [ ] **Step 12 : vérifier et commiter**

```bash
npx tsc --noEmit && npm test
git add lib/backtest/types.ts lib/backtest/replay.ts lib/backtest/replay.test.ts
git commit -m "feat(backtest): moteur de rejeu avec calibration roulante et étanchéité temporelle"
```

---

## Task 3 : Métriques de courbe et diagnostic d'absorption

**Files:**
- Create: `lib/backtest/metrics.ts`
- Test: `lib/backtest/metrics.test.ts`

**Interfaces:**
- Consomme : `ReplayMoment`, `MomentContext`, `HorizonSample` (Task 2, `lib/backtest/types.ts`) ; `ReplayContext`, `replayMoment`, `findPointNear` (Task 2) ; `resolveCarbs` (`lib/insulin-log-values.ts`).
- Produit, consommé par Task 5 :
  - `computeCurveError(moments: ReplayMoment[]): CurveErrorReport`
  - `analyzeAbsorption(ctx: ReplayContext): AbsorptionReport`
  - `MIN_MOMENTS = 20`, `MIN_MEALS = 8`

- [ ] **Step 1 : écrire le test des seuils d'honnêteté (échoue)**

```ts
// lib/backtest/metrics.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { computeCurveError, MIN_MOMENTS } from "./metrics";
import type { ReplayMoment } from "./types";

const moment = (t0: number, predicted: number, actual: number): ReplayMoment => ({
  t0, context: "fasting", glucoseAtT0: 120,
  samples: [{ minute: 60, predicted, actual }],
  unreliableTooFresh: false,
});

test("seuil d'honnêteté : 19 instants ne concluent pas, 20 concluent", () => {
  const make = (n: number) =>
    Array.from({ length: n }, (_, i) => moment(i * 60_000, 150, 120));

  const thin = computeCurveError(make(19));
  const thick = computeCurveError(make(20));

  assert.equal(MIN_MOMENTS, 20);
  assert.equal(thin.overall.inconclusive, true, "19 instants : non concluant");
  assert.equal(thin.overall.count, 19, "l'effectif reste affiché");
  assert.equal(thin.overall.meanAbsError, null, "aucune valeur sur trop peu");

  assert.equal(thick.overall.inconclusive, false);
  assert.equal(thick.overall.meanAbsError, 30);
});

test("le biais signé est distinct de l'erreur absolue", () => {
  // Moitié +30, moitié -30 : erreur absolue 30, biais 0.
  const mixed = [
    ...Array.from({ length: 10 }, (_, i) => moment(i * 60_000, 150, 120)),
    ...Array.from({ length: 10 }, (_, i) => moment((i + 10) * 60_000, 90, 120)),
  ];
  const r = computeCurveError(mixed);
  assert.equal(r.overall.meanAbsError, 30);
  assert.equal(r.overall.meanSignedError, 0, "un biais nul ne doit pas être confondu avec une erreur nulle");
});
```

- [ ] **Step 2 : lancer, voir échouer**

```bash
npx tsx --test lib/backtest/metrics.test.ts
```

Attendu : ÉCHEC — module absent.

- [ ] **Step 3 : implémenter `computeCurveError`**

```ts
export const MIN_MOMENTS = 20;

export interface ErrorStats {
  count: number;
  /** null quand inconclusive : on n'affiche jamais un chiffre calculé sur rien. */
  meanAbsError: number | null;
  medianAbsError: number | null;
  p90AbsError: number | null;
  /** Signé : positif = le modèle prédit trop haut. */
  meanSignedError: number | null;
  inconclusive: boolean;
}

export interface CurveErrorReport {
  overall: ErrorStats;
  byHorizon: Record<number, ErrorStats>;      // 30, 60, 120, 240
  byContext: Record<MomentContext, ErrorStats>;
  /** Semaine ISO "YYYY-Www" → stats. Rend visible la montée en calibration. */
  byWeek: Record<string, ErrorStats>;
}

const HORIZONS = [30, 60, 120, 240];

function stats(errors: number[]): ErrorStats {
  const count = errors.length;
  if (count < MIN_MOMENTS) {
    return {
      count, meanAbsError: null, medianAbsError: null,
      p90AbsError: null, meanSignedError: null, inconclusive: true,
    };
  }
  const abs = errors.map(Math.abs).sort((a, b) => a - b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const quantile = (sorted: number[], q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    count,
    meanAbsError: round1(mean(abs)),
    medianAbsError: round1(quantile(abs, 0.5)),
    p90AbsError: round1(quantile(abs, 0.9)),
    meanSignedError: round1(mean(errors)),
    inconclusive: false,
  };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
```

L'agrégation parcourt les moments et pousse `s.predicted - s.actual` dans les seaux : global, par horizon (uniquement les minutes de `HORIZONS`), par contexte, par semaine (`isoWeekKey(t0)`). Écrire `isoWeekKey` dans ce fichier : année + numéro de semaine ISO, format `2026-W28`.

- [ ] **Step 4 : relancer, voir passer**

```bash
npx tsx --test lib/backtest/metrics.test.ts
```

- [ ] **Step 5 : écrire le test du diagnostic d'absorption**

```ts
test("absorption : sans assez de repas, on ne conclut pas", () => {
  const ctx = buildReplayContext({
    points: [], insulinLogs: [], carbEntries: [], isf: 100,
    ratios: { morning: 6.67, lunch: 10, snack: 8.33, dinner: 10 },
    basalChangeMs: null,
  });
  const r = analyzeAbsorption(ctx);
  assert.equal(r.inconclusive, true);
  assert.equal(r.mealCount, 0);
  assert.equal(r.riseRatio, null, "aucun ratio d'amplitude sans repas");
});
```

- [ ] **Step 6 : implémenter `analyzeAbsorption`**

Pour chaque `InsulinLog` avec `resolveCarbs(log) > 0`, rejoué **à l'horodatage exact de l'injection** (pas sur la grille) :

```ts
export const MIN_MEALS = 8;

export interface AbsorptionReport {
  mealCount: number;
  inconclusive: boolean;
  /**
   * Montée réelle / montée prédite sur 4 h. > 1 = le modèle sous-estime la
   * montée (MG_PER_GRAM_CARB trop bas) ; < 1 = il la surestime.
   */
  riseRatio: number | null;
  /** Minute du pic réel moins minute du pic prédit. > 0 = le vrai pic arrive plus tard que prévu (CARB_PEAK_MIN trop bas). */
  peakDelayMin: number | null;
  /** Erreur signée résiduelle à T+3h et T+4h : diagnostique la queue (durée, FPU). */
  tailErrorAt180: number | null;
  tailErrorAt240: number | null;
}
```

Pour chaque repas retenu : `rise_predicted = max(predicted) - glucoseAtT0`, `rise_actual = max(actual) - glucoseAtT0`. Écarter le repas si `rise_predicted <= 5` (division instable) et compter l'exclusion. `riseRatio` = médiane des `rise_actual / rise_predicted` (médiane et non moyenne : un seul repas aberrant ne doit pas emporter la conclusion).

- [ ] **Step 7 : vérifier et commiter**

```bash
npx tsc --noEmit && npm test
git add lib/backtest/metrics.ts lib/backtest/metrics.test.ts
git commit -m "feat(backtest): métriques d'erreur de courbe et diagnostic d'absorption"
```

---

## Task 4 : Audit du plafond

**Files:**
- Create: `lib/backtest/cap-audit.ts`
- Test: `lib/backtest/cap-audit.test.ts`

**Interfaces:**
- Consomme : `capDoseByPrediction`, `DoseCappingContext` (`lib/dose-capping.ts`) ; `ReplayContext`, `findPointNear` (Task 2) ; `resolveCarbs` (`lib/insulin-log-values.ts`).
- Produit, consommé par Task 5 : `auditCapping(ctx: ReplayContext): CapAuditReport`, `MIN_INJECTIONS = 10`.

- [ ] **Step 1 : écrire le test du classement des quatre cas**

```ts
// lib/backtest/cap-audit.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome } from "./cap-audit";

test("les quatre cas de l'audit sont distingués", () => {
  assert.equal(classifyOutcome(true, true), "justified");
  assert.equal(classifyOutcome(true, false), "false-alarm");
  assert.equal(classifyOutcome(false, true), "missed-hypo");
  assert.equal(classifyOutcome(false, false), "normal");
});
```

- [ ] **Step 2 : lancer, voir échouer, puis implémenter**

```ts
export type CapOutcome = "justified" | "false-alarm" | "missed-hypo" | "normal";

/**
 * @param wouldCap    le plafond aurait raboté la dose à cet instant
 * @param hypoHappened la glycémie est réellement descendue sous 70 dans les 5 h
 */
export function classifyOutcome(wouldCap: boolean, hypoHappened: boolean): CapOutcome {
  if (wouldCap) return hypoHappened ? "justified" : "false-alarm";
  return hypoHappened ? "missed-hypo" : "normal";
}
```

- [ ] **Step 3 : implémenter `auditCapping`**

Pour chaque `InsulinLog` avec `resolveCarbs(log) > 0` et `units > 0` :

1. `t0 = injectedAt`. Glycémie à `t0` via `findPointNear` ; sans point, l'injection est écartée et comptée.
2. Reconstruire le `DoseCappingContext` : `currentGlucose` du capteur, `glucoseAgeMin` réel, `insulinLogs` et `carbEntries` **filtrés à `< t0`** (étanchéité), `pendingMeal: { carbsGrams: resolveCarbs(log), gramsPerU: ratio du créneau }`, `isf`, `ratios`, `carbBolusUnits: resolveCarbs(log) / gramsPerU`, `nowMs: t0`.
3. `capDoseByPrediction(log.units, context)` — la dose candidate est **la dose réellement injectée ce jour-là**, puisque c'est celle que le plafond aurait vue.
4. `wouldCap = result.capped`.
5. `hypoHappened` : un point d'archive sous **70** entre `t0` et `t0 + 5 h`.
6. `classifyOutcome`.

Sortie :

```ts
export interface CapAuditReport {
  injectionCount: number;
  skippedNoGlucose: number;
  inconclusive: boolean;      // injectionCount < MIN_INJECTIONS
  counts: Record<CapOutcome, number>;
  /** false-alarm / (false-alarm + justified) — taux de fausses alertes. */
  falseAlarmRate: number | null;
  /** missed-hypo / (missed-hypo + justified) — hypos non anticipées. */
  missRate: number | null;
  /** Unités totales que le plafond aurait retirées sur des fausses alertes. */
  unitsWronglyRemoved: number;
}
```

- [ ] **Step 4 : test de l'étanchéité de l'audit**

Un test qui vérifie qu'une injection postérieure à `t0` **ne figure pas** dans les `insulinLogs` passés à `capDoseByPrediction` : construire deux jeux identiques sauf une injection de 10 U placée 30 min APRÈS `t0`, et assert que le verdict est identique.

- [ ] **Step 5 : vérifier et commiter**

```bash
npx tsc --noEmit && npm test
git add lib/backtest/cap-audit.ts lib/backtest/cap-audit.test.ts
git commit -m "feat(backtest): audit du plafond — fausses alertes et hypos manquées"
```

---

## Task 5 : Runner local et rapport

**Files:**
- Create: `scripts/backtest.ts`

**Interfaces:**
- Consomme : tout des Tasks 2, 3, 4. Lit le fichier produit par Task 1.
- Produit : `backtest-report.json` dans le dossier de sortie choisi + un résumé lisible sur la sortie standard.

- [ ] **Step 1 : écrire le script**

Usage :

```bash
npx tsx scripts/backtest.ts [chemin/vers/export.json]
```

Sans argument : **mode dégradé**, archive seule.

Étapes du script :

1. Récupérer l'archive : `GET https://apex-coach-dusky.vercel.app/api/glucose/archive?days=90`, réponse `{ points: ArchivedPoint[], meta: {...} }`. Échec réseau → message clair, sortie code 1.
2. Si un export est fourni : lire `state.insulinLogs`, `state.carbEntries`, `state.userProfile.basalDoseChangedAt`, `state.diabetesConfig` (pour `insulinSensitivityFactor` et `ratios`). Chaque champ absent → valeur vide et **mention explicite dans le rapport**, jamais un défaut silencieux.
3. `buildReplayContext` → `replayGrid` → `computeCurveError`.
4. Si injections présentes : `analyzeAbsorption` et `auditCapping`. Sinon, marquer ces sections `unavailable: "aucune injection dans l'export"`.
5. Écrire `backtest-report.json` et afficher un résumé.

- [ ] **Step 2 : en-tête de provenance obligatoire dans le rapport**

Le rapport porte toujours en tête :

```ts
{
  generatedAt: string,
  archive: { pointCount: number, from: string, to: string, daysCovered: number },
  injections: { count: number, from: string | null, to: string | null },
  carbEntries: { count: number },
  basalChangeAt: string | null,
  method: {
    stepMinutes: 15,
    horizonMinutes: 240,
    pairingToleranceMin: 8,
    calibration: "recalculée une fois par jour, sur les seules données antérieures",
    sportModelled: false,
  },
  skipped: Record<SkipReason, number>,
}
```

Sans cet en-tête, aucun chiffre du rapport n'est interprétable.

- [ ] **Step 3 : vérifier**

```bash
npx tsc --noEmit
npx tsx scripts/backtest.ts
```

Attendu : le mode dégradé tourne de bout en bout sur l'archive réelle et produit un rapport dont les sections 2 et 3 sont marquées indisponibles.

- [ ] **Step 4 : commit**

```bash
git add scripts/backtest.ts
git commit -m "feat(backtest): runner local avec mode dégradé et en-tête de provenance"
```

---

## Auto-revue du plan

**Couverture de la spec** — Section 1 → Task 3 (`computeCurveError`). Section 2 → Task 3 (`analyzeAbsorption`). Section 3 → Task 4. Calibration roulante → Task 2 Step 8. Barrière basale → Task 2 Steps 8 et 9. Export → Task 1. Mode dégradé → Task 5 Step 1. Garde-fous d'honnêteté → Tasks 3 et 4 (constantes `MIN_MOMENTS`, `MIN_MEALS`, `MIN_INJECTIONS`) et Task 5 Step 2 (`skipped`). Tests exigés par la spec → Task 2 Steps 2 et 6, Task 3 Step 1, Task 4 Steps 1 et 4.

**Écart assumé avec la spec** : la spec évoquait `learnedBias` et le sport parmi les entrées reconstruites. Le plan ne les modélise pas — le biais de réveil dépend de `nightPredictionLogs` dont la disponibilité dans l'export n'est pas garantie, et l'heure des séances n'est pas fiable sur tout l'historique. Les deux sont déclarés dans l'en-tête de provenance (`sportModelled: false`) plutôt que silencieusement omis. Le rapport doit dire que le modèle rejoué est très légèrement plus pauvre que celui de production.

**Cohérence des types** — `ReplayMoment`, `HorizonSample`, `MomentContext`, `SkipReason` définis en Task 2 et consommés sous ces noms exacts en Tasks 3, 4, 5. `ReplayContext` produit en Task 2, consommé en Tasks 3, 4, 5. `resolveCarbs` réutilisé partout, jamais réimplémenté.

**Le livrable visuel** (rapport publié) n'est pas une tâche : il se construit à partir de `backtest-report.json` une fois les vrais chiffres connus, et sa forme dépend de ce qu'ils montrent.
