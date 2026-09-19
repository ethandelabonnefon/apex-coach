/**
 * Sauvegarde serveur du store (sept. 2026).
 *
 *   GET  /api/store-backup            → métadonnées (latest + jours)
 *   GET  /api/store-backup?full=1     → la « latest » complète
 *   GET  /api/store-backup?day=YYYY-MM-DD → l'instantané de ce jour
 *   POST /api/store-backup            → enregistre un BackupPayload
 *
 * App single-user (même modèle que /api/reminders) ; garde-fous dans
 * lib/store-backup/store.ts. 503 si KV n'est pas configuré (dev local).
 */

import { NextResponse } from "next/server";
import {
  getDayBackup,
  getLatestBackup,
  isKvConfigured,
  listBackups,
  saveBackup,
} from "@/lib/store-backup/store";
import { BACKUP_FORMAT_VERSION, type BackupPayload } from "@/lib/store-backup/payload";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isKvConfigured()) {
    return NextResponse.json({ error: "KV non configuré" }, { status: 503 });
  }
  const url = new URL(req.url);
  const day = url.searchParams.get("day");
  if (day) {
    const p = await getDayBackup(day);
    return p ? NextResponse.json(p) : NextResponse.json({ error: "aucune sauvegarde ce jour" }, { status: 404 });
  }
  if (url.searchParams.get("full") === "1") {
    const p = await getLatestBackup();
    return p ? NextResponse.json(p) : NextResponse.json({ error: "aucune sauvegarde" }, { status: 404 });
  }
  return NextResponse.json(await listBackups());
}

export async function POST(req: Request) {
  if (!isKvConfigured()) {
    return NextResponse.json({ error: "KV non configuré" }, { status: 503 });
  }
  let payload: BackupPayload;
  try {
    payload = (await req.json()) as BackupPayload;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  if (
    !payload ||
    payload.formatVersion !== BACKUP_FORMAT_VERSION ||
    typeof payload.savedAt !== "string" ||
    !payload.summary ||
    !payload.state ||
    typeof payload.state !== "object"
  ) {
    return NextResponse.json({ error: "payload invalide" }, { status: 400 });
  }

  const result = await saveBackup(payload);
  if (!result.ok) {
    const status = result.reason === "too-large" ? 413 : result.reason === "would-wipe" ? 409 : 500;
    return NextResponse.json({ error: result.reason, detail: result.detail }, { status });
  }
  return NextResponse.json(result);
}
