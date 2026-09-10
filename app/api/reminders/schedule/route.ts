/**
 * POST /api/reminders/schedule
 *
 * Crée ou met à jour un rappel côté serveur (split dose ou confirmation
 * de repas). Appelé par l'app cliente à la création du rappel, en
 * fire-and-forget.
 *
 * Body attendu :
 *   { id: string, kind?: 'split' | 'meal-confirm' | 'post-session',
 *     parentInjectionId: string,
 *     units: number, triggerAt: string (ISO), mealLabel?: string,
 *     carbsEstimated?: number }
 *
 * Pas d'authentification : app single-user. Si tu passes multi-user un
 * jour, ajoute une vérif de session.
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertReminder, isKvConfigured } from "@/lib/reminders/store";
import type { Reminder, ReminderKind } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json(
      { ok: false, error: "kv_not_configured" },
      { status: 503 },
    );
  }

  let body: Partial<Reminder>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  // Nature du rappel. Inconnue ou absente → 'split' : c'est la seule qui
  // existait avant septembre 2026, donc le repli rétrocompatible.
  const kind: ReminderKind =
    body.kind === "meal-confirm" || body.kind === "post-session"
      ? body.kind
      : "split";

  // Validation minimale. `units > 0` est exigé de tout rappel qui ORDONNE
  // une injection (split, appoint post-séance) : un meal-confirm peut
  // légitimement avoir units = 0 (glucides loggés sans insuline — oubli,
  // correction à zéro) où `units` n'est qu'un contexte d'affichage.
  const ordersADose = kind !== "meal-confirm";
  if (
    !body.id ||
    !body.parentInjectionId ||
    typeof body.units !== "number" ||
    (ordersADose && body.units <= 0) ||
    body.units < 0 ||
    !body.triggerAt
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_fields",
        message:
          "Required: id, parentInjectionId, units (>0 for split & post-session, >=0 for meal-confirm), triggerAt (ISO).",
      },
      { status: 400 },
    );
  }

  // Sanity check : triggerAt doit être parseable
  const triggerMs = new Date(body.triggerAt).getTime();
  if (isNaN(triggerMs)) {
    return NextResponse.json(
      { ok: false, error: "invalid_triggerAt" },
      { status: 400 },
    );
  }

  const reminder: Reminder = {
    id: body.id,
    kind,
    parentInjectionId: body.parentInjectionId,
    units: body.units,
    triggerAt: body.triggerAt,
    createdAt: body.createdAt ?? new Date().toISOString(),
    mealLabel: body.mealLabel,
    carbsEstimated: body.carbsEstimated,
    status: "pending",
  };

  try {
    await upsertReminder(reminder);
    return NextResponse.json({ ok: true, scheduled: reminder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[reminders/schedule] upsert error:", msg);
    return NextResponse.json(
      { ok: false, error: "kv_error", message: msg },
      { status: 500 },
    );
  }
}
