/**
 * Tests unitaires — primitives de prédiction glycémique (Étape 5a).
 * Runner natif : `node --test` (Node 24, TS strip natif, zéro dépendance).
 *
 * ISF de test = 100 mg/dL/U (vraie valeur Ethan), DIA=195, peak=75.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  iobGlucoseDrop,
  activeIOB,
  carbGlucoseRise,
  fpuGlucoseRise,
  mealGlucoseRise,
  basalGlucoseEffect,
  assessBasalTitration,
  BASAL_EFFECT_CAP_MGDL,
  DEFAULT_DIA_MIN,
  carbSensitivity,
  predictGlucoseCurve,
  buildPredictionAdvice,
} from "./glucose-prediction";

// Midi (12:00 local) → l'horizon 8h reste hors fenêtre dawn (4h-8h).
const NOON = new Date("2026-06-20T12:00:00").getTime();
// 04:00 local → l'horizon traverse le dawn.
const PRE_DAWN = new Date("2026-06-20T04:00:00").getTime();
import { iobRemainingFraction } from "./night-calibration";

const ISF = 100;

// ───────────────────────────────────────────────────────────────────────
// IOB → baisse glycémique
// ───────────────────────────────────────────────────────────────────────

test("iobGlucoseDrop: horizon nul ou négatif → 0", () => {
  const b = [{ units: 5, minutesAgo: 0 }];
  assert.equal(iobGlucoseDrop(b, 0, ISF), 0);
  assert.equal(iobGlucoseDrop(b, -30, ISF), 0);
});

test("iobGlucoseDrop: bolus 5U à t=0, drop sur tout le DIA = units×ISF", () => {
  // À t=0 fraction=1, à t=DIA fraction=0 → toute l'insuline est consommée.
  const drop = iobGlucoseDrop([{ units: 5, minutesAgo: 0 }], DEFAULT_DIA_MIN, ISF);
  assert.ok(Math.abs(drop - 5 * ISF) < 1, `attendu ~500, obtenu ${drop}`);
});

test("iobGlucoseDrop: monotone croissant avec l'horizon", () => {
  const b = [{ units: 5, minutesAgo: 0 }];
  const d60 = iobGlucoseDrop(b, 60, ISF);
  const d120 = iobGlucoseDrop(b, 120, ISF);
  const d195 = iobGlucoseDrop(b, 195, ISF);
  assert.ok(d60 < d120 && d120 < d195, `${d60} < ${d120} < ${d195}`);
  assert.ok(d60 > 0);
});

test("iobGlucoseDrop: deux bolus chevauchants = somme additive", () => {
  const a = iobGlucoseDrop([{ units: 3, minutesAgo: 30 }], 60, ISF);
  const b = iobGlucoseDrop([{ units: 2, minutesAgo: 90 }], 60, ISF);
  const both = iobGlucoseDrop(
    [
      { units: 3, minutesAgo: 30 },
      { units: 2, minutesAgo: 90 },
    ],
    60,
    ISF,
  );
  assert.ok(Math.abs(both - (a + b)) < 1e-6, `${both} vs ${a + b}`);
});

test("iobGlucoseDrop: bolus déjà épuisé (minutesAgo ≥ DIA) → 0", () => {
  const drop = iobGlucoseDrop([{ units: 5, minutesAgo: 200 }], 60, ISF);
  assert.equal(drop, 0);
});

test("activeIOB: t=0 → dose entière ; t≥DIA → 0 ; au pic, fraction < 1", () => {
  assert.equal(activeIOB([{ units: 5, minutesAgo: 0 }]), 5);
  assert.equal(activeIOB([{ units: 5, minutesAgo: 195 }]), 0);
  const atPeak = activeIOB([{ units: 5, minutesAgo: 75 }]);
  assert.ok(atPeak > 0 && atPeak < 5, `IOB au pic = ${atPeak}`);
  // Cohérence directe avec la primitive réutilisée.
  assert.ok(Math.abs(atPeak - 5 * iobRemainingFraction(75)) < 1e-9);
});

// ───────────────────────────────────────────────────────────────────────
// Glucides → montée glycémique
// ───────────────────────────────────────────────────────────────────────

test("carbGlucoseRise: repas entièrement absorbé (au-delà de la fenêtre) → 0", () => {
  assert.equal(carbGlucoseRise(60, 200, 120), 0); // 200min > 3h
});

test("carbGlucoseRise: pas de glucides ou horizon nul → 0", () => {
  assert.equal(carbGlucoseRise(0, 0, 120), 0);
  assert.equal(carbGlucoseRise(60, 0, 0), 0);
});

test("carbGlucoseRise: repas à t=0, montée totale ≈ carbs×mgPerGram sur toute l'absorption", () => {
  // 60g, 3.5 mg/dL/g → ~210 mg/dL absorbés une fois la digestion finie.
  const total = carbGlucoseRise(60, 0, 300); // horizon > durée d'absorption
  assert.ok(Math.abs(total - 60 * 3.5) < 1, `attendu ~210, obtenu ${total}`);
});

test("carbGlucoseRise: monotone croissant avec l'horizon", () => {
  const r30 = carbGlucoseRise(60, 0, 30);
  const r90 = carbGlucoseRise(60, 0, 90);
  assert.ok(r30 < r90 && r30 > 0);
});

// ───────────────────────────────────────────────────────────────────────
// FPU → montée glycémique
// ───────────────────────────────────────────────────────────────────────

test("fpuGlucoseRise: sous 1 FPU → 0 (négligeable, cohérent calculateur dose)", () => {
  // 5g lip + 5g prot = (45+20)/100 = 0.65 FPU < 1
  assert.equal(fpuGlucoseRise(5, 5, 0, 120), 0);
});

test("fpuGlucoseRise: repas riche, montée totale = FPU×6×mgPerGram sur la fenêtre", () => {
  // 30g lip + 40g prot = (270+160)/100 = 4.3 FPU
  const fpu = (30 * 9 + 40 * 4) / 100;
  const total = fpuGlucoseRise(30, 40, 0, 5 * 60);
  assert.ok(Math.abs(total - fpu * 6 * 3.5) < 1, `attendu ${fpu * 6 * 3.5}, obtenu ${total}`);
});

test("mealGlucoseRise: somme glucides + FPU", () => {
  const meal = { carbsGrams: 60, fatGrams: 30, proteinGrams: 40, minutesAgo: 0 };
  const combined = mealGlucoseRise(meal, 180);
  const carbs = carbGlucoseRise(60, 0, 180);
  const fpu = fpuGlucoseRise(30, 40, 0, 180);
  assert.ok(Math.abs(combined - (carbs + fpu)) < 1e-6);
});

// ───────────────────────────────────────────────────────────────────────
// Effet basal (Lantus) — Étape 5b
// ───────────────────────────────────────────────────────────────────────

test("basalGlucoseEffect: basale titrée (drift 0) → effet net nul", () => {
  assert.equal(basalGlucoseEffect(480, 0), 0); // 8h, rien
});

test("basalGlucoseEffect: NE s'effondre PAS comme la formule spec", () => {
  // Formule spec (fausse) : (26/24)*100*(60/60) ≈ -108 mg/dL pour 1h.
  // Notre modèle avec une basale titrée ne bouge pas.
  assert.equal(basalGlucoseEffect(60, 0), 0);
});

test("basalGlucoseEffect: dérive négative mesurée → descente proportionnelle", () => {
  // -3 mg/dL/h sur 2h = -6 mg/dL.
  assert.equal(basalGlucoseEffect(120, -3), -6);
});

test("basalGlucoseEffect: dérive positive → montée signée", () => {
  assert.equal(basalGlucoseEffect(120, 4), 8);
});

test("basalGlucoseEffect: extrapolation plafonnée (anti-runaway sur 8h)", () => {
  // 20 mg/dL/h × 8h = 160 théorique → plafonné à ±80.
  assert.equal(basalGlucoseEffect(480, 20), BASAL_EFFECT_CAP_MGDL);
  assert.equal(basalGlucoseEffect(480, -20), -BASAL_EFFECT_CAP_MGDL);
});

test("basalGlucoseEffect: horizon nul → 0", () => {
  assert.equal(basalGlucoseEffect(0, -10), 0);
});

test("assessBasalTitration: confiance faible → unknown (pas de conclusion)", () => {
  assert.equal(assessBasalTitration(-12, "low").status, "unknown");
});

test("assessBasalTitration: dérive descendante franche → basale trop forte", () => {
  assert.equal(assessBasalTitration(-8, "high").status, "likely-too-strong");
});

test("assessBasalTitration: dérive montante franche → basale trop faible", () => {
  assert.equal(assessBasalTitration(7, "medium").status, "likely-too-weak");
});

test("assessBasalTitration: dans la bande ±5 → ok", () => {
  assert.equal(assessBasalTitration(-2, "high").status, "ok");
  assert.equal(assessBasalTitration(3, "high").status, "ok");
});

// ───────────────────────────────────────────────────────────────────────
// Conseil actionnable buildPredictionAdvice
// ───────────────────────────────────────────────────────────────────────

function curveFlatHigh(v: number) {
  return predictGlucoseCurve({ currentGlucose: v, events: [], isf: ISF, nowMs: NOON });
}

test("advice: reste haut (160) sans IOB → correction pour viser la cible", () => {
  const a = buildPredictionAdvice({ prediction: curveFlatHigh(160), targetGlucose: 110, isf: ISF, iobUnits: 0 });
  assert.equal(a.kind, "correction");
  assert.equal(a.unit, "U");
  // (160-110)/100 = 0,5U
  assert.ok(a.quantity && a.quantity >= 0.5 && a.quantity <= 1, `unités=${a.quantity}`);
});

test("advice: correction plafonnée à maxCorrection", () => {
  const a = buildPredictionAdvice({ prediction: curveFlatHigh(300), targetGlucose: 110, isf: ISF, iobUnits: 0, maxCorrection: 1 });
  assert.equal(a.kind, "correction");
  assert.ok(a.quantity! <= 1);
});

test("advice: IOB élevé + reste haut → wait-iob (anti-stacking)", () => {
  const a = buildPredictionAdvice({ prediction: curveFlatHigh(200), targetGlucose: 110, isf: ISF, iobUnits: 2 });
  assert.equal(a.kind, "wait-iob");
});

test("advice: en cible → rien à ajuster", () => {
  const a = buildPredictionAdvice({ prediction: curveFlatHigh(120), targetGlucose: 110, isf: ISF, iobUnits: 0 });
  assert.equal(a.kind, "in-range");
});

test("advice: trajectoire qui descend bas → glucides", () => {
  // 3U de correction sur 160 → chute → hypo prévue
  const pred = predictGlucoseCurve({ currentGlucose: 160, events: [{ minutesAgo: 0, units: 3 }], isf: ISF, nowMs: NOON });
  const a = buildPredictionAdvice({ prediction: pred, targetGlucose: 110, isf: ISF, iobUnits: 0 });
  assert.equal(a.kind, "carbs");
  assert.equal(a.unit, "g");
});

// ───────────────────────────────────────────────────────────────────────
// Modulation sport (sensibilité ↑) — Étape 5d
// ───────────────────────────────────────────────────────────────────────

/** Séance terminée il y a `hoursAgo` h, par rapport à NOON. */
function sportEndedHoursAgo(
  hoursAgo: number,
  source: "running" | "muscu" | "cardio-other",
  durationMin = 45,
  strain = 14,
) {
  return {
    source,
    endedAtMs: NOON - hoursAgo * 3_600_000,
    durationMin,
    strain,
    strainSource: "whoop" as const,
  };
}

test("sport: running récent + insuline active → baisse amplifiée (plus bas)", () => {
  const base = {
    currentGlucose: 130,
    isf: ISF,
    nowMs: NOON,
    events: [{ minutesAgo: 0, units: 6, carbsGrams: 60, carbSensitivity: carbSensitivity(ISF, 10) }],
  };
  const sansSport = predictGlucoseCurve(base);
  const avecSport = predictGlucoseCurve({ ...base, sport: sportEndedHoursAgo(1, "running") });
  assert.ok(avecSport.min.value < sansSport.min.value, `running devrait tirer plus bas (${avecSport.min.value} vs ${sansSport.min.value})`);
});

test("sport: muscu << running pour la même séance (Yardley 2013)", () => {
  const base = {
    currentGlucose: 130,
    isf: ISF,
    nowMs: NOON,
    events: [{ minutesAgo: 0, units: 6, carbsGrams: 60, carbSensitivity: carbSensitivity(ISF, 10) }],
  };
  const running = predictGlucoseCurve({ ...base, sport: sportEndedHoursAgo(1, "running") });
  const muscu = predictGlucoseCurve({ ...base, sport: sportEndedHoursAgo(1, "muscu") });
  // La muscu fait moins baisser → son minimum reste plus haut que le running.
  assert.ok(muscu.min.value > running.min.value, `muscu (${muscu.min.value}) devrait rester au-dessus du running (${running.min.value})`);
});

test("sport: sans insuline active → aucun effet (rien à amplifier)", () => {
  const base = { currentGlucose: 120, isf: ISF, nowMs: NOON, events: [] };
  const sansSport = predictGlucoseCurve(base);
  const avecSport = predictGlucoseCurve({ ...base, sport: sportEndedHoursAgo(1, "running") });
  for (let i = 0; i < sansSport.curve.length; i++) {
    assert.equal(avecSport.curve[i].value, sansSport.curve[i].value);
  }
});

test("sport: séance hors fenêtre d'effet → aucun effet", () => {
  const base = {
    currentGlucose: 130,
    isf: ISF,
    nowMs: NOON,
    events: [{ minutesAgo: 0, units: 6, carbsGrams: 60, carbSensitivity: carbSensitivity(ISF, 10) }],
  };
  const sansSport = predictGlucoseCurve(base);
  // running strain 14 → fenêtre 18h ; 30h plus tôt = dissipé.
  const avecVieuxSport = predictGlucoseCurve({ ...base, sport: sportEndedHoursAgo(30, "running") });
  assert.equal(avecVieuxSport.min.value, sansSport.min.value);
});

// ───────────────────────────────────────────────────────────────────────
// Cas d'acceptation : désynchronisation IOB/COB (pattern remontée 16h)
// ───────────────────────────────────────────────────────────────────────

// ───────────────────────────────────────────────────────────────────────
// carbSensitivity (CSF = ISF/ratio)
// ───────────────────────────────────────────────────────────────────────

test("carbSensitivity: ISF/ratio, fallback ISF/10 si ratio invalide", () => {
  assert.equal(carbSensitivity(100, 10), 10);
  assert.equal(carbSensitivity(100, 0), 10);
});

// ───────────────────────────────────────────────────────────────────────
// Assemblage predictGlucoseCurve — Étape 5c
// ───────────────────────────────────────────────────────────────────────

test("predictGlucoseCurve: 8h / pas 15min → 33 points, t=0 = glycémie actuelle", () => {
  const r = predictGlucoseCurve({ currentGlucose: 120, events: [], isf: ISF, nowMs: NOON });
  assert.equal(r.curve.length, 33);
  assert.equal(r.curve[0].value, 120);
  assert.equal(r.curve[0].minute, 0);
  assert.equal(r.curve[r.curve.length - 1].minute, 480);
});

test("predictGlucoseCurve: à jeun, basale titrée, hors dawn → ligne plate", () => {
  const r = predictGlucoseCurve({ currentGlucose: 120, events: [], isf: ISF, nowMs: NOON });
  for (const p of r.curve) assert.equal(p.value, 120);
  assert.equal(r.alerts.length, 0);
});

test("predictGlucoseCurve: repas bien dosé → retour ~baseline, aucune hypo", () => {
  // 60g, bolus 6U (ratio 10), CSF 10 → montée glucides ≈ baisse IOB.
  const r = predictGlucoseCurve({
    currentGlucose: 120,
    isf: ISF,
    nowMs: NOON,
    events: [{ minutesAgo: 0, units: 6, carbsGrams: 60, carbSensitivity: carbSensitivity(ISF, 10) }],
  });
  const final = r.curve[r.curve.length - 1].value;
  assert.ok(Math.abs(final - 120) <= 5, `retour baseline attendu, final=${final}`);
  assert.ok(!r.alerts.some((a) => a.type === "hypo"), "pas d'hypo fantôme après un repas bien dosé");
  // Excursion post-prandiale modérée et réaliste (pas un crash, pas un pic absurde).
  assert.ok(r.max.value <= 120 + 90, `excursion=${r.max.value}`);
});

test("predictGlucoseCurve: repas riche FPU sans split → montée tardive prédite", () => {
  // 100g glucides bolussés (10U) MAIS 40g lip + 50g prot non couverts, pas de split.
  const r = predictGlucoseCurve({
    currentGlucose: 130,
    isf: ISF,
    nowMs: NOON,
    events: [
      {
        minutesAgo: 0,
        units: 10,
        carbsGrams: 100,
        fatGrams: 40,
        proteinGrams: 50,
        carbSensitivity: carbSensitivity(ISF, 10),
      },
    ],
  });
  assert.ok(r.max.value > 170, `montée FPU attendue, max=${r.max.value}`);
  assert.ok(r.max.minute >= 120, "la montée FPU est tardive (≥2h)");
});

test("predictGlucoseCurve: le split couvre le FPU → montée tardive neutralisée", () => {
  const base = {
    currentGlucose: 130,
    isf: ISF,
    nowMs: NOON,
    events: [
      {
        minutesAgo: 0,
        units: 10,
        carbsGrams: 100,
        fatGrams: 40,
        proteinGrams: 50,
        carbSensitivity: carbSensitivity(ISF, 10),
      },
    ],
  };
  const withoutSplit = predictGlucoseCurve(base);
  // fpuBolus ≈ (FPU 5.0 × 6)/10 = 3U couvre la montée
  const withSplit = predictGlucoseCurve({ ...base, pendingSplit: { units: 3, minutesUntil: 120 } });
  assert.ok(withSplit.max.value < withoutSplit.max.value, "le split réduit le pic tardif");
});

test("predictGlucoseCurve: correction en hyper → descente + détection cohérente", () => {
  // 250 mg/dL, 0 repas, 3U de correction → forte baisse.
  const r = predictGlucoseCurve({
    currentGlucose: 250,
    isf: ISF,
    nowMs: NOON,
    events: [{ minutesAgo: 0, units: 3 }],
  });
  const final = r.curve[r.curve.length - 1].value;
  assert.ok(final < 250, `descente attendue, final=${final}`);
  // 3U × 100 = -300 théorique borné par le clamp 40 → finit bas.
  assert.ok(r.min.value < 100, `min=${r.min.value}`);
});

test("predictGlucoseCurve: dérive basale négative la NUIT → descente + alerte hypo", () => {
  // La dérive ne s'applique QUE sur les heures nocturnes [0h-6h) → on part du soir.
  const NIGHT = new Date("2026-06-20T23:00:00").getTime();
  const r = predictGlucoseCurve({
    currentGlucose: 110,
    events: [],
    isf: ISF,
    nowMs: NIGHT,
    basalDriftPerHour: -20, // nuits qui descendent franchement
  });
  assert.ok(r.min.value < 110);
  assert.ok(r.alerts.some((a) => a.type === "hypo"));
});

test("predictGlucoseCurve: dérive basale NON appliquée en journée (digestion)", () => {
  // À midi, horizon 12h-20h → aucune heure nocturne → la dérive n'écrase pas.
  const r = predictGlucoseCurve({
    currentGlucose: 150,
    events: [],
    isf: ISF,
    nowMs: NOON,
    basalDriftPerHour: 10,
  });
  for (const p of r.curve) assert.equal(p.value, 150); // plat, dérive ignorée le jour
});

test("predictGlucoseCurve: dawn appliqué quand l'horizon traverse 4h-8h", () => {
  const r = predictGlucoseCurve({ currentGlucose: 110, events: [], isf: ISF, nowMs: PRE_DAWN });
  // Au moins un point du matin nettement au-dessus de la baseline.
  assert.ok(r.max.value >= 140, `dawn attendu, max=${r.max.value}`);
});

test("predictGlucoseCurve: courbe dawn mesurée prime sur l'échelle par défaut", () => {
  const r = predictGlucoseCurve({
    currentGlucose: 110,
    events: [],
    isf: ISF,
    nowMs: PRE_DAWN,
    dawnCurveByHour: { 4: 3, 5: 4, 6: 5, 7: 5, 8: 3 }, // dawn perso quasi nul
  });
  // Avec un dawn mesuré faible, pas de grosse montée.
  assert.ok(r.max.value <= 120, `dawn mesuré devrait primer, max=${r.max.value}`);
});

test("predictGlucoseCurve: flag peu fiable si repas frais + IOB élevé", () => {
  const r = predictGlucoseCurve({
    currentGlucose: 140,
    isf: ISF,
    nowMs: NOON,
    events: [{ minutesAgo: 20, units: 8, carbsGrams: 70 }],
  });
  assert.equal(r.unreliableTooFresh, true);
});

test("predictGlucoseCurve: valeurs toujours clampées 40–350", () => {
  const r = predictGlucoseCurve({
    currentGlucose: 300,
    isf: ISF,
    nowMs: NOON,
    events: [{ minutesAgo: 0, units: 20 }], // énorme, ferait -2000 sans clamp
    basalDriftPerHour: 30,
  });
  for (const p of r.curve) assert.ok(p.value >= 40 && p.value <= 350, `hors bornes: ${p.value}`);
});

test("désync IOB/COB: passé le DIA, les glucides montent encore alors que l'IOB est mort", () => {
  // Riz midi : bolus 6U + 70g glucides. À t≈195min (fin IOB), il reste
  // de l'absorption glucidique si la fenêtre carbs est plus longue.
  // Ici on prend une fenêtre d'absorption longue (riz ~2h30) pour illustrer.
  const dropFullDIA = iobGlucoseDrop([{ units: 6, minutesAgo: 195 }], 30, ISF);
  const riseAfterDIA = carbGlucoseRise(70, 150, 60, 3.5, 300); // riz : absorption ~5h
  assert.equal(dropFullDIA, 0, "IOB épuisé → plus de baisse");
  assert.ok(riseAfterDIA > 0, "les glucides continuent de faire monter");
});
