"use client";

/**
 * Panneau « Sauvegarde serveur » de Paramètres (sept. 2026) : état de la
 * dernière synchro, sauvegarde manuelle, restauration (latest ou un jour).
 * Chaque restauration passe par une confirmation.
 */

import { useEffect, useState } from "react";
import { CloudUpload, RotateCcw, Loader2 } from "lucide-react";
import {
  fetchBackupFull,
  fetchBackupMeta,
  readLocalMeta,
  restoreFromBackup,
  syncBackupNow,
  type ServerBackupList,
} from "@/lib/store-backup/client";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function StoreBackupPanel() {
  const [server, setServer] = useState<ServerBackupList | null | "unavailable">(null);
  const [local, setLocal] = useState(() => ({ lastSyncAt: null as string | null, lastError: null as string | null }));
  const [busy, setBusy] = useState<"sync" | "restore" | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const refresh = async () => {
    const m = await fetchBackupMeta();
    setServer(m ?? "unavailable");
    const l = readLocalMeta();
    setLocal({ lastSyncAt: l.lastSyncAt, lastError: l.lastError });
  };

  useEffect(() => {
    // Lecture différée : rien de synchrone dans l'effet (règle react-hooks).
    const id = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(id);
  }, []);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleSync = async () => {
    setBusy("sync");
    const ok = await syncBackupNow(true);
    setBusy(null);
    await refresh();
    flash(ok ? "Sauvegarde envoyée" : readLocalMeta().lastError ? `Refusée : ${readLocalMeta().lastError}` : "Rien à envoyer");
  };

  const handleRestore = async (day?: string, label?: string) => {
    if (!window.confirm(`Restaurer ${label ?? "la dernière sauvegarde"} ?\n\nTes données locales seront remplacées par celles de la sauvegarde.`)) return;
    setBusy("restore");
    const full = await fetchBackupFull(day);
    setBusy(null);
    if (!full) {
      flash("Sauvegarde illisible");
      return;
    }
    restoreFromBackup(full);
    flash("Restauré");
  };

  return (
    <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="text-base font-semibold text-text-primary">Sauvegarde serveur</h2>
        {toast && <span className="text-xs text-success">{toast}</span>}
      </div>
      <p className="text-xs text-text-tertiary mb-4 leading-relaxed">
        Tes injections, glucides, hypos, réglages et séances sont copiés automatiquement sur le serveur
        (10 s après chaque changement). Les points GPS et les photos ne sont pas inclus.
      </p>

      {server === null ? (
        <p className="text-xs text-text-tertiary flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lecture…</p>
      ) : server === "unavailable" ? (
        <p className="text-xs text-warning">Serveur de sauvegarde indisponible (KV non configuré).</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="surface-2 rounded-xl p-3">
              <p className="label">Dernière sauvegarde</p>
              <p className="num text-sm text-text-primary mt-1">{server.latest ? fmt(server.latest.savedAt) : "aucune"}</p>
              {server.latest && (
                <p className="text-[11px] text-text-tertiary mt-0.5">
                  {server.latest.summary.insulinLogs} inj · {server.latest.summary.carbEntries} gluc · {server.latest.summary.hypoEvents} hypos
                </p>
              )}
            </div>
            <div className="surface-2 rounded-xl p-3">
              <p className="label">Depuis ce téléphone</p>
              <p className="num text-sm text-text-primary mt-1">{local.lastSyncAt ? fmt(local.lastSyncAt) : "jamais"}</p>
              {local.lastError && <p className="text-[11px] text-warning mt-0.5">{local.lastError}</p>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleSync}
              disabled={busy !== null}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-accent text-accent-ink disabled:opacity-50 tap-scale"
            >
              {busy === "sync" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudUpload className="w-3.5 h-3.5" />}
              Sauvegarder maintenant
            </button>
            {server.latest && (
              <button
                type="button"
                onClick={() => handleRestore(undefined, `la sauvegarde du ${fmt(server.latest!.savedAt)}`)}
                disabled={busy !== null}
                className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border border-border-default text-text-primary disabled:opacity-50 tap-scale"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Restaurer la dernière
              </button>
            )}
          </div>

          {server.days.length > 0 && (
            <div>
              <p className="label mb-1.5">Instantanés du matin (30 j)</p>
              <div className="flex flex-wrap gap-1.5">
                {server.days.map((d) => (
                  <button
                    key={d.day}
                    type="button"
                    onClick={() => handleRestore(d.day, `l'instantané du ${d.day} (${d.summary.insulinLogs} injections)`)}
                    disabled={busy !== null}
                    className="num text-[11px] px-2 py-1 rounded-md border border-border-subtle text-text-secondary hover:border-border-default disabled:opacity-50 tap-scale"
                    title={`${d.summary.insulinLogs} injections · ${d.summary.carbEntries} glucides`}
                  >
                    {d.day.slice(5)} · {d.summary.insulinLogs} inj
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
