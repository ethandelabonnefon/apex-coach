/**
 * GET /api/glucose/current
 *
 * Renvoie la dernière lecture glycémique du capteur FreeStyle Libre 2,
 * augmentée des méta-données utiles (tonalité, flèche, label FR).
 *
 * Réponse :
 *   { value: number, trend, tone, arrow, label, date, isHigh, isLow }
 *
 * Erreurs :
 *   503 — credentials non configurés
 *   502 — échec côté API Abbott (réseau, login, etc.)
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
    const { current } = await fetchGlucoseSnapshot();
    const tone = glucoseTone(current.value);
    return NextResponse.json({
      value: current.value,
      trend: current.trend,
      tone,
      arrow: trendArrow(current.trend),
      trendLabel: trendLabel(current.trend),
      statusLabel: glucoseToneLabel(tone),
      date: current.date,
      isHigh: current.isHigh,
      isLow: current.isLow,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.error("[glucose/current] fetch failed:", message);
    return NextResponse.json(
      { error: "librelink_fetch_failed", message },
      { status: 502 },
    );
  }
}
