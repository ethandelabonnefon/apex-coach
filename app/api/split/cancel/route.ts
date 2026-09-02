/**
 * DELETE /api/split/cancel — ALIAS de compatibilité.
 *
 * Voir app/api/split/schedule/route.ts pour le pourquoi de ce handler
 * délégué plutôt qu'un re-export ESM direct (non supporté par Turbopack
 * sur Next.js 16.2.1 pour `runtime`/`dynamic`).
 */
import type { NextRequest } from "next/server";
import { DELETE as cancelDELETE } from "@/app/api/reminders/cancel/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(req: NextRequest) {
  return cancelDELETE(req);
}
