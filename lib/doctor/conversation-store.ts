/**
 * Docteur — persistance de la conversation (Vercel KV).
 *
 * Même modèle que `lib/push/store.ts` / `lib/glucose-archive/store.ts` :
 * une clé KV par utilisateur (`doctor:conv:${userId}`), app single-user
 * (userId = "me" tant qu'il n'y a pas d'auth).
 *
 * Sans KV configuré (dev local, tests) → fallback en mémoire (Map module-level).
 * En serverless le fallback ne survit pas aux cold-starts — c'est un mode
 * dégradé assumé, l'app reste fonctionnelle.
 *
 * ⚠️ Code serveur (à importer uniquement depuis les routes API). Pas de
 * `import "server-only"` ici pour rester exécutable dans les tests node
 * (`npm test`), comme les pure functions de lib/.
 */

import { kv } from "@vercel/kv";

export const DOCTOR_USER_ID = "me";

/** Nb max de messages envoyés à Claude comme contexte conversationnel. */
export const MAX_CONTEXT_MESSAGES = 20;

/** Nb max de messages conservés en stockage (au-delà on tronque les plus vieux). */
const MAX_STORED_MESSAGES = 200;

export interface DoctorReplyMeta {
  summary?: string;
  highlights?: string[];
  suggestions?: {
    area: string;
    suggestion: string;
    rationale: string;
    confidence: "low" | "medium" | "high";
  }[];
  warnings?: string[];
}

export interface DoctorMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string; // ISO
  /** 'analysis' = bilan auto généré, 'chat' = échange libre. */
  kind?: "analysis" | "chat";
  /** Structure du bilan (kind analysis) pour ré-afficher les cards après refresh. */
  meta?: DoctorReplyMeta;
}

const keyFor = (userId: string) => `doctor:conv:${userId}`;

/** Check si Vercel KV est configuré (évite les crashes en dev local sans KV). */
export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.KV_URL);
}

/** Fallback en mémoire quand KV absent (dev local / tests). */
const memoryStore = new Map<string, DoctorMessage[]>();

export async function readConversation(
  userId: string,
): Promise<DoctorMessage[]> {
  if (!isKvConfigured()) {
    return memoryStore.get(keyFor(userId)) ?? [];
  }
  try {
    const msgs = await kv.get<DoctorMessage[]>(keyFor(userId));
    return Array.isArray(msgs) ? msgs : [];
  } catch (err) {
    console.error("[doctor/conversation-store] read error:", err);
    return [];
  }
}

export async function appendMessages(
  userId: string,
  msgs: DoctorMessage[],
): Promise<DoctorMessage[]> {
  const current = await readConversation(userId);
  const next = [...current, ...msgs].slice(-MAX_STORED_MESSAGES);
  if (!isKvConfigured()) {
    memoryStore.set(keyFor(userId), next);
    return next;
  }
  try {
    await kv.set(keyFor(userId), next);
  } catch (err) {
    console.error("[doctor/conversation-store] append error:", err);
  }
  return next;
}

export async function clearConversation(userId: string): Promise<void> {
  if (!isKvConfigured()) {
    memoryStore.delete(keyFor(userId));
    return;
  }
  try {
    await kv.del(keyFor(userId));
  } catch (err) {
    console.error("[doctor/conversation-store] clear error:", err);
  }
}

/** Tronque l'historique aux N derniers messages pour borner les tokens. */
export function truncateForContext(
  msgs: DoctorMessage[],
  max: number = MAX_CONTEXT_MESSAGES,
): DoctorMessage[] {
  return msgs.length <= max ? msgs : msgs.slice(-max);
}
