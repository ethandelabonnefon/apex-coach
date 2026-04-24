/**
 * GET /api/cron/archive-glucose
 *
 * Cron d'archivage des lectures CGM — appelé toutes les 4h par cron-job.org.
 *
 * Flow :
 *   1. Auth (Bearer CRON_SECRET ou ?secret=…)
 *   2. Fetch snapshot Libre (current + 8h history à 15min)
 *   3. Convertit les points vers `ArchivedPoint` (timestamp ms + value + trend)
 *   4. Insert avec dédupe dans KV sorted set
 *   5. Purge les points > 90 jours
 *   6. Retourne les stats pour observabilité
 *
 * Fréquence cron = 4h → chevauchement double de l'historique Libre (8h) pour
 * redondance en cas d'échec d'un cron (le prochain rattrape toujours).
 */

import { NextRequest, NextResponse } from "next/server";
import { PUSH_CONFIG } from "@/lib/push/config";
import { fetchGlucoseSnapshot } from "@/lib/libre-link/client";
import {
  archivePoints,
  purgeOldPoints,
  getArchiveMeta,
  isKvConfigured,
  type ArchivedPoint,
} from "@/lib/glucose-archive/store";

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
        message: "Missing or invalid CRON_SECRET",
      },
      { status: 401 },
    );
  }

  if (!isKvConfigured()) {
    return NextResponse.json(
      {
        error: "kv_not_configured",
        message: "Vercel KV store required for archive.",
      },
      { status: 500 },
    );
  }

  try {
    const snapshot = await fetchGlucoseSnapshot();

    // On archive TOUT : current + historique (8h). Le set dédupe par timestamp.
    const allReadings = [snapshot.current, ...snapshot.history];
    const points: ArchivedPoint[] = allReadings
      .map((r) => ({
        t: new Date(r.date).getTime(),
        value: r.value,
        trend: r.trend,
        isHigh: r.isHigh,
        isLow: r.isLow,
      }))
      .filter((p) => Number.isFinite(p.t) && p.t > 0);

    const { inserted, skipped } = await archivePoints(points);
    const purged = await purgeOldPoints();
    const meta = await getArchiveMeta();

    return NextResponse.json({
      status: "ok",
      archived: {
        inserted,
        skipped,
        purged,
      },
      meta,
      ts: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/archive-glucose] error:", err);
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json(
      { status: "error", message },
      { status: 500 },
    );
  }
}
