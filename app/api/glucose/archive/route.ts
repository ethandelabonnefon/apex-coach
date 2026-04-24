/**
 * GET /api/glucose/archive?days=7|14|30|90
 *
 * Lit les points archivés dans Vercel KV. Pas d'auth (on expose uniquement
 * les points glycémiques, aucun PII sensible côté client).
 *
 * Query params :
 *   - days : fenêtre en jours (default 30, max 90)
 *
 * Réponse :
 *   {
 *     points: [{ t, value, trend, isHigh, isLow }, …],
 *     range: { fromMs, toMs },
 *     meta: { total, latestTs, oldestTs },
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  readPoints,
  getArchiveMeta,
  RETENTION_DAYS,
  isKvConfigured,
} from "@/lib/glucose-archive/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json({
      points: [],
      range: { fromMs: 0, toMs: 0 },
      meta: { total: 0, latestTs: null, oldestTs: null },
      warning: "KV not configured — archive unavailable",
    });
  }

  const url = new URL(req.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "30");
  const days = Math.max(1, Math.min(RETENTION_DAYS, Number.isFinite(daysRaw) ? daysRaw : 30));

  const toMs = Date.now();
  const fromMs = toMs - days * 24 * 60 * 60 * 1000;

  try {
    const [points, meta] = await Promise.all([
      readPoints(fromMs, toMs),
      getArchiveMeta(),
    ]);

    return NextResponse.json({
      points,
      range: { fromMs, toMs, days },
      meta,
    });
  } catch (err) {
    console.error("[api/glucose/archive] error:", err);
    return NextResponse.json(
      { error: "archive_read_failed", message: err instanceof Error ? err.message : "unknown" },
      { status: 500 },
    );
  }
}
