/**
 * GET /api/whoop/status — état de la connexion Whoop (booléen + info).
 *
 * Utilisé par la page paramètres pour afficher "Connecté" vs "Pas connecté".
 */

import { NextResponse } from "next/server";
import { isWhoopConfigured } from "@/lib/whoop/client";
import { getTokens, isKvConfigured } from "@/lib/whoop/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWhoopConfigured()) {
    return NextResponse.json({ configured: false, connected: false, reason: "not_configured" });
  }
  if (!isKvConfigured()) {
    return NextResponse.json({ configured: true, connected: false, reason: "kv_not_configured" });
  }
  const tokens = await getTokens();
  return NextResponse.json({
    configured: true,
    connected: !!tokens,
    connectedAt: tokens?.connectedAt ?? null,
    scope: tokens?.scope ?? null,
  });
}
