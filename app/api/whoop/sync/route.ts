/**
 * GET /api/whoop/sync — fetch les dernières données Whoop (strain,
 * recovery, sleep, workout) et les renvoie au client.
 *
 * Cache 5min (Vercel KV) pour éviter de spammer l'API Whoop. Le client
 * appelle cet endpoint depuis le hook useWhoop.
 */

import { NextResponse } from "next/server";
import {
  fetchLatestCycle,
  fetchLatestRecovery,
  fetchLatestSleep,
  fetchLatestWorkout,
  isWhoopConfigured,
} from "@/lib/whoop/client";
import {
  getSnapshot,
  getTokens,
  isKvConfigured,
  saveSnapshot,
  type WhoopSnapshot,
} from "@/lib/whoop/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWhoopConfigured()) {
    return NextResponse.json({ connected: false, reason: "whoop_not_configured" }, { status: 200 });
  }
  if (!isKvConfigured()) {
    return NextResponse.json({ connected: false, reason: "kv_not_configured" }, { status: 200 });
  }
  const tokens = await getTokens();
  if (!tokens) {
    return NextResponse.json({ connected: false, reason: "not_connected" }, { status: 200 });
  }

  // 1. Snapshot en cache ?
  const cached = await getSnapshot();
  if (cached) {
    return NextResponse.json({ connected: true, snapshot: cached, cached: true });
  }

  // 2. Fetch parallèle
  try {
    const [cycle, recovery, sleep, workout] = await Promise.all([
      fetchLatestCycle(),
      fetchLatestRecovery(),
      fetchLatestSleep(),
      fetchLatestWorkout(),
    ]);

    const snapshot: WhoopSnapshot = {
      cycleStrain: cycle?.score?.strain ?? null,
      recoveryScore: recovery?.score?.recovery_score ?? null,
      hrvMs: recovery?.score?.hrv_rmssd_milli ?? null,
      rhrBpm: recovery?.score?.resting_heart_rate ?? null,
      sleepDurationMin: sleep?.score?.stage_summary
        ? Math.round(
            (sleep.score.stage_summary.total_in_bed_time_milli -
              sleep.score.stage_summary.total_awake_time_milli) /
              60_000,
          )
        : null,
      sleepPerformance: sleep?.score?.sleep_performance_percentage ?? null,
      lastWorkout: workout
        ? {
            id: String(workout.id),
            strain: workout.score?.strain ?? 0,
            startedAt: workout.start,
            endedAt: workout.end,
            sport: workout.sport_name ?? null,
          }
        : null,
      fetchedAt: Date.now(),
    };

    await saveSnapshot(snapshot);
    return NextResponse.json({ connected: true, snapshot, cached: false });
  } catch (e) {
    console.error("[whoop/sync] fetch error", e);
    return NextResponse.json(
      { connected: true, error: "fetch_failed", message: String(e) },
      { status: 200 },
    );
  }
}
