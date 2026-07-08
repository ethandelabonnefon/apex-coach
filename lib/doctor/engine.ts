/**
 * Docteur — moteur d'orchestration de la route /api/diabete/docteur.
 *
 * Séparé de la route pour être testable avec node:test (les dépendances
 * externes — appel Claude, lecture archive KV, store conversation — sont
 * injectées via `DoctorEngineDeps`).
 *
 * Garde-fous durs appliqués CÔTÉ SERVEUR (en plus du system prompt) :
 *  - fenêtre < 14j → suggestions vidées (observation seulement) + warning
 *  - CV > 50 → suggestions ratio/isf/basal retirées + warning
 *  - doses numériques non ancrées dans le contexte → retirées (dose-guard)
 */

import {
  buildDoctorContext,
  type ClientDetectedPattern,
  type MealContextEntry,
  type WorkoutSummary,
} from "./context-builder";
import {
  collectAllowedNumbers,
  sanitizeDoses,
  DOSE_WARNING,
} from "./dose-guard";
import { T1D_SAFETY_RULES } from "./t1d-safety-rules";
import {
  truncateForContext,
  type DoctorMessage,
  type DoctorReplyMeta,
} from "./conversation-store";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import type { InsulinLog } from "@/types";

// ───────────────────────────────────────────────────────────────────────
// Types du contrat API (§4 de la spec)
// ───────────────────────────────────────────────────────────────────────

export interface DoctorRequestBody {
  mode: "analysis" | "chat";
  message?: string;
  days?: number; // défaut 14, max 90
  injections?: InsulinLog[];
  detectedPatterns?: ClientDetectedPattern[];
  workoutSessions?: WorkoutSummary[];
  mealContext?: MealContextEntry[];
  activeProfileName?: string;
}

export interface DoctorReply extends DoctorReplyMeta {
  /** Texte principal affiché (analysis : synthèse ; chat : réponse). */
  message: string;
  generatedAt: string;
}

export interface DoctorEngineDeps {
  /** Appel Claude — renvoie le texte brut de la réponse. */
  callClaude: (args: {
    system: string;
    messages: { role: "user" | "assistant"; content: string }[];
  }) => Promise<string>;
  /** Lecture des points glycémie archivés (readPoints — [] sans KV). */
  readGlucosePoints: (fromMs: number, toMs: number) => Promise<ArchivedPoint[]>;
  conversation: {
    read: (userId: string) => Promise<DoctorMessage[]>;
    append: (
      userId: string,
      msgs: DoctorMessage[],
    ) => Promise<DoctorMessage[]>;
  };
  nowMs?: () => number;
}

export const DEFAULT_DAYS = 14;
export const MAX_DAYS = 90;

// ───────────────────────────────────────────────────────────────────────
// System prompt "Docteur" (§5) — identité + règles weekly-insight + format
// ───────────────────────────────────────────────────────────────────────

export const DOCTOR_SYSTEM_PROMPT = `Tu es "Le Docteur", l'assistant clinique et comportemental d'APEX pour Ethan, 21 ans, diabétique de type 1 sous Novorapid (rapide) + Lantus 28U le soir (lente) + FreeStyle Libre 2 CGM. Tu raisonnes sur les interactions basal / bolus / repas / sport / sommeil / glycémie. Tu OBSERVES, EXPLIQUES et PROPOSES des hypothèses — tu ne prescris jamais, tu n'appliques jamais de changement, tu n'inventes aucun chiffre absent du contexte fourni.

Tu reçois un RAPPORT déterministe (TIR, patterns horaires, réponses post-repas, événements hypos/hypers) + des PATTERNS déjà calculés + le contexte sport/repas. Tu ne recalcules pas les stats : tu t'appuies dessus.

Quand une hypothèse implique une chaîne (ex. baisser la lente), tu SIGNALES les répercussions à revoir (bolus matin/midi/soir) sans donner de dose.

${T1D_SAFETY_RULES}

Termine toute suggestion d'ajustement par : "Hypothèse à valider avec ton suivi médical." Réponds en français, clair et non anxiogène.

═══════════════════════════════════════════════════════════════
FORMAT DE RÉPONSE — JSON STRICT
═══════════════════════════════════════════════════════════════

Tu réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de prose autour) :

{
  "summary": "En mode BILAN : 2-4 phrases qui résument la période (TIR %, événements marquants, rappel validation médecin). En mode CHAT : omets ce champ.",
  "highlights": ["2 à 4 points clés factuels — mode BILAN uniquement"],
  "suggestions": [
    {
      "area": "ratio-midi" | "ratio-matin" | "ratio-soir" | "ratio-snack" | "isf" | "basal" | "timing" | "regularite" | "autre",
      "suggestion": "Phrase actionnable courte",
      "rationale": "Une phrase qui explique POURQUOI à partir des stats (chiffres précis du rapport)",
      "confidence": "low" | "medium" | "high"
    }
  ],
  "warnings": ["Alertes safety — vide si rien"],
  "message": "TOUJOURS rempli : le texte principal affiché à Ethan, en texte brut (PAS de markdown : pas de **, pas de #, tirets simples autorisés). Mode BILAN : synthèse conversationnelle du bilan. Mode CHAT : ta réponse à sa question, en t'appuyant sur le rapport et l'historique de conversation.",
  "generatedAt": "ISO timestamp"
}

Tu produis MAX 4 suggestions, max 4 highlights, max 3 warnings. Tout en français.`;

// ───────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────

function clampDays(raw: unknown): number {
  const n = Number(raw ?? DEFAULT_DAYS);
  return Math.max(1, Math.min(MAX_DAYS, Number.isFinite(n) ? n : DEFAULT_DAYS));
}

/** Parse défensif du JSON Claude (markdown fences, prose autour, etc.). */
export function parseDoctorReply(raw: string): DoctorReply {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
    if (parsed && typeof parsed === "object") {
      const p = parsed as Partial<DoctorReply>;
      return {
        summary: typeof p.summary === "string" ? p.summary : undefined,
        highlights: Array.isArray(p.highlights) ? p.highlights : undefined,
        suggestions: Array.isArray(p.suggestions) ? p.suggestions : undefined,
        warnings: Array.isArray(p.warnings) ? p.warnings : undefined,
        message:
          typeof p.message === "string" && p.message.trim()
            ? p.message
            : (p.summary ?? text),
        generatedAt:
          typeof p.generatedAt === "string"
            ? p.generatedAt
            : new Date().toISOString(),
      };
    }
  } catch {
    // fallback prose brute ci-dessous
  }
  return { message: text, generatedAt: new Date().toISOString() };
}

/**
 * L'API Messages exige une alternance stricte user/assistant : on fusionne
 * les messages consécutifs de même rôle (ex. contexte + question user).
 */
export function mergeConsecutiveRoles(
  msgs: { role: "user" | "assistant"; content: string }[],
): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of msgs) {
    const last = out[out.length - 1];
    if (last && last.role === m.role) {
      last.content = `${last.content}\n\n${m.content}`;
    } else {
      out.push({ ...m });
    }
  }
  return out;
}

/** Rendu texte d'un bilan pour l'historique de conversation. */
function formatAnalysisForHistory(reply: DoctorReply): string {
  const parts: string[] = [];
  if (reply.summary) parts.push(reply.summary);
  if (reply.message && reply.message !== reply.summary)
    parts.push(reply.message);
  if (reply.highlights?.length)
    parts.push(reply.highlights.map((h) => `• ${h}`).join("\n"));
  if (reply.suggestions?.length)
    parts.push(
      reply.suggestions
        .map((s) => `→ [${s.area}] ${s.suggestion} (${s.rationale})`)
        .join("\n"),
    );
  if (reply.warnings?.length)
    parts.push(reply.warnings.map((w) => `⚠ ${w}`).join("\n"));
  return parts.join("\n\n") || reply.message;
}

/** Garde-fous durs post-Claude (data insuffisante, CV, doses inventées). */
export function applyHardGuards(
  reply: DoctorReply,
  args: {
    days: number;
    cv: number;
    allowedNumbers: Set<number>;
  },
): DoctorReply {
  const warnings = [...(reply.warnings ?? [])];
  let suggestions = reply.suggestions ?? [];

  // Règle héritée de weekly-insight : < 14j → observation seulement
  if (args.days < 14 && suggestions.length > 0) {
    suggestions = [];
    warnings.push(
      `Fenêtre de ${args.days}j < 14j : pas de suggestion d'ajustement concrète — observations seulement (règle de sécurité T1D).`,
    );
  }

  // CV > 50 → pas de conclusion sur les ratios/isf/basal
  if (args.cv > 50) {
    const before = suggestions.length;
    suggestions = suggestions.filter(
      (s) => !/^(ratio-|isf$|basal$)/.test(s.area),
    );
    if (suggestions.length < before) {
      warnings.push(
        "CV > 50% : trop de variabilité pour conclure sur les ratios — suggestions de dosage retirées.",
      );
    }
  }

  // Anti-hallucination : doses non ancrées dans le contexte
  let doseRemoved = false;
  const clean = (text: string): string => {
    const { text: t, removed } = sanitizeDoses(text, args.allowedNumbers);
    if (removed.length > 0) doseRemoved = true;
    return t;
  };

  const out: DoctorReply = {
    ...reply,
    message: clean(reply.message),
    summary: reply.summary ? clean(reply.summary) : undefined,
    highlights: reply.highlights?.map(clean),
    suggestions: suggestions.map((s) => ({
      ...s,
      suggestion: clean(s.suggestion),
      rationale: clean(s.rationale),
    })),
    warnings,
  };

  if (doseRemoved) out.warnings = [...(out.warnings ?? []), DOSE_WARNING];
  return out;
}

// ───────────────────────────────────────────────────────────────────────
// Orchestration
// ───────────────────────────────────────────────────────────────────────

export async function runDoctor(
  userId: string,
  body: DoctorRequestBody,
  deps: DoctorEngineDeps,
): Promise<{ reply: DoctorReply; conversation: DoctorMessage[] }> {
  const now = deps.nowMs ? deps.nowMs() : Date.now();
  const days = clampDays(body.days);
  const fromMs = now - days * 24 * 60 * 60 * 1000;

  const points = await deps.readGlucosePoints(fromMs, now);

  const { report, payload } = buildDoctorContext({
    points,
    injections: body.injections ?? [],
    range: { fromMs, toMs: now, days },
    detectedPatterns: body.detectedPatterns,
    workoutSessions: body.workoutSessions,
    mealContext: body.mealContext,
    activeProfileName: body.activeProfileName,
  });

  const history = truncateForContext(await deps.conversation.read(userId));

  const contextBlock = `CONTEXTE (rapport déterministe + patterns + sport + repas — période ${days}j, ${new Date(fromMs).toLocaleDateString("fr-FR")} → ${new Date(now).toLocaleDateString("fr-FR")}) :

${JSON.stringify(payload)}

Tu t'appuies UNIQUEMENT sur ce contexte et sur la conversation qui suit. Aucun chiffre inventé.`;

  const instruction =
    body.mode === "chat"
      ? (body.message ?? "")
      : "Génère le bilan de la période (mode BILAN) au format JSON strict décrit dans tes instructions.";

  const messages = mergeConsecutiveRoles([
    { role: "user" as const, content: contextBlock },
    ...history.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: instruction },
  ]);

  const raw = await deps.callClaude({
    system: DOCTOR_SYSTEM_PROMPT,
    messages,
  });

  let reply = parseDoctorReply(raw);
  if (!reply.generatedAt) reply.generatedAt = new Date(now).toISOString();

  // Ancres autorisées pour les doses : contexte + historique + message user
  const allowedNumbers = collectAllowedNumbers(payload, [
    ...history.map((m) => m.content),
    body.message ?? "",
  ]);

  reply = applyHardGuards(reply, {
    days,
    cv: report.overall.cv,
    allowedNumbers,
  });

  // Persistance
  const createdAt = new Date(now).toISOString();
  const toAppend: DoctorMessage[] = [];
  if (body.mode === "chat" && body.message) {
    toAppend.push({
      role: "user",
      content: body.message,
      createdAt,
      kind: "chat",
    });
  }
  toAppend.push({
    role: "assistant",
    content:
      body.mode === "analysis" ? formatAnalysisForHistory(reply) : reply.message,
    createdAt: new Date().toISOString(),
    kind: body.mode === "analysis" ? "analysis" : "chat",
    meta:
      body.mode === "analysis"
        ? {
            summary: reply.summary,
            highlights: reply.highlights,
            suggestions: reply.suggestions,
            warnings: reply.warnings,
          }
        : undefined,
  });

  const conversation = await deps.conversation.append(userId, toAppend);

  return { reply, conversation };
}
