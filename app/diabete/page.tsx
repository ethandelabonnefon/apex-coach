"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { calculateBolus, getInsulinOnBoard } from "@/lib/insulin-calculator";
import { DIABETES_CONFIG } from "@/lib/constants";
import type { MealTime } from "@/types";
import { Badge } from "@/components/ui/Badge";
import { useGlucose } from "@/hooks/useGlucose";
import GlucoseWidget from "@/components/glucose/GlucoseWidget";
import {
  Droplet,
  Syringe,
  Calculator,
  Settings,
  AlertTriangle,
  ChevronRight,
  Dumbbell,
  Footprints,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";

type GlucoseTone = "low" | "normal" | "high" | "critical";

function glucoseTone(value: number): GlucoseTone {
  if (value < 70 || value > 250) return "critical";
  if (value > 180) return "high";
  if (value < 80) return "low";
  return "normal";
}

function glucoseColor(tone: GlucoseTone): string {
  switch (tone) {
    case "critical":
      return "var(--glucose-critical)";
    case "high":
      return "var(--glucose-high)";
    case "low":
      return "var(--glucose-low)";
    default:
      return "var(--glucose-normal)";
  }
}

const MEAL_OPTIONS: { value: MealTime; label: string }[] = [
  { value: "morning", label: "Petit-déj" },
  { value: "lunch", label: "Déjeuner" },
  { value: "snack", label: "Goûter" },
  { value: "dinner", label: "Dîner" },
];

// Conversion ratio interne (g par U) → format naturel "X,YU"
function formatUper10g(gPerU: number): string {
  const units = 10 / gPerU;
  const rounded = Math.round(units * 10) / 10;
  if (rounded === Math.floor(rounded)) return `${rounded}U`;
  return `${rounded.toFixed(1).replace(".", ",")}U`;
}

export default function DiabetePage() {
  const {
    profile,
    diabetesConfig,
    glucoseReadings,
    addGlucoseReading,
    insulinLogs,
    addInsulinLog,
  } = useStore();

  // ─── Bolus calculator ─────────────────────────
  const [carbsGrams, setCarbsGrams] = useState(60);
  const [mealTime, setMealTime] = useState<MealTime>("lunch");
  const [currentGlucose, setCurrentGlucose] = useState(120);
  const [isPreWorkout, setIsPreWorkout] = useState(false);
  const [workoutType, setWorkoutType] = useState<"muscu" | "running" | null>(null);
  const [minutesUntilWorkout, setMinutesUntilWorkout] = useState(60);

  const bolusResult = useMemo(
    () =>
      calculateBolus(
        carbsGrams,
        mealTime,
        currentGlucose,
        isPreWorkout,
        workoutType,
        minutesUntilWorkout,
        diabetesConfig
      ),
    [
      carbsGrams,
      mealTime,
      currentGlucose,
      isPreWorkout,
      workoutType,
      minutesUntilWorkout,
      diabetesConfig,
    ]
  );

  // ─── IOB ──────────────────────────────────────
  const iob = useMemo(() => {
    const now = new Date();
    const recentInjections = insulinLogs
      .map((log) => {
        const injectedAt = new Date(log.injectedAt);
        const minutesAgo = (now.getTime() - injectedAt.getTime()) / 60000;
        return { units: log.units, minutesAgo };
      })
      .filter(
        (inj) =>
          inj.minutesAgo < DIABETES_CONFIG.insulinActiveDuration && inj.minutesAgo >= 0
      );
    return getInsulinOnBoard(recentInjections);
  }, [insulinLogs]);

  // ─── Quick logs ───────────────────────────────
  const [glucoseValue, setGlucoseValue] = useState(110);
  const [glucoseTrend, setGlucoseTrend] = useState("stable");

  function handleLogGlucose() {
    addGlucoseReading({
      id: crypto.randomUUID(),
      value: glucoseValue,
      trend: glucoseTrend,
      recordedAt: new Date(),
    });
  }

  function handleLogInjection() {
    addInsulinLog({
      id: crypto.randomUUID(),
      units: bolusResult.totalBolus,
      insulinType: profile.insulinRapid,
      mealType: mealTime,
      carbsGrams,
      glucoseBefore: currentGlucose,
      notes: isPreWorkout ? `pré-${workoutType}` : "",
      injectedAt: new Date(),
    });
  }

  const lastGlucose = glucoseReadings[0];
  const lastValue = lastGlucose?.value ?? currentGlucose;
  const iobTone: "info" | "warning" =
    iob.totalIOB > 2 ? "warning" : "info";

  // ─── Raccourci "Utiliser la valeur live" pour le calculateur bolus ─────
  // On n'auto-remplit PAS (T1D : explicite > implicite). L'utilisateur
  // clique pour synchroniser depuis le capteur.
  const { current: liveGlucose } = useGlucose({ mode: "current" });
  const liveValueForBolus = liveGlucose?.value;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto stagger">
      {/* ── HERO : Glycémie + IOB ── */}
      <section className="surface-1 rounded-3xl p-6 sm:p-8 mb-4">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="label">Diabète T1</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">
              {profile.insulinRapid} · {profile.cgmType}
            </h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/diabete/patterns"
              className="text-xs text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border-subtle tap-scale"
            >
              Patterns
            </Link>
            <Link
              href="/diabete/parametres"
              className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border-subtle tap-scale"
            >
              <Settings className="w-3.5 h-3.5" />
              Paramètres
            </Link>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Glucose hero — live FreeStyle Libre avec fallback manuel */}
          <GlucoseWidget
            fallbackValue={lastValue}
            fallbackRecordedAt={lastGlucose?.recordedAt}
          />

          {/* IOB hero */}
          <div className="surface-2 rounded-2xl p-5 flex items-center gap-5">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-info/10 flex items-center justify-center">
              <Syringe className={`w-5 h-5 ${iobTone === "warning" ? "text-warning" : "text-info"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="label mb-1">Insuline active</p>
              <div className="flex items-baseline gap-1.5">
                <span
                  className={`num-hero text-4xl sm:text-5xl font-semibold leading-none ${
                    iobTone === "warning" ? "text-warning" : "text-info"
                  }`}
                >
                  {iob.totalIOB.toFixed(1)}
                </span>
                <span className="text-xs text-text-tertiary">U</span>
              </div>
              <p className="mt-1 text-xs text-text-secondary">
                {iob.details.length === 0
                  ? "Rien d'actif"
                  : `${iob.details.length} injection${iob.details.length > 1 ? "s" : ""} en cours`}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CALCULATEUR BOLUS (action primaire) ── */}
      <section className="surface-1 rounded-3xl p-6 sm:p-8 mb-4 glow-accent">
        <div className="flex items-center gap-2 mb-5">
          <Calculator className="w-5 h-5 text-diabete" />
          <h2 className="text-lg font-semibold text-text-primary">Calculateur de bolus</h2>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <BolusInput
            label="Glucides"
            unit="g"
            value={carbsGrams}
            onChange={setCarbsGrams}
            min={0}
            max={300}
          />
          <BolusInput
            label="Glycémie"
            unit="mg/dL"
            value={currentGlucose}
            onChange={setCurrentGlucose}
            min={40}
            max={500}
          />
        </div>

        {liveValueForBolus !== undefined && liveValueForBolus !== currentGlucose && (
          <button
            type="button"
            onClick={() => setCurrentGlucose(liveValueForBolus)}
            className="mb-5 w-full text-xs text-diabete hover:text-diabete/80 transition-colors py-2 rounded-lg border border-diabete/25 bg-diabete/5 tap-scale flex items-center justify-center gap-1.5"
          >
            <span
              className="dot-pulse h-1.5 w-1.5 rounded-full bg-success"
              aria-hidden
            />
            Utiliser la valeur live (<span className="num">{liveValueForBolus}</span> mg/dL)
          </button>
        )}

        {/* Meal selector */}
        <div className="mb-5">
          <p className="label mb-2">Repas</p>
          <div className="grid grid-cols-4 gap-2">
            {MEAL_OPTIONS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMealTime(m.value)}
                className={`py-2 text-xs font-medium rounded-lg border transition-all tap-scale ${
                  mealTime === m.value
                    ? "bg-diabete/15 border-diabete/40 text-diabete"
                    : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pre-workout */}
        <div className="surface-2 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Pré-entraînement ?</p>
              <p className="text-xs text-text-tertiary">Ajuste le bolus automatiquement</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsPreWorkout(!isPreWorkout);
                if (isPreWorkout) setWorkoutType(null);
              }}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                isPreWorkout ? "bg-diabete" : "bg-border-strong"
              }`}
              aria-label="Toggle pré-entraînement"
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-bg-primary transition-transform ${
                  isPreWorkout ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {isPreWorkout && (
            <div className="space-y-3 animate-slide-up">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWorkoutType("muscu")}
                  className={`flex items-center gap-2 justify-center py-2.5 text-xs font-medium rounded-lg border transition-all tap-scale ${
                    workoutType === "muscu"
                      ? "bg-muscu/15 border-muscu/40 text-muscu"
                      : "bg-bg-tertiary border-border-subtle text-text-secondary"
                  }`}
                >
                  <Dumbbell className="w-3.5 h-3.5" />
                  Muscu
                </button>
                <button
                  type="button"
                  onClick={() => setWorkoutType("running")}
                  className={`flex items-center gap-2 justify-center py-2.5 text-xs font-medium rounded-lg border transition-all tap-scale ${
                    workoutType === "running"
                      ? "bg-running/15 border-running/40 text-running"
                      : "bg-bg-tertiary border-border-subtle text-text-secondary"
                  }`}
                >
                  <Footprints className="w-3.5 h-3.5" />
                  Running
                </button>
              </div>
              <BolusInput
                label="Dans combien de minutes"
                unit="min"
                value={minutesUntilWorkout}
                onChange={setMinutesUntilWorkout}
                min={0}
                max={360}
              />
            </div>
          )}
        </div>

        {/* Résultat hero */}
        <div className="rounded-2xl bg-diabete/10 border border-diabete/30 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="label" style={{ color: "var(--diabete)" }}>Total à injecter</p>
            {iob.totalIOB > 0.5 && (
              <Badge variant="warning" size="sm">
                <AlertTriangle className="w-3 h-3 mr-1" />
                IOB {iob.totalIOB}U
              </Badge>
            )}
          </div>

          <div className="flex items-baseline gap-2 mb-4">
            <span className="num-hero text-6xl sm:text-7xl font-semibold text-diabete leading-none">
              {bolusResult.totalBolus}
            </span>
            <span className="text-xl text-diabete/70 font-medium">U</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-bg-tertiary rounded-lg px-3 py-2">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Glucides</p>
              <p className="num text-base font-semibold text-info">
                {bolusResult.carbBolus.toFixed(1)}<span className="text-xs text-text-tertiary">U</span>
              </p>
            </div>
            <div className="bg-bg-tertiary rounded-lg px-3 py-2">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Correction</p>
              <p className="num text-base font-semibold text-warning">
                {bolusResult.correctionBolus.toFixed(1)}<span className="text-xs text-text-tertiary">U</span>
              </p>
            </div>
          </div>

          {bolusResult.adjustments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {bolusResult.adjustments.map((adj, i) => (
                <Badge key={i} variant="warning" size="sm">
                  {adj}
                </Badge>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleLogInjection}
            className="w-full bg-diabete text-ink font-semibold py-3 rounded-xl hover:bg-diabete/90 transition-colors tap-scale"
          >
            Enregistrer l&apos;injection ({bolusResult.totalBolus}U)
          </button>

          {bolusResult.reasoning.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary transition-colors">
                Voir le raisonnement
              </summary>
              <div className="mt-2 space-y-1 text-xs text-text-secondary">
                {bolusResult.reasoning.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-diabete shrink-0">›</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ── GRID : Glucose log + Injection history ── */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        {/* Log glycémie rapide */}
        <section className="surface-1 rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Droplet className="w-4 h-4 text-diabete" />
            <h2 className="text-base font-semibold text-text-primary">Logger une glycémie</h2>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <BolusInput
              label="Valeur"
              unit="mg/dL"
              value={glucoseValue}
              onChange={setGlucoseValue}
              min={30}
              max={500}
            />
            <div>
              <p className="label mb-2">Tendance</p>
              <div className="grid grid-cols-3 gap-1">
                <TrendButton
                  active={glucoseTrend === "rising"}
                  onClick={() => setGlucoseTrend("rising")}
                  icon={<TrendingUp className="w-3.5 h-3.5" />}
                  label="↑"
                />
                <TrendButton
                  active={glucoseTrend === "stable"}
                  onClick={() => setGlucoseTrend("stable")}
                  icon={<Minus className="w-3.5 h-3.5" />}
                  label="→"
                />
                <TrendButton
                  active={glucoseTrend === "falling"}
                  onClick={() => setGlucoseTrend("falling")}
                  icon={<TrendingDown className="w-3.5 h-3.5" />}
                  label="↓"
                />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogGlucose}
            className="w-full bg-bg-tertiary hover:bg-bg-hover text-text-primary text-sm font-medium py-2.5 rounded-xl transition-colors border border-border-subtle tap-scale"
          >
            Enregistrer
          </button>

          {/* Historique compact */}
          {glucoseReadings.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border-subtle">
              <p className="label mb-2">Dernières lectures</p>
              <div className="space-y-1">
                {glucoseReadings.slice(0, 5).map((r) => {
                  const tone = glucoseTone(r.value);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2"
                    >
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: glucoseColor(tone) }}
                        />
                        <span
                          className="num text-sm font-semibold"
                          style={{ color: glucoseColor(tone) }}
                        >
                          {r.value}
                        </span>
                        <span className="text-[10px] text-text-tertiary">mg/dL</span>
                      </div>
                      <span className="num text-[10px] text-text-tertiary">
                        {new Date(r.recordedAt).toLocaleTimeString("fr-FR", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Historique injections */}
        <section className="surface-1 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Syringe className="w-4 h-4 text-diabete" />
              <h2 className="text-base font-semibold text-text-primary">Injections</h2>
            </div>
            <span className="num text-xs text-text-tertiary">
              {insulinLogs.length} total
            </span>
          </div>

          {insulinLogs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-text-secondary">Aucune injection</p>
              <p className="text-xs text-text-tertiary mt-1">
                Utilise le calculateur au-dessus pour logger
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {insulinLogs.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="bg-bg-tertiary rounded-xl p-3 border border-border-subtle"
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="num text-lg font-semibold text-diabete">
                        {log.units}
                        <span className="text-xs text-text-tertiary ml-0.5">U</span>
                      </span>
                      <Badge
                        variant={log.mealType === "correction" ? "warning" : "default"}
                        size="sm"
                      >
                        {log.mealType}
                      </Badge>
                    </div>
                    <span className="num text-[10px] text-text-tertiary">
                      {new Date(log.injectedAt).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <div className="num flex items-center gap-3 text-[11px] text-text-tertiary">
                    <span>{log.carbsGrams}g gluc.</span>
                    <span>
                      Glyc.{" "}
                      <span
                        style={{
                          color: glucoseColor(glucoseTone(log.glucoseBefore)),
                        }}
                      >
                        {log.glucoseBefore}
                      </span>
                    </span>
                  </div>
                  {log.notes && (
                    <p className="text-[11px] text-text-tertiary mt-1 italic">
                      {log.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Footer : mon programme d'insuline (4 ratios) ── */}
      <section className="surface-1 rounded-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="label">Mon programme</p>
          <Link
            href="/diabete/parametres"
            className="flex items-center gap-1 text-xs text-diabete hover:text-diabete/80 transition-colors"
          >
            Modifier <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <RatioChip
            label="Le matin"
            value={formatUper10g(diabetesConfig.ratios.morning)}
            unit="pour 10g"
          />
          <RatioChip
            label="À midi"
            value={formatUper10g(diabetesConfig.ratios.lunch)}
            unit="pour 10g"
          />
          <RatioChip
            label="Au goûter"
            value={formatUper10g(
              diabetesConfig.insulinRatios?.find((r) => r.mealKey === "snack")?.ratio ??
                diabetesConfig.ratios.lunch
            )}
            unit="pour 10g"
          />
          <RatioChip
            label="Au dîner"
            value={formatUper10g(diabetesConfig.ratios.dinner)}
            unit="pour 10g"
          />
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────

function BolusInput({
  label,
  unit,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
}) {
  return (
    <label className="block">
      <p className="label mb-1.5">{label}</p>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          className="num w-full bg-bg-tertiary border border-border-subtle rounded-xl px-3 py-3 text-xl font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary uppercase tracking-wide pointer-events-none">
          {unit}
        </span>
      </div>
    </label>
  );
}

function TrendButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-3 rounded-lg border transition-all flex items-center justify-center gap-1 tap-scale ${
        active
          ? "bg-diabete/15 border-diabete/40 text-diabete"
          : "bg-bg-tertiary border-border-subtle text-text-secondary"
      }`}
      aria-label={label}
    >
      {icon}
    </button>
  );
}

function RatioChip({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-bg-tertiary rounded-xl px-3 py-2.5 text-center">
      <p className="text-[10px] text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className="num text-base font-semibold text-text-primary mt-0.5">{value}</p>
      {unit && <p className="text-[9px] text-text-tertiary">{unit}</p>}
    </div>
  );
}
