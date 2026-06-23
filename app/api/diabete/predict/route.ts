/**
 * POST /api/diabete/predict
 *
 * Prédit la courbe glycémique sur 8h (pas 15 min) à partir du contexte
 * complet du moment. Suit le pattern de `weekly-insight` : les logs vivent
 * côté client (Zustand/localStorage, pas de base), donc le client POST ses
 * injections + le contexte, et le SERVEUR lit l'archive 90j (Vercel KV) pour
 * en dériver les paramètres PERSO (dérive basale + courbe dawn) avant
 * d'appeler le moteur pur `predictGlucoseCurve`.
 *
 * Tout le calcul réutilise les primitives calibrées (lib/glucose-prediction.ts) :
 *   - IOB bi-exponentiel (lib/night-calibration.ts)
 *   - COB glucides + FPU facteur 6 (cohérent calculateur de dose)
 *   - effet basal = dérive MESURÉE (jamais la formule dose×ISF de la spec)
 *   - modulation sport via computeExerciseAdjustment (muscu vs running)
 *
 * Body :
 *   {
 *     currentGlucose: number,            // mg/dL (live LibreLink ou manuel)
 *     trendArrow?: number,               // 1..5 (1=↓↓ … 5=↑↑)
 *     injections: InsulinLog[],          // store.insulinLogs
 *     standaloneMeals?: {                // repas SANS bolus (rare) — store.meals
 *       carbsGrams: number; fatGrams?: number; proteinGrams?: number; eatenAtMs: number;
 *     }[],
 *     pendingSplit?: { units: number; minutesUntil: number },
 *     sport?: RecentExercise,            // séance récente (Whoop/estimée)
 *     isf: number,                       // mg/dL par U (ex. 100)
 *     ratios: { morning:number; lunch:number; snack:number; dinner:number }, // g par U
 *     insulinActiveDuration?: number,    // DIA min (défaut 195)
 *     targetRange?: { min:number; max:number },
 *     horizonMinutes?: number;           // défaut 480
 *     stepMinutes?: number;              // défaut 15
 *     days?: number;                     // fenêtre archive pour dérive/dawn (défaut 30)
 *   }
 *
 * Réponse :
 *   {
 *     prediction: GlucosePrediction,     // curve + min/max + alerts + unreliableTooFresh
 *     meta: {
 *       driftPerHour: number; driftConfidence: 'low'|'medium'|'high';
 *       dawnConfidence: 'low'|'medium'|'high';
 *       eventsUsed: number; archivePoints: number; generatedAt: string;
 *     }
 *   }
 *
 * Erreurs : 400 (body invalide), 503 (KV non configuré — pas de perso possible).
 */

import { NextRequest, NextResponse } from "next/server";
import { readPoints, isKvConfigured } from "@/lib/glucose-archive/store";
import { estimateNightDrift, estimateDawnCurve } from "@/lib/night-calibration";
import { predictGlucoseCurve, DEFAULT_DIA_MIN } from "@/lib/glucose-prediction";
import { buildPredictionEvents } from "@/lib/prediction-inputs";
import type { RecentExercise } from "@/lib/exercise-insulin-adjustment";
import type { InsulinLog, CarbEntry } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MealKey = "morning" | "lunch" | "snack" | "dinner";

interface StandaloneMeal {
  carbsGrams: number;
  fatGrams?: number;
  proteinGrams?: number;
  eatenAtMs: number;
}

interface RequestBody {
  currentGlucose: number;
  trendArrow?: number;
  injections?: InsulinLog[];
  standaloneMeals?: StandaloneMeal[];
  pendingSplit?: { units: number; minutesUntil: number };
  sport?: RecentExercise;
  isf: number;
  ratios?: Record<MealKey, number>;
  insulinActiveDuration?: number;
  targetRange?: { min: number; max: number };
  horizonMinutes?: number;
  stepMinutes?: number;
  days?: number;
}


export async function POST(req: NextRequest) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (typeof body.currentGlucose !== "number" || !Number.isFinite(body.currentGlucose)) {
    return NextResponse.json(
      { error: "invalid_body", message: "currentGlucose (number) requis." },
      { status: 400 },
    );
  }
  if (typeof body.isf !== "number" || body.isf <= 0) {
    return NextResponse.json(
      { error: "invalid_body", message: "isf (mg/dL par U, > 0) requis." },
      { status: 400 },
    );
  }

  const now = Date.now();
  const dia = body.insulinActiveDuration ?? DEFAULT_DIA_MIN;
  const isf = body.isf;

  // ─── 1. Archive → paramètres perso (dérive basale + dawn) ──────────────
  // Dégradation gracieuse : sans archive (KV non configuré ou erreur), on
  // prédit quand même avec des défauts sûrs (dérive 0 = basale supposée
  // titrée, échelle dawn standard). La prédiction reste fonctionnelle, juste
  // moins personnalisée — on le signale dans `meta.personalized`.
  const days = Math.min(90, Math.max(7, body.days ?? 30));
  const fromMs = now - days * 24 * 60 * 60 * 1000;

  let drift = { driftPerHour: 0, confidence: "low" as "low" | "medium" | "high" };
  let dawn = { curve: {} as Record<number, number>, confidence: "low" as "low" | "medium" | "high" };
  let archivePoints = 0;
  let personalized = false;

  if (isKvConfigured()) {
    try {
      const points = await readPoints(fromMs, now);
      archivePoints = points.length;
      const nightInjections = (body.injections ?? [])
        .filter((i) => i && i.injectedAt && typeof i.units === "number")
        .map((i) => ({ injectedAt: new Date(i.injectedAt).toISOString(), units: i.units }));
      const d = estimateNightDrift(points, nightInjections);
      const dc = estimateDawnCurve(points);
      drift = { driftPerHour: d.driftPerHour, confidence: d.confidence };
      dawn = { curve: dc.curve, confidence: dc.confidence };
      personalized = points.length > 0;
    } catch (err) {
      console.error("[diabete/predict] archive read failed:", err instanceof Error ? err.message : err);
      // on continue avec les défauts
    }
  }

  // ─── 2. Mapping injections + repas → PredictionEvent[] (source unique) ──
  // Les repas sans bolus (standaloneMeals) sont convertis en CarbEntry pour
  // passer par le même mapper que le plan nuit → prédictions cohérentes.
  const carbEntriesFromMeals: CarbEntry[] = (body.standaloneMeals ?? [])
    .filter((m) => m && typeof m.eatenAtMs === "number")
    .map((m, i) => ({
      id: `m${i}`,
      carbsGrams: m.carbsGrams,
      fatGrams: m.fatGrams,
      proteinGrams: m.proteinGrams,
      insulinUnits: 0,
      eatenAt: new Date(m.eatenAtMs).toISOString(),
    }));
  const events = buildPredictionEvents({
    insulinLogs: body.injections ?? [],
    carbEntries: carbEntriesFromMeals,
    isf,
    ratios: body.ratios,
    nowMs: now,
  });

  // ─── 3. Prédiction ─────────────────────────────────────────────────────
  const prediction = predictGlucoseCurve({
    currentGlucose: body.currentGlucose,
    trendArrow: body.trendArrow,
    events,
    isf,
    dia,
    basalDriftPerHour: drift.driftPerHour,
    dawnCurveByHour: Object.keys(dawn.curve).length > 0 ? dawn.curve : undefined,
    pendingSplit: body.pendingSplit,
    sport: body.sport,
    hypoThreshold: 70,
    hyperThreshold: 250,
    horizonMinutes: body.horizonMinutes,
    stepMinutes: body.stepMinutes,
    nowMs: now,
  });

  return NextResponse.json({
    prediction,
    meta: {
      personalized,
      driftPerHour: drift.driftPerHour,
      driftConfidence: drift.confidence,
      dawnConfidence: dawn.confidence,
      eventsUsed: events.length,
      archivePoints,
      generatedAt: new Date(now).toISOString(),
    },
  });
}
