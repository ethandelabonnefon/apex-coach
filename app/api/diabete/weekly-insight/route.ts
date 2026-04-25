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
import type { InsulinLog } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic();

interface RequestBody {
  days?: number;
  injections?: InsulinLog[];
  profiles?: { id: string; name: string }[];
  activeProfileName?: string;
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

const SYSTEM_PROMPT = `Tu es un assistant T1D (diabète de type 1) expert qui aide Ethan, 21 ans, sous Novorapid (rapide) + Toujeo (lente) + FreeStyle Libre 2 CGM.

Tu reçois un RAPPORT STATISTIQUE déterministe de la dernière semaine (TIR, patterns horaires, réponses post-repas par mealType, événements hypos/hypers, stats par profil ratio actif).

Ta mission : produire un bilan en langage naturel, court et actionnable.

═══════════════════════════════════════════════════════════════
RÈGLES DE SÉCURITÉ T1D — NON-NÉGOCIABLES
═══════════════════════════════════════════════════════════════

1. **JAMAIS d'auto-apply.** Toutes tes suggestions sont des PROPOSITIONS à valider par Ethan. Tu ne dois jamais formuler une suggestion comme une instruction ferme.

2. **Incréments max** :
   - Ratio bolus (X U pour 10g) : ±10% maximum par ajustement (ex: 1.0 → 1.1 max)
   - ISF (sensibilité, mg/dL par U) : ±10 mg/dL maximum (ex: 100 → 90 ou 110)
   - Basal (lente du soir) : ±1 U maximum
   - Toujours formuler comme "essayer de monter à X" pas "passer à X"

3. **Données insuffisantes → pas de suggestion concrète** :
   - Si la fenêtre fait < 14 jours OU si un bucket (mealType, créneau horaire) a < 3 injections, tu ne suggères PAS d'ajuster les ratios pour ce bucket. Tu observes seulement.
   - Si CV (variabilité) > 50% → trop de bruit pour conclure sur les ratios. Tu mentionnes la variabilité comme priorité 1 (régularité repas/horaires) avant tout ajustement.
   - Si pointsCount < 200 → tu mentionnes que la base est mince et tu réduis la confiance des suggestions.

4. **Patterns à détecter et nommer si présents** :
   - **Phénomène de l'aube** (5-9h glycémie qui monte sans manger) → suggestion : peut-être augmenter basal de 1U si répété (low confidence sans test).
   - **Remontée 16h** (15-18h glycémie qui monte après un goûter ou en fin d'après-midi) → vérifier ratio goûter ou besoin d'un mini-bolus de correction.
   - **Hypo post-repas** (glycémie < 80 dans les 3h après injection) → ratio peut-être trop fort pour ce repas (réduire de 10%).
   - **Pic post-repas excessif** (delta > 80 mg/dL ou peak > 220) → ratio trop faible OU injection trop tardive (timing).

5. **Hypos = priorité absolue** :
   - Si tu vois ≥ 2 hypos dans la semaine, tu mets ça en warning critique.
   - Tu ne suggères JAMAIS de monter un ratio si des hypos ont eu lieu sur cette période/repas.

6. **Tu rappelles toujours dans le summary** que les ajustements sont une discussion avec son endocrino/diabéto, pas une décision à prendre seul à partir d'une semaine de data.

7. **Confidence** :
   - "high" : ≥ 14j de data, ≥ 5 injections sur le bucket, pattern stable, pas de contre-indication
   - "medium" : ≥ 7j, ≥ 3 injections, pattern visible
   - "low" : < 7j, < 3 injections, ou CV élevé

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
  };

  const userPrompt = `Voici le rapport stats de la semaine d'Ethan.

PROFIL RATIO ACTIF : ${claudeContext.profileActif}
PÉRIODE : ${days} jours (${new Date(fromMs).toLocaleDateString("fr-FR")} → ${new Date(toMs).toLocaleDateString("fr-FR")})

RAPPORT JSON :
${JSON.stringify(claudeContext, null, 2)}

Génère le bilan au format JSON strict décrit dans tes instructions.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
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
