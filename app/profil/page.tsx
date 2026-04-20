"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Card, PageHeader, Button, Badge, SectionTitle, InfoBox } from "@/components/ui";
import { useStore } from "@/lib/store";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

// ---------------------------------------------------------------------------
// Editable field components
// ---------------------------------------------------------------------------

function EditableField({
  label,
  value,
  onChange,
  type = "text",
  unit,
  min,
  max,
  step,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: "text" | "number";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-white/40">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={min}
          max={max}
          step={step}
          className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/25 transition-colors"
        />
        {unit && <span className="text-xs text-white/35 whitespace-nowrap">{unit}</span>}
      </div>
    </div>
  );
}

function EditableSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-white/40">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/25 transition-colors appearance-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#0a0a0a] text-white">
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

function TagEditor({
  label,
  tags,
  onChange,
  color = "green",
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  color?: "green" | "orange" | "blue" | "purple" | "red" | "gray";
}) {
  const [input, setInput] = useState("");

  const addTag = () => {
    const trimmed = input.trim();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
      setInput("");
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs text-white/40">{label}</label>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1">
            <Badge color={color}>{tag}</Badge>
            <button
              onClick={() => removeTag(tag)}
              className="text-white/30 hover:text-[#ff4757] text-xs transition-colors -ml-1"
            >
              x
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag();
            }
          }}
          placeholder="Ajouter..."
          className="flex-1 bg-white/[0.05] border border-white/[0.08] rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-[#00ff94]/50 focus:ring-1 focus:ring-[#00ff94]/25 transition-colors"
        />
        <Button variant="ghost" size="sm" onClick={addTag}>
          +
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mensurations Section
// ---------------------------------------------------------------------------

const MEASUREMENT_LABELS: Record<string, string> = {
  chest: "Poitrine",
  shoulders: "Épaules",
  waist: "Taille",
  hips: "Hanches",
  armRelaxed: "Bras (R)",
  armFlexed: "Bras (F)",
  thigh: "Cuisse",
  calf: "Mollet",
};

const CHART_COLORS = ["#00ff94", "#00d4ff", "#a855f7", "#ff9500", "#ff4757", "#ffd93d", "#6bff6b", "#ff6bea"];

function MensurationsSection() {
  const { diagnosticHistory } = useStore();
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(["shoulders", "waist", "armFlexed", "chest"]);

  // Build chart data from history (oldest → newest)
  const chartData = useMemo(() => {
    const reversed = [...diagnosticHistory].reverse();
    return reversed.map((entry) => {
      const m = entry.mensurations || {};
      const date = new Date(entry.date);
      const label = date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      const point: Record<string, string | number> = { date: label };
      for (const key of Object.keys(MEASUREMENT_LABELS)) {
        const val = parseFloat((m as Record<string, string>)[key]);
        if (!isNaN(val) && val > 0) point[key] = val;
      }
      return point;
    });
  }, [diagnosticHistory]);

  const latest = diagnosticHistory[0];
  const previous = diagnosticHistory[1] || null;

  if (!latest) {
    return (
      <div className="mt-6">
        <Card>
          <SectionTitle>Mes Mensurations</SectionTitle>
          <div className="text-center py-8">
            <span className="text-3xl mb-3 block">📏</span>
            <p className="text-white/50 text-sm">Aucune mensuration enregistrée</p>
            <p className="text-white/30 text-xs mt-1">Complète le diagnostic morphologique pour voir tes mensurations ici</p>
          </div>
        </Card>
      </div>
    );
  }

  const m = latest.mensurations || {};

  function getDelta(key: string): { value: number; display: string } | null {
    if (!previous) return null;
    const prev = parseFloat((previous.mensurations as Record<string, string>)?.[key]) || 0;
    const curr = parseFloat((m as Record<string, string>)[key]) || 0;
    if (prev === 0 || curr === 0) return null;
    const delta = curr - prev;
    if (Math.abs(delta) < 0.1) return { value: 0, display: "—" };
    return { value: delta, display: `${delta > 0 ? "+" : ""}${delta.toFixed(1)} cm` };
  }

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const lastDate = new Date(latest.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="mt-6">
      <Card glow="blue">
        <div className="flex items-center justify-between mb-4">
          <SectionTitle className="!mb-0">Mes Mensurations</SectionTitle>
          <a href="/profil/diagnostic" className="text-xs text-[#00d4ff] hover:text-[#00d4ff]/80 transition-colors">
            Mettre à jour
          </a>
        </div>
        <p className="text-xs text-white/35 -mt-2 mb-4">Dernière mesure : {lastDate}</p>

        {/* Grid of measurements */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {Object.entries(MEASUREMENT_LABELS).map(([key, label]) => {
            const val = (m as Record<string, string>)[key];
            const delta = getDelta(key);
            return (
              <div key={key} className="p-3 rounded-lg bg-white/[0.03]">
                <p className="text-[10px] text-white/35 uppercase tracking-wider">{label}</p>
                <p className="text-lg font-semibold mt-0.5">
                  {val || "—"}
                  {val && <span className="text-xs text-white/30 font-normal ml-1">cm</span>}
                </p>
                {delta && (
                  <p className={`text-[10px] mt-0.5 ${delta.value > 0 ? "text-[#00ff94]" : delta.value < 0 ? "text-[#ff4757]" : "text-white/25"}`}>
                    {delta.display}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Ratios */}
        {latest.analysis?.ratios && latest.analysis.ratios.length > 0 && (
          <div className="mb-6 pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-white/40 font-medium mb-3 uppercase tracking-wider">Ratios clés</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {latest.analysis.ratios.slice(0, 6).map((r, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-white/[0.02]">
                  <span className="text-[10px] text-white/50 truncate mr-2">{r.label.replace("Ratio ", "")}</span>
                  <span className="text-xs font-bold">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Evolution chart */}
        {chartData.length > 1 && (
          <div className="pt-4 border-t border-white/[0.06]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-white/40 font-medium uppercase tracking-wider">Évolution</p>
            </div>

            {/* Metric toggles */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {Object.entries(MEASUREMENT_LABELS).map(([key, label], i) => (
                <button
                  key={key}
                  onClick={() => toggleMetric(key)}
                  className={`text-[10px] px-2 py-1 rounded-full border transition-all ${
                    selectedMetrics.includes(key)
                      ? "border-white/20 text-white"
                      : "border-white/[0.06] text-white/25 hover:text-white/50"
                  }`}
                  style={selectedMetrics.includes(key) ? { borderColor: CHART_COLORS[i % CHART_COLORS.length] + "60", color: CHART_COLORS[i % CHART_COLORS.length] } : undefined}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.3)" }} axisLine={false} tickLine={false} width={35} />
                  <Tooltip
                    contentStyle={{ background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                    labelStyle={{ color: "rgba(255,255,255,0.5)" }}
                  />
                  {selectedMetrics.map((key, i) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={MEASUREMENT_LABELS[key]}
                      stroke={CHART_COLORS[Object.keys(MEASUREMENT_LABELS).indexOf(key) % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* History */}
        {diagnosticHistory.length > 1 && (
          <div className="pt-4 mt-4 border-t border-white/[0.06]">
            <p className="text-xs text-white/40 font-medium mb-2 uppercase tracking-wider">Historique des mesures</p>
            <div className="space-y-1.5">
              {diagnosticHistory.slice(0, 5).map((entry, i) => {
                const date = new Date(entry.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
                return (
                  <div key={entry.id} className="flex items-center gap-2 text-xs">
                    <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-[#00ff94]" : "bg-white/20"}`} />
                    <span className="text-white/50">{date}</span>
                    <span className="text-white/25">— Mesure complète</span>
                    {entry.photos?.length > 0 && <Badge color="blue">{entry.photos.length} photos</Badge>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ProfilPage() {
  const { profile, updateProfile, diabetesConfig, updateDiabetesConfig } = useStore();
  const [saved, setSaved] = useState(false);

  const save = (updates: Partial<typeof profile>) => {
    updateProfile(updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  // Local form state mirroring the store so we can batch saves
  const [name, setName] = useState(profile.name);
  const [age, setAge] = useState(profile.age);
  const [height, setHeight] = useState(profile.height);
  const [weight, setWeight] = useState(profile.weight);

  // Diabetes — lit depuis le store centralisé (plus de valeurs hardcodées)
  const [isf, setIsf] = useState(diabetesConfig.insulinSensitivityFactor);
  const [targetGlucose, setTargetGlucose] = useState(diabetesConfig.targetGlucose);
  const [basalDose, setBasalDose] = useState(profile.basalDose);
  const [insulinRapid, setInsulinRapid] = useState(profile.insulinRapid);
  const [insulinSystem, setInsulinSystem] = useState(profile.insulinSystem);

  // Les 4 ratios affichés en lecture (édition dans /diabete/parametres)
  const profileDiabeteSlots = [
    {
      key: "morning",
      suffix: "le matin",
      gPerU: diabetesConfig.ratios.morning,
    },
    {
      key: "lunch",
      suffix: "à midi",
      gPerU: diabetesConfig.ratios.lunch,
    },
    {
      key: "snack",
      suffix: "au goûter",
      gPerU:
        diabetesConfig.insulinRatios?.find((r) => r.mealKey === "snack")?.ratio ??
        diabetesConfig.ratios.lunch,
    },
    {
      key: "dinner",
      suffix: "au dîner",
      gPerU: diabetesConfig.ratios.dinner,
    },
  ];

  // Training
  const [trainingDays, setTrainingDays] = useState(profile.trainingDaysPerWeek);
  const [runningLevel, setRunningLevel] = useState(profile.runningLevel);
  const [muscuLevel, setMuscuLevel] = useState(profile.muscuLevel);
  const [goals, setGoals] = useState(profile.goals);

  // Nutrition
  const [targetCalories, setTargetCalories] = useState(profile.targetCalories);
  const [targetProtein, setTargetProtein] = useState(profile.targetProtein);
  const [targetCarbs, setTargetCarbs] = useState(profile.targetCarbs);
  const [targetFat, setTargetFat] = useState(profile.targetFat);

  // Weak points
  const [weakPoints, setWeakPoints] = useState(profile.weakPoints);

  // Equipment
  const [cgmType, setCgmType] = useState(profile.cgmType);

  // Body type
  const [bodyType, setBodyType] = useState(profile.bodyType);

  const handleSaveAll = () => {
    save({
      name,
      age: Number(age),
      height: Number(height),
      weight: Number(weight),
      basalDose: Number(basalDose),
      insulinRapid,
      insulinSystem,
      trainingDaysPerWeek: Number(trainingDays),
      runningLevel,
      muscuLevel,
      goals,
      targetCalories: Number(targetCalories),
      targetProtein: Number(targetProtein),
      targetCarbs: Number(targetCarbs),
      targetFat: Number(targetFat),
      weakPoints,
      cgmType,
      bodyType,
    });
    // Save diabetes config separately (ISF + cible)
    updateDiabetesConfig({
      insulinSensitivityFactor: Number(isf),
      targetGlucose: Number(targetGlucose),
    });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto pb-32">
      <PageHeader
        title="Mon Profil"
        subtitle="Configure tes informations personnelles, diabete et entrainement"
        action={
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-xs text-[#00ff94] animate-pulse">Sauvegarde !</span>
            )}
            <Button onClick={handleSaveAll}>Sauvegarder</Button>
          </div>
        }
      />

      {/* Quick access menu */}
      <Card className="mb-6">
        <SectionTitle>Accès rapide</SectionTitle>
        <div className="space-y-1">
          {[
            { href: "/profil/diagnostic", icon: "🔬", label: "Mon Diagnostic", desc: "Morphologie, muscu, running" },
            { href: "/diabete", icon: "💉", label: "Paramètres Diabète", desc: "Ratios, FSI, cible glycémique" },
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center justify-between p-3 rounded-xl hover:bg-white/[0.03] transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-white/35">{item.desc}</p>
                </div>
              </div>
              <span className="text-white/20">→</span>
            </Link>
          ))}
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* ---------------------------------------------------------- */}
        {/* Personal Info */}
        {/* ---------------------------------------------------------- */}
        <Card glow="green">
          <SectionTitle>Informations personnelles</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <EditableField
                label="Prenom"
                value={name}
                onChange={(v) => setName(v)}
              />
            </div>
            <EditableField
              label="Age"
              value={age}
              type="number"
              unit="ans"
              min={10}
              max={99}
              onChange={(v) => setAge(Number(v))}
            />
            <EditableField
              label="Taille"
              value={height}
              type="number"
              unit="cm"
              min={100}
              max={250}
              onChange={(v) => setHeight(Number(v))}
            />
            <EditableField
              label="Poids"
              value={weight}
              type="number"
              unit="kg"
              min={30}
              max={200}
              step={0.1}
              onChange={(v) => setWeight(Number(v))}
            />
            <EditableSelect
              label="Morphotype"
              value={bodyType}
              options={[
                "Ectomorphe",
                "Mesomorphe",
                "Endomorphe",
                "Ectomorphe-Mesomorphe",
                "Mesomorphe-Endomorphe",
              ]}
              onChange={(v) => setBodyType(v)}
            />
          </div>

          {/* Morphology display */}
          <div className="mt-6 pt-4 border-t border-white/[0.06]">
            <p className="text-xs text-white/40 mb-3">Morphologie</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between p-2 rounded-lg bg-white/[0.03]">
                <span className="text-white/35">Type</span>
                <span>
                  <Badge color="green">{bodyType}</Badge>
                </span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-white/[0.03]">
                <span className="text-white/35">Bras</span>
                <span className="text-white/60">{profile.morphology.armLength ?? "Non mesure"}</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-white/[0.03]">
                <span className="text-white/35">Femur</span>
                <span className="text-white/60">{profile.morphology.femurLength ?? "Non mesure"}</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-white/[0.03]">
                <span className="text-white/35">Torse</span>
                <span className="text-white/60">{profile.morphology.torsoLength ?? "Non mesure"}</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-white/[0.03]">
                <span className="text-white/35">Epaules</span>
                <span className="text-white/60">{profile.morphology.shoulderWidth ?? "Non mesure"}</span>
              </div>
              <div className="flex justify-between p-2 rounded-lg bg-white/[0.03]">
                <span className="text-white/35">Hanches</span>
                <span className="text-white/60">{profile.morphology.hipWidth ?? "Non mesure"}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------------- */}
        {/* Diabetes Config */}
        {/* ---------------------------------------------------------- */}
        <Card>
          <SectionTitle>Diabete T1 — Configuration</SectionTitle>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/40">Mon programme d&apos;insuline</p>
              <Link
                href="/diabete/parametres"
                className="text-xs text-[#a855f7] hover:text-[#a855f7]/80 transition-colors"
              >
                Modifier →
              </Link>
            </div>
            <div className="space-y-2">
              {profileDiabeteSlots.map((slot) => {
                const unitsPer10g = 10 / slot.gPerU;
                const rounded = Math.round(unitsPer10g * 10) / 10;
                const display =
                  rounded === Math.floor(rounded)
                    ? String(rounded)
                    : rounded.toFixed(1).replace(".", ",");
                const unitWord = rounded === 1 ? "unité" : "unités";
                return (
                  <div
                    key={slot.key}
                    className="p-3 rounded-lg bg-white/[0.03] text-sm text-white/80"
                  >
                    <span className="text-lg font-bold text-[#a855f7] mr-1">{display}</span>
                    <span className="text-[#a855f7]/80">{unitWord} pour 10g de glucide</span>{" "}
                    <span className="text-white">{slot.suffix}</span>
                  </div>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <EditableField
                label="ISF (Facteur de sensibilite)"
                value={isf}
                type="number"
                unit="mg/dL/U"
                min={10}
                max={200}
                onChange={(v) => setIsf(Number(v))}
              />
              <EditableField
                label="Glycemie cible"
                value={targetGlucose}
                type="number"
                unit="mg/dL"
                min={70}
                max={150}
                onChange={(v) => setTargetGlucose(Number(v))}
              />
              <EditableField
                label="Dose basale"
                value={basalDose}
                type="number"
                unit="U/jour"
                min={1}
                max={100}
                step={0.5}
                onChange={(v) => setBasalDose(Number(v))}
              />
              <EditableSelect
                label="Insuline rapide"
                value={insulinRapid}
                options={["Novorapid", "Humalog", "Fiasp", "Apidra", "Lyumjev"]}
                onChange={(v) => setInsulinRapid(v)}
              />
            </div>

            <EditableSelect
              label="Systeme d'injection"
              value={insulinSystem}
              options={[
                "Stylos basal-bolus",
                "Pompe Medtronic",
                "Pompe Omnipod",
                "Pompe t:slim",
                "Pompe YpsoPump",
              ]}
              onChange={(v) => setInsulinSystem(v)}
            />
          </div>
        </Card>

        {/* ---------------------------------------------------------- */}
        {/* Training Config */}
        {/* ---------------------------------------------------------- */}
        <Card>
          <SectionTitle>Entrainement</SectionTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <EditableField
                label="Jours / semaine"
                value={trainingDays}
                type="number"
                min={1}
                max={7}
                onChange={(v) => setTrainingDays(Number(v))}
              />
              <EditableSelect
                label="Niveau running"
                value={runningLevel}
                options={["Debutant", "Intermediaire", "Avance", "Expert"]}
                onChange={(v) => setRunningLevel(v)}
              />
              <EditableSelect
                label="Niveau muscu"
                value={muscuLevel}
                options={["Debutant", "Intermediaire", "Avance", "Expert"]}
                onChange={(v) => setMuscuLevel(v)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <EditableField
                label="VO2max"
                value={profile.vo2max}
                type="number"
                unit="ml/kg/min"
                min={20}
                max={90}
                onChange={(v) => updateProfile({ vo2max: Number(v) })}
              />
              <EditableField
                label="DC 1RM"
                value={profile.benchPress1RM}
                type="number"
                unit="kg"
                min={20}
                max={300}
                onChange={(v) => updateProfile({ benchPress1RM: Number(v) })}
              />
            </div>

            <TagEditor
              label="Objectifs"
              tags={goals}
              onChange={setGoals}
              color="green"
            />
          </div>
        </Card>

        {/* ---------------------------------------------------------- */}
        {/* Nutrition Targets */}
        {/* ---------------------------------------------------------- */}
        <Card>
          <SectionTitle>Objectifs nutritionnels</SectionTitle>
          <div className="space-y-4">
            <EditableField
              label="Calories"
              value={targetCalories}
              type="number"
              unit="kcal"
              min={1000}
              max={6000}
              step={50}
              onChange={(v) => setTargetCalories(Number(v))}
            />
            <div className="grid grid-cols-3 gap-4">
              <EditableField
                label="Proteines"
                value={targetProtein}
                type="number"
                unit="g"
                min={50}
                max={400}
                onChange={(v) => setTargetProtein(Number(v))}
              />
              <EditableField
                label="Glucides"
                value={targetCarbs}
                type="number"
                unit="g"
                min={50}
                max={600}
                onChange={(v) => setTargetCarbs(Number(v))}
              />
              <EditableField
                label="Lipides"
                value={targetFat}
                type="number"
                unit="g"
                min={20}
                max={250}
                onChange={(v) => setTargetFat(Number(v))}
              />
            </div>

            {/* Macro split visual */}
            <div className="pt-3">
              <p className="text-xs text-white/40 mb-2">Repartition calorique</p>
              <div className="flex h-3 rounded-full overflow-hidden">
                {(() => {
                  const pCal = targetProtein * 4;
                  const cCal = targetCarbs * 4;
                  const fCal = targetFat * 9;
                  const total = pCal + cCal + fCal;
                  if (total === 0) return null;
                  return (
                    <>
                      <div
                        className="bg-[#00d4ff]"
                        style={{ width: `${(pCal / total) * 100}%` }}
                        title={`Proteines ${Math.round((pCal / total) * 100)}%`}
                      />
                      <div
                        className="bg-[#ff9500]"
                        style={{ width: `${(cCal / total) * 100}%` }}
                        title={`Glucides ${Math.round((cCal / total) * 100)}%`}
                      />
                      <div
                        className="bg-[#a855f7]"
                        style={{ width: `${(fCal / total) * 100}%` }}
                        title={`Lipides ${Math.round((fCal / total) * 100)}%`}
                      />
                    </>
                  );
                })()}
              </div>
              <div className="flex justify-between text-[10px] text-white/35 mt-1">
                <span className="text-[#00d4ff]">P {Math.round((targetProtein * 4 / (targetProtein * 4 + targetCarbs * 4 + targetFat * 9)) * 100)}%</span>
                <span className="text-[#ff9500]">G {Math.round((targetCarbs * 4 / (targetProtein * 4 + targetCarbs * 4 + targetFat * 9)) * 100)}%</span>
                <span className="text-[#a855f7]">L {Math.round((targetFat * 9 / (targetProtein * 4 + targetCarbs * 4 + targetFat * 9)) * 100)}%</span>
              </div>
            </div>
          </div>
        </Card>

        {/* ---------------------------------------------------------- */}
        {/* Weak Points */}
        {/* ---------------------------------------------------------- */}
        <Card>
          <SectionTitle>Points faibles</SectionTitle>
          <TagEditor
            label="Muscles / mouvements a travailler"
            tags={weakPoints}
            onChange={setWeakPoints}
            color="orange"
          />
          {weakPoints.length > 0 && (
            <div className="mt-4">
              <InfoBox variant="warning">
                Tes points faibles sont pris en compte dans la programmation muscu.
                Le volume est augmente automatiquement sur ces groupes.
              </InfoBox>
            </div>
          )}
        </Card>

        {/* ---------------------------------------------------------- */}
        {/* Equipment: CGM & Insulin System */}
        {/* ---------------------------------------------------------- */}
        <Card>
          <SectionTitle>Equipement</SectionTitle>
          <div className="space-y-4">
            <EditableSelect
              label="Capteur de glycemie (CGM)"
              value={cgmType}
              options={[
                "FreeStyle Libre",
                "FreeStyle Libre 2",
                "FreeStyle Libre 3",
                "Dexcom G6",
                "Dexcom G7",
                "Dexcom ONE",
                "Medtronic Guardian",
                "Eversense",
                "Aucun",
              ]}
              onChange={(v) => setCgmType(v)}
            />
            <EditableSelect
              label="Systeme d'insuline"
              value={insulinSystem}
              options={[
                "Stylos basal-bolus",
                "Pompe Medtronic",
                "Pompe Omnipod",
                "Pompe t:slim",
                "Pompe YpsoPump",
              ]}
              onChange={(v) => setInsulinSystem(v)}
            />

            <div className="p-4 rounded-xl bg-white/[0.03] space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-white/35">CGM actif</span>
                <span>{profile.hasCGM ? <Badge color="green">Oui</Badge> : <Badge color="red">Non</Badge>}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/35">Type diabete</span>
                <span><Badge color="blue">{profile.diabetesType}</Badge></span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/35">Insuline rapide</span>
                <span className="text-white/70">{insulinRapid}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-white/35">Dose basale</span>
                <span className="text-white/70">{basalDose} U/jour</span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ---------------------------------------------------------- */}
      {/* Mensurations Section (full width) */}
      {/* ---------------------------------------------------------- */}
      <MensurationsSection />

      {/* Sticky save bar */}
      <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent pointer-events-none z-40">
        <div className="max-w-5xl mx-auto lg:ml-64 flex justify-end pointer-events-auto">
          <Button onClick={handleSaveAll} size="lg">
            {saved ? "Sauvegarde !" : "Sauvegarder les modifications"}
          </Button>
        </div>
      </div>
    </div>
  );
}
