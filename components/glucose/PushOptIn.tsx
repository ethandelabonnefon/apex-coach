"use client";

/**
 * PushOptIn — bouton pour activer les notifications push sur ce device.
 *
 * Flow :
 *  1. user tape "Activer les alertes"
 *  2. navigateur demande la permission (Notification.requestPermission)
 *  3. on souscrit au pushManager avec la VAPID public key
 *  4. on POST la subscription à /api/push/subscribe
 *  5. on déclenche un push test via GET /api/push/test
 *
 * Règles iOS spécifiques :
 *  - sur iPhone, les Web Push ne marchent QUE si l'app est installée
 *    sur l'écran d'accueil (PWA standalone). iOS Safari normal → pas de push.
 *    On détecte ça via `navigator.standalone` ou `display-mode: standalone`.
 *  - iOS ≥ 16.4 requis
 *
 * États possibles :
 *  - "not-supported"        : pas de SW / pas de push manager
 *  - "requires-standalone"  : iOS en Safari normal, pas en PWA
 *  - "denied"               : permission refusée
 *  - "ready"                : pas encore activé, on propose le bouton
 *  - "subscribed"           : déjà activé → bouton désactiver
 *  - "subscribing"          : en cours
 *  - "error"                : échec
 */

import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Check, AlertTriangle, Info } from "lucide-react";

type State =
  | { kind: "loading" }
  | { kind: "not-supported" }
  | { kind: "requires-standalone" }
  | { kind: "denied" }
  | { kind: "ready" }
  | { kind: "subscribed" }
  | { kind: "subscribing" }
  | { kind: "testing" }
  | { kind: "error"; message: string };

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function isStandalonePwa(): boolean {
  if (typeof window === "undefined") return false;
  const mm = window.matchMedia?.("(display-mode: standalone)").matches;
  const iosStandalone = (navigator as unknown as { standalone?: boolean })
    .standalone;
  return Boolean(mm || iosStandalone);
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function PushOptIn() {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [toast, setToast] = useState<string | null>(null);

  const computeInitialState = useCallback(async (): Promise<State> => {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      return { kind: "not-supported" };
    }

    // iOS : exige le mode standalone (PWA installée)
    if (isIos() && !isStandalonePwa()) {
      return { kind: "requires-standalone" };
    }

    if (Notification.permission === "denied") {
      return { kind: "denied" };
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      return sub ? { kind: "subscribed" } : { kind: "ready" };
    } catch {
      return { kind: "ready" };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    computeInitialState().then((s) => {
      if (!cancelled) setState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [computeInitialState]);

  const flashToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  async function subscribe() {
    setState({ kind: "subscribing" });
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) {
        setState({
          kind: "error",
          message:
            "Clé VAPID publique absente (NEXT_PUBLIC_VAPID_PUBLIC_KEY) — vérifie les variables Vercel.",
        });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState({ kind: "denied" });
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const applicationServerKey = urlBase64ToUint8Array(publicKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as BufferSource,
      });

      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState({
          kind: "error",
          message:
            data.message ||
            `Échec inscription serveur (HTTP ${res.status}). Vérifie que Vercel KV est bien lié au projet.`,
        });
        return;
      }

      setState({ kind: "subscribed" });

      // Push test
      setState({ kind: "testing" });
      await fetch("/api/push/test");
      setState({ kind: "subscribed" });
      flashToast("Notif test envoyée ✅");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "inconnu";
      setState({ kind: "error", message: msg });
    }
  }

  async function unsubscribe() {
    setState({ kind: "subscribing" });
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe();
      await fetch("/api/push/subscribe", { method: "DELETE" });
      setState({ kind: "ready" });
      flashToast("Alertes désactivées");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "inconnu";
      setState({ kind: "error", message: msg });
    }
  }

  async function sendTest() {
    setState({ kind: "testing" });
    try {
      const res = await fetch("/api/push/test");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        flashToast(
          `Test échoué${data.reason ? ` (${data.reason})` : ` (HTTP ${res.status})`}`,
        );
      } else {
        flashToast("Notif test envoyée ✅");
      }
    } finally {
      setState({ kind: "subscribed" });
    }
  }

  // ─── Rendu ────────────────────────────────────

  return (
    <section className="surface-1 rounded-3xl p-5">
      <div className="flex items-start gap-3 mb-3">
        <div className="shrink-0 w-10 h-10 rounded-xl bg-diabete/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-diabete" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="label">Alertes push</p>
          <h3 className="text-base font-semibold text-text-primary mt-0.5">
            Hypo &amp; hyper en direct
          </h3>
          <p className="text-xs text-text-secondary mt-0.5 leading-relaxed">
            Une notification iOS t&apos;arrive si ta glycémie passe sous 70 ou
            au-dessus de 250 mg/dL — même quand l&apos;app est fermée.
          </p>
        </div>
      </div>

      <Body state={state} onSubscribe={subscribe} onUnsubscribe={unsubscribe} onTest={sendTest} />

      {toast && (
        <div className="mt-3 rounded-xl bg-success/10 border border-success/25 text-success text-xs px-3 py-2 text-center">
          {toast}
        </div>
      )}
    </section>
  );
}

function Body({
  state,
  onSubscribe,
  onUnsubscribe,
  onTest,
}: {
  state: State;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  onTest: () => void;
}) {
  switch (state.kind) {
    case "loading":
      return <div className="h-10 rounded-xl skeleton" />;

    case "not-supported":
      return (
        <Info2
          tone="warning"
          title="Navigateur non compatible"
          body="Ton navigateur ne supporte pas les Web Push. Utilise Safari sur iPhone (en mode PWA) ou Chrome/Firefox sur desktop."
        />
      );

    case "requires-standalone":
      return (
        <Info2
          tone="info"
          title="Installe l'app sur l'écran d'accueil"
          body="Sur iPhone, les notifications fonctionnent uniquement quand APEX Coach est installée en PWA. Bouton Partage Safari → « Sur l'écran d'accueil », puis rouvre l'app depuis cette icône et reviens ici."
        />
      );

    case "denied":
      return (
        <Info2
          tone="error"
          title="Autorisation refusée"
          body="Tu as bloqué les notifications. Va dans Réglages iOS → APEX Coach → Notifications pour réautoriser, puis reviens."
        />
      );

    case "ready":
      return (
        <button
          type="button"
          onClick={onSubscribe}
          className="w-full bg-diabete text-ink font-semibold py-3 rounded-xl hover:bg-diabete/90 transition-colors tap-scale flex items-center justify-center gap-2"
        >
          <Bell className="w-4 h-4" />
          Activer les alertes
        </button>
      );

    case "subscribing":
      return (
        <button
          type="button"
          disabled
          className="w-full bg-diabete/50 text-ink/70 font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
        >
          <span className="w-4 h-4 rounded-full border-2 border-ink/40 border-t-ink animate-spin" />
          Activation…
        </button>
      );

    case "testing":
      return (
        <button
          type="button"
          disabled
          className="w-full bg-success/15 border border-success/25 text-success font-semibold py-3 rounded-xl flex items-center justify-center gap-2"
        >
          <span className="w-4 h-4 rounded-full border-2 border-success/40 border-t-success animate-spin" />
          Envoi test…
        </button>
      );

    case "subscribed":
      return (
        <div className="space-y-2">
          <div className="w-full bg-success/10 border border-success/25 text-success font-medium py-3 rounded-xl flex items-center justify-center gap-2">
            <Check className="w-4 h-4" />
            Alertes activées sur ce device
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onTest}
              className="bg-bg-tertiary hover:bg-bg-hover text-text-primary text-xs font-medium py-2.5 rounded-xl transition-colors border border-border-subtle tap-scale"
            >
              Tester
            </button>
            <button
              type="button"
              onClick={onUnsubscribe}
              className="bg-bg-tertiary hover:bg-bg-hover text-text-tertiary text-xs font-medium py-2.5 rounded-xl transition-colors border border-border-subtle tap-scale flex items-center justify-center gap-1.5"
            >
              <BellOff className="w-3.5 h-3.5" />
              Désactiver
            </button>
          </div>
        </div>
      );

    case "error":
      return (
        <Info2
          tone="error"
          title="Échec activation"
          body={state.message}
        />
      );
  }
}

function Info2({
  tone,
  title,
  body,
}: {
  tone: "info" | "warning" | "error";
  title: string;
  body: string;
}) {
  const color =
    tone === "error"
      ? "error"
      : tone === "warning"
        ? "warning"
        : "info";
  const Icon = tone === "error" ? AlertTriangle : Info;
  return (
    <div
      className={`rounded-xl bg-${color}/10 border border-${color}/25 px-3 py-2.5`}
    >
      <div className="flex items-start gap-2">
        <Icon className={`w-4 h-4 text-${color} shrink-0 mt-0.5`} />
        <div className="min-w-0">
          <p className={`text-xs font-semibold text-${color}`}>{title}</p>
          <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
            {body}
          </p>
        </div>
      </div>
    </div>
  );
}
