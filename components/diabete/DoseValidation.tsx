"use client";

/**
 * Validation des doses par créneau — présentation pure.
 *
 * Reçoit les analyses, rend une carte par créneau, remonte l'intention de
 * validation par callback. Ne calcule rien, ne lit pas le store, n'écrit
 * jamais un ratio : c'est la page qui le fait, après confirmation.
 */

import { Loader2, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import {
  formatRatio,
  MIN_ELIGIBLE_MEALS,
  type SlotAnalysis,
} from "@/lib/dose-validation";

const SLOT_LABELS: Record<string, string> = {
  morning: "Matin",
  lunch: "Midi",
  snack: "Goûter",
  dinner: "Soir",
};

const EXCLUSION_LABELS: Record<string, string> = {
  sport: "suivis de sport",
  iob: "avec insuline résiduelle",
  uncertain: "à quantité incertaine",
  correction: "suivis d'une correction",
  "short-window": "trop proches du repas suivant",
  "no-coverage": "sans mesure capteur suffisante",
  "low-at-meal": "pris en dessous de 80 mg/dL",
  "sport-carbs": "suivis de glucides pris pour le sport",
};

function SlotCard({
  analysis,
  onApply,
}: {
  analysis: SlotAnalysis;
  onApply: (a: SlotAnalysis) => void;
}) {
  const label = SLOT_LABELS[analysis.mealType] ?? analysis.mealType;
  const excludedTotal = Object.values(analysis.excluded).reduce(
    (s, n) => s + (n ?? 0),
    0,
  );

  const tone =
    analysis.verdict === "over-bolus"
      ? { led: "amber", pill: "amber", text: "À revoir" }
      : analysis.verdict === "ok"
        ? { led: "green", pill: "green", text: "OK" }
        : { led: "steel", pill: "", text: "Données insuffisantes" };

  return (
    <div className="row-item items-start">
      <span className={`led ${tone.led} mt-1.5`} />
      <div className="min-w-0 flex-1">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="t">{label}</h3>
        <span className={`pill ${tone.pill}`}>{tone.text}</span>
      </div>

      {analysis.verdict === "insufficient-data" ? (
        <p className="text-xs text-text-secondary">
          {analysis.eligibleCount} repas analysable
          {analysis.eligibleCount > 1 ? "s" : ""} sur les {analysis.windowDays}{" "}
          derniers jours — il en faut {MIN_ELIGIBLE_MEALS}.
          {excludedTotal > 0 && (
            <>
              {" "}
              {excludedTotal} écarté{excludedTotal > 1 ? "s" : ""} :{" "}
              {Object.entries(analysis.excluded)
                .filter(([, n]) => (n ?? 0) > 0)
                .map(([r, n]) => `${n} ${EXCLUSION_LABELS[r] ?? r}`)
                .join(", ")}
              .
            </>
          )}
        </p>
      ) : (
        <>
          <p className="num text-xs text-text-secondary">
            {analysis.hypoCount} hypo{analysis.hypoCount > 1 ? "s" : ""} sur{" "}
            {analysis.eligibleCount} repas ({Math.round(analysis.hypoRate * 100)} %) ·{" "}
            {analysis.windowDays} derniers jours · {analysis.confidence}
          </p>
          {analysis.avgLandingDelta !== null && (
            <p className="num mt-1 text-[11px] text-text-tertiary">
              Tu atterris en moyenne {analysis.avgLandingDelta > 0 ? "+" : ""}
              {analysis.avgLandingDelta} mg/dL par rapport à ton point de départ
              {analysis.avgWindowMin !== null && (
                <>
                  , en fin de fenêtre d&apos;observation (~
                  {Math.round((analysis.avgWindowMin / 60) * 10) / 10} h en moyenne)
                </>
              )}
              .
            </p>
          )}
        </>
      )}

      {analysis.proposedRatio && (
        <div className="mt-3 pt-3 border-t border-border-subtle">
          <p className="num text-xs text-text-secondary mb-2">
            {formatRatio(analysis.proposedRatio.current)} →{" "}
            <span className="text-warning font-semibold">
              {formatRatio(analysis.proposedRatio.proposed)}
            </span>
          </p>
          <Button size="sm" onClick={() => onApply(analysis)}>
            Valider
          </Button>
        </div>
      )}
      </div>
    </div>
  );
}

export function DoseValidation({
  analyses,
  onApply,
  loading,
  archiveError,
}: {
  analyses: SlotAnalysis[];
  onApply: (a: SlotAnalysis) => void;
  loading?: boolean;
  /** Archive glycémique injoignable : aucun verdict n'est rendu. */
  archiveError?: string | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-tertiary py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Analyse des repas en cours…
      </div>
    );
  }
  // Sans capteur, aucun verdict : un « correct » produit par l'absence de
  // mesure serait un faux verdict rassurant sur une question de dose.
  if (archiveError) {
    return (
      <div className="rounded-xl bg-warning/10 border border-warning/25 p-4 flex items-start gap-2">
        <WifiOff className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-warning font-medium">Archive indisponible</p>
          <p className="text-[11px] text-text-tertiary mt-0.5">
            Impossible de lire les mesures du capteur ({archiveError}). Aucun
            verdict n&apos;est rendu tant que les données manquent.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div>
      {analyses.map((a) => (
        <SlotCard key={a.mealType} analysis={a} onApply={onApply} />
      ))}
    </div>
  );
}
