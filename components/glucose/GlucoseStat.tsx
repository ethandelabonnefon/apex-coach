"use client";

/**
 * GlucoseStat — tuile compacte du Dashboard (live FreeStyle Libre 2).
 *
 * Utilise `useGlucose` pour récupérer la dernière lecture en temps réel
 * et retombe gracieusement sur une valeur "fallback" (dernière lecture
 * manuelle du store) quand l'API n'est pas configurée ou échoue.
 */

import Link from "next/link";
import {
  Droplet,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";
import { useGlucose } from "@/hooks/useGlucose";
import { glucoseToneColor, type GlucoseTrend } from "@/lib/libre-link/utils";

type Props = {
  /** Valeur glucose de repli si l'API LibreLink n'est pas disponible */
  fallbackValue?: number;
  /** Comparaison pour delta quand on est en fallback (sans live) */
  fallbackPrevValue?: number;
  /** Lien cible (par défaut /diabete) */
  href?: string;
};

function TrendIcon({ trend }: { trend: GlucoseTrend }) {
  switch (trend) {
    case "SingleUp":
      return <TrendingUp size={14} className="text-warning" />;
    case "FortyFiveUp":
      return <ArrowUpRight size={14} className="text-warning" />;
    case "Flat":
      return <Minus size={14} className="text-text-tertiary" />;
    case "FortyFiveDown":
      return <ArrowDownRight size={14} className="text-info" />;
    case "SingleDown":
      return <TrendingDown size={14} className="text-info" />;
    default:
      return <Minus size={14} className="text-text-tertiary" />;
  }
}

export default function GlucoseStat({
  fallbackValue,
  fallbackPrevValue,
  href = "/diabete",
}: Props) {
  const { current, loading, notConfigured } = useGlucose({ mode: "current" });

  // Priorité au live ; sinon fallback manuel ; sinon rien.
  const hasLive = current !== null;
  const displayValue = hasLive ? current!.value : fallbackValue;
  const displayTone = hasLive ? current!.tone : null;

  // Flèche : live → tendance Abbott ; fallback → delta simple
  let fallbackTrend: "up" | "down" | "flat" = "flat";
  if (!hasLive && fallbackValue !== undefined && fallbackPrevValue !== undefined) {
    const delta = fallbackValue - fallbackPrevValue;
    if (Math.abs(delta) >= 10) fallbackTrend = delta > 0 ? "up" : "down";
  }

  const color = displayTone ? glucoseToneColor(displayTone) : undefined;

  return (
    <Link
      href={href}
      className="group surface-1 p-3 sm:p-4 tap-scale hover:bg-bg-tertiary transition-colors block"
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Droplet size={12} className="text-diabete" />
        <span className="label">Glycémie</span>
        {hasLive && (
          <span
            className="ml-auto dot-pulse h-1.5 w-1.5 rounded-full bg-success"
            aria-label="Live"
            title="Live FreeStyle Libre"
          />
        )}
      </div>

      {displayValue !== undefined ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span
              className="num-hero text-2xl sm:text-3xl font-semibold leading-none"
              style={color ? { color } : undefined}
            >
              {displayValue}
            </span>
            {hasLive ? (
              <TrendIcon trend={current!.trend} />
            ) : fallbackTrend === "up" ? (
              <TrendingUp size={14} className="text-warning" />
            ) : fallbackTrend === "down" ? (
              <TrendingDown size={14} className="text-info" />
            ) : (
              <Minus size={14} className="text-text-tertiary" />
            )}
          </div>
          <p className="text-[10px] text-text-tertiary mt-1">
            {hasLive ? "mg/dL · live" : notConfigured ? "mg/dL · manuel" : "mg/dL"}
          </p>
        </>
      ) : (
        <>
          <p className="num-hero text-2xl sm:text-3xl font-semibold text-text-tertiary leading-none">
            {loading ? "…" : "—"}
          </p>
          <p className="text-[10px] text-text-tertiary mt-1">
            {notConfigured ? "non configuré" : "aucune lecture"}
          </p>
        </>
      )}
    </Link>
  );
}
