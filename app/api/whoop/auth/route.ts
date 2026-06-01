/**
 * GET /api/whoop/auth — démarre le flow OAuth Whoop.
 *
 * Génère un `state` aléatoire (stocké en cookie httpOnly) et redirige
 * vers l'URL d'autorisation Whoop. Au retour, /api/whoop/callback vérifie
 * le state pour anti-CSRF.
 */

import { NextResponse } from "next/server";
import { buildAuthUrl, isWhoopConfigured } from "@/lib/whoop/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!isWhoopConfigured()) {
    return NextResponse.json(
      {
        error: "whoop_not_configured",
        message: "Variables d'env WHOOP_CLIENT_ID + WHOOP_CLIENT_SECRET manquantes côté serveur.",
      },
      { status: 503 },
    );
  }
  const state = crypto.randomUUID();
  const url = buildAuthUrl(state);
  const res = NextResponse.redirect(url);
  res.cookies.set("whoop_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/",
  });
  return res;
}
