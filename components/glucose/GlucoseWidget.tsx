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
import { glucoseToneColor, formatReadingAge, trendStringToNumber } from "@/lib/libre-link/utils";

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

/**
 * Vitesse de tendance Libre (mg/dL/min) — slide rule Abbott, mêmes valeurs
 * que `lib/glucose-prediction.ts` (fonction privée là-bas). Affichage
 * seulement : la projection « dans 30 min » de cette carte est un repère
 * de lecture, pas une entrée de calcul.
 */
function trendVelocityMgPerMin(arrow?: number): number {
  switch (arrow) {
    case 1: return -1.5;
    case 2: return -0.7;
    case 4: return 0.7;
    case 5: return 1.5;
    default: return 0;
  }
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
          <b className="whitespace-nowrap">Glycémie live</b>
        </div>
        <span className={`pill ${hasLive ? "green" : ""}`}>
          {hasLive
            ? `FreeStyle · ${displayDate ? formatReadingAge(displayDate, nowMs).replace(/^il y a /, "") : "live"}`
            : notConfigured
              ? "non connecté"
              : displayDate
                ? `manuel · ${formatReadingAge(displayDate, nowMs)}`
                : "—"}
        </span>
      </div>

      {displayValue !== undefined ? (
        <>
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
            {hasLive ? (
              <>
                <p className="text-[11px] text-text-tertiary">Tendance</p>
                <p className="num text-sm">
                  {(() => {
                    const v = trendVelocityMgPerMin(trendStringToNumber(current!.trend));
                    return v === 0 ? "stable" : `${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")} /min`;
                  })()}
                </p>
                <p className="text-[11px] text-text-tertiary mt-1.5">Dans 30 min</p>
                <p className="num text-sm">
                  ≈ {Math.round(displayValue + trendVelocityMgPerMin(trendStringToNumber(current!.trend)) * 30)}
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] text-text-tertiary">Statut</p>
                <p className="text-sm font-semibold text-text-primary">{glucoseStatusText(displayValue)}</p>
              </>
            )}
          </div>
        </div>
        {hasLive && (
          <p className="text-xs text-text-secondary mt-1">{current!.statusLabel} · {current!.trendLabel}</p>
        )}
        </>
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
