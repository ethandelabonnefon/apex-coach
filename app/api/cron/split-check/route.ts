/**
 * GET /api/cron/split-check
 *
 * Endpoint cron — appelé par Vercel Cron toutes les minutes (cf. vercel.json).
 * Protégé par CRON_SECRET (header Authorization Bearer ou ?secret= en query).
 *
 * Pour chaque rappel (split-dose ou confirmation de repas) dont triggerAt ≤ now
 * et status === pending :
 *   1. Envoie un push VAPID
 *   2. Marque le reminder "fired" en KV
 *
 * Latence garantie ≤ 1 min entre triggerAt et notif sur device.
 */

import { NextRequest, NextResponse } from "next/server";
import { PUSH_CONFIG } from "@/lib/push/config";
import { checkRemindersAndAlert } from "@/lib/reminders/check";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function isAuthorized(req: NextRequest): boolean {
  const expected = PUSH_CONFIG.cronSecret;
  if (!expected) return false;

  const auth = req.headers.get("authorization");
  if (auth === `Bearer ${expected}`) return true;

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

  const result = await checkRemindersAndAlert();
  return NextResponse.json(result);
}
