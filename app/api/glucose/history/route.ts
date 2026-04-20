/**
 * GET /api/glucose/history
 *
 * Renvoie la dernière lecture + l'historique des ~8 dernières heures
 * (points glycémiques à 15 min de résolution) depuis FreeStyle Libre 2.
 *
 * Réponse :
 *   {
 *     current: { value, trend, tone, arrow, ..., date, isHigh, isLow },
 *     history: [{ value, date, isHigh, isLow, trend }, ...]   // ordre chronologique
 *   }
 */

import { NextResponse } from "next/server";
import { fetchGlucoseSnapshot } from "@/lib/libre-link/client";
import { isLibreLinkConfigured } from "@/lib/libre-link/config";
import {
  glucoseTone,
  glucoseToneLabel,
  trendArrow,
  trendLabel,
} from "@/lib/libre-link/utils";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  if (!isLibreLinkConfigured()) {
    return NextResponse.json(
      {
        error: "librelink_not_configured",
        message:
          "LIBRELINK_EMAIL et LIBRELINK_PASSWORD manquants dans l'environnement serveur.",
      },
      { status: 503 },
    );
  }

  try {
    const { current, history } = await fetchGlucoseSnapshot();
    const tone = glucoseTone(current.value);

    // Tri chronologique croissant (du plus ancien au plus récent)
    const sortedHistory = [...history].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return NextResponse.json({
      current: {
        value: current.value,
        trend: current.trend,
        tone,
        arrow: trendArrow(current.trend),
        trendLabel: trendLabel(current.trend),
        statusLabel: glucoseToneLabel(tone),
        date: current.date,
        isHigh: current.isHigh,
        isLow: current.isLow,
      },
      history: sortedHistory,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[glucose/history] fetch failed:", message);
    return NextResponse.json(
      { error: "librelink_fetch_failed", message },
      { status: 502 },
    );
  }
}
