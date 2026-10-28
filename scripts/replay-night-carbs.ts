/**
 * Rejeu des dîners passés : la prédiction de nuit « avant » (sans glucides
 * observés) contre « après » (bilan de masse + facteur appris hors de la
 * nuit rejouée), à T+2h30, comparées à la montée réelle sur 5 h.
 *
 * Calibration en leave-one-out (PAS walk-forward) : le facteur appris et la
 * dérive/aube excluent la nuit rejouée mais peuvent utiliser des nuits
 * postérieures. `reel` = max de la glycémie sur les 5 h après T+150.
 *
 * Hors CI, non importé par l'app. Données de santé : lues par chemin, jamais
 * copiées dans le dépôt.
 *
 *   npx tsx scripts/replay-night-carbs.ts --archive <arch.json> --backup <bk.json>
 *
 * Réutilise les modules de l'app (aucun modèle recodé ici). Les heures locales
 * viennent du fuseau de la machine (celui des données).
 */
import { readFileSync } from "node:fs";
import { computeNightPlan, type NightBrainInput } from "../lib/night-brain";
import { computeBedtimeAdvice } from "../lib/bedtime-advisor";
import { buildPredictionEvents, ratioForMeal, withMealBolusTail, withObservedCarbs } from "../lib/prediction-inputs";
import { buildObservedCarbsInput, observedCarbsRemaining } from "../lib/observed-carbs";
import {
  estimateDawnCurve,
  estimateLateCarbFactor,
  estimateNightDrift,
  iobRemainingFraction,
  LATE_CARB_DEFAULT,
  type LateCarbMeal,
  type NightInjection,
} from "../lib/night-calibration";
import { carbSensitivity } from "../lib/glucose-prediction";
import { isLearnable, resolveCarbs, resolveFat } from "../lib/insulin-log-values";
import { nightKeyFor, filterExcludedNightPoints } from "../lib/night-review";
import { NIGHT_FLOOR } from "../lib/bedtime-dose";
import type { ArchivedPoint } from "../lib/glucose-archive/store";
import type { CarbEntry, InsulinLog } from "../types";

const MIN = 60_000;

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0 || !process.argv[i + 1]) {
    console.error("Usage : replay-night-carbs.ts --archive <json> --backup <json>");
    process.exit(1);
  }
  return process.argv[i + 1];
}

const archive = JSON.parse(readFileSync(arg("archive"), "utf8")) as { points: ArchivedPoint[] };
const backup = JSON.parse(readFileSync(arg("backup"), "utf8")) as {
  state: {
    insulinLogs: InsulinLog[];
    carbEntries: CarbEntry[];
    diabetesConfig: {
      insulinSensitivityFactor: number;
      ratios: { morning: number; lunch: number; snack: number; dinner: number };
      insulinActiveDuration: number;
      targetGlucose: number;
    };
  };
};

const points = [...archive.points].sort((a, b) => a.t - b.t);
const { insulinLogs, carbEntries, diabetesConfig: cfg } = backup.state;
const isf = cfg.insulinSensitivityFactor;
const injections: NightInjection[] = insulinLogs
  .filter((l) => l.units > 0)
  .map((l) => ({ injectedAt: new Date(l.injectedAt).toISOString(), units: l.units }));
const lateMeals: LateCarbMeal[] = insulinLogs
  .filter((l) => l.mealType !== "correction" && !l.isSplitDose)
  .map((l) => ({
    injectedAt: new Date(l.injectedAt).toISOString(),
    carbsGrams: resolveCarbs(l),
    carbSensitivity: carbSensitivity(isf, ratioForMeal(cfg.ratios, l.mealType)),
    sampleable: isLearnable(l),
  }));

function nearest(targetMs: number, tolMin: number): ArchivedPoint | null {
  let best: ArchivedPoint | null = null;
  let bd = Infinity;
  for (const p of points) {
    const d = Math.abs(p.t - targetMs);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best && bd <= tolMin * MIN ? best : null;
}

interface Row {
  date: string;
  injectedAt: string;
  carbs: number;
  units: number;
  bg: number;
  oldPeak: number;
  newPeak: number;
  realPeak: number;
  dose: number | null;
  minWithDose: number | null;
  observedG: number | null;
  factor: number;
  isDefaultFactor: boolean;
}

const dinners = insulinLogs
  .filter((l) => l.mealType === "dinner" && !l.isSplitDose && resolveCarbs(l) >= 80)
  .sort((a, b) => new Date(a.injectedAt).getTime() - new Date(b.injectedAt).getTime());

const rows: Row[] = [];
let skipped = 0;

for (const log of dinners) {
  const t0 = new Date(log.injectedAt).getTime();
  const nowMs = t0 + 150 * MIN;
  const reading = nearest(nowMs, 10);
  // Montée réelle : il faut la lecture ET des points sur les 5 h suivantes.
  const future = points.filter((p) => p.t > nowMs && p.t <= nowMs + 300 * MIN);
  if (!reading || future.length < 15) {
    skipped++;
    continue;
  }
  const realPeak = Math.max(...future.map((p) => p.value));

  // Calibration hors de la nuit rejouée (leave-one-out).
  const excluded = new Set([nightKeyFor(t0)]);
  const calPts = filterExcludedNightPoints(points, excluded);
  const drift = estimateNightDrift(calPts, injections);
  const dawn = estimateDawnCurve(calPts);
  const lateCarb = estimateLateCarbFactor(calPts, lateMeals, injections, isf, excluded, carbEntries ?? []);

  const baseEvents = buildPredictionEvents({
    insulinLogs,
    carbEntries,
    isf,
    ratios: cfg.ratios,
    nowMs,
  });
  const live = { value: reading.value, date: new Date(nowMs).toISOString() };
  const obsBuilt = buildObservedCarbsInput({
    insulinLogs,
    carbEntries,
    history: [],
    archive: points,
    live,
    nowMs,
    isf,
    ratios: cfg.ratios,
    dia: cfg.insulinActiveDuration,
  });
  const obs = obsBuilt ? observedCarbsRemaining(obsBuilt.input) : null;
  const newEvents =
    obsBuilt && obs
      ? withObservedCarbs(baseEvents, obsBuilt.sourceId, obs.remainingG, lateCarb.mgPerGram)
      : baseEvents;

  const iobInjections = insulinLogs
    .map((l) => ({ units: l.units, minutesAgo: (nowMs - new Date(l.injectedAt).getTime()) / MIN }))
    .filter((i) => i.units > 0 && i.minutesAgo >= 0 && i.minutesAgo < cfg.insulinActiveDuration);
  const iobUnits = iobInjections.reduce(
    (s, i) => s + i.units * iobRemainingFraction(i.minutesAgo, cfg.insulinActiveDuration, 75),
    0,
  );
  const fat = resolveFat(log);

  const mk = (events: typeof baseEvents, observed: boolean): NightBrainInput => ({
    currentGlucose: reading.value,
    trendArrow: 3,
    iobUnits,
    iobInjections,
    nightDriftPerHour: drift.sampleNights >= 4 ? drift.driftPerHour : undefined,
    dawnCurveByHour:
      dawn.sampleDays >= 4 && Object.keys(dawn.curve).length > 0 ? dawn.curve : undefined,
    wakeupBias: 0, // état post-déploiement : seuls les logs v2 comptent, le biais repart à 0
    isfMgPerU: isf,
    mgPerGramCarb: cfg.ratios.dinner > 0 ? isf / cfg.ratios.dinner : undefined,
    insulinActiveMinutes: cfg.insulinActiveDuration,
    targetGlucose: cfg.targetGlucose,
    hoursUntilWakeup: 7,
    lastMealHoursAgo: 2.5,
    lastMealFpu: fat, // approximation : le plan ne s'en sert qu'en mode legacy
    lastMealCarbs: resolveCarbs(log),
    events,
    observedCarbs:
      observed && obsBuilt && obs
        ? { remainingG: obs.remainingG, enteredG: obsBuilt.enteredG, uncertain: obsBuilt.uncertain }
        : undefined,
    glucoseAgeMin: 0,
    nowMs,
  });

  // Pic prédit sur les 5 h suivantes (même fenêtre que la montée réelle).
  const peak5h = (input: NightBrainInput): number => {
    const c = computeBedtimeAdvice(input).curve ?? [];
    return Math.max(...c.filter((p) => p.minute > 0 && p.minute <= 300).map((p) => p.value));
  };
  const oldInput = mk(baseEvents, false);
  const newInput = mk(newEvents, true);
  const oldPeak = peak5h(oldInput);
  const newPeak = peak5h(newInput);

  // Dose proposée par le plan (version « nouvelle ») et point bas avec elle,
  // sur la courbe « sécurité » du plan (queue d'IOB du bolus du repas).
  const plan = computeNightPlan(newInput);
  const act = plan.steps.find((s) => s.action?.kind === "log-correction")?.action;
  const dose = act ? act.quantity : null;
  let minWithDose: number | null = null;
  if (dose && dose > 0) {
    const c =
      computeBedtimeAdvice({
        ...newInput,
        events: [...withMealBolusTail(newEvents), { units: dose, minutesAgo: 0 }],
      }).curve ?? [];
    minWithDose = Math.min(...c.filter((p) => p.minute > 0 && p.minute <= 7 * 60).map((p) => p.value));
  }

  rows.push({
    date: new Date(t0).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
    injectedAt: new Date(t0).toISOString(),
    carbs: resolveCarbs(log),
    units: log.units,
    bg: reading.value,
    oldPeak,
    newPeak,
    realPeak,
    dose,
    minWithDose,
    observedG: obs ? obs.remainingG : null,
    factor: lateCarb.mgPerGram,
    isDefaultFactor: lateCarb.isDefault,
  });
}

const r = (n: number | null) => (n == null ? "-" : String(Math.round(n)));
const pad = (s: string, n: number) => s.padStart(n);
console.log(
  [
    "date ", "g glu", "U rep", "BG150", "ancien", "nouveau", "reel", "restG", "facteur", "dose", "min/dose",
  ]
    .map((h, i) => pad(h, [6, 6, 6, 6, 7, 8, 5, 6, 9, 5, 9][i]))
    .join(" "),
);
for (const x of rows) {
  console.log(
    [
      x.date, r(x.carbs), r(x.units), r(x.bg), r(x.oldPeak), r(x.newPeak), r(x.realPeak),
      x.observedG == null ? "-" : x.observedG.toFixed(0),
      x.factor.toFixed(2) + (x.isDefaultFactor ? "*" : " "),
      x.dose == null ? "-" : String(x.dose),
      r(x.minWithDose),
    ]
      .map((c, i) => pad(c, [6, 6, 6, 6, 7, 8, 5, 6, 9, 5, 9][i]))
      .join(" "),
  );
}
console.log(`(* = facteur par defaut ${LATE_CARB_DEFAULT}, moins de 5 nuits utilisables)`);

const mae = (f: (x: Row) => number) =>
  rows.reduce((s, x) => s + Math.abs(f(x) - x.realPeak), 0) / (rows.length || 1);
const unsafe = rows.filter((x) => x.minWithDose != null && x.minWithDose < NIGHT_FLOOR).length;
console.log("");
console.log(`Diners rejoues : ${rows.length} (ignores faute de donnees : ${skipped})`);
console.log(
  `Erreur absolue moyenne sur le pic : ancien ${mae((x) => x.oldPeak).toFixed(1)} mg/dL, nouveau ${mae((x) => x.newPeak).toFixed(1)} mg/dL`,
);
console.log(`Doses dont le min predit < ${NIGHT_FLOOR} : ${unsafe}`);
const oct27 = rows.find((x) => x.injectedAt.startsWith("2026-10-27T10:54:31"));
console.log(
  oct27
    ? `Ligne 27/10 : ${oct27.carbs} g, ${oct27.units} U, BG@T+150 ${r(oct27.bg)}, pic ancien ${r(oct27.oldPeak)}, nouveau ${r(oct27.newPeak)}, reel ${r(oct27.realPeak)}, restant observe ${r(oct27.observedG)} g, dose ${oct27.dose ?? "aucune"}, min avec dose ${r(oct27.minWithDose)}`
    : "Ligne 27/10 : introuvable (diner non rejoue)",
);
const diff = rows.filter((x) => Math.abs(x.newPeak - x.oldPeak) > 0.5);
const maeOn = (rs: Row[], f: (x: Row) => number) =>
  rs.reduce((s, x) => s + Math.abs(f(x) - x.realPeak), 0) / (rs.length || 1);
console.log(
  `Lignes ou ancien et nouveau different : ${diff.length} sur ${rows.length} ; erreur moyenne sur ces lignes : ancien ${maeOn(diff, (x) => x.oldPeak).toFixed(1)}, nouveau ${maeOn(diff, (x) => x.newPeak).toFixed(1)}`,
);
console.log(
  `Facteur appris : ${rows.filter((x) => !x.isDefaultFactor).length} lignes ; defaut ${LATE_CARB_DEFAULT} : ${rows.filter((x) => x.isDefaultFactor).length} lignes`,
);
console.log("biais de réveil = 0 (état post-déploiement)");
