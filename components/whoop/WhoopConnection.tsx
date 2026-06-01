"use client";

/**
 * WhoopConnection — section dans /diabete/parametres pour gérer le
 * lien OAuth avec Whoop (Phase F2).
 *
 * État du composant exporté wrappé dans <Suspense> car useSearchParams
 * est utilisé pour lire ?whoop=connected/?whoop=error après callback.
 * En Next.js 16 strict, useSearchParams nécessite un Suspense boundary
 * pour le static rendering.
 */

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  LinkIcon,
  Unlink,
} from "lucide-react";

interface WhoopStatus {
  configured: boolean;
  connected: boolean;
  reason?: string;
  connectedAt?: string | null;
  scope?: string | null;
}

export default function WhoopConnection() {
  return (
    <Suspense fallback={
      <section className="surface-1 rounded-2xl p-5 mb-4">
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Chargement...
        </div>
      </section>
    }>
      <WhoopConnectionInner />
    </Suspense>
  );
}

function WhoopConnectionInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<WhoopStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/whoop/status", { cache: "no-store" });
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ configured: false, connected: false, reason: "fetch_failed" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Toast après callback OAuth
  useEffect(() => {
    const w = searchParams?.get("whoop");
    if (w === "connected") {
      setToast({ kind: "ok", msg: "Whoop connecté ✅" });
      // Nettoie les params URL
      router.replace("/diabete/parametres");
      fetchStatus();
    } else if (w === "error") {
      const msg = searchParams?.get("whoop_msg") || "erreur inconnue";
      setToast({ kind: "err", msg: `Connexion échouée : ${msg}` });
      router.replace("/diabete/parametres");
    }
  }, [searchParams, router, fetchStatus]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  async function handleDisconnect() {
    if (!confirm("Déconnecter ton compte Whoop ? Tu pourras te reconnecter plus tard.")) return;
    setActionLoading(true);
    try {
      await fetch("/api/whoop/disconnect", { method: "POST" });
      setToast({ kind: "ok", msg: "Whoop déconnecté" });
      fetchStatus();
    } catch {
      setToast({ kind: "err", msg: "Erreur lors de la déconnexion" });
    } finally {
      setActionLoading(false);
    }
  }

  function handleConnect() {
    setActionLoading(true);
    window.location.href = "/api/whoop/auth";
  }

  // ─── Rendering ─────────────────────────────────
  return (
    <section className="surface-1 rounded-2xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-running" />
          <h2 className="text-base font-semibold text-text-primary">Whoop</h2>
          {status?.connected && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold bg-success/15 text-success border border-success/30">
              <CheckCircle2 className="w-3 h-3" />
              Connecté
            </span>
          )}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`mb-3 rounded-lg px-3 py-2 text-xs flex items-start gap-2 ${
            toast.kind === "ok"
              ? "bg-success/10 border border-success/30 text-success"
              : "bg-error/10 border border-error/30 text-error"
          }`}
        >
          {toast.kind === "ok" ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          )}
          <p>{toast.msg}</p>
        </div>
      )}

      {/* État loading */}
      {loading && (
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Vérification du lien Whoop...
        </div>
      )}

      {/* Pas configuré côté serveur */}
      {!loading && status && !status.configured && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2.5 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
          <div className="text-xs text-text-secondary leading-snug">
            <p className="font-semibold text-warning mb-1">Configuration serveur requise</p>
            <p>
              Crée une app sur{" "}
              <a
                href="https://developer.whoop.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-warning hover:underline font-medium"
              >
                developer.whoop.com
              </a>{" "}
              puis configure les variables d&apos;env Vercel : <code className="num">WHOOP_CLIENT_ID</code>{" "}
              et <code className="num">WHOOP_CLIENT_SECRET</code>.
            </p>
            <p className="mt-2">
              Redirect URI à mettre dans l&apos;app Whoop :{" "}
              <code className="num text-[10px]">
                {typeof window !== "undefined" ? window.location.origin : ""}
                /api/whoop/callback
              </code>
            </p>
          </div>
        </div>
      )}

      {/* KV manquant */}
      {!loading && status?.configured && status?.reason === "kv_not_configured" && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 px-3 py-2.5 text-xs text-warning">
          Vercel KV requis pour stocker les tokens OAuth. Lie un store KV au projet.
        </div>
      )}

      {/* Configuré, pas connecté */}
      {!loading && status?.configured && !status.connected && status.reason !== "kv_not_configured" && (
        <>
          <p className="text-xs text-text-secondary leading-relaxed mb-3">
            Connecte ton compte Whoop pour récupérer ton <strong>strain quotidien</strong>,{" "}
            <strong>recovery</strong>, HRV et sommeil. Ces données permettent de calculer
            précisément la réduction d&apos;insuline post-exercice et d&apos;adapter ton
            entraînement.
          </p>
          <button
            type="button"
            onClick={handleConnect}
            disabled={actionLoading}
            className="bg-running text-ink font-semibold px-4 py-2 rounded-lg hover:bg-running/90 transition-colors tap-scale flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <LinkIcon className="w-4 h-4" />}
            Connecter Whoop
          </button>
        </>
      )}

      {/* Connecté */}
      {!loading && status?.connected && (
        <>
          <div className="rounded-lg bg-bg-tertiary border border-border-subtle px-3 py-2.5 mb-3">
            <p className="text-[10px] uppercase tracking-wide text-text-tertiary font-semibold mb-1">
              Lien actif
            </p>
            <p className="text-xs text-text-primary">
              Connecté depuis{" "}
              {status.connectedAt
                ? new Date(status.connectedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—"}
            </p>
            <p className="text-[10px] text-text-tertiary mt-1">
              Données récupérées toutes les 5 minutes (cache).
            </p>
          </div>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={actionLoading}
            className="bg-bg-tertiary border border-border-default text-text-secondary hover:text-error hover:border-error/40 font-medium px-4 py-2 rounded-lg transition-colors tap-scale flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Unlink className="w-4 h-4" />}
            Déconnecter
          </button>
        </>
      )}
    </section>
  );
}
