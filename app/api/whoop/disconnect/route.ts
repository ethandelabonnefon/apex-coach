/**
 * POST /api/whoop/disconnect — supprime les tokens Whoop stockés.
 *
 * Note : ne révoque pas le grant côté Whoop (API Whoop ne fournit pas
 * d'endpoint de révocation). L'utilisateur devra aussi révoquer manuellement
 * via developer.whoop.com s'il veut vraiment couper l'accès.
 */

import { NextResponse } from "next/server";
import { clearTokens, isKvConfigured } from "@/lib/whoop/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (!isKvConfigured()) {
    return NextResponse.json({ ok: false, error: "kv_not_configured" }, { status: 503 });
  }
  await clearTokens();
  return NextResponse.json({ ok: true });
}
