"use client";

/**
 * RecoveryFigure — carte dashboard : figure 3D humaine dont la couleur du corps
 * reflète le Recovery Whoop du jour. Le Canvas Three.js (RecoveryFigureCanvas)
 * est chargé via next/dynamic { ssr:false } pour rester hors du chemin critique
 * (rendu serveur + PWA) et ne pas bloquer le reste du dashboard.
 *
 * Bandes Whoop : ≥67 vert / 34-66 jaune / <34 rouge / no-data gris.
 * Attribution modèle CC-BY-4.0 → caption + /credits.
 */

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity } from "lucide-react";
import { useWhoop } from "@/hooks/useWhoop";
import { useTheme } from "@/hooks/useTheme";

const RecoveryFigureCanvas = dynamic(
  () => import("@/components/whoop/RecoveryFigureCanvas"),
  { ssr: false },
);

type Band = {
  label: string;
  toneClass: string; // classe token pour le point coloré (theme-aware)
};

function recoveryBand(score: number | null): Band {
  if (score === null || Number.isNaN(score))
    return { label: "Non connecté", toneClass: "bg-text-tertiary" };
  if (score >= 67) return { label: "Vert · récupéré", toneClass: "bg-success" };
  if (score >= 34) return { label: "Jaune · modéré", toneClass: "bg-warning" };
  return { label: "Rouge · fatigué", toneClass: "bg-error" };
}

export default function RecoveryFigure() {
  const { snapshot } = useWhoop();
  const { resolved } = useTheme();
  const [ready, setReady] = useState(false);

  const score = snapshot?.recoveryScore ?? null;
  const sleepPerformance = snapshot?.sleepPerformance ?? null;
  const hrvMs = snapshot?.hrvMs ?? null;
  const band = useMemo(() => recoveryBand(score), [score]);

  return (
    <section className="mb-6 animate-in">
      <div className="surface-1 relative overflow-hidden p-5">
        {/* halo teinté en fond, discret */}
        <div
          aria-hidden
          className="absolute -top-16 -right-16 h-48 w-48 rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "var(--accent-2)" }}
        />

        <div className="relative flex items-center gap-1.5 mb-1">
          <Activity size={12} className="text-accent-2" />
          <span className="label">Récupération</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className={`h-1.5 w-1.5 rounded-full ${band.toneClass}`} aria-hidden />
            <span className="text-[11px] text-text-secondary">{band.label}</span>
          </span>
        </div>

        {/* Zone 3D : hauteur fixe, canvas transparent sur la surface de la carte */}
        <div className="relative h-[320px] w-full" role="img" aria-label={`Figure de récupération Whoop : ${band.label}`}>
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="skeleton h-40 w-16 rounded-full opacity-60" />
            </div>
          )}
          <RecoveryFigureCanvas
            score={score}
            hrvMs={hrvMs}
            sleepPerformance={sleepPerformance}
            themeKey={resolved}
            onReady={() => setReady(true)}
          />
        </div>

        {/* Valeur + caption/attribution */}
        <div className="relative flex items-end justify-between gap-3 mt-1">
          <div>
            {score !== null ? (
              <div className="flex items-baseline gap-1.5">
                <span className="num-hero text-4xl font-semibold leading-none tabular-nums">
                  {score}
                </span>
                <span className="text-xs text-text-tertiary">% recovery</span>
              </div>
            ) : (
              <p className="text-xs text-text-tertiary">
                Connecte Whoop pour colorer la figure selon ta récupération.
              </p>
            )}
          </div>
          <Link
            href="/credits"
            className="text-[10px] text-text-tertiary hover:text-text-secondary transition-colors shrink-0"
          >
            Modèle 3D · CC BY 4.0
          </Link>
        </div>
      </div>
    </section>
  );
}
