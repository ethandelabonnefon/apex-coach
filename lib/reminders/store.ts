/**
 * Rappels serveur (split dose + confirmation de repas) — stockage KV.
 *
 * App single-user → un seul array de reminders en KV. Survit aux
 * fermetures d'app PWA et permet au cron de tirer les notifs même
 * quand l'utilisateur n'a pas l'app ouverte.
 *
 * Schéma KV :
 *   "split:reminders" → Reminder[]
 *
 * ⚠️ Ne PAS renommer cette clé KV : des rappels sont potentiellement déjà
 * programmés en production sous cette clé (héritée du pipeline split-only
 * de juin 2026). La renommer les rendrait invisibles au cron.
 *
 * On garde max 100 reminders (sécurité), les anciens "dismissed" ou
 * "fired" de + de 48h sont auto-purgés à chaque écriture.
 *
 * ⚠️ Server only.
 */

import "server-only";
import { kv } from "@vercel/kv";
import type { Reminder } from "@/types";

const K_REMINDERS = "split:reminders";
const MAX_REMINDERS = 100;
const PURGE_AFTER_MS = 48 * 3_600_000; // 48h après fired/dismissed

export function isKvConfigured(): boolean {
  return Boolean(process.env.KV_REST_API_URL || process.env.KV_URL);
}

/** Charge la liste complète (KV peut retourner null si jamais set). */
export async function getAllReminders(): Promise<Reminder[]> {
  try {
    const list = await kv.get<Reminder[]>(K_REMINDERS);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error("[reminders/store] get error:", err);
    return [];
  }
}

/** Sauve la liste (auto-purge des vieux + cap à MAX_REMINDERS). */
async function saveAll(list: Reminder[]): Promise<void> {
  const now = Date.now();
  const pruned = list
    .filter((r) => {
      // Garde les pending toujours, purge fired/dismissed après 48h
      if (r.status === "pending") return true;
      const triggerMs = new Date(r.triggerAt).getTime();
      return now - triggerMs < PURGE_AFTER_MS;
    })
    .slice(0, MAX_REMINDERS);
  await kv.set(K_REMINDERS, pruned);
}

/** Ajoute / remplace un reminder (idempotent via l'id). */
export async function upsertReminder(
  reminder: Reminder,
): Promise<void> {
  const list = await getAllReminders();
  const filtered = list.filter((r) => r.id !== reminder.id);
  filtered.unshift(reminder);
  await saveAll(filtered);
}

/** Retourne les reminders à déclencher (pending + triggerAt ≤ now). */
export async function getDueReminders(
  now: number = Date.now(),
): Promise<Reminder[]> {
  const list = await getAllReminders();
  return list.filter(
    (r) => r.status === "pending" && new Date(r.triggerAt).getTime() <= now,
  );
}

/** Marque comme "fired" après envoi push réussi. */
export async function markFired(id: string): Promise<void> {
  const list = await getAllReminders();
  const next = list.map((r) =>
    r.id === id ? { ...r, status: "fired" as const } : r,
  );
  await saveAll(next);
}

/** Supprime un reminder (utilisateur a confirmé / dismiss / annule). */
export async function removeReminder(id: string): Promise<void> {
  const list = await getAllReminders();
  const next = list.filter((r) => r.id !== id);
  await saveAll(next);
}
