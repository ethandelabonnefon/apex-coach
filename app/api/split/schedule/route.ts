/**
 * POST /api/split/schedule — ALIAS de compatibilité.
 *
 * Conservé pour les clients PWA dont le JS est encore en cache après le
 * renommage vers /api/reminders/* (septembre 2026). Supprimable une fois
 * que le service worker a rafraîchi le bundle chez l'utilisateur.
 *
 * Note d'implémentation : un simple `export { POST, runtime, dynamic } from
 * "..."` ne compile pas avec Turbopack sur Next.js 16.2.1 — le build
 * statique n'arrive pas à parser `runtime`/`dynamic` re-exportés
 * ("Next.js can't recognize the exported `dynamic` field in route. It
 * mustn't be reexported."). D'où ce handler mince qui délègue à la place.
 */
import type { NextRequest } from "next/server";
import { POST as schedulePOST } from "@/app/api/reminders/schedule/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return schedulePOST(req);
}
