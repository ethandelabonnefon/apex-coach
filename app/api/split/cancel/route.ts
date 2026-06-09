/**
 * DELETE /api/split/cancel?id=<reminderId>
 *
 * Supprime un split-dose reminder côté serveur. Appelé quand l'utilisateur :
 *  - confirme manuellement la dose dans l'app (handleConfirmSplitDose)
 *  - dismiss le reminder
 *  - supprime l'injection parente
 *
 * Pas d'authentification : app single-user.
 */

import { NextRequest, NextResponse } from "next/server";
import { removeReminder, isKvConfigured } from "@/lib/split-reminders/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json(
      { ok: false, error: "kv_not_configured" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { ok: false, error: "missing_id" },
      { status: 400 },
    );
  }

  try {
    await removeReminder(id);
    return NextResponse.json({ ok: true, removed: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[split/cancel] remove error:", msg);
    return NextResponse.json(
      { ok: false, error: "kv_error", message: msg },
      { status: 500 },
    );
  }
}
