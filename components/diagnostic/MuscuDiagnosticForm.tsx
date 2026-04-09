"use client";

import { useState, useCallback } from "react";
import { Card, Button, SectionTitle, ProgressBar, InfoBox, Badge } from "@/components/ui";
import { useStore } from "@/lib/store";

const STEP_LABELS = ["Objectifs", "Disponibilité", "Préférences", "Expérience", "Contraintes T1D"];

// ─── Option types ────────────────────────────────────────────────
interface SelectOption { value: string; label: string; description?: string; recommendation?: string; note?: string; t1dNote?: string; warning?: string }

function OptionButton({ option, selected, onClick }: { option: SelectOption; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`text-left p-3 rounded-xl border transition-all ${selected ? "bg-[#00ff94]/10 border-[#00ff94]/30 text-white" : "bg-white/[0.03] border-white/[0.06] text-white/60 hover:bg-white/[0.06]"}`}>
      <p className="text-sm font-medium">{option.label}</p>
      {option.description && <p className="text-xs text-white/35 mt-0.5">{option.description}</p>}
      {option.recommendation && selected && <p className="text-[10px] text-[#00d4ff] mt-1">{option.recommendation}</p>}
      {option.t1dNote && selected && <p className="text-[10px] text-[#ff9500] mt-1">T1D : {option.t1dNote}</p>}
      {option.warning && selected && <p className="text-[10px] text-[#ff4757] mt-1">{option.warning}</p>}
      {option.note && <p className="text-[10px] text-white/25 mt-0.5">{option.note}</p>}
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

// ─── Main Component ──────────────────────────────────────────────
export default function MuscuDiagnosticForm() {
  const { profile, setMuscuDiagnosticData, muscuDiagnosticData, muscuDiagnosticCompleted } = useStore();
  const [step, setStep] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);

  // Form state
  const [data, setData] = useState<Record<string, unknown>>(() => {
    if (muscuDiagnosticCompleted && Object.keys(muscuDiagnosticData).length > 0) return muscuDiagnosticData;
    return {
      primaryGoal: "", secondaryGoals: [] as string[], targetWeight: "", timeline: "",
      daysPerWeek: "", availableDays: [] as string[], sessionDuration: "", equipment: "", unavailableEquipment: [] as string[],
      preferredSplit: "", trainingStyle: "", exercisePreferences: [] as string[], exerciseAvoidance: [] as string[],
      experienceYears: "", currentProgram: "", stagnation: [] as string[], previousInjuries: "",
      preferredTrainingTime: "", postWorkoutGlycemia: "", insulinTiming: "", hyposDuringWorkout: "", preWorkoutTarget: "140",
    };
  });

  const set = useCallback((key: string, val: unknown) => setData((prev) => ({ ...prev, [key]: val })), []);
  const toggle = useCallback((key: string, val: string) => {
    setData((prev) => {
      const arr = (prev[key] as string[]) || [];
      return { ...prev, [key]: arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val] };
    });
  }, []);

  const handleSubmit = async () => {
    setMuscuDiagnosticData(data);
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-muscu-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ diagnosticData: data, userContext: { name: profile.name, age: profile.age, height: profile.height, weight: profile.weight, goals: profile.goals } }),
      });
      const json = await res.json();
      if (res.ok) {
        setResult(json);
        useStore.getState().setGeneratedMuscuProgram(json);
      }
    } catch (err) {
      console.error("Erreur génération:", err);
    } finally {
      setGenerating(false);
    }
  };

  // ─── Result view ───────────────────────────────────────────────
  if (result || (muscuDiagnosticCompleted && useStore.getState().generatedMuscuProgram)) {
    const program = result || useStore.getState().generatedMuscuProgram || {};
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionTitle className="!mb-0">Programme généré</SectionTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              // Fully reset: local state + store flags so the result view
              // is dismissed and the form re-opens at step 0.
              useStore.setState({
                muscuDiagnosticCompleted: false,
                generatedMuscuProgram: null,
              });
              setResult(null);
              setStep(0);
            }}
          >
            Refaire le diagnostic
          </Button>
        </div>
        <InfoBox variant="success">Programme muscu personnalisé généré avec succès !</InfoBox>
        {Boolean((program as Record<string, unknown>).fullAnalysis) && (
          <Card>
            <SectionTitle>Analyse</SectionTitle>
            <div className="text-sm text-white/70 leading-relaxed whitespace-pre-line">{String((program as Record<string, unknown>).fullAnalysis)}</div>
          </Card>
        )}
        {Boolean((program as Record<string, unknown>).summary) && (
          <Card>
            <SectionTitle>Résumé</SectionTitle>
            <div className="space-y-2">
              {((program as Record<string, unknown>).summary as Record<string, string[]>)?.changesDetected?.map((c: string, i: number) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-[#00ff94] text-xs mt-0.5">•</span>
                  <p className="text-sm text-white/70">{c}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // ─── Summary view (completed, no result loaded) ────────────────
  if (muscuDiagnosticCompleted && Object.keys(muscuDiagnosticData).length > 0 && !generating) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <SectionTitle className="!mb-0">Diagnostic Musculation</SectionTitle>
          <Button variant="secondary" size="sm" onClick={() => setStep(0)}>Modifier</Button>
        </div>
        <InfoBox variant="success">Diagnostic muscu complété !</InfoBox>
        <Card>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Objectif", value: String(muscuDiagnosticData.primaryGoal || "—") },
              { label: "Jours/sem", value: String(muscuDiagnosticData.daysPerWeek || "—") },
              { label: "Durée séance", value: `${muscuDiagnosticData.sessionDuration || "—"} min` },
              { label: "Split", value: String(muscuDiagnosticData.preferredSplit || "Auto") },
              { label: "Style", value: String(muscuDiagnosticData.trainingStyle || "—") },
              { label: "Niveau", value: String(muscuDiagnosticData.experienceYears || "—") },
            ].map((item) => (
              <div key={item.label} className="p-2.5 rounded-lg bg-white/[0.03]">
                <p className="text-[10px] text-white/35 uppercase">{item.label}</p>
                <p className="text-sm font-medium mt-0.5 capitalize">{item.value.replace(/_/g, " ")}</p>
              </div>
            ))}
          </div>
        </Card>
        <Button onClick={handleSubmit} disabled={generating} className="w-full">
          {generating ? "Génération en cours..." : "Regénérer le programme"}
        </Button>
      </div>
    );
  }

  // ─── Form steps ────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <ProgressBar value={step + 1} max={5} color="#00ff94" label={`Étape ${step + 1}/5 — ${STEP_LABELS[step]}`} />

      {step === 0 && (
        <Card>
          <SectionTitle>Objectifs</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Objectif principal</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "mass", label: "Prise de masse", description: "Gagner du muscle" },
                  { value: "strength", label: "Force", description: "Devenir plus fort" },
                  { value: "definition", label: "Définition", description: "Perdre du gras, garder le muscle" },
                  { value: "recomp", label: "Recomposition", description: "Gras → muscle" },
                  { value: "health", label: "Santé générale", description: "Juste être en forme" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.primaryGoal === opt.value} onClick={() => set("primaryGoal", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Objectifs secondaires (optionnel)</p>
              <MultiSelectGrid options={["Améliorer ma posture", "Rattraper mes points faibles", "Augmenter mon 1RM", "Préparer une compétition", "Compléter mon entraînement running"]} selected={data.secondaryGoals as string[]} onToggle={(v) => toggle("secondaryGoals", v)} />
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Timeline</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "3months", label: "3 mois" },
                  { value: "6months", label: "6 mois" },
                  { value: "1year", label: "1 an" },
                  { value: "ongoing", label: "Progression continue" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.timeline === opt.value} onClick={() => set("timeline", opt.value)} />)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <SectionTitle>Disponibilité & Équipement</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Jours par semaine</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {[
                  { value: "2", label: "2 jours", note: "Full Body" },
                  { value: "3", label: "3 jours", note: "Full Body / PPL" },
                  { value: "4", label: "4 jours", note: "Upper/Lower" },
                  { value: "5", label: "5 jours", note: "PPL" },
                  { value: "6", label: "6 jours", note: "PPL x2" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.daysPerWeek === opt.value} onClick={() => set("daysPerWeek", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Quels jours ?</p>
              <MultiSelectGrid options={["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"]} selected={data.availableDays as string[]} onToggle={(v) => toggle("availableDays", v)} />
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Durée max d'une séance</p>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {["45", "60", "75", "90", "120"].map((v) => (
                  <button key={v} onClick={() => set("sessionDuration", v)} className={`p-2 rounded-xl text-sm border ${data.sessionDuration === v ? "bg-[#00ff94]/10 border-[#00ff94]/30 text-[#00ff94]" : "bg-white/[0.03] border-white/[0.06] text-white/50"}`}>{v} min</button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Équipement disponible</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "full_gym", label: "Salle complète", description: "Tout le matériel" },
                  { value: "basic_gym", label: "Salle basique", description: "Barres, haltères, quelques machines" },
                  { value: "home_gym", label: "Home gym", description: "Rack, barres, haltères" },
                  { value: "minimal", label: "Minimal", description: "Haltères uniquement" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.equipment === opt.value} onClick={() => set("equipment", opt.value)} />)}
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <SectionTitle>Préférences d'entraînement</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Split préféré</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "auto", label: "🤖 Laisse l'IA décider", description: "Basé sur tes objectifs" },
                  { value: "push_pull", label: "Push / Pull", description: "4 jours" },
                  { value: "upper_lower", label: "Upper / Lower", description: "4 jours" },
                  { value: "ppl", label: "Push / Pull / Legs", description: "3-6 jours" },
                  { value: "full_body", label: "Full Body", description: "2-4 jours" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.preferredSplit === opt.value} onClick={() => set("preferredSplit", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Style d'entraînement</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "hypertrophy", label: "Hypertrophie", description: "8-12 reps" },
                  { value: "strength", label: "Force", description: "3-6 reps" },
                  { value: "mixed", label: "Mixte", description: "Force + hypertrophie" },
                  { value: "endurance", label: "Endurance", description: "15+ reps" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.trainingStyle === opt.value} onClick={() => set("trainingStyle", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Exercices à garder absolument</p>
              <MultiSelectGrid options={["Développé couché", "Squat", "Soulevé de terre", "Tractions", "Rowing", "Développé militaire", "Dips", "Curl biceps"]} selected={data.exercisePreferences as string[]} onToggle={(v) => toggle("exercisePreferences", v)} />
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Exercices à éviter</p>
              <MultiSelectGrid options={["Squat barre", "Soulevé de terre", "Développé militaire", "Dips", "Exercices derrière la nuque", "Leg extension"]} selected={data.exerciseAvoidance as string[]} onToggle={(v) => toggle("exerciseAvoidance", v)} />
            </div>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card>
          <SectionTitle>Expérience & Historique</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Expérience en muscu</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "beginner", label: "< 1 an", description: "Débutant" },
                  { value: "intermediate", label: "1-3 ans", description: "Intermédiaire" },
                  { value: "advanced", label: "3-5 ans", description: "Avancé" },
                  { value: "expert", label: "5+ ans", description: "Expert" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.experienceYears === opt.value} onClick={() => set("experienceYears", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Programme actuel</p>
              <input type="text" value={String(data.currentProgram || "")} onChange={(e) => set("currentProgram", e.target.value)} placeholder="Ex: Push/Pull 4 jours, programme maison..." className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50" />
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Tu stagnes sur quelque chose ?</p>
              <MultiSelectGrid options={["Développé couché", "Squat", "Prise de masse", "Un groupe musculaire", "Motivation", "Non, tout va bien"]} selected={data.stagnation as string[]} onToggle={(v) => toggle("stagnation", v)} />
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Blessures / douleurs chroniques</p>
              <textarea value={String(data.previousInjuries || "")} onChange={(e) => set("previousInjuries", e.target.value)} placeholder="Ex: Tendinite épaule droite..." rows={2} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50 resize-none" />
            </div>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card>
          <SectionTitle>Contraintes T1D — Musculation</SectionTitle>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-white/50 mb-2">Moment d'entraînement préféré</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { value: "morning_fasted", label: "Matin à jeun", t1dNote: "Attention hypo — prévoir collation" },
                  { value: "morning_fed", label: "Matin après petit-déj", t1dNote: "Réduire bolus 30-50%" },
                  { value: "afternoon", label: "Après-midi", t1dNote: "Souvent le meilleur moment" },
                  { value: "evening", label: "Soir", t1dNote: "Surveiller glycémie nocturne" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.preferredTrainingTime === opt.value} onClick={() => set("preferredTrainingTime", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Réaction glycémique post-muscu</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "rises", label: "Elle monte", description: "+30-60 mg/dL" },
                  { value: "stable", label: "Reste stable", description: "±20 mg/dL" },
                  { value: "drops", label: "Elle descend", description: "-30+ mg/dL" },
                  { value: "unknown", label: "Je ne sais pas" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.postWorkoutGlycemia === opt.value} onClick={() => set("postWorkoutGlycemia", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-2">Hypos pendant la muscu ?</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "never", label: "Jamais" },
                  { value: "rarely", label: "Rarement" },
                  { value: "sometimes", label: "Parfois" },
                  { value: "often", label: "Souvent", warning: "On va adapter ton protocole" },
                ].map((opt) => <OptionButton key={opt.value} option={opt} selected={data.hyposDuringWorkout === opt.value} onClick={() => set("hyposDuringWorkout", opt.value)} />)}
              </div>
            </div>
            <div>
              <p className="text-xs text-white/50 mb-1.5">Glycémie cible avant séance</p>
              <div className="flex items-center gap-2">
                <input type="number" value={String(data.preWorkoutTarget || "140")} onChange={(e) => set("preWorkoutTarget", e.target.value)} min={100} max={200} className="w-24 bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50" />
                <span className="text-xs text-white/30">mg/dL</span>
                <span className="text-[10px] text-[#00d4ff]/70 ml-2">Recommandé : 120-180</span>
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between items-center">
        <Button variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0}>Retour</Button>
        <Button
          onClick={() => { if (step < 4) setStep(step + 1); else handleSubmit(); }}
          disabled={generating || (step === 0 && !data.primaryGoal)}
        >
          {generating ? "Génération..." : step === 4 ? "Générer mon programme" : "Suivant"}
        </Button>
      </div>
    </div>
  );
}
