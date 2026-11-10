/**
 * GET /api/whoop/strain-history?tz=<fuseau IANA> — strain Whoop par jour
 * local sur 14 jours.
 *
 * Alimente l'analyse de la lente : une charge d'activité inhabituelle est la
 * cause la plus fréquente d'hypos qui apparaissent d'un coup à toute heure.
 * Le fuseau vient du navigateur (le serveur tourne en UTC).
 */

import { NextRequest, NextResponse } from "next/server";
import { isValidTimeZone } from "@/lib/local-time";
import { loadDailyStrain } from "@/lib/whoop/strain-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tz = new URL(req.url).searchParams.get("tz");
  if (!isValidTimeZone(tz)) {
    return NextResponse.json({ connected: false, days: [], reason: "missing_time_zone" });
  }
  const days = await loadDailyStrain(tz);
  return NextResponse.json({ connected: days !== null, days: days ?? [] });
}
