/**
 * POST /api/diabete/weekly-insight
 *
 * Génère un bilan hebdomadaire T1D — combinaison :
 *   1. Moteur stats déterministe (lib/glucose-archive/analytics.ts)
 *   2. Claude Sonnet 4 qui lit le rapport et produit un résumé en langage naturel
 *      avec suggestions incrémentales (jamais auto-appliquées).
 *
 * ⚠️ Sécurité T1D — règles dures dans le system prompt :
 *   - Aucune suggestion ne doit être auto-appliquée
 *   - Increments max : ±10% sur ratio bolus, ±0,5U sur ISF, ±1U sur basal
 *   - Si data insuffisante (< 14j ou < 3 injections par bucket) → pas de
 *     suggestion concrète, juste observation
 *   - Si CV > 50 → trop de variabilité, on ne conclut pas sur les ratios
 *   - Toujours rappeler que la décision finale revient à l'utilisateur
 *
 * Body :
 *   {
 *     days?: number,          // 7 par défaut, max 90
 *     injections: InsulinLog[], // depuis le store client
 *     profiles?: { id: string; name: string }[], // pour annoter byProfile
 *     activeProfileName?: string,                 // contexte UI
 *
 *     // Phase 11 Bloc 5 — contexte enrichi (tous optionnels) :
 *     detectedPatterns?: DetectedPattern[],       // moteur déterministe (Bloc 3)
 *     workoutSessions?: WorkoutSummary[],         // séances muscu/running (date, type, heure, durée)
 *     mealContext?: MealContextEntry[],           // résumé repas (mealTag, macros)
 *   }
 *
 * Réponse :
 *   {
 *     report: WeeklyReport,
 *     insight: {
 *       summary: string,
 *       highlights: string[],   // 2-4 points clés
 *       suggestions: { area: string; suggestion: string; rationale: string; confidence: 'low'|'medium'|'high' }[],
 *       warnings: string[],     // alertes safety (hypos répétées, CV élevé, etc.)
 *       generatedAt: string,    // ISO
 *     }
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import {
  readPoints,
  isKvConfigured,
  RETENTION_DAYS,
} from "@/lib/glucose-archive/store";
import { buildWeeklyReport } from "@/lib/glucose-archive/analytics";
import { T1D_SAFETY_RULES } from "@/lib/doctor/t1d-safety-rules";
import type { InsulinLog } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic();

/** Pattern détecté par le moteur déterministe (Phase 11 Bloc 3). */
interface ClientDetectedPattern {
  type: string;          // "night-hyper" | "recurring-hypo" | …
  severity: string;      // "info" | "warning" | "alert"
  title: string;
  message: string;
  occurrences: number;
  timeWindow: string;
  suggestion: string;
}

/** Séance sport (depuis store muscu/running). */
interface WorkoutSummary {
  date: string;          // ISO
  type: "muscu" | "running";
  startTime?: string;    // ex: "20:15"
  durationMin: number;
}

/** Résumé d'un repas tagué (alimente l'analyse meal-tag). */
interface MealContextEntry {
  mealType: string;      // "morning" | "lunch" | "snack" | "dinner" | "other"
  mealTag?: string;      // "pates" | "pizza" | …
  mealSize?: string;
  carbsGrams: number;
  fatGrams?: number;
  proteinGrams?: number;
  injectedAt: string;
  glucoseBefore: number;
}

interface RequestBody {
  days?: number;
  injections?: InsulinLog[];
  profiles?: { id: string; name: string }[];
  activeProfileName?: string;
  // Phase 11 Bloc 5
  detectedPatterns?: ClientDetectedPattern[];
  workoutSessions?: WorkoutSummary[];
  mealContext?: MealContextEntry[];
}

interface InsightOutput {
  summary: string;
  highlights: string[];
  suggestions: {
    area: string;
    suggestion: string;
    rationale: string;
    confidence: "low" | "medium" | "high";
  }[];
  warnings: string[];
  generatedAt: string;
}

const SYSTEM_PROMPT = `Tu es un assistant T1D (diabète de type 1) expert qui aide Ethan, 21 ans, sous Novorapid (rapide) + Lantus 28U le soir (lente) + FreeStyle Libre 2 CGM.

Tu reçois un RAPPORT STATISTIQUE déterministe de la dernière semaine (TIR, patterns horaires, réponses post-repas par mealType, événements hypos/hypers, stats par profil ratio actif), enrichi de :
  - PATTERNS DÉTECTÉS par un moteur déterministe (règle des 3 jours / 4 sur 7) — tu dois les CONFIRMER, NUANCER, ou INFIRMER avec ton analyse.
  - SÉANCES SPORT (date, type muscu/running, heure, durée) — corrèle les variations glycémiques avec les séances.
  - CONTEXTE REPAS (mealTag : pates/pizza/sandwich/…, macros lipides+protéines quand renseignées) — utilise-le pour distinguer un ratio mal calibré d'un repas à digestion lente (FPU).

Ta mission : produire un bilan en langage naturel, court et actionnable, qui CROISE ces signaux.

${T1D_SAFETY_RULES}

═══════════════════════════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT
═══════════════════════════════════════════════════════════════

Tu réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de prose autour) :

{
  "summary": "2-4 phrases qui résument la semaine. Inclut TIR %, événements marquants, et rappelle que c'est à valider avec son médecin.",
  "highlights": [
    "2 à 4 points clés en français — observations factuelles (ex: 'TIR à 72%, cible 70% dépassée', 'Pic moyen midi à 165 vs cible 180')"
  ],
  "suggestions": [
    {
      "area": "ratio-midi" | "ratio-matin" | "ratio-soir" | "ratio-snack" | "isf" | "basal" | "timing" | "regularite" | "autre",
      "suggestion": "Phrase actionnable courte (ex: 'Essayer de monter le ratio du midi de 1U/10g à 1.1U/10g pour les repas > 60g')",
      "rationale": "Une phrase qui explique POURQUOI à partir des stats (chiffres précis du rapport)",
      "confidence": "low" | "medium" | "high"
    }
  ],
  "warnings": [
    "Alertes safety (hypos répétées, CV > 50, pas assez de data) — vide si rien"
  ],
  "generatedAt": "ISO timestamp"
}

Tu produis MAX 4 suggestions, max 4 highlights, max 3 warnings. Tout en français.

Si la fenêtre a < 7 jours OU < 100 points, tu retournes des suggestions vides + un warning explicite "Pas encore assez de data pour conclure — reviens dans X jours".`;

export async function POST(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json(
      { error: "kv_not_configured", message: "Vercel KV requis pour le bilan." },
      { status: 503 },
    );
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const daysRaw = Number(body.days ?? 7);
  const days = Math.max(
    1,
    Math.min(RETENTION_DAYS, Number.isFinite(daysRaw) ? daysRaw : 7),
  );

  const toMs = Date.now();
  const fromMs = toMs - days * 24 * 60 * 60 * 1000;

  const points = await readPoints(fromMs, toMs);

  // Normalize injections (timestamps can be Date | string)
  const injections = (body.injections ?? [])
    .map((log) => {
      const t =
        log.injectedAt instanceof Date
          ? log.injectedAt.getTime()
          : new Date(log.injectedAt).getTime();
      return {
        t,
        units: log.units,
        mealType: log.mealType,
        carbsGrams: log.carbsGrams,
        profileId: log.profileId,
      };
    })
    .filter((i) => Number.isFinite(i.t) && i.t >= fromMs && i.t <= toMs);

  const profileNameById = new Map<string, string>();
  for (const p of body.profiles ?? []) {
    profileNameById.set(p.id, p.name);
  }

  const report = buildWeeklyReport({
    points,
    injections,
    range: { fromMs, toMs, days },
    profileNameById,
  });

  // Garde-fou : si vraiment rien dans la fenêtre, on retourne sans appeler Claude
  if (report.pointsCount === 0) {
    const insight: InsightOutput = {
      summary:
        "Aucune donnée dans la fenêtre demandée. Le cron d'archivage tourne toutes les 4h — reviens plus tard ou attends que l'archive se remplisse.",
      highlights: [],
      suggestions: [],
      warnings: ["Pas de data dans la fenêtre demandée."],
      generatedAt: new Date().toISOString(),
    };
    return NextResponse.json({ report, insight });
  }

  // ─── Phase 11 Bloc 5 — Contexte enrichi ────────────────────────────
  // On normalize les 3 nouveaux signaux côté serveur pour gérer les cas
  // où ils sont absents (rétrocompat) ou volumineux (capping).
  const detectedPatterns = (body.detectedPatterns ?? []).slice(0, 6);

  // Filtre + tri des sessions sport dans la fenêtre temporelle
  const workoutSessions = (body.workoutSessions ?? [])
    .filter((w) => {
      const t = new Date(w.date).getTime();
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 30);

  // Résumé des repas — on ne renvoie que ceux dans la fenêtre, ordonnés
  // par date desc pour donner du poids aux plus récents.
  const mealContext = (body.mealContext ?? [])
    .filter((m) => {
      const t = new Date(m.injectedAt).getTime();
      return Number.isFinite(t) && t >= fromMs && t <= toMs;
    })
    .sort((a, b) => new Date(b.injectedAt).getTime() - new Date(a.injectedAt).getTime())
    .slice(0, 40);

  // Préparer le contexte minimal pour Claude
  const claudeContext = {
    range: report.range,
    profileActif: body.activeProfileName ?? "inconnu",
    pointsCount: report.pointsCount,
    injectionsCount: report.injectionsCount,
    overall: report.overall,
    byTimeBucket: report.byTimeBucket,
    riskyHours: report.riskyHours,
    postMeal: report.postMeal,
    hypoEventsCount: report.hypoEvents.length,
    hyperEventsCount: report.hyperEvents.length,
    hypoEvents: report.hypoEvents.slice(0, 3).map((e) => ({
      durationMin: e.durationMin,
      minValue: e.minValue,
      startMs: e.startMs,
    })),
    hyperEvents: report.hyperEvents.slice(0, 3).map((e) => ({
      durationMin: e.durationMin,
      maxValue: e.maxValue,
      startMs: e.startMs,
    })),
    byProfile: report.byProfile,
    // Phase 11 Bloc 5
    detectedPatterns,
    workoutSessions,
    mealContext,
  };

  const userPrompt = `Voici le rapport stats de la semaine d'Ethan.

PROFIL RATIO ACTIF : ${claudeContext.profileActif}
PÉRIODE : ${days} jours (${new Date(fromMs).toLocaleDateString("fr-FR")} → ${new Date(toMs).toLocaleDateString("fr-FR")})

RAPPORT JSON :
${JSON.stringify(claudeContext, null, 2)}

Génère le bilan au format JSON strict décrit dans tes instructions.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-5",
      thinking: { type: "disabled" },
      max_tokens: 1500,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Pas de réponse texte de Claude");
    }

    // Parse JSON (Claude renvoie parfois du markdown autour, on nettoie)
    let raw = textBlock.text.trim();
    if (raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }

    let insight: InsightOutput;
    try {
      insight = JSON.parse(raw);
    } catch (parseErr) {
      console.error("[weekly-insight] parse error:", parseErr, "raw:", raw);
      throw new Error("Réponse Claude invalide (JSON parse failed)");
    }

    // Garantir generatedAt
    if (!insight.generatedAt) {
      insight.generatedAt = new Date().toISOString();
    }

    return NextResponse.json({ report, insight });
  } catch (err) {
    console.error("[weekly-insight] Claude error:", err);
    return NextResponse.json(
      {
        report,
        error: "claude_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
