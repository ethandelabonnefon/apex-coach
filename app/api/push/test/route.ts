/**
 * GET /api/push/test
 *
 * Envoie un push "test" à la subscription enregistrée. Utile pour
 * valider la chaîne complète après l'activation depuis le bouton
 * dans les paramètres diabète.
 *
 * Pas besoin du CRON_SECRET : c'est pas un endpoint qui déclenche
 * d'effet métier (juste une notif test). Pour éviter le spam on
 * pourrait rate-limiter, mais dans un contexte single-user c'est ok.
 */

import { NextResponse } from "next/server";
import { sendGlucosePush } from "@/lib/push/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const res = await sendGlucosePush({
    type: "test",
    title: "✅ APEX Coach — notifications OK",
    body: "Les alertes hypo/hyper sont bien activées sur ce device.",
    url: "/diabete",
  });

  return NextResponse.json(res, {
    status: res.sent ? 200 : 400,
  });
}
