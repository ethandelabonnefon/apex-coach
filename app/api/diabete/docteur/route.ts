/**
 * /api/diabete/docteur — "Le Docteur" : bilan + Q&A avec mémoire (Vercel KV).
 *
 * POST   { mode: "analysis" | "chat", message?, days?, injections, ... }
 *        → { reply, conversation }   (voir lib/doctor/engine.ts pour le contrat)
 * GET    → { conversation }          (hydratation initiale de la page)
 * DELETE → { ok: true }              (effacer la conversation)
 *
 * Toute la logique (contexte borné, garde-fous durs, persistance) vit dans
 * lib/doctor/engine.ts — cette route ne fait que brancher Anthropic + KV.
 *
 * ⚠️ Sécurité T1D : mêmes règles que weekly-insight (lib/doctor/t1d-safety-rules)
 * + validateur anti-hallucination de doses côté serveur (lib/doctor/dose-guard).
 * Aucun dosage auto-appliqué, décision finale = utilisateur.
 */

import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { readPoints, isKvConfigured } from "@/lib/glucose-archive/store";
import { runDoctor, type DoctorRequestBody } from "@/lib/doctor/engine";
import {
  DOCTOR_USER_ID,
  readConversation,
  appendMessages,
  clearConversation,
} from "@/lib/doctor/conversation-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const anthropic = new Anthropic();

export async function POST(req: NextRequest) {
  let body: DoctorRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (body.mode !== "analysis" && body.mode !== "chat") {
    return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
  }
  if (body.mode === "chat" && !body.message?.trim()) {
    return NextResponse.json({ error: "message_required" }, { status: 400 });
  }

  try {
    const { reply, conversation } = await runDoctor(DOCTOR_USER_ID, body, {
      callClaude: async ({ system, messages }) => {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-5",
          thinking: { type: "disabled" },
          max_tokens: 1500,
          system,
          messages,
        });
        const textBlock = response.content.find((b) => b.type === "text");
        if (!textBlock || textBlock.type !== "text") {
          throw new Error("Pas de réponse texte de Claude");
        }
        return textBlock.text;
      },
      // Sans KV : readPoints renvoie [] — le Docteur répond quand même
      // (fallback dégradé, rapport vide + contexte injections client).
      readGlucosePoints: (fromMs, toMs) => readPoints(fromMs, toMs),
      conversation: { read: readConversation, append: appendMessages },
    });

    return NextResponse.json({
      reply,
      conversation,
      kvConfigured: isKvConfigured(),
    });
  } catch (err) {
    console.error("[docteur] error:", err);
    return NextResponse.json(
      {
        error: "claude_failed",
        message: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  const conversation = await readConversation(DOCTOR_USER_ID);
  return NextResponse.json({ conversation, kvConfigured: isKvConfigured() });
}

export async function DELETE() {
  await clearConversation(DOCTOR_USER_ID);
  return NextResponse.json({ ok: true });
}
