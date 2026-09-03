"use client";

/**
 * Validation des doses par créneau — présentation pure.
 *
 * Reçoit les analyses, rend une carte par créneau, remonte l'intention de
 * validation par callback. Ne calcule rien, ne lit pas le store, n'écrit
 * jamais un ratio : c'est la page qui le fait, après confirmation.
 */

import { AlertTriangle, CheckCircle2, HelpCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { SlotAnalysis } from "@/lib/dose-validation";

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
};

/** Ratio interne (g par U) → format naturel « 1 U / 10 g ». */
function formatRatio(gPerU: number): string {
  return `1 U / ${gPerU.toFixed(1).replace(".", ",").replace(",0", "")} g`;
}

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
      ? { icon: AlertTriangle, color: "text-warning", badge: "warning" as const }
      : analysis.verdict === "ok"
        ? { icon: CheckCircle2, color: "text-success", badge: "success" as const }
        : { icon: HelpCircle, color: "text-text-tertiary", badge: "default" as const };
  const Icon = tone.icon;

  return (
    <div className="surface-2 rounded-2xl p-4">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${tone.color}`} />
          <h3 className="text-sm font-semibold text-text-primary">{label}</h3>
        </div>
        <Badge variant={tone.badge} size="sm">
          {analysis.verdict === "over-bolus"
            ? "sur-dose"
            : analysis.verdict === "ok"
              ? "correct"
              : "pas assez de données"}
        </Badge>
      </div>

      {analysis.verdict === "insufficient-data" ? (
        <p className="text-xs text-text-secondary">
          {analysis.eligibleCount} repas analysable
          {analysis.eligibleCount > 1 ? "s" : ""} sur les {analysis.windowDays}{" "}
          derniers jours — il en faut 3.
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
            {analysis.eligibleCount} repas · {analysis.windowDays} derniers jours ·{" "}
            {analysis.confidence}
          </p>
          {analysis.avgLandingDelta !== null && (
            <p className="num mt-1 text-[11px] text-text-tertiary">
              Tu atterris en moyenne {analysis.avgLandingDelta > 0 ? "+" : ""}
              {analysis.avgLandingDelta} mg/dL par rapport à ton point de départ.
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
  );
}

export function DoseValidation({
  analyses,
  onApply,
  loading,
}: {
  analyses: SlotAnalysis[];
  onApply: (a: SlotAnalysis) => void;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-tertiary py-6">
        <Loader2 className="w-4 h-4 animate-spin" />
        Analyse des repas en cours…
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {analyses.map((a) => (
        <SlotCard key={a.mealType} analysis={a} onApply={onApply} />
      ))}
    </div>
  );
}
