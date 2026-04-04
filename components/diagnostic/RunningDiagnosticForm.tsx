"use client";

import { useState, useCallback } from "react";
import { Card, Button, SectionTitle, ProgressBar, InfoBox, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";

const STEP_LABELS = ["Profil Running", "Physiologie", "Test Terrain", "Objectifs", "Contraintes T1D"];

interface SelectOption { value: string; label: string; description?: string; note?: string; t1dAdvice?: string; t1dWarning?: string; warning?: string; alert?: boolean }

function OptionButton({ option, selected, onClick }: { option: SelectOption; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left p-3 rounded-xl border transition-all ${selected ? "bg-[#00ff94]/10 border-[#00ff94]/30 text-white" : "bg-white/[0.03] border-white/[0.06] text-white/60 hover:bg-white/[0.06]"}`}>
      <p className="text-sm font-medium">{option.label}</p>
      {option.description && <p className="text-xs text-white/35 mt-0.5">{option.description}</p>}
      {option.note && <p className="text-[10px] text-white/25 mt-0.5">{option.note}</p>}
      {option.t1dAdvice && selected && <p className="text-[10px] text-[#ff9500] mt-1">T1D : {option.t1dAdvice}</p>}
      {option.t1dWarning && selected && <p className="text-[10px] text-[#ff4757] mt-1">{option.t1dWarning}</p>}
      {option.warning && selected && <p className="text-[10px] text-[#ff4757] mt-1">{option.warning}</p>}
      {option.alert && selected && <p className="text-[10px] text-[#ff4757] mt-1 font-medium">On va adapter ton protocole</p>}
    </button>
  );
}

function MultiSelectGrid({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {options.map((opt) => {
        const isSel = selected.includes(opt);
        return (
          <button key={opt} onClick={() => onToggle(opt)} className={`p-2.5 rounded-xl text-xs font-medium border transition-all ${isSel ? "bg-[#00ff94]/10 border-[#00ff94]/30 text-[#00ff94]" : "bg-white/[0.03] border-white/[0.06] text-white/50 hover:bg-white/[0.06]"}`}>
            {isSel && "✓ "}{opt}
          </button>
        );
      })}
    </div>
  );
}

export default function RunningDiagnosticForm() {
  const { profile, setRunningDiagnosticData, runningDiagnosticData, runningDiagnosticCompleted } = useStore();
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  const [data, setData] = useState<Record<string, unknown>>(() => {
    if (runningDiagnosticCompleted && Object.keys(runningDiagnosticData).length > 0) return runningDiagnosticData;
    return {
      // Step 0 - Profil
      runningExperience: "", currentFrequency: "", maxRecentDistance: "",
      officialRaces: [] as string[], best5k: "", best10k: "", bestSemi: "",
      // Step 1 - Physiologie
      vo2max: "", vo2maxUnknown: false, restingHR: "", restingHRUnknown: false,
      maxHR: "", maxHRUnknown: false, currentWeight: String(profile.weight || ""),
      // Step 2 - Test terrain
      selectedTest: "", testResult: "", skipTest: false,
      // Step 3 - Objectifs
      primaryGoal: "", targetTime: "", targetTimeValue: "", raceDate: "",
      availableDays: [] as string[], maxRunsPerWeek: "",
      // Step 4 - T1D
      preferredRunTime: "", hyposWhileRunning: "", preRunTargetGlucose: "150",
      glucoseDropRate: "", carbsDuringRun: "", carbsAmount: "30",
      insulinAdjustments: [] as string[],
    };
  });

  const set = useCallback((key: string, val: unknown) => setData((prev) => ({ ...prev, [key]: val })), []);
  const toggle = useCallback((key: string, val: string) => {
    setData((prev) => {
      const arr = (prev[key] as string[]) || [];
      return { ...prev, [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] };
    });
  }, []);

  // Calculate VMA from test result
  const calculatedVMA = data.selectedTest === "test_6min" && data.testResult
    ? (Number(data.testResult) / 100).toFixed(1)
    : data.selectedTest === "test_cooper" && data.testResult
      ? ((Number(data.testResult) - 504) / 45).toFixed(1)
      : null;

  const estimatedMaxHR = data.maxHRUnknown ? 220 - (profile.age || 21) : null;

  const handleSubmit = async () => {
    const submitData = {
      ...data,
      calculatedVMA: calculatedVMA ? Number(calculatedVMA) : null,
      estimatedMaxHR,
    };
    setRunningDiagnosticData(submitData);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-running-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          diagnosticData: submitData,
          userContext: { name: profile.name, age: profile.age, height: profile.height, weight: profile.weight, goals: profile.goals },
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult(json);
        useStore.getState().setGeneratedRunningPlan(json);
      }
    } catch (err) {
      console.error("Erreur génération plan running:", err);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Result view ───────────────────────────────────────────────
  if (result || (runningDiagnosticCompleted && useStore.getState().generatedRunningPlan)) {
    const plan = result || useStore.getState().generatedRunningPlan || {};
    const p = plan as Record<string, unknown>;
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionTitle className="!mb-0">Plan Running généré</SectionTitle>
          <Button variant="ghost" size="sm" onClick={() => { setResult(null); setStep(0); }}>Refaire le diagnostic</Button>
        </div>
        <InfoBox variant="success">Plan running personnalisé généré avec succès !</InfoBox>

        {/* Zones display */}
        {Boolean(p.zones) && (
          <Card>
            <SectionTitle>Zones d'entraînement</SectionTitle>
            <div className="space-y-2">
              {(p.zones as { name: string; paceMin: string; paceMax: string; hrMin: number; hrMax: number; description: string }[]).map((zone, i) => (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03]">
                  <Badge color={i < 2 ? "green" : i < 4 ? "orange" : "red"}>Z{i + 1}</Badge>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{zone.name}</p>
                    <p className="text-[10px] text-white/35">{zone.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/70">{zone.paceMin} - {zone.paceMax}</p>
                    <p className="text-[10px] text-white/30">{zone.hrMin}-{zone.hrMax} bpm</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Predictions */}
        {Boolean(p.predictions) && (
          <Card>
            <SectionTitle>Prédictions de temps</SectionTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(p.predictions as Record<string, unknown>).map(([dist, time]) => (
                <div key={dist} className="p-3 rounded-xl bg-white/[0.03] text-center">
                  <p className="text-[10px] text-white/35 uppercase">{dist}</p>
                  <p className="text-sm font-medium mt-1">{String(time)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        {Boolean(p.fullAnalysis) && (
          <Card>
            <SectionTitle>Analyse</SectionTitle>
            <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{String(p.fullAnalysis)}</div>
          </Card>
        )}
      </div>
    );
  }

  // ─── Summary view (completed, no result) ────────────────────
  if (runningDiagnosticCompleted && Object.keys(runningDiagnosticData).length > 0 && !generating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionTitle className="!mb-0">Diagnostic Running</SectionTitle>
          <Button variant="secondary" size="sm" onClick={() => setStep(0)}>Modifier</Button>
        </div>
        <InfoBox variant="success">Diagnostic running complété !</InfoBox>
        <Card>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Expérience", value: String(runningDiagnosticData.runningExperience || "—").replace(/_/g, " ") },
              { label: "Fréquence", value: `${runningDiagnosticData.currentFrequency || "—"}x/sem` },
              { label: "Distance max", value: `${runningDiagnosticData.maxRecentDistance || "—"} km` },
              { label: "Objectif", value: String(runningDiagnosticData.primaryGoal || "—").replace(/_/g, " ") },
              { label: "Sorties/sem", value: String(runningDiagnosticData.maxRunsPerWeek || "—") },
              { label: "VO2max", value: runningDiagnosticData.vo2maxUnknown ? "Non connue" : `${runningDiagnosticData.vo2max || "—"}` },
            ].map((item) => (
              <div key={item.label} className="p-2.5 rounded-lg bg-white/[0.03]">
                <p className="text-[10px] text-white/35 uppercase">{item.label}</p>
                <p className="text-sm font-medium mt-0.5 capitalize">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>
        <Button onClick={handleSubmit} disabled={generating} className="w-full">
          {generating ? "Génération en cours..." : "Regénérer le plan"}
        </Button>
      </div>
    );
  }

  // ─── Form steps ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ProgressBar value={step + 1} max={5} color="#00ff94" label={`Étape ${step + 1}/5 — ${STEP_LABELS[step]}`} />

      {/* Step 0: Profil Running */}
      {step === 0 && (
        <Card>
          <SectionTitle>Profil Running Actuel</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Depuis combien de temps tu cours ?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "never", label: "Jamais couru régulièrement", description: "Débutant complet" },
                  { value: "<6months", label: "Moins de 6 mois", description: "Débutant" },
                  { value: "6-12months", label: "6-12 mois", description: "Débutant+" },
                  { value: "1-2years", label: "1-2 ans", description: "Intermédiaire" },
                  { value: "2+years", label: "Plus de 2 ans", description: "Confirmé" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.runningExperience === opt.value} onClick={() => set("runningExperience", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Fréquence actuelle ?</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  { value: "0", label: "0x/sem", note: "Pas actuellement" },
                  { value: "1", label: "1x/sem" },
                  { value: "2", label: "2x/sem" },
                  { value: "3", label: "3x/sem" },
                  { value: "4", label: "4x+/sem" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.currentFrequency === opt.value} onClick={() => set("currentFrequency", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Distance max courue récemment (3 derniers mois) ?</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { value: "0", label: "Jamais couru" },
                  { value: "3", label: "Moins de 3 km" },
                  { value: "5", label: "3-5 km" },
                  { value: "10", label: "5-10 km" },
                  { value: "15", label: "10-15 km" },
                  { value: "20", label: "15+ km" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.maxRecentDistance === opt.value} onClick={() => set("maxRecentDistance", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Courses officielles ?</p>
              <MultiSelectGrid options={["Aucune", "5K", "10K", "Semi-marathon", "Marathon", "Trail"]} selected={data.officialRaces as string[]} onToggle={(v) => toggle("officialRaces", v)} />
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Meilleurs temps (optionnel)</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-white/30 block mb-1">5K</label>
                  <input type="text" value={String(data.best5k || "")} onChange={(e) => set("best5k", e.target.value)} placeholder="MM:SS" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                </div>
                <div>
                  <label className="text-[10px] text-white/30 block mb-1">10K</label>
                  <input type="text" value={String(data.best10k || "")} onChange={(e) => set("best10k", e.target.value)} placeholder="MM:SS" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                </div>
                <div>
                  <label className="text-[10px] text-white/30 block mb-1">Semi</label>
                  <input type="text" value={String(data.bestSemi || "")} onChange={(e) => set("bestSemi", e.target.value)} placeholder="HH:MM:SS" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                </div>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 1: Physiologie */}
      {step === 1 && (
        <Card>
          <SectionTitle>Données Physiologiques</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-1.5">VO2max connue ?</p>
              <p className="text-[10px] text-white/25 mb-2">Disponible sur Garmin, Apple Watch, ou Whoop</p>
              {data.vo2maxUnknown ? (
                <button onClick={() => set("vo2maxUnknown", false)} className="text-sm text-[#00ff94] underline">Je connais ma VO2max</button>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" value={String(data.vo2max || "")} onChange={(e) => set("vo2max", e.target.value)} placeholder="Ex: 49" className="w-24 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                  <span className="text-xs text-white/30">ml/kg/min</span>
                  <button onClick={() => { set("vo2maxUnknown", true); set("vo2max", ""); }} className="text-[10px] text-white/30 underline ml-2">Je ne sais pas</button>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Fréquence cardiaque au repos</p>
              <p className="text-[10px] text-white/25 mb-2">Mesurée au réveil, allongé</p>
              {data.restingHRUnknown ? (
                <button onClick={() => set("restingHRUnknown", false)} className="text-sm text-[#00ff94] underline">Je connais ma FC repos</button>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" value={String(data.restingHR || "")} onChange={(e) => set("restingHR", e.target.value)} placeholder="Ex: 55" className="w-24 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                  <span className="text-xs text-white/30">bpm</span>
                  <button onClick={() => { set("restingHRUnknown", true); set("restingHR", ""); }} className="text-[10px] text-white/30 underline ml-2">Je ne sais pas</button>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Fréquence cardiaque max</p>
              <p className="text-[10px] text-white/25 mb-2">Le max atteint en effort intense</p>
              {data.maxHRUnknown ? (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-white/50">Estimation : <span className="text-[#00ff94]">{220 - (profile.age || 21)} bpm</span> (220 - âge)</p>
                  <button onClick={() => set("maxHRUnknown", false)} className="text-[10px] text-white/30 underline ml-2">Je la connais</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input type="number" value={String(data.maxHR || "")} onChange={(e) => set("maxHR", e.target.value)} placeholder="Ex: 190" className="w-24 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                  <span className="text-xs text-white/30">bpm</span>
                  <button onClick={() => { set("maxHRUnknown", true); set("maxHR", ""); }} className="text-[10px] text-white/30 underline ml-2">Je ne sais pas</button>
                </div>
              )}
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Poids actuel</p>
              <div className="flex items-center gap-2">
                <input type="number" value={String(data.currentWeight || "")} onChange={(e) => set("currentWeight", e.target.value)} placeholder="Ex: 85" className="w-24 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                <span className="text-xs text-white/30">kg</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 2: Test Terrain */}
      {step === 2 && (
        <Card>
          <SectionTitle>Test Terrain (optionnel)</SectionTitle>
          <InfoBox>Pour calculer tes zones d'entraînement, un test terrain est recommandé. Tu peux aussi passer cette étape.</InfoBox>
          <div className="space-y-4 mt-4">
            {!data.skipTest ? (
              <>
                <div>
                  <p className="text-xs text-white/50 mb-2">Choisis un test</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { value: "test_6min", label: "Test des 6 minutes", description: "Cours le plus loin possible en 6 min" },
                      { value: "test_cooper", label: "Test de Cooper (12 min)", description: "Cours le plus loin possible en 12 min" },
                    ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.selectedTest === opt.value} onClick={() => set("selectedTest", opt.value)} />)}
                  </div>
                </div>

                {data.selectedTest && (
                  <div>
                    <p className="text-xs text-white/50 mb-1.5">Instructions :</p>
                    <ol className="list-decimal list-inside text-xs text-white/40 space-y-1 mb-3">
                      <li>Échauffe-toi 10 minutes en trottinant</li>
                      <li>Lance un chrono de {data.selectedTest === "test_6min" ? "6" : "12"} minutes</li>
                      <li>Cours le plus loin possible à allure constante</li>
                      <li>Note la distance parcourue</li>
                    </ol>
                    <div className="flex items-center gap-2">
                      <input type="number" value={String(data.testResult || "")} onChange={(e) => set("testResult", e.target.value)} placeholder="Ex: 1350" className="w-32 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                      <span className="text-xs text-white/30">mètres</span>
                    </div>
                    {calculatedVMA && (
                      <div className="mt-3 p-3 rounded-xl bg-[#00ff94]/5 border border-[#00ff94]/20">
                        <p className="text-sm font-medium text-[#00ff94]">
                          {data.selectedTest === "test_6min" ? `VMA estimée : ${calculatedVMA} km/h` : `VO2max estimée : ${calculatedVMA} ml/kg/min`}
                        </p>
                        {data.selectedTest === "test_6min" && (
                          <p className="text-[10px] text-white/35 mt-0.5">Formule : distance (m) / 100</p>
                        )}
                        {data.selectedTest === "test_cooper" && (
                          <p className="text-[10px] text-white/35 mt-0.5">Formule : (distance - 504) / 45</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <button onClick={() => { set("skipTest", true); set("selectedTest", ""); set("testResult", ""); }} className="text-sm text-white/30 underline">
                  Passer cette étape — on estimera depuis VO2max ou temps de course
                </button>
              </>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-white/50 mb-2">Test terrain passé</p>
                <p className="text-[10px] text-white/30">La VMA sera estimée depuis ta VO2max ou tes temps de course</p>
                <button onClick={() => set("skipTest", false)} className="text-sm text-[#00ff94] underline mt-3">Faire un test quand même</button>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Step 3: Objectifs Running */}
      {step === 3 && (
        <Card>
          <SectionTitle>Objectifs Running</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Objectif principal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "run_5k", label: "Courir 5km sans m'arrêter", description: "Débutant" },
                  { value: "finish_10k", label: "Finir un 10K", description: "Débutant+" },
                  { value: "semi", label: "Finir un semi-marathon", description: "Intermédiaire" },
                  { value: "marathon", label: "Finir un marathon", description: "Avancé" },
                  { value: "improve_time", label: "Améliorer mon temps", description: "Variable" },
                  { value: "fitness", label: "Compléter ma muscu", description: "Tous niveaux" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.primaryGoal === opt.value} onClick={() => set("primaryGoal", opt.value)} />)}
              </div>
            </div>

            {Boolean(data.primaryGoal) && data.primaryGoal !== "fitness" && (
              <div>
                <p className="text-xs text-white/50 mb-2">Objectif de temps ?</p>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {[
                    { value: "just_finish", label: "Juste finir" },
                    { value: "target", label: "Temps cible" },
                  ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.targetTime === opt.value} onClick={() => set("targetTime", opt.value)} />)}
                </div>
                {data.targetTime === "target" && (
                  <input type="text" value={String(data.targetTimeValue || "")} onChange={(e) => set("targetTimeValue", e.target.value)} placeholder="Ex: 1:55:00" className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
                )}
              </div>
            )}

            <div>
              <p className="text-xs text-white/50 mb-1.5">Date de la course / objectif (optionnel)</p>
              <input type="date" value={String(data.raceDate || "")} onChange={(e) => set("raceDate", e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 [color-scheme:dark]" />
            </div>

            <div>
              <p className="text-xs text-white/50 mb-2">Jours disponibles pour courir</p>
              <p className="text-[10px] text-white/25 mb-2">Idéalement 3 jours avec 1-2 jours de repos entre chaque</p>
              <MultiSelectGrid options={["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]} selected={data.availableDays as string[]} onToggle={(v) => toggle("availableDays", v)} />
            </div>

            <div>
              <p className="text-xs text-white/50 mb-2">Nombre max de sorties par semaine</p>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: "2", label: "2", note: "Minimum" },
                  { value: "3", label: "3", note: "Idéal semi" },
                  { value: "4", label: "4", note: "Progression+" },
                  { value: "5", label: "5+", note: "Confirmé" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.maxRunsPerWeek === opt.value} onClick={() => set("maxRunsPerWeek", opt.value)} />)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Step 4: Contraintes T1D Running */}
      {step === 4 && (
        <Card>
          <SectionTitle>Contraintes T1D — Running</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Moment préféré pour courir</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "morning_fasted", label: "Matin à jeun", t1dWarning: "Risque hypo élevé", t1dAdvice: "Prévoir 15-20g glucides avant + réduire basale" },
                  { value: "morning_fed", label: "Matin après petit-déj", t1dAdvice: "Réduire bolus de 50-75% selon durée" },
                  { value: "noon", label: "Midi", t1dAdvice: "Attention timing avec le déjeuner" },
                  { value: "evening", label: "Soir", t1dAdvice: "Surveiller glycémie nocturne — effet prolongé" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.preferredRunTime === opt.value} onClick={() => set("preferredRunTime", opt.value)} />)}
              </div>
            </div>

            <div>
              <p className="text-xs text-white/50 mb-2">Hypos en courant ?</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "never", label: "Jamais" },
                  { value: "rarely", label: "Rarement" },
                  { value: "sometimes", label: "Parfois" },
                  { value: "often", label: "Souvent", alert: true },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.hyposWhileRunning === opt.value} onClick={() => set("hyposWhileRunning", opt.value)} />)}
              </div>
            </div>

            <div>
              <p className="text-xs text-white/50 mb-1.5">Glycémie cible avant de courir</p>
              <div className="flex items-center gap-2">
                <input type="number" value={String(data.preRunTargetGlucose || "150")} onChange={(e) => set("preRunTargetGlucose", e.target.value)} min={120} max={200} className="w-24 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50" />
                <span className="text-xs text-white/30">mg/dL</span>
                <span className="text-[10px] text-[#00d4ff]/70 ml-2">Recommandé : 140-180</span>
              </div>
            </div>

            <div>
              <p className="text-xs text-white/50 mb-2">Chute de glycémie en courant</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "low", label: "Peu", description: "-20 à -40 mg/dL/h" },
                  { value: "medium", label: "Moyennement", description: "-40 à -60 mg/dL/h" },
                  { value: "high", label: "Beaucoup", description: "-60+ mg/dL/h" },
                  { value: "unknown", label: "Je ne sais pas" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.glucoseDropRate === opt.value} onClick={() => set("glucoseDropRate", opt.value)} />)}
              </div>
            </div>

            <div>
              <p className="text-xs text-white/50 mb-2">Glucides pendant les sorties longues ?</p>
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[
                  { value: "no", label: "Non" },
                  { value: "yes", label: "Oui" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.carbsDuringRun === opt.value} onClick={() => set("carbsDuringRun", opt.value)} />)}
              </div>
              {data.carbsDuringRun === "yes" && (
                <div className="flex items-center gap-2">
                  <input type="number" value={String(data.carbsAmount || "30")} onChange={(e) => set("carbsAmount", e.target.value)} className="w-20 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50" />
                  <span className="text-xs text-white/30">g/heure</span>
                  <span className="text-[10px] text-[#00d4ff]/70 ml-2">Recommandé : 30-60g/h pour +1h</span>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs text-white/50 mb-2">Ajustements insuline avant de courir</p>
              <MultiSelectGrid options={["Je réduis mon bolus", "Je réduis ma basale (pompe)", "Je n'ajuste pas", "Je ne sais pas quoi faire"]} selected={data.insulinAdjustments as string[]} onToggle={(v) => toggle("insulinAdjustments", v)} />
            </div>
          </div>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>Retour</Button>
        <Button
          onClick={() => { if (step < 4) setStep(step + 1); else handleSubmit(); }}
          disabled={generating || (step === 0 && !data.runningExperience)}
        >
          {generating ? "Génération..." : step === 4 ? "Générer mon plan" : "Suivant"}
        </Button>
      </div>
    </div>
  );
}
