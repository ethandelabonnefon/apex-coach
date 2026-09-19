"use client";

/**
 * Synchronisation silencieuse du store vers le serveur (sept. 2026).
 *
 * Monté une fois dans le layout. Écoute le store : 10 s après le dernier
 * changement, envoie une sauvegarde si l'empreinte des données protégées
 * a bougé. Envoie aussi au passage en arrière-plan (fermeture de la PWA)
 * et une fois au démarrage. Ne rend rien.
 */

import { useEffect } from "react";
import { useStore } from "@/lib/store";
import { syncBackupNow } from "@/lib/store-backup/client";

const DEBOUNCE_MS = 10_000;

export function StoreBackupSync() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void syncBackupNow();
      }, DEBOUNCE_MS);
    };
    const unsubscribe = useStore.subscribe(schedule);
    const onHide = () => {
      if (document.visibilityState === "hidden") void syncBackupNow();
    };
    document.addEventListener("visibilitychange", onHide);
    // Première synchro peu après l'hydratation.
    const boot = setTimeout(() => void syncBackupNow(), 3_000);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", onHide);
      if (timer) clearTimeout(timer);
      clearTimeout(boot);
    };
  }, []);
  return null;
}
