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

  const led = hasLive
    ? pulseTone === "success" ? "green" : pulseTone === "warning" ? "amber" : "red"
    : "steel";

  return (
    <div className="panel">
      <div className="panel-hd">
        <div className="flex items-center gap-2">
          <span className={`led ${led}`} />
          <b>Glycémie live</b>
        </div>
        <span className={`pill ${hasLive ? "green" : ""}`}>
          {hasLive
            ? `FreeStyle · ${displayDate ? formatReadingAge(displayDate, nowMs) : "live"}`
            : notConfigured
              ? "non connecté"
              : displayDate
                ? `manuel · ${formatReadingAge(displayDate, nowMs)}`
                : "—"}
        </span>
      </div>

      {displayValue !== undefined ? (
        <div className="flex items-start gap-3">
          <span className="num-hero text-[52px] leading-none" style={color ? { color } : undefined}>
            {displayValue}
          </span>
          {hasLive && (
            <span className="text-2xl mt-1 font-semibold" style={color ? { color } : undefined}>
              {current!.arrow}
            </span>
          )}
          <div className="ml-auto text-right">
            <p className="text-[11px] text-text-tertiary">Statut</p>
            <p className="text-sm font-semibold text-text-primary">
              {hasLive ? current!.statusLabel : glucoseStatusText(displayValue)}
            </p>
            {hasLive && (
              <>
                <p className="text-[11px] text-text-tertiary mt-1.5">Tendance</p>
                <p className="num text-sm">{current!.trendLabel}</p>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <span className="num-hero text-[52px] leading-none text-text-tertiary">
            {loading ? "…" : "—"}
          </span>
          <p className="ml-auto text-xs text-text-tertiary text-right mt-2">
            {notConfigured
              ? "LibreLink non connecté"
              : loading
                ? "Récupération…"
                : "Aucune lecture disponible"}
          </p>
        </div>
      )}
    </div>
  );
}
