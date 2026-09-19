"use client";

/**
 * Bannière de restauration (sept. 2026).
 *
 * S'affiche dans deux cas, et seulement là :
 *  1. le store local est vide (aucune injection / glucide / hypo) alors
 *     que le serveur détient une sauvegarde qui contient des injections —
 *     c'est la situation du 19/09 : un téléphone vidé, des données à
 *     récupérer ;
 *  2. le verrou d'écriture vient de bloquer un effacement : l'état en
 *     mémoire ne correspond plus au stockage, il faut recharger.
 *
 * La restauration demande une confirmation explicite : rien n'est jamais
 * écrasé automatiquement.
 */

import { useEffect, useState } from "react";
import { ShieldAlert, RotateCcw } from "lucide-react";
import { useStore, WIPE_BLOCKED_EVENT } from "@/lib/store";
import { isStoreEmpty } from "@/lib/store-backup/payload";
import { fetchBackupFull, fetchBackupMeta, restoreFromBackup, type ServerBackupList } from "@/lib/store-backup/client";

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function StoreRestoreBanner() {
  const insulinLogs = useStore((s) => s.insulinLogs);
  const carbEntries = useStore((s) => s.carbEntries);
  const hypoEvents = useStore((s) => s.hypoEvents);
  const empty = isStoreEmpty({ insulinLogs, carbEntries, hypoEvents });

  const [server, setServer] = useState<ServerBackupList | null>(null);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onBlocked = () => setBlocked(true);
    window.addEventListener(WIPE_BLOCKED_EVENT, onBlocked);
    return () => window.removeEventListener(WIPE_BLOCKED_EVENT, onBlocked);
  }, []);

  useEffect(() => {
    if (!empty) return;
    let cancelled = false;
    fetchBackupMeta().then((m) => {
      if (!cancelled) setServer(m);
    });
    return () => {
      cancelled = true;
    };
  }, [empty]);

  if (blocked) {
    return (
      <div className="mb-4 rounded-xl border border-warning/40 bg-warning/10 p-4 flex items-start gap-3">
        <ShieldAlert className="w-4 h-4 text-warning shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">Écriture bloquée</p>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
            L&apos;app a tenté d&apos;effacer tes injections enregistrées. Le stockage a été protégé.
            Recharge l&apos;app pour repartir de tes données.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 text-xs font-semibold text-warning underline-offset-2 hover:underline"
          >
            Recharger maintenant
          </button>
        </div>
      </div>
    );
  }

  const latest = server?.latest;
  const candidateDay = server?.days.find((d) => d.summary.insulinLogs > 0);
  const candidate = latest && latest.summary.insulinLogs > 0 ? { kind: "latest" as const, meta: latest } : candidateDay ? { kind: "day" as const, meta: candidateDay } : null;
  if (!empty || dismissed || !candidate) return null;

  const restore = async () => {
    const m = candidate.meta;
    const ok = window.confirm(
      `Restaurer la sauvegarde serveur du ${fmt(m.savedAt)} ?\n\n${m.summary.insulinLogs} injections · ${m.summary.carbEntries} glucides · ${m.summary.hypoEvents} hypos · ${m.summary.runningSessions} sorties.\n\nTes réglages actuels seront remplacés par ceux de la sauvegarde.`,
    );
    if (!ok) return;
    setBusy(true);
    const full = await fetchBackupFull(candidate.kind === "day" ? (candidate.meta as { day: string }).day : undefined);
    setBusy(false);
    if (!full) {
      window.alert("Impossible de lire la sauvegarde. Réessaie dans un instant.");
      return;
    }
    restoreFromBackup(full);
  };

  return (
    <div className="mb-4 rounded-xl border border-info/40 bg-info/10 p-4 flex items-start gap-3">
      <RotateCcw className="w-4 h-4 text-info shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">Une sauvegarde serveur existe</p>
        <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
          Ce téléphone n&apos;a aucune injection enregistrée, mais le serveur a une sauvegarde du{" "}
          <span className="num">{fmt(candidate.meta.savedAt)}</span> avec{" "}
          <span className="num">{candidate.meta.summary.insulinLogs}</span> injections.
        </p>
        <div className="mt-2 flex items-center gap-3">
          <button
            type="button"
            onClick={restore}
            disabled={busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-info text-white disabled:opacity-50 tap-scale"
          >
            {busy ? "Lecture…" : "Restaurer"}
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            className="text-xs text-text-tertiary hover:text-text-secondary"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
