"use client";

import { useState } from "react";
import { Button, Card, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { NutritionDiagnosticData } from "@/lib/nutrition-calculator";

interface Props {
  onComplete: (data: NutritionDiagnosticData) => void;
}

// ─── Option button ──────────────────────────────
function OptionButton({
  selected,
  onClick,
  children,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
  description?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left p-3 rounded-xl border transition-all ${
        selected
          ? "border-[#00ff94]/50 bg-[#00ff94]/10 text-white"
          : "border-white/[0.06] bg-white/[0.03] text-white/60 hover:bg-white/[0.06]"
      }`}
    >
      <span className="text-sm font-medium">{children}</span>
      {description && <p className="text-[11px] text-white/40 mt-0.5">{description}</p>}
    </button>
  );
}

// ─── Number input ───────────────────────────────
function NumberInput({
  label,
  value,
  onChange,
  suffix,
  placeholder,
  helpText,
}: {
  label: string;
  value: number | undefined;
  onChange: (v: number) => void;
  suffix?: string;
  placeholder?: string;
  helpText?: string;
}) {
  return (
    <div>
      <label className="text-xs text-white/40 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value))}
          placeholder={placeholder}
          className="w-full bg-white/[0.06] border border-white/[0.06] rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50"
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">
            {suffix}
          </span>
        )}
      </div>
      {helpText && <p className="text-[10px] text-white/30 mt-1">{helpText}</p>}
    </div>
  );
}

const STEPS = ["Données physiques", "Niveau d'activité", "Objectif", "Préférences & T1D"];

export default function NutritionDiagnosticForm({ onComplete }: Props) {
  const profile = useStore((s) => s.profile);
  const [step, setStep] = useState(0);

  // Form state — pre-filled from profile
  const [data, setData] = useState<Partial<NutritionDiagnosticData>>({
    height: profile.height,
    weight: profile.weight,
    age: profile.age,
    sex: "male",
    muscuSessionsPerWeek: profile.trainingDaysPerWeek || 4,
    averageMuscuDuration: 60,
    runningSessionsPerWeek: 3,
    averageRunningDuration: 45,
    dailyActivityLevel: "light",
    jobType: "desk",
    primaryGoal: "bulk",
    aggressiveness: "moderate",
    mealsPerDay: 4,
    dietaryRestrictions: [],
    carbTiming: "around_workout",
    t1dConsiderations: {
      countCarbs: true,
      lowCarbPreference: "no",
      insulinSensitivity: "normal",
    },
  });

  const update = (partial: Partial<NutritionDiagnosticData>) =>
    setData((prev) => ({ ...prev, ...partial }));

  const updateT1D = (partial: Partial<NutritionDiagnosticData["t1dConsiderations"]>) =>
    setData((prev) => ({
      ...prev,
      t1dConsiderations: { ...prev.t1dConsiderations!, ...partial },
    }));

  const canProceed = () => {
    if (step === 0) return (data.height ?? 0) > 0 && (data.weight ?? 0) > 0 && (data.age ?? 0) > 0 && data.sex;
    if (step === 1) return data.dailyActivityLevel && data.jobType;
    if (step === 2) return data.primaryGoal && data.aggressiveness;
    return true;
  };

  const handleSubmit = () => {
    onComplete(data as NutritionDiagnosticData);
  };

  const toggleRestriction = (r: string) => {
    const current = data.dietaryRestrictions || [];
    if (r === "Aucune") {
      update({ dietaryRestrictions: ["Aucune"] });
    } else {
      const without = current.filter((x) => x !== "Aucune");
      update({
        dietaryRestrictions: without.includes(r) ? without.filter((x) => x !== r) : [...without, r],
      });
    }
  };

  return (
    <Card className="max-w-2xl mx-auto">
      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => (
          <div key={s} className="flex-1">
            <div
              className={`h-1 rounded-full transition-colors ${
                i <= step ? "bg-[#00ff94]" : "bg-white/[0.06]"
              }`}
            />
            <p
              className={`text-[10px] mt-1 ${
                i === step ? "text-[#00ff94]" : "text-white/30"
              }`}
            >
              {s}
            </p>
          </div>
        ))}
      </div>

      {/* Step 1: Physical Data */}
      {step === 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Données physiques</h3>
          <p className="text-sm text-white/40">Pré-rempli depuis ton profil. Ajuste si nécessaire.</p>

          <div className="grid grid-cols-3 gap-3">
            <NumberInput label="Taille" value={data.height} onChange={(v) => update({ height: v })} suffix="cm" />
            <NumberInput label="Poids actuel" value={data.weight} onChange={(v) => update({ weight: v })} suffix="kg" />
            <NumberInput label="Âge" value={data.age} onChange={(v) => update({ age: v })} suffix="ans" />
          </div>

          <div>
            <label className="text-xs text-white/40 mb-2 block">Sexe biologique</label>
            <p className="text-[10px] text-white/25 mb-2">Nécessaire pour le calcul du métabolisme</p>
            <div className="grid grid-cols-2 gap-2">
              <OptionButton selected={data.sex === "male"} onClick={() => update({ sex: "male" })}>
                Homme
              </OptionButton>
              <OptionButton selected={data.sex === "female"} onClick={() => update({ sex: "female" })}>
                Femme
              </OptionButton>
            </div>
          </div>

          <NumberInput
            label="Taux de masse grasse (optionnel)"
            value={data.bodyFatPercentage}
            onChange={(v) => update({ bodyFatPercentage: v })}
            suffix="%"
            helpText="Si tu le connais, ça améliore la précision du calcul"
          />
        </div>
      )}

      {/* Step 2: Activity Level */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Niveau d'activité</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/40 mb-2 block">Séances muscu / semaine</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <OptionButton
                    key={n}
                    selected={data.muscuSessionsPerWeek === n}
                    onClick={() => update({ muscuSessionsPerWeek: n })}
                  >
                    {n}
                  </OptionButton>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-white/40 mb-2 block">Séances running / semaine</label>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 3, 4].map((n) => (
                  <OptionButton
                    key={n}
                    selected={data.runningSessionsPerWeek === n}
                    onClick={() => update({ runningSessionsPerWeek: n })}
                  >
                    {n === 4 ? "4+" : String(n)}
                  </OptionButton>
                ))}
              </div>
            </div>
          </div>

          {(data.muscuSessionsPerWeek ?? 0) > 0 && (
            <div>
              <label className="text-xs text-white/40 mb-2 block">Durée moyenne d&apos;une séance muscu</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { v: 30, l: "~30 min" },
                  { v: 45, l: "~45 min" },
                  { v: 60, l: "~1h" },
                  { v: 75, l: "~1h15" },
                  { v: 90, l: "1h30+" },
                ].map((o) => (
                  <OptionButton
                    key={o.v}
                    selected={data.averageMuscuDuration === o.v}
                    onClick={() => update({ averageMuscuDuration: o.v })}
                  >
                    {o.l}
                  </OptionButton>
                ))}
              </div>
            </div>
          )}

          {(data.runningSessionsPerWeek ?? 0) > 0 && (
            <div>
              <label className="text-xs text-white/40 mb-2 block">Durée moyenne d&apos;une sortie running</label>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { v: 20, l: "~20 min" },
                  { v: 30, l: "~30 min" },
                  { v: 45, l: "~45 min" },
                  { v: 60, l: "~1h" },
                  { v: 90, l: "1h30+" },
                ].map((o) => (
                  <OptionButton
                    key={o.v}
                    selected={data.averageRunningDuration === o.v}
                    onClick={() => update({ averageRunningDuration: o.v })}
                  >
                    {o.l}
                  </OptionButton>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-white/40 mb-2 block">Activité quotidienne (hors sport)</label>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { v: "sedentary", l: "Sédentaire", d: "Bureau, peu de marche" },
                { v: "light", l: "Légèrement actif", d: "Marche quotidienne, escaliers" },
                { v: "moderate", l: "Modérément actif", d: "Debout souvent, déplacements" },
                { v: "active", l: "Actif", d: "Travail physique léger" },
                { v: "very_active", l: "Très actif", d: "Travail physique intense" },
              ].map((o) => (
                <OptionButton
                  key={o.v}
                  selected={data.dailyActivityLevel === o.v}
                  onClick={() => update({ dailyActivityLevel: o.v as NutritionDiagnosticData["dailyActivityLevel"] })}
                  description={o.d}
                >
                  {o.l}
                </OptionButton>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-2 block">Type de travail</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: "desk", l: "Bureau / Assis" },
                { v: "standing", l: "Debout / Commercial" },
                { v: "physical", l: "Physique / Manuel" },
              ].map((o) => (
                <OptionButton
                  key={o.v}
                  selected={data.jobType === o.v}
                  onClick={() => update({ jobType: o.v as NutritionDiagnosticData["jobType"] })}
                >
                  {o.l}
                </OptionButton>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Goal */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Objectif nutritionnel</h3>

          <div className="grid grid-cols-2 gap-2">
            {[
              { v: "bulk", l: "Prise de masse", d: "Gagner du muscle (et un peu de gras)", delta: "+300 à +500 kcal" },
              { v: "cut", l: "Sèche", d: "Perdre du gras en gardant le muscle", delta: "-300 à -500 kcal" },
              { v: "maintain", l: "Maintenance", d: "Maintenir ton physique actuel", delta: "±0 kcal" },
              { v: "recomp", l: "Recomposition", d: "Perdre du gras ET gagner du muscle (lent)", delta: "~0 kcal" },
            ].map((o) => (
              <OptionButton
                key={o.v}
                selected={data.primaryGoal === o.v}
                onClick={() => update({ primaryGoal: o.v as NutritionDiagnosticData["primaryGoal"] })}
                description={o.d}
              >
                {o.l} <Badge color="gray">{o.delta}</Badge>
              </OptionButton>
            ))}
          </div>

          {data.primaryGoal !== "maintain" && (
            <div className="grid grid-cols-2 gap-3">
              <NumberInput
                label="Poids cible"
                value={data.targetWeight}
                onChange={(v) => update({ targetWeight: v })}
                suffix="kg"
                placeholder={data.primaryGoal === "bulk" ? "92" : "80"}
                helpText="Optionnel"
              />
              <NumberInput
                label="En combien de semaines ?"
                value={data.targetTimelineWeeks}
                onChange={(v) => update({ targetTimelineWeeks: v })}
                suffix="sem"
                placeholder="12"
                helpText="Si rempli, override le rythme"
              />
            </div>
          )}

          {/* Preview du rythme calculé si timeline fournie */}
          {(data.primaryGoal === "bulk" || data.primaryGoal === "cut") &&
            data.targetWeight &&
            data.targetTimelineWeeks &&
            data.targetTimelineWeeks > 0 &&
            data.weight && (
              <div className="rounded-xl bg-[#00ff94]/10 border border-[#00ff94]/25 px-3 py-2.5 text-xs">
                <p className="text-[#00ff94] font-medium">
                  Rythme calculé :{" "}
                  {(
                    Math.round(
                      ((data.targetWeight - data.weight) / data.targetTimelineWeeks) * 100,
                    ) / 100
                  ).toFixed(2)}{" "}
                  kg/sem
                </p>
                <p className="text-white/50 mt-0.5">
                  {data.targetWeight - data.weight > 0 ? "+" : ""}
                  {(data.targetWeight - data.weight).toFixed(1)} kg sur {data.targetTimelineWeeks}{" "}
                  semaines
                </p>
              </div>
            )}

          {(data.primaryGoal === "bulk" || data.primaryGoal === "cut") && (
            <div>
              <label className="text-xs text-white/40 mb-2 block">
                Rythme souhaité{" "}
                {data.targetWeight && data.targetTimelineWeeks ? (
                  <span className="text-white/25">(ignoré — objectif chiffré prioritaire)</span>
                ) : null}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  {
                    v: "slow",
                    l: "Lent & progressif",
                    d: data.primaryGoal === "bulk" ? "+0.25 kg/sem" : "-0.25 kg/sem",
                  },
                  {
                    v: "moderate",
                    l: "Modéré",
                    d: data.primaryGoal === "bulk" ? "+0.5 kg/sem" : "-0.5 kg/sem",
                  },
                  {
                    v: "aggressive",
                    l: "Agressif",
                    d: data.primaryGoal === "bulk" ? "+0.75 kg/sem" : "-0.75 kg/sem",
                  },
                ].map((o) => (
                  <OptionButton
                    key={o.v}
                    selected={data.aggressiveness === o.v}
                    onClick={() => update({ aggressiveness: o.v as NutritionDiagnosticData["aggressiveness"] })}
                    description={o.d}
                  >
                    {o.l}
                  </OptionButton>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 4: Preferences & T1D */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Préférences & Diabète T1</h3>

          <div>
            <label className="text-xs text-white/40 mb-2 block">Nombre de repas par jour</label>
            <div className="grid grid-cols-4 gap-1.5">
              {[
                { v: 3, l: "3 repas" },
                { v: 4, l: "4 repas" },
                { v: 5, l: "5 repas" },
                { v: 6, l: "6 repas" },
              ].map((o) => (
                <OptionButton
                  key={o.v}
                  selected={data.mealsPerDay === o.v}
                  onClick={() => update({ mealsPerDay: o.v })}
                >
                  {o.l}
                </OptionButton>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-2 block">Restrictions alimentaires</label>
            <div className="flex flex-wrap gap-1.5">
              {["Aucune", "Végétarien", "Végan", "Sans lactose", "Sans gluten", "Halal", "Allergie noix"].map(
                (r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRestriction(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                      (data.dietaryRestrictions || []).includes(r)
                        ? "bg-[#00ff94]/15 text-[#00ff94] border border-[#00ff94]/30"
                        : "bg-white/[0.04] text-white/50 border border-white/[0.06] hover:bg-white/[0.08]"
                    }`}
                  >
                    {r}
                  </button>
                )
              )}
            </div>
          </div>

          <div>
            <label className="text-xs text-white/40 mb-2 block">Répartition des glucides préférée</label>
            <div className="grid grid-cols-1 gap-1.5">
              {[
                { v: "spread", l: "Répartis sur la journée", d: "Plus stable pour la glycémie" },
                { v: "around_workout", l: "Autour des entraînements", d: "Plus avant/après le sport" },
                { v: "backloaded", l: "Concentrés le soir", d: "Peu de glucides la journée, plus le soir" },
              ].map((o) => (
                <OptionButton
                  key={o.v}
                  selected={data.carbTiming === o.v}
                  onClick={() => update({ carbTiming: o.v as NutritionDiagnosticData["carbTiming"] })}
                  description={o.d}
                >
                  {o.l}
                </OptionButton>
              ))}
            </div>
          </div>

          {/* T1D section */}
          <div className="pt-4 border-t border-white/[0.06]">
            <p className="text-sm font-semibold text-[#00d4ff] mb-3">Considérations Diabète T1</p>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div>
                  <p className="text-sm text-white/80">Calcul des glucides précis par repas</p>
                  <p className="text-[10px] text-white/30">Pour faciliter le calcul de ton bolus</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateT1D({ countCarbs: !data.t1dConsiderations?.countCarbs })}
                  className={`w-10 h-6 rounded-full transition-colors ${
                    data.t1dConsiderations?.countCarbs ? "bg-[#00ff94]" : "bg-white/[0.1]"
                  }`}
                >
                  <span
                    className={`block w-4 h-4 bg-white rounded-full transition-transform mx-1 ${
                      data.t1dConsiderations?.countCarbs ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-2 block">Approche glucides</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { v: "no", l: "Normal" },
                    { v: "moderate", l: "Réduit (-20%)" },
                    { v: "low", l: "Low-carb (-40%)" },
                  ].map((o) => (
                    <OptionButton
                      key={o.v}
                      selected={data.t1dConsiderations?.lowCarbPreference === o.v}
                      onClick={() =>
                        updateT1D({
                          lowCarbPreference: o.v as NutritionDiagnosticData["t1dConsiderations"]["lowCarbPreference"],
                        })
                      }
                    >
                      {o.l}
                    </OptionButton>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-white/40 mb-2 block">Sensibilité à l'insuline</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {[
                    { v: "high", l: "Haute", d: "Peu d'insuline nécessaire" },
                    { v: "normal", l: "Normale" },
                    { v: "low", l: "Basse", d: "Besoin de plus d'insuline" },
                  ].map((o) => (
                    <OptionButton
                      key={o.v}
                      selected={data.t1dConsiderations?.insulinSensitivity === o.v}
                      onClick={() =>
                        updateT1D({
                          insulinSensitivity: o.v as NutritionDiagnosticData["t1dConsiderations"]["insulinSensitivity"],
                        })
                      }
                      description={o.d}
                    >
                      {o.l}
                    </OptionButton>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-6 pt-4 border-t border-white/[0.06]">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
            Retour
          </Button>
        ) : (
          <div />
        )}

        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep((s) => s + 1)} disabled={!canProceed()}>
            Suivant
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={!canProceed()}>
            Calculer mes macros
          </Button>
        )}
      </div>
    </Card>
  );
}
