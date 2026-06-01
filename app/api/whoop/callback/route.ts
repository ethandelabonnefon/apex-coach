/**
 * GET /api/whoop/callback — Whoop redirige ici avec ?code=...&state=...
 *
 * Vérifie le state (CSRF), échange le code contre tokens, persiste les
 * tokens dans Vercel KV, puis redirige vers /diabete/parametres.
 */

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCodeForTokens, isWhoopConfigured } from "@/lib/whoop/client";
import { isKvConfigured, saveTokens } from "@/lib/whoop/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const storedState = cookieStore.get("whoop_oauth_state")?.value;

  // Origine redirect : /diabete/parametres avec params status
  const settingsUrl = new URL("/diabete/parametres", url.origin);

  if (error) {
    settingsUrl.searchParams.set("whoop", "error");
    settingsUrl.searchParams.set("whoop_msg", error);
    return NextResponse.redirect(settingsUrl);
  }
  if (!isWhoopConfigured()) {
    settingsUrl.searchParams.set("whoop", "error");
    settingsUrl.searchParams.set("whoop_msg", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }
  if (!isKvConfigured()) {
    settingsUrl.searchParams.set("whoop", "error");
    settingsUrl.searchParams.set("whoop_msg", "kv_not_configured");
    return NextResponse.redirect(settingsUrl);
  }
  if (!code) {
    settingsUrl.searchParams.set("whoop", "error");
    settingsUrl.searchParams.set("whoop_msg", "no_code");
    return NextResponse.redirect(settingsUrl);
  }
  if (!state || !storedState || state !== storedState) {
    settingsUrl.searchParams.set("whoop", "error");
    settingsUrl.searchParams.set("whoop_msg", "state_mismatch");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveTokens(tokens);
    settingsUrl.searchParams.set("whoop", "connected");
  } catch (e) {
    settingsUrl.searchParams.set("whoop", "error");
    settingsUrl.searchParams.set("whoop_msg", "exchange_failed");
    console.error("[whoop/callback] exchange failed", e);
  }

  const res = NextResponse.redirect(settingsUrl);
  // Cleanup le cookie state
  res.cookies.delete("whoop_oauth_state");
  return res;
}
