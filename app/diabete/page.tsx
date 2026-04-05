"use client";

import { useState, useMemo } from "react";
import {
  Card,
  PageHeader,
  Button,
  Badge,
  InfoBox,
  SectionTitle,
  GlucoseIndicator,
} from "@/components/ui";
import { useStore } from "@/lib/store";
import { calculateBolus, getInsulinOnBoard } from "@/lib/insulin-calculator";
import { DIABETES_CONFIG } from "@/lib/constants";
import Link from "next/link";
import type { MealTime } from "@/types";

export default function DiabetePage() {
  const {
    profile,
    diabetesConfig,
    glucoseReadings,
    addGlucoseReading,
    insulinLogs,
    addInsulinLog,
  } = useStore();

  // ---- Bolus calculator form state ----
  const [carbsGrams, setCarbsGrams] = useState(60);
  const [mealTime, setMealTime] = useState<MealTime>("lunch");
  const [currentGlucose, setCurrentGlucose] = useState(120);
  const [isPreWorkout, setIsPreWorkout] = useState(false);
  const [workoutType, setWorkoutType] = useState<"muscu" | "running" | null>(null);
  const [minutesUntilWorkout, setMinutesUntilWorkout] = useState(60);
  const [showResult, setShowResult] = useState(false);

  // ---- Quick injection logger state ----
  const [quickUnits, setQuickUnits] = useState(4);
  const [quickMealType, setQuickMealType] = useState("lunch");
  const [quickCarbs, setQuickCarbs] = useState(60);
  const [quickGlucose, setQuickGlucose] = useState(120);
  const [quickNotes, setQuickNotes] = useState("");

  // ---- Glucose logger state ----
  const [glucoseValue, setGlucoseValue] = useState(110);
  const [glucoseTrend, setGlucoseTrend] = useState("stable");

  // ---- Computed bolus result ----
  const bolusResult = useMemo(() => {
    if (!showResult) return null;
    return calculateBolus(
      carbsGrams,
      mealTime,
      currentGlucose,
      isPreWorkout,
      workoutType,
      minutesUntilWorkout,
      diabetesConfig
    );
  }, [showResult, carbsGrams, mealTime, currentGlucose, isPreWorkout, workoutType, minutesUntilWorkout, diabetesConfig]);

  // ---- Insulin on board ----
  const iob = useMemo(() => {
    const now = new Date();
    const recentInjections = insulinLogs
      .map((log) => {
        const injectedAt = new Date(log.injectedAt);
        const minutesAgo = (now.getTime() - injectedAt.getTime()) / 60000;
        return { units: log.units, minutesAgo };
      })
      .filter((inj) => inj.minutesAgo < DIABETES_CONFIG.insulinActiveDuration && inj.minutesAgo >= 0);
    return getInsulinOnBoard(recentInjections);
  }, [insulinLogs]);

  // ---- Handlers ----
  function handleCalculate() {
    setShowResult(true);
  }

  function handleLogInjection() {
    addInsulinLog({
      id: crypto.randomUUID(),
      units: quickUnits,
      insulinType: profile.insulinRapid,
      mealType: quickMealType,
      carbsGrams: quickCarbs,
      glucoseBefore: quickGlucose,
      notes: quickNotes,
      injectedAt: new Date(),
    });
    setQuickNotes("");
  }

  function handleLogGlucose() {
    addGlucoseReading({
      id: crypto.randomUUID(),
      value: glucoseValue,
      trend: glucoseTrend,
      recordedAt: new Date(),
    });
  }

  const lastGlucose = glucoseReadings[0];
  const mealTimeLabels: Record<MealTime, string> = {
    morning: "Petit-dej",
    lunch: "Dejeuner",
    snack: "Gouter",
    dinner: "Diner",
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Diabete T1"
        subtitle={`Gestion insuline · ${profile.insulinRapid} · Basale ${profile.basalDose}U/jour · CGM ${profile.cgmType}`}
        action={
          <div className="flex items-center gap-2">
            <Link href="/diabete/parametres">
              <Button variant="ghost" size="sm">
                ⚙️ Parametres
              </Button>
            </Link>
            <Link href="/diabete/patterns">
              <Button variant="secondary" size="sm">
                Patterns connus
              </Button>
            </Link>
          </div>
        }
      />

      {/* Current glucose banner */}
      {lastGlucose && (
        <div className="mb-6">
          <GlucoseIndicator value={lastGlucose.value} />
          <span className="text-xs text-white/30 ml-3">
            {new Date(lastGlucose.recordedAt).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · Tendance: {lastGlucose.trend}
          </span>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 md:gap-6">
        {/* ============ LEFT COLUMN ============ */}
        <div className="space-y-6">
          {/* Bolus Calculator */}
          <Card glow="green">
            <SectionTitle>Calculateur de bolus</SectionTitle>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/40 block mb-1">Glucides (g)</label>
                <input
                  type="number"
                  value={carbsGrams}
                  onChange={(e) => {
                    setCarbsGrams(Number(e.target.value));
                    setShowResult(false);
                  }}
                  min={0}
                  max={300}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Repas</label>
                <select
                  value={mealTime}
                  onChange={(e) => {
                    setMealTime(e.target.value as MealTime);
                    setShowResult(false);
                  }}
                  className="w-full"
                >
                  <option value="morning">Petit-dejeuner</option>
                  <option value="lunch">Dejeuner</option>
                  <option value="snack">Gouter</option>
                  <option value="dinner">Diner</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Glycemie actuelle (mg/dL)</label>
                <input
                  type="number"
                  value={currentGlucose}
                  onChange={(e) => {
                    setCurrentGlucose(Number(e.target.value));
                    setShowResult(false);
                  }}
                  min={40}
                  max={500}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Minutes avant sport</label>
                <input
                  type="number"
                  value={minutesUntilWorkout}
                  onChange={(e) => {
                    setMinutesUntilWorkout(Number(e.target.value));
                    setShowResult(false);
                  }}
                  min={0}
                  max={360}
                  disabled={!isPreWorkout}
                  className={`w-full ${!isPreWorkout ? "opacity-40" : ""}`}
                />
              </div>
            </div>

            {/* Pre-workout toggle */}
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={() => {
                  setIsPreWorkout(!isPreWorkout);
                  if (isPreWorkout) setWorkoutType(null);
                  setShowResult(false);
                }}
                className={`relative w-12 h-6 rounded-full transition-colors ${
                  isPreWorkout ? "bg-[#00ff94]" : "bg-white/10"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                    isPreWorkout ? "translate-x-6" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-sm text-white/60">Pre-entrainement</span>

              {isPreWorkout && (
                <div className="flex gap-2 ml-2">
                  <button
                    onClick={() => {
                      setWorkoutType("muscu");
                      setShowResult(false);
                    }}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                      workoutType === "muscu"
                        ? "bg-[#a855f7]/20 text-[#a855f7] border border-[#a855f7]/30"
                        : "bg-white/[0.05] text-white/40 border border-white/[0.06]"
                    }`}
                  >
                    Muscu
                  </button>
                  <button
                    onClick={() => {
                      setWorkoutType("running");
                      setShowResult(false);
                    }}
                    className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                      workoutType === "running"
                        ? "bg-[#00d4ff]/20 text-[#00d4ff] border border-[#00d4ff]/30"
                        : "bg-white/[0.05] text-white/40 border border-white/[0.06]"
                    }`}
                  >
                    Running
                  </button>
                </div>
              )}
            </div>

            <Button onClick={handleCalculate} size="lg" className="w-full">
              Calculer le bolus
            </Button>

            {/* Result */}
            {bolusResult && (
              <div className="mt-5 animate-slide-up">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="p-3 rounded-xl bg-white/[0.04] text-center">
                    <p className="text-xs text-white/35">Bolus glucides</p>
                    <p className="text-xl font-bold text-[#00d4ff]">
                      {bolusResult.carbBolus.toFixed(1)}
                      <span className="text-xs font-normal text-white/30 ml-0.5">U</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.04] text-center">
                    <p className="text-xs text-white/35">Correction</p>
                    <p className="text-xl font-bold text-[#ff9500]">
                      {bolusResult.correctionBolus.toFixed(1)}
                      <span className="text-xs font-normal text-white/30 ml-0.5">U</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[#00ff94]/10 text-center border border-[#00ff94]/20">
                    <p className="text-xs text-[#00ff94]/60">Total</p>
                    <p className="text-2xl font-bold text-[#00ff94]">
                      {bolusResult.totalBolus}
                      <span className="text-xs font-normal text-[#00ff94]/50 ml-0.5">U</span>
                    </p>
                  </div>
                </div>

                {/* Adjustments */}
                {bolusResult.adjustments.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs text-white/40 mb-1.5">Ajustements appliques</p>
                    <div className="flex flex-wrap gap-2">
                      {bolusResult.adjustments.map((adj, i) => (
                        <Badge key={i} color="orange">
                          {adj}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Reasoning */}
                <div className="mt-3 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <p className="text-xs text-white/40 mb-2 font-medium">Raisonnement</p>
                  <div className="space-y-1.5">
                    {bolusResult.reasoning.map((r, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs">
                        <span className="text-[#00ff94] mt-0.5 shrink-0">&#9654;</span>
                        <span className="text-white/60">{r}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* IOB warning if significant */}
                {iob.totalIOB > 0.5 && (
                  <InfoBox variant="warning">
                    <span className="font-medium">Attention IOB:</span> {iob.totalIOB}U d&apos;insuline encore active.
                    Envisager de reduire le bolus de correction.
                  </InfoBox>
                )}
              </div>
            )}
          </Card>

          {/* Insulin On Board */}
          <Card>
            <SectionTitle>Insuline active (IOB)</SectionTitle>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-center">
                <p
                  className={`text-3xl font-bold ${
                    iob.totalIOB > 2 ? "text-[#ff9500]" : iob.totalIOB > 0 ? "text-[#00d4ff]" : "text-white/30"
                  }`}
                >
                  {iob.totalIOB}
                  <span className="text-sm font-normal text-white/30 ml-1">U</span>
                </p>
                <p className="text-xs text-white/35">active</p>
              </div>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#00d4ff] transition-all duration-500"
                    style={{
                      width: `${Math.min(100, (iob.totalIOB / 10) * 100)}%`,
                    }}
                  />
                </div>
                <p className="text-xs text-white/25 mt-1">
                  Duree d&apos;action: {DIABETES_CONFIG.insulinActiveDuration} min ({(DIABETES_CONFIG.insulinActiveDuration / 60).toFixed(1)}h)
                </p>
              </div>
            </div>

            {iob.details.length > 0 ? (
              <div className="space-y-2">
                {iob.details.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/[0.02]"
                  >
                    <span className="text-white/50">
                      {d.units}U il y a {Math.round(d.minutesAgo)} min
                    </span>
                    <span className="text-[#00d4ff] font-medium">{d.remaining.toFixed(1)}U restantes</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-white/25">Aucune insuline active recemment.</p>
            )}
          </Card>

          {/* Known Patterns */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <SectionTitle className="mb-0">Patterns connus</SectionTitle>
              <Link href="/diabete/patterns" className="text-xs text-[#00ff94] hover:underline">
                Details &rarr;
              </Link>
            </div>
            <div className="space-y-3">
              {diabetesConfig.knownPatterns.map((pattern) => (
                <div
                  key={pattern.name}
                  className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[#ff9500]">&#9888;</span>
                    <span className="text-sm font-medium">{pattern.name}</span>
                  </div>
                  <p className="text-xs text-white/40 mb-1">{pattern.description}</p>
                  <p className="text-xs text-[#00ff94]/70">
                    &#10140; {pattern.suggestion}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* ============ RIGHT COLUMN ============ */}
        <div className="space-y-6">
          {/* Glucose Quick Logger */}
          <Card glow="blue">
            <SectionTitle>Logger une glycemie</SectionTitle>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/40 block mb-1">Glycemie (mg/dL)</label>
                <input
                  type="number"
                  value={glucoseValue}
                  onChange={(e) => setGlucoseValue(Number(e.target.value))}
                  min={30}
                  max={500}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Tendance</label>
                <select
                  value={glucoseTrend}
                  onChange={(e) => setGlucoseTrend(e.target.value)}
                  className="w-full"
                >
                  <option value="rising-fast">Montee rapide</option>
                  <option value="rising">En hausse</option>
                  <option value="stable">Stable</option>
                  <option value="falling">En baisse</option>
                  <option value="falling-fast">Chute rapide</option>
                </select>
              </div>
            </div>
            <Button onClick={handleLogGlucose} variant="secondary" className="w-full">
              Enregistrer la glycemie
            </Button>

            {/* Recent readings */}
            {glucoseReadings.length > 0 && (
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <p className="text-xs text-white/40 mb-2">Lectures recentes</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {glucoseReadings.slice(0, 8).map((reading) => (
                    <div
                      key={reading.id}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-white/[0.02]"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            reading.value < 70
                              ? "bg-[#ff4757]"
                              : reading.value > 180
                                ? "bg-[#ff9500]"
                                : "bg-[#00ff94]"
                          }`}
                        />
                        <span
                          className={`font-medium ${
                            reading.value < 70
                              ? "text-[#ff4757]"
                              : reading.value > 180
                                ? "text-[#ff9500]"
                                : "text-[#00ff94]"
                          }`}
                        >
                          {reading.value} mg/dL
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-white/30">
                        <span>{reading.trend}</span>
                        <span>
                          {new Date(reading.recordedAt).toLocaleTimeString("fr-FR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Quick Injection Logger */}
          <Card glow="orange">
            <SectionTitle>Logger une injection</SectionTitle>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="text-xs text-white/40 block mb-1">Unites</label>
                <input
                  type="number"
                  value={quickUnits}
                  onChange={(e) => setQuickUnits(Number(e.target.value))}
                  min={0}
                  max={50}
                  step={0.5}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Repas</label>
                <select
                  value={quickMealType}
                  onChange={(e) => setQuickMealType(e.target.value)}
                  className="w-full"
                >
                  <option value="morning">Petit-dejeuner</option>
                  <option value="lunch">Dejeuner</option>
                  <option value="dinner">Diner</option>
                  <option value="correction">Correction</option>
                  <option value="snack">Collation</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Glucides (g)</label>
                <input
                  type="number"
                  value={quickCarbs}
                  onChange={(e) => setQuickCarbs(Number(e.target.value))}
                  min={0}
                  max={300}
                  className="w-full"
                />
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">Glycemie avant</label>
                <input
                  type="number"
                  value={quickGlucose}
                  onChange={(e) => setQuickGlucose(Number(e.target.value))}
                  min={30}
                  max={500}
                  className="w-full"
                />
              </div>
            </div>
            <div className="mb-4">
              <label className="text-xs text-white/40 block mb-1">Notes (optionnel)</label>
              <input
                type="text"
                value={quickNotes}
                onChange={(e) => setQuickNotes(e.target.value)}
                placeholder="Ex: pre-running, correction post-muscu..."
                className="w-full"
              />
            </div>
            <Button onClick={handleLogInjection} variant="secondary" className="w-full">
              Enregistrer l&apos;injection
            </Button>
          </Card>

          {/* Recent Injections History */}
          <Card>
            <SectionTitle>Historique des injections</SectionTitle>
            {insulinLogs.length === 0 ? (
              <p className="text-xs text-white/25 text-center py-6">
                Aucune injection enregistree. Utilise le formulaire ci-dessus pour commencer.
              </p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {insulinLogs.slice(0, 15).map((log) => (
                  <div
                    key={log.id}
                    className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold text-[#ff9500]">
                          {log.units}
                          <span className="text-xs font-normal text-white/30 ml-0.5">U</span>
                        </span>
                        <Badge color={log.mealType === "correction" ? "red" : "gray"}>
                          {log.mealType}
                        </Badge>
                      </div>
                      <span className="text-xs text-white/25">
                        {new Date(log.injectedAt).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-white/35">
                      <span>{log.carbsGrams}g glucides</span>
                      <span>
                        Glyc: {log.glucoseBefore}{" "}
                        <span
                          className={
                            log.glucoseBefore < 70
                              ? "text-[#ff4757]"
                              : log.glucoseBefore > 180
                                ? "text-[#ff9500]"
                                : "text-[#00ff94]"
                          }
                        >
                          mg/dL
                        </span>
                      </span>
                    </div>
                    {log.notes && (
                      <p className="text-xs text-white/20 mt-1 italic">{log.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Ratios Summary */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <SectionTitle className="!mb-0">Ratios & Parametres</SectionTitle>
              <Link href="/diabete/parametres" className="text-xs text-[#00d4ff] hover:text-[#00d4ff]/80 transition-colors">
                Modifier ⚙️
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              {(diabetesConfig.insulinRatios || [
                { id: "m", label: "Petit-dej", mealKey: "morning", ratio: diabetesConfig.ratios.morning },
                { id: "l", label: "Dejeuner", mealKey: "lunch", ratio: diabetesConfig.ratios.lunch },
                { id: "d", label: "Diner", mealKey: "dinner", ratio: diabetesConfig.ratios.dinner },
              ]).map((r, i) => {
                const colors = ["text-[#ff9500]", "text-[#00d4ff]", "text-[#00ff94]", "text-[#a855f7]"];
                return (
                  <div key={r.id} className="p-3 rounded-xl bg-white/[0.03] text-center">
                    <p className="text-xs text-white/35 mb-1">{r.label}</p>
                    <p className={`text-lg font-bold ${colors[i % colors.length]}`}>
                      1:{r.ratio}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-white/35">ISF (sensibilite)</span>
                <span className="font-medium">{diabetesConfig.insulinSensitivityFactor} mg/dL par U</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/35">Glycemie cible</span>
                <span className="font-medium text-[#00ff94]">{diabetesConfig.targetGlucose} mg/dL</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/35">Plage cible</span>
                <span className="font-medium">
                  {diabetesConfig.targetRange.min} - {diabetesConfig.targetRange.max} mg/dL
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/35">Duree d&apos;action insuline</span>
                <span className="font-medium">{diabetesConfig.insulinActiveDuration} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-white/35">Basale quotidienne</span>
                <span className="font-medium">{profile.basalDose} U/jour</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
