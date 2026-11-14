"use client";

/**
 * CorrectionSuggestion — carte « tu es en hyper, voici quoi faire ».
 *
 * N'apparaît que si la glycémie live dépasse le haut de la plage cible.
 * Le calcul vit dans `lib/correction-suggestion.ts` (pur, testé) :
 *   - arrondi EN DESSOUS à l'unité entière (stylo sans demi-unités, et une
 *     correction n'a pas de repas derrière pour rattraper une unité de trop) ;
 *   - l'insuline déjà active est soustraite ; au-dessus de 0,5 U on attend ;
 *   - une glycémie qui descend déjà ne se corrige pas ;
 *   - la sensibilité post-sport réduit la dose, comme dans le calculateur.
 *
 * L'insuline active, la flèche et l'ajustement sport sont fournis par la
 * page : un seul modèle d'insuline active à l'écran, jamais deux chiffres
 * différents sur la même page.
 */

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useGlucose } from "@/hooks/useGlucose";
import { glucoseTone, glucoseToneLabel, isReadingFresh, trendStringToNumber } from "@/lib/libre-link/utils";
import { computeHyperCorrection } from "@/lib/correction-suggestion";
import { Badge } from "@/components/ui/Badge";
import { Syringe, AlertTriangle, Info, Check } from "lucide-react";

interface CorrectionSuggestionProps {
  /** Insuline rapide active (U), modèle de la page. */
  iobUnits: number;
  /** Réduction due à la sensibilité post-sport (%). */
  exerciseReductionPct?: number;
}

function fr(n: number): string {
  return n.toFixed(1).replace(".", ",");
}

export default function CorrectionSuggestion({
  iobUnits,
  exerciseReductionPct,
}: CorrectionSuggestionProps) {
  const { profile, diabetesConfig, addInsulinLog } = useStore();
  const { current: live } = useGlucose({ mode: "current" });
  const [justLogged, setJustLogged] = useState(false);

  // Une mesure de plus de 15 min n'est pas une glycémie à corriger : en
  // 40 minutes elle a pu redescendre toute seule, ou chuter.
  if (!live || !isReadingFresh(live.date)) return null;
  const value = live.value;
  const target = diabetesConfig.targetGlucose;
  const isf = diabetesConfig.insulinSensitivityFactor;

  const suggestion = computeHyperCorrection({
    glucose: value,
    target,
    thresholdHigh: diabetesConfig.targetRange.max,
    isf,
    iobUnits,
    trendArrow: trendStringToNumber(live.trend),
    exerciseReductionPct,
  });
  if (!suggestion) return null;

  const tone = glucoseTone(value);
  const isHyper = tone === "hyper"; // > 250
  const units = suggestion.kind === "dose" ? suggestion.units : 0;

  function handleLog() {
    if (suggestion?.kind !== "dose") return;
    addInsulinLog({
      id: crypto.randomUUID(),
      units: suggestion.units,
      insulinType: profile.insulinRapid,
      mealType: "correction",
      carbsGrams: 0,
      glucoseBefore: value,
      notes: "correction hyper — suggestion auto",
      injectedAt: new Date(),
    });
    setJustLogged(true);
    setTimeout(() => setJustLogged(false), 3000);
  }

  return (
    <section className="panel border border-warning/30">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-start gap-3">
          <div
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
              isHyper ? "bg-error/15" : "bg-warning/15"
            }`}
          >
            <AlertTriangle
              className={`w-5 h-5 ${isHyper ? "text-error" : "text-warning"}`}
            />
          </div>
          <div className="min-w-0">
            <p className="label">
              {isHyper ? "Alerte — hyperglycémie" : "Correction suggérée"}
            </p>
            <h3 className="text-base font-semibold text-text-primary mt-0.5">
              Tu es à{" "}
              <span
                className={`num ${isHyper ? "text-error" : "text-warning"}`}
              >
                {value}
              </span>{" "}
              mg/dL
            </h3>
            <p className="text-xs text-text-tertiary mt-0.5">
              Cible : <span className="num">{target}</span> mg/dL ·{" "}
              {glucoseToneLabel(tone)}
            </p>
          </div>
        </div>
      </div>

      {suggestion.kind === "wait-iob" ? (
        <div className="rounded-2xl bg-error/8 border border-error/25 p-4 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-4 h-4 text-error" />
            <p className="text-sm font-semibold text-error">
              Pas de correction maintenant
            </p>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Tu as déjà{" "}
            <span className="num font-semibold">{fr(suggestion.iobUnits)} U</span>{" "}
            d&apos;insuline active. En rajouter maintenant risque de te faire
            passer en hypo. Attends qu&apos;elle retombe sous 0,5 U.
          </p>
        </div>
      ) : suggestion.kind === "falling" ? (
        <div className="rounded-2xl surface-2 p-4 mb-3">
          <p className="text-sm font-semibold text-text-primary mb-1">
            Ta glycémie descend déjà
          </p>
          <p className="text-xs text-text-secondary leading-relaxed">
            Pas de correction tant que la flèche pointe vers le bas : elle
            s&apos;ajouterait à la descente en cours. Revois dans 30 min.
          </p>
        </div>
      ) : suggestion.kind === "too-small" ? (
        <div className="rounded-2xl surface-2 p-4 mb-3">
          <p className="text-xs text-text-secondary leading-relaxed">
            Il faudrait <span className="num">{fr(suggestion.raw)} U</span> :
            moins d&apos;une unité entière. Une unité complète te ferait passer
            sous ta cible. Surveille la tendance.
          </p>
        </div>
      ) : (
        <div className="rounded-2xl bg-diabete/10 border border-diabete/30 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="label" style={{ color: "var(--diabete)" }}>
              Dose suggérée
            </p>
            <Badge variant={iobUnits > 0 ? "warning" : "default"} size="sm">
              Insuline active <span className="num ml-1">{fr(iobUnits)}</span> U
            </Badge>
          </div>

          <div className="flex items-baseline gap-2 mb-3">
            <span className="num-hero text-5xl sm:text-6xl font-semibold text-diabete leading-none">
              {units}
            </span>
            <span className="text-lg text-diabete/70 font-medium">U</span>
          </div>

          <p className="text-xs text-text-secondary mb-4 leading-relaxed">
            {value - target} mg/dL au-dessus de la cible, soit{" "}
            <span className="num">{fr(suggestion.raw)} U</span> théoriques
            {suggestion.iobDeducted > 0 ? " (insuline active déduite)" : ""}
            {suggestion.exerciseReductionPct > 0
              ? `, réduites de ${Math.round(suggestion.exerciseReductionPct)} % après le sport`
              : ""}
            . Arrondi en dessous : <span className="num font-semibold">{units} U</span>,
            atterrissage vers <span className="num">{suggestion.landing}</span> mg/dL.
          </p>

          {isHyper && (
            <div className="rounded-xl bg-error/10 border border-error/25 p-3 mb-3">
              <p className="text-xs text-error font-medium mb-1">
                Vérifie les cétones
              </p>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Au-dessus de 250 mg/dL, teste la cétonémie (bandelette ou
                lecteur). Si &gt; 1,0 mmol/L : contacte ton médecin, ne fais
                pas de sport.
              </p>
            </div>
          )}

          {justLogged ? (
            <div className="w-full bg-success/15 border border-success/30 text-success font-medium py-3 rounded-xl flex items-center justify-center gap-2">
              <Check className="w-4 h-4" />
              <span>Correction enregistrée ({units} U)</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLog}
              className="w-full bg-diabete text-ink font-semibold py-3 rounded-xl hover:bg-diabete/90 transition-colors tap-scale flex items-center justify-center gap-2"
            >
              <Syringe className="w-4 h-4" />
              Enregistrer la correction ({units} U)
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-text-tertiary italic text-center">
        Calculé avec ta sensibilité ({isf} mg/dL par U) et ta cible ({target} mg/dL).
        Ajuste à la main dans le calculateur si besoin.
      </p>
    </section>
  );
}
