"use client";

import { useState, useCallback, useEffect } from "react";
import { Card, PageHeader, Button, Badge, InfoBox, SectionTitle, ProgressBar } from "@/components/ui";
import { useStore } from "@/lib/store";
import type { DiagnosticEntry, ProgramChange } from "@/lib/store";
import PhotoCapture from "@/components/diagnostic/PhotoCapture";
import BodyAnalysisResult from "@/components/diagnostic/BodyAnalysisResult";
import DiagnosticSummary from "@/components/diagnostic/DiagnosticSummary";
import SectionEditor from "@/components/diagnostic/SectionEditor";
import ProgramUpdateModal from "@/components/programs/ProgramUpdateModal";
import { compareDiagnostics } from "@/lib/diagnostic-comparison";
import type { DiagnosticDiff } from "@/lib/diagnostic-comparison";
import DiagnosticTabs, { type DiagnosticTab } from "@/components/diagnostic/DiagnosticTabs";
import MuscuDiagnosticForm from "@/components/diagnostic/MuscuDiagnosticForm";
import RunningDiagnosticForm from "@/components/diagnostic/RunningDiagnosticForm";
import BodyAnalysisSection from "@/components/body-map/BodyAnalysisSection";

// ─── Types ───────────────────────────────────────────────────────
interface Mensurations {
  chest: string;
  shoulders: string;
  waist: string;
  hips: string;
  armRelaxed: string;
  armFlexed: string;
  thigh: string;
  calf: string;
}

interface Longueurs {
  armSpan: string;
  torsoLength: string;
}

interface Mobilite {
  shoulderMobility: string;
  hipMobility: string;
  ankleMobility: string;
}

interface Historique {
  injuries: string;
  trainingHistory: string;
  benchPress1RM: string;
  squat1RM: string;
  deadlift1RM: string;
  pullups: string;
  ohp1RM: string;
}

type WeakPoint =
  | "Pectoraux"
  | "Dos largeur"
  | "Dos épaisseur"
  | "Épaules"
  | "Bras"
  | "Quadriceps"
  | "Ischio-jambiers"
  | "Mollets"
  | "Abdos";

const WEAK_POINT_OPTIONS: WeakPoint[] = [
  "Pectoraux",
  "Dos largeur",
  "Dos épaisseur",
  "Épaules",
  "Bras",
  "Quadriceps",
  "Ischio-jambiers",
  "Mollets",
  "Abdos",
];

const MOBILITY_OPTIONS = ["Non", "Difficilement", "Facilement"];

const STEP_LABELS = [
  "Mensurations",
  "Longueurs segmentaires",
  "Tests de mobilité",
  "Historique et forces",
  "Points faibles",
  "Photos",
];

// ─── Analysis helpers ────────────────────────────────────────────
interface AnalysisResult {
  ratios: { label: string; value: number; ideal: string; status: "good" | "warning" | "neutral" }[];
  recommendations: string[];
}

function computeAnalysis(
  mensurations: Mensurations,
  longueurs: Longueurs,
  mobilite: Mobilite,
  historique: Historique,
  weakPoints: WeakPoint[],
  height: number
): AnalysisResult {
  const shoulders = parseFloat(mensurations.shoulders) || 0;
  const waist = parseFloat(mensurations.waist) || 0;
  const hips = parseFloat(mensurations.hips) || 0;
  const chest = parseFloat(mensurations.chest) || 0;
  const armSpan = parseFloat(longueurs.armSpan) || 0;
  const torsoLength = parseFloat(longueurs.torsoLength) || 0;
  const thigh = parseFloat(mensurations.thigh) || 0;
  const calf = parseFloat(mensurations.calf) || 0;
  const armFlexed = parseFloat(mensurations.armFlexed) || 0;

  const bench = parseFloat(historique.benchPress1RM) || 0;
  const squat = parseFloat(historique.squat1RM) || 0;
  const deadlift = parseFloat(historique.deadlift1RM) || 0;
  const ohp = parseFloat(historique.ohp1RM) || 0;
  const pullups = parseFloat(historique.pullups) || 0;

  const ratios: AnalysisResult["ratios"] = [];
  const recommendations: string[] = [];

  if (shoulders > 0 && waist > 0) {
    const stw = shoulders / waist;
    ratios.push({ label: "Ratio épaules / taille", value: parseFloat(stw.toFixed(2)), ideal: "≥ 1.618 (nombre d'or)", status: stw >= 1.6 ? "good" : "warning" });
    if (stw < 1.6) recommendations.push("Ton ratio épaules/taille est inférieur à l'idéal. Priorise le développement des deltoïdes latéraux (élévations latérales, upright rows) et réduis le tour de taille si besoin.");
  }
  if (waist > 0 && hips > 0) {
    const wth = waist / hips;
    ratios.push({ label: "Ratio taille / hanches", value: parseFloat(wth.toFixed(2)), ideal: "≤ 0.85 (homme athlétique)", status: wth <= 0.85 ? "good" : "warning" });
  }
  if (chest > 0 && waist > 0) {
    const ctw = chest / waist;
    ratios.push({ label: "Ratio poitrine / taille", value: parseFloat(ctw.toFixed(2)), ideal: "≥ 1.35", status: ctw >= 1.35 ? "good" : "warning" });
    if (ctw < 1.35) recommendations.push("Le ratio poitrine/taille montre un potentiel de développement pectoral. Ajoute du volume sur les exercices de pressing (incliné/décliné).");
  }
  if (armSpan > 0 && height > 0) {
    const ath = armSpan / height;
    ratios.push({ label: "Ratio envergure / taille", value: parseFloat(ath.toFixed(2)), ideal: "= 1.0 (neutre), > 1.0 = bras longs", status: "neutral" });
    if (ath > 1.03) recommendations.push("Tu as des bras relativement longs. Avantage en deadlift et tirage. En revanche le bench press sera biomécaniquement désavantagé : utilise des variantes avec un ROM réduit (floor press, board press) en complément.");
    else if (ath < 0.97) recommendations.push("Tu as des bras relativement courts. Avantage sur les mouvements de pressing (bench, OHP). Le deadlift peut nécessiter une attention sur le positionnement (sumo peut être plus adapté).");
  }
  if (torsoLength > 0 && height > 0) {
    const tth = torsoLength / height;
    ratios.push({ label: "Ratio tronc / taille", value: parseFloat(tth.toFixed(2)), ideal: "~0.30 (moyen)", status: "neutral" });
    if (tth > 0.33) recommendations.push("Tronc long : avantage pour le deadlift conventionnel. Au squat, penche-toi légèrement plus en avant et privilégie une stance medium-wide.");
    else if (tth < 0.28) recommendations.push("Tronc court : avantage au squat (torse plus vertical). Le deadlift sumo pourrait être plus confortable qu'en conventionnel.");
  }
  if (armFlexed > 0 && parseFloat(mensurations.armRelaxed) > 0) {
    const armDiff = armFlexed - parseFloat(mensurations.armRelaxed);
    ratios.push({ label: "Delta bras contracté/relâché", value: parseFloat(armDiff.toFixed(1)), ideal: "≥ 4 cm (bonne contractilité)", status: armDiff >= 4 ? "good" : "warning" });
    if (armDiff < 4) recommendations.push("Le delta entre bras contracté et relâché est faible. Travaille l'hypertrophie en peak contraction (curls concentrés, spider curls).");
  }
  if (thigh > 0 && calf > 0) {
    const tcr = thigh / calf;
    ratios.push({ label: "Ratio cuisse / mollet", value: parseFloat(tcr.toFixed(2)), ideal: "~1.5 (proportionné)", status: tcr >= 1.35 && tcr <= 1.65 ? "good" : "warning" });
  }
  if (bench > 0 && squat > 0) {
    const bsRatio = bench / squat;
    if (bsRatio > 0.75) recommendations.push("Ton ratio bench/squat est élevé. Le bas du corps a du potentiel de progression : augmente le volume de squat et leg press.");
    else if (bsRatio < 0.55) recommendations.push("Ton ratio bench/squat est bas. Le haut du corps peut être priorisé : augmente la fréquence du bench (2x/semaine).");
  }
  if (deadlift > 0 && squat > 0) {
    if (deadlift / squat < 1.1) recommendations.push("Ton deadlift est proche de ton squat. Travaille la chaîne postérieure (RDL, hip thrust, good mornings) pour augmenter le deadlift.");
  }
  if (ohp > 0 && bench > 0) {
    const obRatio = ohp / bench;
    ratios.push({ label: "Ratio OHP / Bench", value: parseFloat(obRatio.toFixed(2)), ideal: "~0.60-0.70", status: obRatio >= 0.55 && obRatio <= 0.75 ? "good" : "warning" });
  }
  if (pullups > 0) {
    if (pullups < 8) recommendations.push("Moins de 8 tractions : priorise le travail de dos avec des progressions (tractions assistées, pull-up négatifs, rows lourds).");
    else if (pullups >= 15) recommendations.push("Excellent niveau de tractions ! Ajoute du lest pour continuer à progresser (tractions lestées, muscle-ups).");
  }
  if (mobilite.shoulderMobility === "Non" || mobilite.shoulderMobility === "Difficilement") recommendations.push("Mobilité d'épaule limitée : ajoute des dislocates à la barre, des étirements pec/lats quotidiens et des face pulls en échauffement.");
  if (mobilite.hipMobility === "Non" || mobilite.hipMobility === "Difficilement") recommendations.push("Mobilité de hanche limitée : travaille le 90/90, les frog stretches et les goblet squats paused pour améliorer ta profondeur de squat.");
  if (mobilite.ankleMobility === "Non" || mobilite.ankleMobility === "Difficilement") recommendations.push("Mobilité de cheville limitée : utilise des cales sous les talons au squat et travaille les dorsiflexions au mur quotidiennement.");
  if (weakPoints.includes("Pectoraux")) recommendations.push("Pectoraux en point faible : ajoute du volume avec écarté incliné, dips larges et câble crossover.");
  if (weakPoints.includes("Dos largeur")) recommendations.push("Dos (largeur) en point faible : priorise tractions prise large, pulldowns et pullovers.");
  if (weakPoints.includes("Dos épaisseur")) recommendations.push("Dos (épaisseur) en point faible : rows lourds (barbell row, Meadows row, T-bar row).");
  if (weakPoints.includes("Épaules")) recommendations.push("Épaules en point faible : élévations latérales haute fréquence (4-6x/semaine) + OHP strict.");
  if (weakPoints.includes("Bras")) recommendations.push("Bras en point faible : ajoute 6-8 séries directes biceps/triceps en plus du volume indirect.");
  if (weakPoints.includes("Quadriceps")) recommendations.push("Quadriceps en point faible : front squat, hack squat et leg extensions en priorité.");
  if (weakPoints.includes("Ischio-jambiers")) recommendations.push("Ischio-jambiers en point faible : RDL, leg curl nordique et glute-ham raise.");
  if (weakPoints.includes("Mollets")) recommendations.push("Mollets en point faible : entraîne-les 4-5x/semaine avec des séries lentes (3s excentrique).");
  if (weakPoints.includes("Abdos")) recommendations.push("Abdos en point faible : ab rollouts, hanging leg raises et pallof press 3-4x/semaine.");

  return { ratios, recommendations };
}

// ─── Input components ────────────────────────────────────────────
function NumberInput({ label, value, onChange, unit = "cm", placeholder }: { label: string; value: string; onChange: (v: string) => void; unit?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1.5">{label}</label>
      <div className="relative">
        <input type="number" inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder || "0"} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/20 transition-colors" />
        {unit && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/30">{unit}</span>}
      </div>
    </div>
  );
}

function SelectInput({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1.5">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/20 transition-colors appearance-none">
        <option value="" className="bg-[#0a0a0f]">Sélectionner...</option>
        {options.map((opt) => <option key={opt} value={opt} className="bg-[#0a0a0f]">{opt}</option>)}
      </select>
    </div>
  );
}

function TextAreaInput({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-white/50 mb-1.5">{label}</label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={3} className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-2.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/20 transition-colors resize-none" />
    </div>
  );
}

// ─── Step indicator ──────────────────────────────────────────────
function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${i < current ? "bg-[#00ff94] text-black" : i === current ? "bg-[#00ff94]/20 text-[#00ff94] border border-[#00ff94]/50" : "bg-white/[0.06] text-white/30"}`}>
            {i < current ? (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            ) : (
              i + 1
            )}
          </div>
          {i < total - 1 && <div className={`w-8 h-0.5 rounded-full transition-all ${i < current ? "bg-[#00ff94]" : "bg-white/[0.08]"}`} />}
        </div>
      ))}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────
export default function DiagnosticPage() {
  const {
    profile, setDiagnosticData, setDiagnosticCompleted,
    diagnosticCompleted, diagnosticData,
    diagnosticHistory, addDiagnosticEntry,
    programChanges, addProgramChange, acknowledgeProgramChange,
    muscuProgram,
    muscuDiagnosticCompleted, runningDiagnosticCompleted,
  } = useStore();
  const height = profile.height || 180;

  // Tab state
  const [activeTab, setActiveTab] = useState<DiagnosticTab>("morphologie");

  // View mode: "summary" (read), "form" (create/edit), "results" (after submit)
  const [viewMode, setViewMode] = useState<"summary" | "form" | "results">("summary");
  const [step, setStep] = useState(0);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Section editing
  const [editingSection, setEditingSection] = useState<string | null>(null);

  // Program update modal
  const [showProgramModal, setShowProgramModal] = useState(false);
  const [latestProgramChange, setLatestProgramChange] = useState<ProgramChange | null>(null);
  const [latestDiff, setLatestDiff] = useState<DiagnosticDiff | null>(null);

  // Form state
  const [mensurations, setMensurations] = useState<Mensurations>({ chest: "", shoulders: "", waist: "", hips: "", armRelaxed: "", armFlexed: "", thigh: "", calf: "" });
  const [longueurs, setLongueurs] = useState<Longueurs>({ armSpan: "", torsoLength: "" });
  const [mobilite, setMobilite] = useState<Mobilite>({ shoulderMobility: "", hipMobility: "", ankleMobility: "" });
  const [historique, setHistorique] = useState<Historique>({ injuries: "", trainingHistory: "", benchPress1RM: "", squat1RM: "", deadlift1RM: "", pullups: "", ohp1RM: "" });
  const [weakPoints, setWeakPoints] = useState<WeakPoint[]>([]);
  const [photos, setPhotos] = useState<(string | null)[]>([null, null, null]);
  const [photoAnalysis, setPhotoAnalysis] = useState<string | null>(null);
  const [analyzingPhotos, setAnalyzingPhotos] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [updatingPrograms, setUpdatingPrograms] = useState(false);

  // Pre-fill form from last diagnostic entry
  const lastEntry = diagnosticHistory[0] || null;

  const prefillFromEntry = useCallback((entry: DiagnosticEntry) => {
    const m = entry.mensurations as Record<string, string>;
    const l = entry.longueurs as Record<string, string>;
    const mob = entry.mobilite as Record<string, string>;
    const h = entry.historique as Record<string, string>;
    setMensurations({ chest: m.chest || "", shoulders: m.shoulders || "", waist: m.waist || "", hips: m.hips || "", armRelaxed: m.armRelaxed || "", armFlexed: m.armFlexed || "", thigh: m.thigh || "", calf: m.calf || "" });
    setLongueurs({ armSpan: l.armSpan || "", torsoLength: l.torsoLength || "" });
    setMobilite({ shoulderMobility: mob.shoulderMobility || "", hipMobility: mob.hipMobility || "", ankleMobility: mob.ankleMobility || "" });
    setHistorique({ injuries: h.injuries || "", trainingHistory: h.trainingHistory || "", benchPress1RM: h.benchPress1RM || "", squat1RM: h.squat1RM || "", deadlift1RM: h.deadlift1RM || "", pullups: h.pullups || "", ohp1RM: h.ohp1RM || "" });
    setWeakPoints((entry.weakPoints || []) as WeakPoint[]);
    setPhotos(entry.photos?.length ? entry.photos.map((p) => p || null) : [null, null, null]);
  }, []);

  const updateMensurations = useCallback((key: keyof Mensurations, val: string) => setMensurations((p) => ({ ...p, [key]: val })), []);
  const updateLongueurs = useCallback((key: keyof Longueurs, val: string) => setLongueurs((p) => ({ ...p, [key]: val })), []);
  const updateMobilite = useCallback((key: keyof Mobilite, val: string) => setMobilite((p) => ({ ...p, [key]: val })), []);
  const updateHistorique = useCallback((key: keyof Historique, val: string) => setHistorique((p) => ({ ...p, [key]: val })), []);

  const toggleWeakPoint = useCallback((wp: WeakPoint) => {
    setWeakPoints((prev) => (prev.includes(wp) ? prev.filter((w) => w !== wp) : [...prev, wp]));
  }, []);

  const canAdvance = useCallback(() => {
    if (step === 0) return parseFloat(mensurations.shoulders) > 0 && parseFloat(mensurations.waist) > 0;
    return true;
  }, [step, mensurations]);

  const handleNext = () => {
    if (step < 5) setStep(step + 1);
    else handleSubmit();
  };
  const handleBack = () => { if (step > 0) setStep(step - 1); };

  // Start editing all (form mode with pre-fill)
  const handleEditAll = () => {
    if (lastEntry) prefillFromEntry(lastEntry);
    setStep(0);
    setViewMode("form");
  };

  // Start editing a specific section
  const handleEditSection = (section: string) => {
    if (section === "photos") {
      if (lastEntry) prefillFromEntry(lastEntry);
      setStep(5);
      setViewMode("form");
    } else if (section === "weakPoints") {
      if (lastEntry) prefillFromEntry(lastEntry);
      setStep(4);
      setViewMode("form");
    } else {
      setEditingSection(section);
    }
  };

  // Save section quick edit
  const handleSectionSave = (section: string, data: Record<string, string>) => {
    if (!lastEntry) return;

    const updatedEntry: DiagnosticEntry = {
      ...lastEntry,
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      [section]: data,
    };

    // Recompute analysis with updated data
    const m = section === "mensurations" ? data : lastEntry.mensurations;
    const l = section === "longueurs" ? data : lastEntry.longueurs;
    const mob = section === "mobilite" ? data : lastEntry.mobilite;
    const h = section === "historique" ? data : lastEntry.historique;

    const result = computeAnalysis(
      m as unknown as Mensurations,
      l as unknown as Longueurs,
      mob as unknown as Mobilite,
      h as unknown as Historique,
      lastEntry.weakPoints as WeakPoint[],
      height
    );
    updatedEntry.analysis = result;

    addDiagnosticEntry(updatedEntry);
    setDiagnosticData({ ...updatedEntry, analysis: result, completedAt: updatedEntry.date });
    setEditingSection(null);

    // Trigger program update
    triggerProgramUpdate(updatedEntry, lastEntry);
  };

  // Photo analysis
  const analyzePhotos = async (result: AnalysisResult) => {
    const hasPhotos = photos.some(Boolean);
    if (!hasPhotos) return null;
    setAnalyzingPhotos(true);
    setPhotoError(null);
    try {
      const res = await fetch("/api/analyze-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photos: photos.filter(Boolean), mensurations, ratios: result.ratios }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");
      return data.analysis as string;
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "Erreur d'analyse");
      return null;
    } finally {
      setAnalyzingPhotos(false);
    }
  };

  // Trigger program update via API
  const triggerProgramUpdate = async (newEntry: DiagnosticEntry, previousEntry: DiagnosticEntry | null) => {
    if (!previousEntry) return;

    const diff = compareDiagnostics(previousEntry, newEntry);
    if (!diff.hasSignificantChanges) return;

    setUpdatingPrograms(true);
    try {
      const res = await fetch("/api/update-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previousDiagnostic: previousEntry,
          newDiagnostic: newEntry,
          diff,
          currentProgram: muscuProgram,
          userContext: { name: profile.name, age: profile.age, height: profile.height, weight: profile.weight, goals: profile.goals },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur serveur");

      const change: ProgramChange = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        programType: "muscu",
        triggerReason: "diagnostic_update",
        changesSummary: data.summary?.changesDetected || [],
        comparativeAnalysis: data.comparativeAnalysis || [],
        exerciseChanges: data.exerciseChanges || [],
        volumeAdjustments: data.volumeAdjustments || {},
        priorities: data.priorities || [],
        predictions: data.predictions?.week8 || {},
        fullAnalysis: data.fullAnalysis || "",
        acknowledged: false,
      };

      addProgramChange(change);
      setLatestProgramChange(change);
      setLatestDiff(diff);
      setShowProgramModal(true);
    } catch (err) {
      console.error("Erreur mise à jour programme:", err);
    } finally {
      setUpdatingPrograms(false);
    }
  };

  // Full form submit
  const handleSubmit = async () => {
    const result = computeAnalysis(mensurations, longueurs, mobilite, historique, weakPoints, height);
    setAnalysis(result);
    setViewMode("results");

    const visualAnalysis = await analyzePhotos(result);
    if (visualAnalysis) setPhotoAnalysis(visualAnalysis);

    const newEntry: DiagnosticEntry = {
      id: crypto.randomUUID(),
      date: new Date().toISOString(),
      mensurations: { ...mensurations },
      longueurs: { ...longueurs },
      mobilite: { ...mobilite },
      historique: { ...historique },
      weakPoints: [...weakPoints],
      photos: photos.filter(Boolean) as string[],
      analysis: result,
      photoAnalysis: visualAnalysis,
    };

    addDiagnosticEntry(newEntry);
    setDiagnosticData({ ...newEntry, completedAt: newEntry.date });
    setDiagnosticCompleted(true);

    // Trigger program update if there's a previous entry
    if (lastEntry) {
      triggerProgramUpdate(newEntry, lastEntry);
    }
  };

  const handleReset = () => {
    setViewMode("form");
    setAnalysis(null);
    setStep(0);
    setMensurations({ chest: "", shoulders: "", waist: "", hips: "", armRelaxed: "", armFlexed: "", thigh: "", calf: "" });
    setLongueurs({ armSpan: "", torsoLength: "" });
    setMobilite({ shoulderMobility: "", hipMobility: "", ankleMobility: "" });
    setHistorique({ injuries: "", trainingHistory: "", benchPress1RM: "", squat1RM: "", deadlift1RM: "", pullups: "", ohp1RM: "" });
    setWeakPoints([]);
    setPhotos([null, null, null]);
    setPhotoAnalysis(null);
    setPhotoError(null);
  };

  // ─── MUSCU / RUNNING TABS ─────────────────────────────────────
  if (activeTab === "musculation" || activeTab === "running") {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <PageHeader
          title="Mon Diagnostic"
          subtitle="Morphologie, musculation et running"
        />
        <DiagnosticTabs
          active={activeTab}
          onChange={setActiveTab}
          morphoCompleted={diagnosticCompleted}
          muscuCompleted={muscuDiagnosticCompleted}
          runningCompleted={runningDiagnosticCompleted}
        />
        {activeTab === "musculation" && <MuscuDiagnosticForm />}
        {activeTab === "running" && <RunningDiagnosticForm />}
      </div>
    );
  }

  // ─── SUMMARY VIEW (read mode) ─────────────────────────────────
  if (diagnosticCompleted && lastEntry && viewMode === "summary") {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <PageHeader
          title="Mon Diagnostic"
          subtitle="Morphologie, musculation et running"
        />
        <DiagnosticTabs
          active={activeTab}
          onChange={setActiveTab}
          morphoCompleted={diagnosticCompleted}
          muscuCompleted={muscuDiagnosticCompleted}
          runningCompleted={runningDiagnosticCompleted}
        />

        {/* Section editor modal */}
        {editingSection && lastEntry && (
          <SectionEditor
            section={editingSection}
            initialData={(lastEntry[editingSection as keyof DiagnosticEntry] as Record<string, string>) || {}}
            onSave={handleSectionSave}
            onCancel={() => setEditingSection(null)}
          />
        )}

        {/* Program update modal */}
        {showProgramModal && latestProgramChange && (
          <ProgramUpdateModal
            change={latestProgramChange}
            diff={latestDiff}
            onAcknowledge={() => {
              acknowledgeProgramChange(latestProgramChange.id);
              setShowProgramModal(false);
            }}
            onClose={() => setShowProgramModal(false)}
          />
        )}

        {updatingPrograms && (
          <div className="mb-6">
            <InfoBox variant="info">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Mise à jour du programme en cours...</span>
              </div>
            </InfoBox>
          </div>
        )}

        <DiagnosticSummary
          entry={lastEntry}
          onEditAll={handleEditAll}
          onEditSection={handleEditSection}
        />

        {/* Body Map */}
        <div className="mt-8">
          <BodyAnalysisSection />
        </div>

        {/* History */}
        {diagnosticHistory.length > 1 && (
          <div className="mt-8">
            <SectionTitle>Historique des diagnostics</SectionTitle>
            <div className="space-y-2">
              {diagnosticHistory.map((entry, i) => {
                const date = new Date(entry.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
                return (
                  <Card key={entry.id}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${i === 0 ? "bg-[#00ff94]" : "bg-white/20"}`} />
                        <div>
                          <p className="text-sm text-white/80">{date}</p>
                          <p className="text-xs text-white/35">
                            {entry.photos?.length ? `${entry.photos.length} photos` : "Sans photos"}
                            {entry.weakPoints?.length ? ` · ${entry.weakPoints.length} points faibles` : ""}
                          </p>
                        </div>
                      </div>
                      {i === 0 && <Badge color="green">Actuel</Badge>}
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── RESULTS VIEW ──────────────────────────────────────────────
  if (viewMode === "results" && analysis) {
    return (
      <div className="p-6 md:p-8 max-w-4xl mx-auto">
        <PageHeader
          title="Résultats du diagnostic"
          subtitle="Analyse morphologique et recommandations personnalisées"
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setViewMode("summary")}>Voir résumé</Button>
              <Button variant="ghost" onClick={handleReset}>Refaire</Button>
            </div>
          }
        />
        <DiagnosticTabs
          active={activeTab}
          onChange={setActiveTab}
          morphoCompleted={diagnosticCompleted}
          muscuCompleted={muscuDiagnosticCompleted}
          runningCompleted={runningDiagnosticCompleted}
        />

        {updatingPrograms && (
          <div className="mb-6">
            <InfoBox variant="info">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-[#00d4ff] border-t-transparent rounded-full animate-spin" />
                <span className="text-xs">Analyse des modifications et mise à jour du programme en cours...</span>
              </div>
            </InfoBox>
          </div>
        )}

        {/* Program update modal */}
        {showProgramModal && latestProgramChange && (
          <ProgramUpdateModal
            change={latestProgramChange}
            diff={latestDiff}
            onAcknowledge={() => {
              acknowledgeProgramChange(latestProgramChange.id);
              setShowProgramModal(false);
            }}
            onClose={() => setShowProgramModal(false)}
          />
        )}

        <InfoBox variant="success">
          Diagnostic complété ! Les données ont été sauvegardées et seront utilisées pour personnaliser ton programme.
        </InfoBox>

        {/* Ratios */}
        <div className="mt-8">
          <SectionTitle>Ratios calculés</SectionTitle>
          <div className="grid gap-3">
            {analysis.ratios.map((r, i) => (
              <Card key={i}>
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white/90">{r.label}</p>
                    <p className="text-xs text-white/40 mt-0.5">Idéal : {r.ideal}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-bold text-white">{r.value}</span>
                    {r.status === "good" && <Badge color="green">Bon</Badge>}
                    {r.status === "warning" && <Badge color="orange">A améliorer</Badge>}
                    {r.status === "neutral" && <Badge color="gray">Info</Badge>}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>

        {/* Recommendations */}
        <div className="mt-8">
          <SectionTitle>Recommandations biomécaniques</SectionTitle>
          <div className="space-y-3">
            {analysis.recommendations.length === 0 ? (
              <Card><p className="text-sm text-white/50">Aucune recommandation spécifique. Tes proportions sont équilibrées !</p></Card>
            ) : (
              analysis.recommendations.map((rec, i) => (
                <Card key={i}>
                  <div className="flex gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#00ff94]/15 flex items-center justify-center shrink-0 mt-0.5">
                      <span className="text-[#00ff94] text-xs font-bold">{i + 1}</span>
                    </div>
                    <p className="text-sm text-white/80 leading-relaxed">{rec}</p>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {weakPoints.length > 0 && (
          <div className="mt-8">
            <SectionTitle>Points faibles identifiés</SectionTitle>
            <Card>
              <div className="flex flex-wrap gap-2">
                {weakPoints.map((wp) => <Badge key={wp} color="orange">{wp}</Badge>)}
              </div>
            </Card>
          </div>
        )}

        {/* Body Map */}
        <div className="mt-8">
          <BodyAnalysisSection />
        </div>

        {/* Photo Analysis */}
        {(analyzingPhotos || photoAnalysis || photoError) && (
          <div className="mt-8">
            {analyzingPhotos && (
              <Card>
                <div className="flex items-center gap-3 py-4">
                  <div className="w-5 h-5 border-2 border-[#00ff94] border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-white/60">Analyse visuelle en cours...</p>
                </div>
              </Card>
            )}
            {photoError && <InfoBox variant="warning">Analyse photo non disponible : {photoError}</InfoBox>}
            {photoAnalysis && <BodyAnalysisResult analysis={photoAnalysis} photos={photos} />}
          </div>
        )}

        {/* Summary card */}
        <div className="mt-8">
          <SectionTitle>Résumé des mensurations</SectionTitle>
          <Card>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Poitrine", val: mensurations.chest },
                { label: "Épaules", val: mensurations.shoulders },
                { label: "Taille", val: mensurations.waist },
                { label: "Hanches", val: mensurations.hips },
                { label: "Bras relâché", val: mensurations.armRelaxed },
                { label: "Bras contracté", val: mensurations.armFlexed },
                { label: "Cuisse", val: mensurations.thigh },
                { label: "Mollet", val: mensurations.calf },
              ].map((item) => (
                <div key={item.label}>
                  <p className="text-xs text-white/40">{item.label}</p>
                  <p className="text-lg font-semibold">{item.val || "—"} <span className="text-xs text-white/30 font-normal">cm</span></p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    );
  }

  // ─── FORM VIEW (create/edit) ───────────────────────────────────
  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto">
      <PageHeader
        title="Mon Diagnostic"
        subtitle="Morphologie, musculation et running"
        action={diagnosticCompleted && lastEntry ? (
          <Button variant="ghost" onClick={() => setViewMode("summary")}>Retour au résumé</Button>
        ) : undefined}
      />
      <DiagnosticTabs
        active={activeTab}
        onChange={setActiveTab}
        morphoCompleted={diagnosticCompleted}
        muscuCompleted={muscuDiagnosticCompleted}
        runningCompleted={runningDiagnosticCompleted}
      />

      {diagnosticCompleted && viewMode === "form" && (
        <div className="mb-6">
          <InfoBox variant="info">
            Mode édition — les champs sont pré-remplis avec tes dernières valeurs. Modifie ce que tu veux puis valide.
          </InfoBox>
        </div>
      )}

      {/* Progress */}
      <StepIndicator current={step} total={6} />
      <ProgressBar value={step + 1} max={6} color="#00ff94" label={`Étape ${step + 1}/6 — ${STEP_LABELS[step]}`} />

      {/* Step content */}
      <div className="mt-8">
        {step === 0 && (
          <Card>
            <SectionTitle>Mensurations (cm)</SectionTitle>
            <p className="text-xs text-white/40 mb-6">Mesure chaque zone en position détendue sauf indication contraire. Utilise un mètre ruban souple.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput label="Tour de poitrine" value={mensurations.chest} onChange={(v) => updateMensurations("chest", v)} />
              <NumberInput label="Tour d'épaules *" value={mensurations.shoulders} onChange={(v) => updateMensurations("shoulders", v)} />
              <NumberInput label="Tour de taille *" value={mensurations.waist} onChange={(v) => updateMensurations("waist", v)} />
              <NumberInput label="Tour de hanches" value={mensurations.hips} onChange={(v) => updateMensurations("hips", v)} />
              <NumberInput label="Tour de bras (relâché)" value={mensurations.armRelaxed} onChange={(v) => updateMensurations("armRelaxed", v)} />
              <NumberInput label="Tour de bras (contracté)" value={mensurations.armFlexed} onChange={(v) => updateMensurations("armFlexed", v)} />
              <NumberInput label="Tour de cuisse" value={mensurations.thigh} onChange={(v) => updateMensurations("thigh", v)} />
              <NumberInput label="Tour de mollet" value={mensurations.calf} onChange={(v) => updateMensurations("calf", v)} />
            </div>
            <p className="text-xs text-white/25 mt-4">* Champs requis pour l'analyse des ratios</p>
          </Card>
        )}

        {step === 1 && (
          <Card>
            <SectionTitle>Longueurs segmentaires (cm)</SectionTitle>
            <p className="text-xs text-white/40 mb-6">Ces mesures permettent d'analyser tes leviers biomécaniques pour optimiser les exercices.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <NumberInput label="Envergure (bras tendus)" value={longueurs.armSpan} onChange={(v) => updateLongueurs("armSpan", v)} placeholder="Ex: 182" />
              <NumberInput label="Longueur du tronc (C7 au coccyx)" value={longueurs.torsoLength} onChange={(v) => updateLongueurs("torsoLength", v)} placeholder="Ex: 55" />
            </div>
            <InfoBox variant="info">
              <p className="text-xs"><strong>Envergure :</strong> Tiens-toi droit, bras tendus à l'horizontale. Mesure du bout du majeur gauche au bout du majeur droit.</p>
              <p className="text-xs mt-2"><strong>Tronc :</strong> De la vertèbre C7 (bosse à la base du cou) jusqu'au coccyx.</p>
            </InfoBox>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <SectionTitle>Tests de mobilité</SectionTitle>
            <p className="text-xs text-white/40 mb-6">Évalue ta mobilité articulaire pour identifier les limitations qui impactent tes mouvements.</p>
            <div className="space-y-4">
              <SelectInput label="Peux-tu joindre tes mains derrière le dos (une main par-dessus, une par-dessous) ?" value={mobilite.shoulderMobility} onChange={(v) => updateMobilite("shoulderMobility", v)} options={MOBILITY_OPTIONS} />
              <SelectInput label="Peux-tu descendre en squat complet (ass-to-grass) sans lever les talons ?" value={mobilite.hipMobility} onChange={(v) => updateMobilite("hipMobility", v)} options={MOBILITY_OPTIONS} />
              <SelectInput label="Genou au mur : peux-tu toucher le mur avec le genou, pied à 12cm du mur ?" value={mobilite.ankleMobility} onChange={(v) => updateMobilite("ankleMobility", v)} options={MOBILITY_OPTIONS} />
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <SectionTitle>Historique et forces</SectionTitle>
            <p className="text-xs text-white/40 mb-6">Tes records et ton historique permettent de calibrer l'intensité et d'identifier les déséquilibres.</p>
            <div className="space-y-6">
              <TextAreaInput label="Blessures passées ou limitations" value={historique.injuries} onChange={(v) => updateHistorique("injuries", v)} placeholder="Ex: Épaule droite opérée en 2022, lombaires sensibles..." />
              <NumberInput label="Années d'entraînement en musculation" value={historique.trainingHistory} onChange={(v) => updateHistorique("trainingHistory", v)} unit="ans" />
              <div className="pt-2">
                <p className="text-xs text-white/50 font-medium mb-3 uppercase tracking-wider">1RM estimés (kg)</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <NumberInput label="Développé couché (Bench Press)" value={historique.benchPress1RM} onChange={(v) => updateHistorique("benchPress1RM", v)} unit="kg" />
                  <NumberInput label="Squat" value={historique.squat1RM} onChange={(v) => updateHistorique("squat1RM", v)} unit="kg" />
                  <NumberInput label="Soulevé de terre (Deadlift)" value={historique.deadlift1RM} onChange={(v) => updateHistorique("deadlift1RM", v)} unit="kg" />
                  <NumberInput label="Développé militaire (OHP)" value={historique.ohp1RM} onChange={(v) => updateHistorique("ohp1RM", v)} unit="kg" />
                </div>
              </div>
              <NumberInput label="Nombre max de tractions (pull-ups)" value={historique.pullups} onChange={(v) => updateHistorique("pullups", v)} unit="reps" />
            </div>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <SectionTitle>Points faibles perçus</SectionTitle>
            <p className="text-xs text-white/40 mb-6">Sélectionne les groupes musculaires que tu considères en retard. Cela orientera les recommandations de volume.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {WEAK_POINT_OPTIONS.map((wp) => {
                const isSelected = weakPoints.includes(wp);
                return (
                  <button key={wp} onClick={() => toggleWeakPoint(wp)} className={`p-3 rounded-xl text-sm font-medium transition-all border ${isSelected ? "bg-[#00ff94]/15 border-[#00ff94]/40 text-[#00ff94]" : "bg-white/[0.03] border-white/[0.06] text-white/60 hover:bg-white/[0.06] hover:text-white/80"}`}>
                    {isSelected && <svg className="w-4 h-4 inline mr-1.5 -mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    {wp}
                  </button>
                );
              })}
            </div>
            {weakPoints.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {weakPoints.map((wp) => <Badge key={wp} color="orange">{wp}</Badge>)}
              </div>
            )}
          </Card>
        )}

        {step === 5 && (
          <PhotoCapture photos={photos} onPhotosChange={setPhotos} />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between items-center mt-8">
        <Button variant="ghost" onClick={handleBack} disabled={step === 0}>Retour</Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/30">{STEP_LABELS[step]}</span>
          <Button onClick={handleNext} disabled={!canAdvance() || analyzingPhotos}>
            {step === 5 ? (photos.some(Boolean) ? "Analyser avec photos" : "Analyser sans photos") : "Suivant"}
          </Button>
        </div>
      </div>
    </div>
  );
}
