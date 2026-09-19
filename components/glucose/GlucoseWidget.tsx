"use client";

/**
 * GlucoseWidget — hero glycémie (page /diabete).
 *
 * Affiche la dernière lecture live FreeStyle Libre avec :
 *  - grande valeur colorée par tonalité
 *  - flèche de tendance (↑↑ ↗ → ↘ ↓↓)
 *  - label "il y a X min" pour l'âge de la lecture
 *  - fallback sur la dernière lecture manuelle si API indisponible
 */

import { useEffect, useState } from "react";
import { Pulse } from "@/components/ui/Pulse";
import { useGlucose } from "@/hooks/useGlucose";
import { glucoseToneColor, formatReadingAge } from "@/lib/libre-link/utils";

type Props = {
  /** Valeur de repli (lecture manuelle la plus récente du store) */
  fallbackValue?: number;
  /** Date ISO de la lecture de repli */
  fallbackRecordedAt?: string | Date;
};

function toneToPulse(
  tone: "hypo" | "low" | "target" | "high" | "hyper",
): "success" | "warning" | "error" {
  if (tone === "target") return "success";
  if (tone === "hypo" || tone === "hyper") return "error";
  return "warning";
}

function glucoseStatusText(value: number): string {
  if (value < 70) return "Hypoglycémie";
  if (value > 250) return "Très élevée";
  if (value > 180) return "Au-dessus";
  if (value < 80) return "Bas";
  return "En zone";
}

export default function GlucoseWidget({ fallbackValue, fallbackRecordedAt }: Props) {
  const { current, notConfigured, loading } = useGlucose({ mode: "current" });

  // Tick toutes les 30s pour rafraîchir l'étiquette "il y a X min"
  // sans dépendre d'un Date.now() impur au rendu.
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const hasLive = current !== null;
  const displayValue = hasLive ? current!.value : fallbackValue;
  const displayDate =
    hasLive
      ? current!.date
      : fallbackRecordedAt
      ? new Date(fallbackRecordedAt).toISOString()
      : null;

  const color = hasLive ? glucoseToneColor(current!.tone) : undefined;
  const pulseTone = hasLive ? toneToPulse(current!.tone) : "warning";

  return (
    <div className="surface-2 rounded-2xl p-5 flex items-center gap-5">
      <div className="shrink-0">
        <Pulse tone={pulseTone} size="lg" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="label">Glycémie</p>
          {hasLive && (
            <span
              className="dot-pulse h-1.5 w-1.5 rounded-full bg-success"
              aria-label="Live"
              title="Live FreeStyle Libre"
            />
          )}
        </div>

        {displayValue !== undefined ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span
                className="num-hero text-4xl sm:text-5xl font-semibold leading-none"
                style={color ? { color } : undefined}
              >
                {displayValue}
              </span>
              {hasLive && (
                <span className="text-lg text-text-secondary font-semibold">
                  {current!.arrow}
                </span>
              )}
              <span className="text-xs text-text-tertiary">mg/dL</span>
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {hasLive ? current!.statusLabel : glucoseStatusText(displayValue)}
              {displayDate && (
                <>
                  {" · "}
                  <span className="num text-text-tertiary">
                    {formatReadingAge(displayDate, nowMs)}
                  </span>
                </>
              )}
              {hasLive && (
                <>
                  {" · "}
                  <span className="text-text-tertiary">{current!.trendLabel}</span>
                </>
              )}
            </p>
          </>
        ) : (
          <>
            <p className="num-hero text-4xl sm:text-5xl font-semibold text-text-tertiary leading-none">
              {loading ? "…" : "—"}
            </p>
            <p className="mt-1 text-xs text-text-tertiary">
              {notConfigured
                ? "LibreLink non connecté"
                : loading
                ? "Récupération…"
                : "Aucune lecture disponible"}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
