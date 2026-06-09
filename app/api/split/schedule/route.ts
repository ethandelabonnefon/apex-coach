/**
 * POST /api/split/schedule
 *
 * Crée ou met à jour un split-dose reminder côté serveur. Appelé par
 * l'app cliente à la création d'un split, en fire-and-forget.
 *
 * Body attendu :
 *   { id: string, parentInjectionId: string, units: number,
 *     triggerAt: string (ISO), mealLabel?: string }
 *
 * Pas d'authentification : app single-user. Si tu passes multi-user un
 * jour, ajoute une vérif de session.
 */

import { NextRequest, NextResponse } from "next/server";
import { upsertReminder, isKvConfigured } from "@/lib/split-reminders/store";
import type { SplitDoseReminder } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json(
      { ok: false, error: "kv_not_configured" },
      { status: 503 },
    );
  }

  let body: Partial<SplitDoseReminder>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  // Validation minimale
  if (
    !body.id ||
    !body.parentInjectionId ||
    typeof body.units !== "number" ||
    body.units <= 0 ||
    !body.triggerAt
  ) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_fields",
        message:
          "Required: id, parentInjectionId, units (>0), triggerAt (ISO).",
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

  const reminder: SplitDoseReminder = {
    id: body.id,
    parentInjectionId: body.parentInjectionId,
    units: body.units,
    triggerAt: body.triggerAt,
    createdAt: body.createdAt ?? new Date().toISOString(),
    mealLabel: body.mealLabel,
    status: "pending",
  };

  try {
    await upsertReminder(reminder);
    return NextResponse.json({ ok: true, scheduled: reminder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[split/schedule] upsert error:", msg);
    return NextResponse.json(
      { ok: false, error: "kv_error", message: msg },
      { status: 500 },
    );
  }
}
