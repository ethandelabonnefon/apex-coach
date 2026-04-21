/**
 * POST /api/push/subscribe
 *
 * Enregistre la subscription push du device (iPhone PWA).
 * Le body contient l'objet subscription généré par pushManager.subscribe().
 *
 * DELETE /api/push/subscribe
 *
 * Supprime la subscription active (unsubscribe).
 */

import { NextRequest, NextResponse } from "next/server";
import type { PushSubscription as WebPushSubscription } from "web-push";
import { saveSubscription, removeSubscription, isKvConfigured } from "@/lib/push/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SubscriptionBody = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

function isValidSubscription(sub: unknown): sub is SubscriptionBody {
  if (!sub || typeof sub !== "object") return false;
  const s = sub as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  return (
    typeof s.endpoint === "string" &&
    !!s.keys &&
    typeof s.keys.p256dh === "string" &&
    typeof s.keys.auth === "string"
  );
}

export async function POST(req: NextRequest) {
  if (!isKvConfigured()) {
    return NextResponse.json(
      { error: "kv_not_configured", message: "Vercel KV non lié au projet." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_json" },
      { status: 400 },
    );
  }

  if (!isValidSubscription(body)) {
    return NextResponse.json(
      { error: "invalid_subscription", message: "Format attendu : { endpoint, keys: { p256dh, auth } }" },
      { status: 400 },
    );
  }

  try {
    await saveSubscription(body as WebPushSubscription);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    console.error("[push/subscribe] KV write error:", msg);
    return NextResponse.json(
      { error: "kv_write_failed", message: msg },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  if (!isKvConfigured()) {
    return NextResponse.json(
      { error: "kv_not_configured" },
      { status: 503 },
    );
  }

  try {
    await removeSubscription();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return NextResponse.json(
      { error: "kv_delete_failed", message: msg },
      { status: 500 },
    );
  }
}
