/**
 * Tests du Docteur (spec §7 — T1 à T5).
 *
 * Le moteur (lib/doctor/engine.ts) est testé avec des dépendances mockées
 * (pas d'appel Claude, pas de KV). Le store conversation réel est testé en
 * mode fallback mémoire (T5) — l'env de test n'a pas KV_REST_API_URL.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runDoctor,
  type DoctorEngineDeps,
  type DoctorRequestBody,
} from "./engine";
import {
  readConversation,
  appendMessages,
  clearConversation,
  isKvConfigured,
  truncateForContext,
  type DoctorMessage,
} from "./conversation-store";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import type { InsulinLog } from "@/types";

// ─── Fixtures ──────────────────────────────────────────────────────────

const NOW = new Date("2026-07-08T12:00:00").getTime();
const HOUR = 60 * 60 * 1000;

/** 5 points à 150 mg/dL répartis sur 5 heures distinctes (données minces). */
function mockPoints(): ArchivedPoint[] {
  return [1, 2, 3, 4, 5].map((i) => ({
    t: NOW - i * 5 * HOUR,
    value: 150,
    trend: "Flat",
    isHigh: false,
    isLow: false,
  }));
}

function mockInjection(): InsulinLog {
  return {
    id: "log-1",
    units: 6,
    insulinType: "rapid",
    mealType: "lunch",
    carbsGrams: 60,
    glucoseBefore: 150,
    notes: "",
    injectedAt: new Date(NOW - 3 * HOUR),
  };
}

/** Store conversation en mémoire, isolé par test. */
function memoryConversation() {
  const msgs: DoctorMessage[] = [];
  return {
    msgs,
    read: async () => [...msgs],
    append: async (_userId: string, add: DoctorMessage[]) => {
      msgs.push(...add);
      return [...msgs];
    },
  };
}

function makeDeps(
  claudeText: string,
  conv = memoryConversation(),
): DoctorEngineDeps & { conv: typeof conv } {
  return {
    conv,
    callClaude: async () => claudeText,
    readGlucosePoints: async () => mockPoints(),
    conversation: conv,
    nowMs: () => NOW,
  };
}

const VALID_ANALYSIS_JSON = JSON.stringify({
  summary: "TIR correct sur la période, glycémie moyenne 150 mg/dL. À valider avec ton diabéto.",
  highlights: ["Glycémie moyenne 150 mg/dL", "Aucune hypo détectée"],
  suggestions: [],
  warnings: [],
  message: "Ta période est stable autour de 150 mg/dL.",
  generatedAt: new Date(NOW).toISOString(),
});

// ─── T1 — mode analysis ────────────────────────────────────────────────

test("T1 · analysis : reply.summary non vide + 1 message kind=analysis persisté", async () => {
  const deps = makeDeps(VALID_ANALYSIS_JSON);
  const body: DoctorRequestBody = {
    mode: "analysis",
    days: 14,
    injections: [mockInjection()],
  };

  const { reply, conversation } = await runDoctor("me", body, deps);

  assert.ok(reply.summary && reply.summary.length > 0, "summary rempli");
  assert.ok(reply.message.length > 0, "message rempli");
  assert.equal(conversation.length, 1);
  assert.equal(conversation[0].role, "assistant");
  assert.equal(conversation[0].kind, "analysis");
  assert.ok(conversation[0].meta?.summary, "meta.summary persisté");
});

// ─── T2 — mode chat ────────────────────────────────────────────────────

test("T2 · chat : l'historique croît de 2 (user + assistant)", async () => {
  const conv = memoryConversation();
  // Conversation existante : un bilan déjà généré
  await conv.append("me", [
    {
      role: "assistant",
      content: "Bilan initial.",
      createdAt: new Date(NOW - HOUR).toISOString(),
      kind: "analysis",
    },
  ]);

  const deps = makeDeps(
    JSON.stringify({
      message: "Tes hypos nocturnes coïncident avec tes séances du soir.",
      generatedAt: new Date(NOW).toISOString(),
    }),
    conv,
  );

  const before = (await conv.read()).length;
  const { reply, conversation } = await runDoctor(
    "me",
    {
      mode: "chat",
      message: "Pourquoi je fais des hypos la nuit ?",
      days: 14,
      injections: [mockInjection()],
    },
    deps,
  );

  assert.equal(conversation.length, before + 2, "historique +2");
  assert.equal(conversation[before].role, "user");
  assert.equal(conversation[before].kind, "chat");
  assert.equal(conversation[before + 1].role, "assistant");
  assert.ok(reply.message.includes("hypos nocturnes"));
});

// ─── T3 — garde-fou anti-hallucination de doses ────────────────────────

test("T3 · dose inventée absente du contexte → retirée + warning", async () => {
  // 6U est ancré (injection de 6U dans le contexte) ; 47U ne l'est pas.
  const deps = makeDeps(
    JSON.stringify({
      message:
        "Ton bolus de 6U du midi est cohérent. Tu pourrais passer à 47U demain.",
      generatedAt: new Date(NOW).toISOString(),
    }),
  );

  const { reply } = await runDoctor(
    "me",
    { mode: "chat", message: "Que penses-tu de mon midi ?", days: 14, injections: [mockInjection()] },
    deps,
  );

  assert.ok(reply.message.includes("6U"), "dose ancrée conservée");
  assert.ok(!reply.message.includes("47U"), "dose inventée retirée");
  assert.ok(reply.message.includes("[dose retirée]"), "placeholder inséré");
  assert.ok(
    (reply.warnings ?? []).some((w) => w.includes("non vérifiables")),
    "warning anti-hallucination ajouté",
  );
});

// ─── T4 — data insuffisante : pas de suggestion concrète ──────────────

test("T4 · fenêtre < 14j : suggestions vidées, summary/warnings conservés", async () => {
  const deps = makeDeps(
    JSON.stringify({
      summary: "Semaine courte mais stable.",
      suggestions: [
        {
          area: "ratio-midi",
          suggestion: "Essayer de monter le ratio midi de 1U/10g à 1,1U/10g",
          rationale: "Pics post-déjeuner",
          confidence: "medium",
        },
      ],
      warnings: [],
      message: "Semaine stable.",
      generatedAt: new Date(NOW).toISOString(),
    }),
  );

  const { reply } = await runDoctor(
    "me",
    { mode: "analysis", days: 7, injections: [mockInjection()] },
    deps,
  );

  assert.equal(reply.suggestions?.length ?? 0, 0, "aucune suggestion concrète");
  assert.ok(reply.summary, "summary conservé");
  assert.ok(
    (reply.warnings ?? []).some((w) => w.includes("14j")),
    "warning règle 14j présent",
  );
});

// ─── T5 — fallback sans KV ─────────────────────────────────────────────

test("T5 · sans KV : store en mémoire fonctionne, la route répond sans crash", async () => {
  assert.equal(isKvConfigured(), false, "l'env de test n'a pas de KV");

  // Le vrai store conversation (fallback mémoire)
  await clearConversation("test-user");
  assert.deepEqual(await readConversation("test-user"), []);

  const { reply, conversation } = await runDoctor(
    "test-user",
    { mode: "analysis", days: 14, injections: [] },
    {
      callClaude: async () => VALID_ANALYSIS_JSON,
      readGlucosePoints: async () => [], // readPoints → [] sans KV
      conversation: {
        read: readConversation,
        append: appendMessages,
      },
      nowMs: () => NOW,
    },
  );

  assert.ok(reply.message.length > 0, "réponse produite sans KV");
  assert.equal(conversation.length, 1);
  assert.equal((await readConversation("test-user")).length, 1);

  await clearConversation("test-user");
  assert.deepEqual(await readConversation("test-user"), []);
});

// ─── Bonus — troncature du contexte conversation ───────────────────────

test("truncateForContext : borne aux N derniers messages", () => {
  const msgs: DoctorMessage[] = Array.from({ length: 30 }, (_, i) => ({
    role: i % 2 === 0 ? "user" : "assistant",
    content: `msg-${i}`,
    createdAt: new Date(NOW).toISOString(),
  }));
  const truncated = truncateForContext(msgs, 20);
  assert.equal(truncated.length, 20);
  assert.equal(truncated[0].content, "msg-10");
  assert.equal(truncated[19].content, "msg-29");
});
