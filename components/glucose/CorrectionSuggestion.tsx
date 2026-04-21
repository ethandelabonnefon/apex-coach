"use client";

/**
 * CorrectionSuggestion — carte qui propose un bolus de correction.
 *
 * Se déclenche automatiquement quand la glycémie live (capteur Libre 2)
 * dépasse la cible haute (180 mg/dL par défaut), en prenant en compte
 * l'insuline active (IOB) pour éviter le stacking.
 *
 * Règle T1D-first :
 *   - correction = (glucose - cible) / ISF, arrondie à 0,5U
 *   - si IOB > 0,5U : on affiche un WARNING rouge "ne pas empiler", pas de bouton injection
 *   - si IOB ≈ 0 et glucose > 180 : on propose l'injection
 *   - si glucose > 250 (hyper) : message "vérifier cétones"
 *
 * Ne s'affiche PAS si :
 *   - capteur non configuré / en erreur
 *   - glycémie en plage (<= targetRange.max)
 */

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useGlucose } from "@/hooks/useGlucose";
import { getInsulinOnBoard } from "@/lib/insulin-calculator";
import { DIABETES_CONFIG } from "@/lib/constants";
import { glucoseTone, glucoseToneLabel } from "@/lib/libre-link/utils";
import { Badge } from "@/components/ui/Badge";
import { Syringe, AlertTriangle, Info, Check } from "lucide-react";

export default function CorrectionSuggestion() {
  const { profile, diabetesConfig, insulinLogs, addInsulinLog } = useStore();
  const { current: live } = useGlucose({ mode: "current" });
  const [justLogged, setJustLogged] = useState(false);

  // ─── IOB (insuline active) ─────────────────────
  const iob = useMemo(() => {
    const now = new Date();
    const recentInjections = insulinLogs
      .map((log) => {
        const injectedAt = new Date(log.injectedAt);
        const minutesAgo =
          (now.getTime() - injectedAt.getTime()) / 60_000;
        return { units: log.units, minutesAgo };
      })
      .filter(
        (inj) =>
          inj.minutesAgo < DIABETES_CONFIG.insulinActiveDuration &&
          inj.minutesAgo >= 0,
      );
    return getInsulinOnBoard(recentInjections);
  }, [insulinLogs]);

  // ─── Ne s'affiche pas si pas de donnée live ou glycémie OK ──
  if (!live) return null;
  const value = live.value;
  const targetHigh = diabetesConfig.targetRange.max;
  if (value <= targetHigh) return null;

  // ─── Calculs ────────────────────────────────
  const target = diabetesConfig.targetGlucose;
  const isf = diabetesConfig.insulinSensitivityFactor;
  const rawCorrection = (value - target) / isf;
  const correctionBolus = Math.max(0, Math.round(rawCorrection * 2) / 2);
  const tone = glucoseTone(value);
  const isHyper = tone === "hyper"; // > 250
  const iobTooHigh = iob.totalIOB > 0.5;

  function handleLog() {
    addInsulinLog({
      id: crypto.randomUUID(),
      units: correctionBolus,
      insulinType: profile.insulinRapid,
      mealType: "correction",
      carbsGrams: 0,
      glucoseBefore: value,
      notes: "correction hyper — suggestion auto",
      injectedAt: new Date(),
    });
    setJustLogged(true);
    // Reset le confirm visuel après 3s (au cas où l'utilisateur reste sur la page)
    setTimeout(() => setJustLogged(false), 3000);
  }

  // Ratio ISF en format naturel : 0,5U pour 50 mg/dL
  const unitsPer50 = 50 / isf; // = 0.5 avec ISF 100

  return (
    <section className="surface-1 rounded-3xl p-5 border border-warning/30">
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

      {/* Bloc dose suggérée */}
      {iobTooHigh ? (
        // Cas 1 : IOB trop élevé → ne pas empiler
        <div className="rounded-2xl bg-error/8 border border-error/25 p-4 mb-3">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-4 h-4 text-error" />
            <p className="text-sm font-semibold text-error">
              Pas de correction maintenant
            </p>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Tu as déjà{" "}
            <span className="num font-semibold">{iob.totalIOB}U</span>{" "}
            d&apos;insuline active (IOB). Empiler une correction maintenant
            risque de te faire passer en hypo. Attends que l&apos;IOB retombe
            sous 0,5U avant de corriger.
          </p>
        </div>
      ) : correctionBolus === 0 ? (
        // Cas 2 : correction arrondie à 0U (tu es juste au-dessus de target+threshold mais pas assez)
        <div className="rounded-2xl surface-2 p-4 mb-3">
          <p className="text-xs text-text-secondary">
            Dose trop faible pour être utile (arrondi à 0U). Surveille la
            tendance — une correction pourra s&apos;imposer si ça continue à
            monter.
          </p>
        </div>
      ) : (
        // Cas 3 : on propose la dose
        <div className="rounded-2xl bg-diabete/10 border border-diabete/30 p-4 mb-3">
          <div className="flex items-center justify-between mb-3">
            <p className="label" style={{ color: "var(--diabete)" }}>
              Dose suggérée
            </p>
            <Badge variant={iob.totalIOB > 0 ? "warning" : "default"} size="sm">
              IOB <span className="num ml-1">{iob.totalIOB}</span>U
            </Badge>
          </div>

          <div className="flex items-baseline gap-2 mb-3">
            <span className="num-hero text-5xl sm:text-6xl font-semibold text-diabete leading-none">
              {correctionBolus}
            </span>
            <span className="text-lg text-diabete/70 font-medium">U</span>
          </div>

          <p className="text-xs text-text-secondary mb-4">
            {value - target} mg/dL au-dessus de la cible →{" "}
            <span className="num">
              {unitsPer50.toFixed(1).replace(".", ",")}
            </span>
            U pour 50 mg/dL ={" "}
            <span className="num font-semibold">{correctionBolus}</span>U
          </p>

          {isHyper && (
            <div className="rounded-xl bg-error/10 border border-error/25 p-3 mb-3">
              <p className="text-xs text-error font-medium mb-1">
                ⚠️ Vérifie les cétones
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
              <span>Correction enregistrée ({correctionBolus}U)</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleLog}
              className="w-full bg-diabete text-ink font-semibold py-3 rounded-xl hover:bg-diabete/90 transition-colors tap-scale flex items-center justify-center gap-2"
            >
              <Syringe className="w-4 h-4" />
              Enregistrer la correction ({correctionBolus}U)
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-text-tertiary italic text-center">
        Suggestion basée sur ton ISF ({isf} mg/dL/U) et ta cible ({target} mg/dL).
        Ajuste manuellement si besoin via le calculateur ci-dessous.
      </p>
    </section>
  );
}
