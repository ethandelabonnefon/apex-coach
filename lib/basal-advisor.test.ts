import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeBasal,
  assessActivityLoad,
  buildBasalInputs,
  detectHypoEpisodes,
  findCleanNights,
  localParts,
  reductionUnits,
  type BasalBolus,
  type BasalPoint,
} from "./basal-advisor";

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Lundi 9 novembre 2026, 12 h 00 locale. */
const NOW = new Date(2026, 10, 9, 12, 0, 0, 0).getTime();

/** Instant local : `daysAgo` jours avant NOW, à l'heure donnée. */
function at(daysAgo: number, hour: number, minute = 0): number {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}

/**
 * Courbe de fond : un point toutes les 15 min sur `days` jours.
 * `valueAt` reçoit l'instant et renvoie la glycémie.
 */
function curve(days: number, valueAt: (t: number) => number): BasalPoint[] {
  const out: BasalPoint[] = [];
  for (let t = NOW - days * DAY; t <= NOW; t += 15 * MIN) {
    out.push({ t, value: valueAt(t) });
  }
  return out;
}

/** Creuse une hypo de `durationMin` minutes autour de `startMs`. */
function withHypo(points: BasalPoint[], startMs: number, value: number, durationMin = 30): BasalPoint[] {
  return points.map((p) =>
    p.t >= startMs && p.t < startMs + durationMin * MIN ? { ...p, value } : p,
  );
}

/** Trois repas par jour, bolus à 7 h 30, 12 h 30 et 19 h 30. */
function mealBoluses(days: number): BasalBolus[] {
  const out: BasalBolus[] = [];
  for (let d = 0; d <= days; d++) {
    for (const h of [7, 12, 19]) {
      const t = at(d, h, 30);
      if (t <= NOW) out.push({ atMs: t, units: 6 });
    }
  }
  return out;
}

const flat = (v: number) => () => v;

// ───────────────────────────────────────────────────────────────────────
// Épisodes
// ───────────────────────────────────────────────────────────────────────

test("un point isolé à 68 n'est pas un épisode, un point isolé à 55 en est un", () => {
  const base: BasalPoint[] = [
    { t: at(1, 4, 0), value: 68 },
    { t: at(1, 10, 0), value: 55 },
  ];
  const episodes = detectHypoEpisodes(base, []);
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].minValue, 55);
  assert.equal(episodes[0].severe, false);
});

test("deux points consécutifs sous 70 forment un seul épisode", () => {
  const pts: BasalPoint[] = [
    { t: at(1, 4, 0), value: 66 },
    { t: at(1, 4, 15), value: 62 },
    { t: at(1, 4, 30), value: 75 },
  ];
  const episodes = detectHypoEpisodes(pts, []);
  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].pointCount, 2);
  assert.equal(episodes[0].block, "night");
});

test("une hypo 2 h après un bolus n'est pas à jeun ; 5 h après, elle l'est", () => {
  const pts: BasalPoint[] = [
    { t: at(1, 14, 30), value: 60 },
    { t: at(1, 14, 45), value: 58 },
    { t: at(2, 17, 30), value: 60 },
    { t: at(2, 17, 45), value: 58 },
  ];
  const boluses: BasalBolus[] = [
    { atMs: at(1, 12, 30), units: 6 },
    { atMs: at(2, 12, 30), units: 6 },
  ];
  const episodes = detectHypoEpisodes(pts, boluses).sort((a, b) => a.startMs - b.startMs);
  assert.equal(episodes.length, 2);
  assert.equal(episodes[0].fasting, true, "17 h 30 : 5 h après le bolus du midi");
  assert.equal(episodes[1].fasting, false, "14 h 30 : 2 h après le bolus du midi");
});

test("injections plus notées depuis 2 jours → une hypo n'est PAS classée à jeun", () => {
  const pts: BasalPoint[] = [
    { t: at(0, 4, 0), value: 60 },
    { t: at(0, 4, 15), value: 58 },
  ];
  const stale: BasalBolus[] = [{ atMs: at(2, 12, 30), units: 6 }];
  assert.equal(detectHypoEpisodes(pts, stale)[0].fasting, false);
  assert.equal(detectHypoEpisodes(pts, [])[0].fasting, false);
  const active: BasalBolus[] = [{ atMs: at(1, 19, 30), units: 6 }];
  assert.equal(detectHypoEpisodes(pts, active)[0].fasting, true);
});

test("buildBasalInputs : glucides avec insuline = bolus, sans insuline = prise de glucides", () => {
  const { boluses, carbEntriesMs } = buildBasalInputs(
    [
      { units: 6, injectedAt: new Date(at(1, 12, 30)) },
      { units: 0, injectedAt: new Date(at(1, 13, 0)) },
      { units: 4, injectedAt: "pas une date" },
    ],
    [
      { eatenAt: new Date(at(1, 16, 0)).toISOString(), insulinUnits: 2 },
      { eatenAt: new Date(at(0, 2, 0)).toISOString() },
    ],
  );
  assert.equal(boluses.length, 2);
  assert.deepEqual(carbEntriesMs, [at(0, 2, 0)]);
});

test("une hypo sous 54 est sévère", () => {
  const pts: BasalPoint[] = [{ t: at(1, 3, 0), value: 50 }];
  assert.equal(detectHypoEpisodes(pts, [])[0].severe, true);
});

// ───────────────────────────────────────────────────────────────────────
// Nuits propres
// ───────────────────────────────────────────────────────────────────────

test("une nuit avec correction à 23 h n'est pas une nuit propre", () => {
  const pts = curve(4, flat(120));
  const from = NOW - 4 * DAY;
  const clean = findCleanNights(pts, [], [], from, NOW);
  assert.ok(clean.length >= 3);
  const withCorrection = findCleanNights(
    pts,
    [{ atMs: at(1, 23, 0), units: 1 }],
    [],
    from,
    NOW,
  );
  assert.equal(withCorrection.length, clean.length - 1);
});

test("un resucrage à 2 h écarte la nuit", () => {
  const pts = curve(4, flat(120));
  const from = NOW - 4 * DAY;
  const clean = findCleanNights(pts, [], [], from, NOW);
  const withCarbs = findCleanNights(pts, [], [at(0, 2, 0)], from, NOW);
  assert.equal(withCarbs.length, clean.length - 1);
});

test("la variation 3 h → 7 h est mesurée", () => {
  const pts = curve(3, (t) => {
    const h = new Date(t).getHours();
    return h >= 3 && h < 8 ? 100 + (h - 3) * 10 : 100;
  });
  const clean = findCleanNights(pts, [], [], NOW - 3 * DAY, NOW);
  assert.ok(clean.length >= 2);
  for (const n of clean) assert.equal(n.delta, 40);
});

// ───────────────────────────────────────────────────────────────────────
// Verdict — baisse
// ───────────────────────────────────────────────────────────────────────

test("deux hypos nocturnes à jeun sur deux jours → baisse de 10 %", () => {
  let pts = curve(7, flat(115));
  pts = withHypo(pts, at(0, 4, 0), 62);
  pts = withHypo(pts, at(1, 5, 0), 64);
  const advice = analyzeBasal({
    points: pts,
    boluses: mealBoluses(7),
    basalDose: 24,
    nowMs: NOW,
  });
  assert.equal(advice.status, "reduce");
  assert.equal(advice.proposedDose, 22);
  assert.equal(advice.evidence.recentFasting, 2);
  assert.match(advice.headline, /24 → 22 U/);
});

test("le scénario 30 000 pas : hypos à toute heure, toutes après un repas → baisse quand même", () => {
  // Aucune hypo n'est « à jeun » : elles tombent 2 h après chaque repas,
  // matin, après-midi et soir. L'ancien détecteur (3 hypos dans le même
  // créneau de 2 h) ne voyait rien.
  let pts = curve(7, flat(115));
  pts = withHypo(pts, at(0, 9, 30), 63);
  pts = withHypo(pts, at(1, 14, 30), 61);
  pts = withHypo(pts, at(1, 21, 30), 65);
  pts = withHypo(pts, at(2, 15, 0), 60);
  const advice = analyzeBasal({
    points: pts,
    boluses: mealBoluses(7),
    basalDose: 26,
    nowMs: NOW,
    dailyStrain: [
      ...[13, 12, 11, 10, 9, 8, 7, 6, 5, 4].map((d) => ({ day: dayOf(d), strain: 10.5 })),
      { day: dayOf(3), strain: 16.2 },
      { day: dayOf(2), strain: 17.1 },
      { day: dayOf(1), strain: 16.4 },
    ],
  });
  assert.equal(advice.status, "reduce");
  assert.equal(advice.evidence.recentFasting, 0);
  assert.equal(advice.evidence.recentEpisodes, 4);
  assert.equal(advice.proposedDose, 23, "10 % de 26 U arrondi = 3 U");
  assert.equal(advice.activity?.elevated, true);
  assert.ok(advice.reasons.some((r) => r.includes("charge d'activité")));
});

test("une hypo sévère à jeun déclenche le pas renforcé, plafonné à 4 U", () => {
  let pts = curve(7, flat(115));
  pts = withHypo(pts, at(0, 4, 0), 48);
  pts = withHypo(pts, at(1, 5, 0), 62);
  const advice = analyzeBasal({
    points: pts,
    boluses: mealBoluses(7),
    basalDose: 28,
    nowMs: NOW,
  });
  assert.equal(advice.status, "reduce");
  assert.equal(advice.proposedDose, 24, "20 % de 28 = 5,6 → plafonné à 4 U");
});

test("trois hypos après le même repas, le même créneau → ce n'est pas la lente", () => {
  let pts = curve(7, flat(115));
  pts = withHypo(pts, at(0, 9, 30), 63);
  pts = withHypo(pts, at(1, 9, 30), 61);
  pts = withHypo(pts, at(2, 9, 45), 65);
  const advice = analyzeBasal({
    points: pts,
    boluses: mealBoluses(7),
    basalDose: 24,
    nowMs: NOW,
  });
  assert.notEqual(advice.status, "reduce");
  assert.equal(advice.proposedDose, null);
  assert.ok(advice.reasons.some((r) => r.includes("ratios")));
});

test("une seule hypo à jeun → surveillance, aucune dose proposée", () => {
  let pts = curve(7, flat(115));
  pts = withHypo(pts, at(1, 4, 0), 62);
  const advice = analyzeBasal({
    points: pts,
    boluses: mealBoluses(7),
    basalDose: 24,
    nowMs: NOW,
  });
  assert.equal(advice.status, "watch");
  assert.equal(advice.proposedDose, null);
});

test("les hypos d'AVANT le dernier changement de lente ne comptent plus", () => {
  let pts = curve(7, flat(115));
  pts = withHypo(pts, at(5, 4, 0), 60);
  pts = withHypo(pts, at(6, 4, 0), 58);
  pts = withHypo(pts, at(6, 16, 0), 58);
  const advice = analyzeBasal({
    points: pts,
    boluses: mealBoluses(7),
    basalDose: 22,
    basalChangedAtMs: at(4, 20, 0),
    nowMs: NOW,
  });
  assert.equal(advice.status, "ok");
  assert.equal(advice.evidence.longFasting, 0);
});

test("lente changée il y a moins de 48 h → observation, jamais de nouvelle baisse", () => {
  let pts = curve(7, flat(115));
  pts = withHypo(pts, at(0, 4, 0), 60);
  pts = withHypo(pts, at(0, 9, 0), 60);
  const advice = analyzeBasal({
    points: pts,
    boluses: [],
    basalDose: 22,
    basalChangedAtMs: NOW - 20 * HOUR,
    nowMs: NOW,
  });
  assert.equal(advice.status, "observing");
  assert.equal(advice.proposedDose, null);
});

test("capteur muet → données insuffisantes, pas « tout va bien »", () => {
  const pts = curve(7, flat(115)).filter((p) => p.t < NOW - 2.5 * DAY);
  const advice = analyzeBasal({
    points: pts,
    boluses: [],
    basalDose: 24,
    nowMs: NOW,
  });
  assert.equal(advice.status, "insufficient");
});

// ───────────────────────────────────────────────────────────────────────
// Verdict — hausse
// ───────────────────────────────────────────────────────────────────────

/** Nuits qui montent de 100 à 160 entre 3 h et 7 h, journées à 130. */
function risingNights(t: number): number {
  const d = new Date(t);
  const h = d.getHours() + d.getMinutes() / 60;
  if (h < 3) return 100;
  if (h < 7) return 100 + ((h - 3) / 4) * 60;
  if (h < 9) return 160;
  return 130;
}

test("nuits qui montent, zéro hypo sur 7 jours → +1 U, jamais plus", () => {
  const advice = analyzeBasal({
    points: curve(8, risingNights),
    boluses: mealBoluses(8),
    basalDose: 22,
    nowMs: NOW,
  });
  assert.equal(advice.status, "increase");
  assert.equal(advice.proposedDose, 23);
  assert.ok((advice.evidence.medianNightDelta ?? 0) >= 30);
});

test("nuits qui montent MAIS une hypo dans la semaine → pas de hausse", () => {
  let pts = curve(8, risingNights);
  pts = withHypo(pts, at(4, 15, 0), 66, 15);
  const advice = analyzeBasal({
    points: pts,
    boluses: mealBoluses(8),
    basalDose: 22,
    nowMs: NOW,
  });
  assert.notEqual(advice.status, "increase");
  assert.equal(advice.proposedDose, null);
});

test("nuits qui montent mais lente changée il y a 3 jours → pas encore de hausse", () => {
  const advice = analyzeBasal({
    points: curve(8, risingNights),
    boluses: mealBoluses(8),
    basalDose: 22,
    basalChangedAtMs: NOW - 3 * DAY,
    nowMs: NOW,
  });
  assert.notEqual(advice.status, "increase");
});

test("réveils sous 150 → pas de hausse même si la nuit monte", () => {
  const advice = analyzeBasal({
    points: curve(8, (t) => {
      const d = new Date(t);
      const h = d.getHours() + d.getMinutes() / 60;
      if (h < 3) return 90;
      if (h < 7) return 90 + ((h - 3) / 4) * 40;
      return 125;
    }),
    boluses: mealBoluses(8),
    basalDose: 22,
    nowMs: NOW,
  });
  assert.notEqual(advice.status, "increase");
});

// ───────────────────────────────────────────────────────────────────────
// Divers
// ───────────────────────────────────────────────────────────────────────

test("tout est calme → la lente tient la route", () => {
  const advice = analyzeBasal({
    points: curve(7, flat(118)),
    boluses: mealBoluses(7),
    basalDose: 24,
    nowMs: NOW,
  });
  assert.equal(advice.status, "ok");
  assert.equal(advice.proposedDose, null);
});

test("nuits qui descendent sans hypo → surveillance", () => {
  const advice = analyzeBasal({
    points: curve(7, (t) => {
      const d = new Date(t);
      const h = d.getHours() + d.getMinutes() / 60;
      if (h < 3) return 140;
      if (h < 7) return 140 - ((h - 3) / 4) * 45;
      return 110;
    }),
    boluses: mealBoluses(7),
    basalDose: 24,
    nowMs: NOW,
  });
  assert.equal(advice.status, "watch");
  assert.match(advice.headline, /nuits descendent/);
});

test("reductionUnits : 10 % arrondi, au moins 1 U, au plus 4 U", () => {
  assert.equal(reductionUnits(24, false), 2);
  assert.equal(reductionUnits(26, false), 3);
  assert.equal(reductionUnits(8, false), 1);
  assert.equal(reductionUnits(4, false), 1);
  assert.equal(reductionUnits(24, true), 4);
  assert.equal(reductionUnits(60, false), 4);
});

test("assessActivityLoad écarte le jour en cours et exige un vrai écart", () => {
  const today = dayOf(0);
  const steady = Array.from({ length: 10 }, (_, i) => ({ day: dayOf(10 - i), strain: 11 }));
  assert.equal(assessActivityLoad(steady, today)?.elevated, false);
  assert.equal(assessActivityLoad([{ day: today, strain: 20 }], today), null);
  assert.equal(assessActivityLoad(undefined, today), null);
});

test("localParts avec fuseau : 23 h 30 UTC est déjà le lendemain à Paris", () => {
  const ms = Date.UTC(2026, 10, 9, 23, 30);
  const paris = localParts(ms, "Europe/Paris");
  assert.equal(paris.hour, 0);
  assert.equal(paris.day, "2026-11-10");
});

function dayOf(daysAgo: number): string {
  return localParts(NOW - daysAgo * DAY).day;
}
