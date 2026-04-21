/**
 * GET /api/cron/glucose-check
 *
 * Endpoint cron — appelé automatiquement par Vercel Cron toutes les 5 min
 * (voir vercel.json). Ne doit PAS être appelable publiquement : protégé par
 * un header `authorization: Bearer <CRON_SECRET>`.
 *
 * Vercel Cron ajoute automatiquement ce header si tu configures `authorization`
 * dans ton `vercel.json` (ou Vercel utilise sa propre signature — selon la
 * doc actuelle Vercel passe un header Bearer avec le CRON_SECRET défini dans
 * les env vars, si présent).
 *
 * En plus, on accepte l'appel manuel via `?secret=<CRON_SECRET>` pour pouvoir
 * le déclencher à la main pour debug.
 */

import { NextRequest, NextResponse } from "next/server";
import { PUSH_CONFIG } from "@/lib/push/config";
import { checkGlucoseAndAlert } from "@/lib/push/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30; // sec — LibreLink fetch + KV + web-push < 5s en régime normal

function isAuthorized(req: NextRequest): boolean {
  const expected = PUSH_CONFIG.cronSecret;
  if (!expected) return false; // sécurité : si pas de secret, on refuse tout

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;

  // Fallback : query param pour debug manuel
  const url = new URL(req.url);
  if (url.searchParams.get("secret") === expected) return true;

  return false;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json(
      {
        error: "unauthorized",
        message:
          "Missing or invalid CRON_SECRET. Set it in Vercel env vars and pass via Authorization header or ?secret= query.",
      },
      { status: 401 },
    );
  }

  const result = await checkGlucoseAndAlert();
  return NextResponse.json(result);
}
