"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { calculateVMA, predictRaceTime, formatPace, formatTime } from "@/lib/running-science";
import { getCurrentPhaseInfo } from "@/lib/muscu-science";
import { HeroMetric } from "@/components/ui/HeroMetric";
import { MetricCard } from "@/components/ui/MetricCard";
import { Ring } from "@/components/ui/Ring";
import { Sparkline } from "@/components/ui/Sparkline";
import { Pulse } from "@/components/ui/Pulse";
import {
  ArrowUpRight,
  Dumbbell,
  Footprints,
  Apple,
  Droplet,
  Target,
  ChevronRight,
} from "lucide-react";

function glucoseTone(value: number): "error" | "warning" | "success" {
  if (value < 70 || value > 250) return "error";
  if (value > 180) return "warning";
  return "success";
}

function glucoseStatus(value: number): string {
  if (value < 70) return "Hypoglycémie";
  if (value > 250) return "Très élevée";
  if (value > 180) return "Élevée";
  if (value >= 70 && value <= 140) return "En plage";
  return "Normale";
}

export default function Dashboard() {
  const {
    profile,
    diabetesConfig,
    glucoseReadings,
    meals,
    completedWorkouts,
    currentRunningWeek,
    muscuProgram,
  } = useStore();

  const vma = calculateVMA(profile.vo2max);
  const semi = predictRaceTime(profile.vo2max, 21.1);
  const phase = getCurrentPhaseInfo(1);

  const lastGlucose = glucoseReadings[0];
  const glucoseSeries = glucoseReadings.slice(0, 24).map((r) => r.value).reverse();

  const todayMeals = meals.filter((m) => {
    const d = new Date(m.eatenAt);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const todayCalories = todayMeals.reduce((s, m) => s + m.calories, 0);
  const todayProtein = todayMeals.reduce((s, m) => s + m.protein, 0);
  const todayCarbs = todayMeals.reduce((s, m) => s + m.carbs, 0);
  const todayFat = todayMeals.reduce((s, m) => s + m.fat, 0);

  const caloriesPct = profile.targetCalories > 0 ? todayCalories / profile.targetCalories : 0;
  const proteinPct = profile.targetProtein > 0 ? todayProtein / profile.targetProtein : 0;

  // Mini weight trend — placeholder à partir du poids actuel si pas d'historique
  const weightSeries = Array.from({ length: 10 }, (_, i) => profile.weight - (10 - i) * 0.08 + Math.sin(i) * 0.2);

  const now = new Date();
  const hours = now.getHours();
  const greeting = hours < 5 ? "Bonne nuit" : hours < 12 ? "Bonjour" : hours < 18 ? "Bel après-midi" : "Bonsoir";

  const completedThisWeek = completedWorkouts.filter((w) => {
    const d = new Date(w.date);
    const diff = (Date.now() - d.getTime()) / 86400000;
    return diff < 7;
  }).length;

  const nextSessions = muscuProgram.sessions.slice(0, 3);

  return (
    <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">

      {/* ==================== HERO ==================== */}
      <section className="mb-8 lg:mb-12 animate-in">
        <div className="flex items-center gap-2 mb-2">
          <Pulse tone="accent" size="sm" />
          <span className="label">Session active · {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight mb-1">
          {greeting}, {profile.name}.
        </h1>
        <p className="text-sm sm:text-base text-text-secondary max-w-xl">
          Voici l'état de ton instrument aujourd'hui — glycémie, training load, fuel.
        </p>
      </section>

      {/* ==================== HERO METRIC : GLUCOSE ==================== */}
      <section className="mb-8">
        <div className="surface-1 p-6 sm:p-8 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -top-24 -right-24 h-64 w-64 rounded-full opacity-[0.08] blur-3xl"
            style={{
              background: lastGlucose
                ? `var(--glucose-${glucoseTone(lastGlucose.value) === "success" ? "normal" : glucoseTone(lastGlucose.value) === "warning" ? "high" : "low"})`
                : "var(--accent)",
            }}
          />

          <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Droplet size={14} className="text-diabete" />
                <span className="label">Glycémie temps réel</span>
                {lastGlucose && (
                  <span className="text-[11px] text-text-tertiary ml-auto">
                    il y a {Math.round((Date.now() - new Date(lastGlucose.recordedAt).getTime()) / 60000)}min
                  </span>
                )}
              </div>

              <HeroMetric
                label=""
                value={lastGlucose ? lastGlucose.value : "—"}
                unit={lastGlucose ? "mg/dL" : ""}
                size="xl"
                tone={
                  !lastGlucose
                    ? "default"
                    : glucoseTone(lastGlucose.value) === "success"
                    ? "accent"
                    : glucoseTone(lastGlucose.value) === "warning"
                    ? "warning"
                    : "error"
                }
                subtitle={lastGlucose ? `${glucoseStatus(lastGlucose.value)} · Cible ${diabetesConfig.targetGlucose} · Plage ${diabetesConfig.targetRange.min}–${diabetesConfig.targetRange.max}` : "Aucune lecture"}
              />

              <div className="mt-6 flex flex-wrap items-center gap-2">
                <Link
                  href="/diabete"
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-accent text-accent-ink text-sm font-semibold hover:bg-accent-hover transition-colors tap-scale"
                >
                  Calculer bolus
                  <ArrowUpRight size={16} strokeWidth={2.5} />
                </Link>
                <Link
                  href="/diabete"
                  className="inline-flex items-center gap-2 px-4 h-10 rounded-lg bg-bg-tertiary text-text-primary text-sm hover:bg-bg-hover transition-colors tap-scale"
                >
                  Logger glucose
                </Link>
              </div>
            </div>

            {/* Sparkline glucose 24 dernières lectures */}
            <div className="min-w-[200px]">
              <div className="flex items-center gap-2 mb-2">
                <span className="label">Tendance · {glucoseSeries.length} pts</span>
              </div>
              {glucoseSeries.length > 1 ? (
                <Sparkline
                  data={glucoseSeries}
                  color={
                    lastGlucose && glucoseTone(lastGlucose.value) === "success"
                      ? "var(--accent)"
                      : lastGlucose && glucoseTone(lastGlucose.value) === "warning"
                      ? "var(--warning)"
                      : "var(--error)"
                  }
                  width={260}
                  height={80}
                  strokeWidth={2}
                />
              ) : (
                <div className="h-20 flex items-center text-xs text-text-tertiary">
                  Pas assez de données
                </div>
              )}
              <div className="mt-2 flex justify-between num text-[10px] text-text-tertiary">
                <span>24h</span>
                <span>maintenant</span>
              </div>
            </div>
          </div>

          {/* Ratios mini — signature cockpit */}
          <div className="relative mt-8 pt-6 border-t border-border-subtle grid grid-cols-3 gap-4">
            <div>
              <span className="label">Ratio matin</span>
              <p className="num text-xl mt-1 text-text-primary">
                1:<span className="text-accent-2">{diabetesConfig.ratios.morning}</span>
              </p>
            </div>
            <div>
              <span className="label">Ratio midi</span>
              <p className="num text-xl mt-1 text-text-primary">
                1:<span className="text-accent-2">{diabetesConfig.ratios.lunch}</span>
              </p>
            </div>
            <div>
              <span className="label">Ratio soir</span>
              <p className="num text-xl mt-1 text-text-primary">
                1:<span className="text-accent-2">{diabetesConfig.ratios.dinner}</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== METRIC GRID ==================== */}
      <section className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-sm font-semibold tracking-tight">Indicateurs</h2>
          <span className="label">4 métriques</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <MetricCard
            label="Poids"
            value={profile.weight.toFixed(1)}
            unit="kg"
            sparkline={weightSeries}
            tone="default"
          />
          <MetricCard
            label="VO₂ max"
            value={profile.vo2max.toFixed(0)}
            unit="ml/kg/min"
            hint={`VMA ${vma.toFixed(1)} km/h`}
            tone="running"
          />
          <MetricCard
            label="Bench 1RM"
            value={profile.benchPress1RM}
            unit="kg"
            tone="muscu"
          />
          <MetricCard
            label="Semaine"
            value={`${completedThisWeek}`}
            unit="séances"
            hint={`Phase ${phase.name} · RIR ${phase.rirTarget}`}
            tone="accent-2"
          />
        </div>
      </section>

      {/* ==================== MAIN 3-COL ==================== */}
      <div className="grid gap-4 lg:gap-6 lg:grid-cols-3">

        {/* --- MUSCU --- */}
        <section className="surface-1 p-5 lg:p-6 animate-slide-up">
          <header className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Dumbbell size={16} className="text-muscu" />
              <h3 className="text-sm font-semibold tracking-tight">Musculation</h3>
            </div>
            <Link
              href="/muscu"
              className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1 transition-colors"
            >
              Programme <ChevronRight size={12} />
            </Link>
          </header>

          <div className="mb-4">
            <span className="label">Programme actif</span>
            <p className="text-base font-medium mt-1 truncate">{muscuProgram.name}</p>
            <p className="text-[11px] text-text-tertiary mt-1">
              {phase.focus}
            </p>
          </div>

          <div className="space-y-2">
            <span className="label mb-2 block">Prochaines séances</span>
            {nextSessions.map((s) => (
              <Link
                key={s.id}
                href={`/muscu/seance/${s.id}`}
                className="group flex items-center justify-between gap-3 p-3 rounded-lg bg-bg-tertiary hover:bg-bg-hover transition-colors tap-scale"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{s.name}</p>
                  <p className="text-[11px] text-text-tertiary mt-0.5">
                    {s.day} · <span className="num">{s.duration}</span>min
                  </p>
                </div>
                <ChevronRight
                  size={16}
                  className="text-text-tertiary group-hover:text-accent transition-colors flex-shrink-0"
                />
              </Link>
            ))}
          </div>

          {profile.weakPoints && profile.weakPoints.length > 0 && (
            <div className="mt-5 pt-4 border-t border-border-subtle">
              <span className="label mb-2 block">Points faibles ciblés</span>
              <div className="flex gap-1.5 flex-wrap">
                {profile.weakPoints.map((wp) => (
                  <span
                    key={wp}
                    className="text-[11px] px-2 py-1 rounded-md bg-muscu/10 text-muscu"
                  >
                    {wp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* --- RUNNING --- */}
        <section className="surface-1 p-5 lg:p-6 animate-slide-up">
          <header className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Footprints size={16} className="text-running" />
              <h3 className="text-sm font-semibold tracking-tight">Running</h3>
            </div>
            <Link
              href="/running"
              className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1 transition-colors"
            >
              Plan <ChevronRight size={12} />
            </Link>
          </header>

          <div className="mb-5">
            <span className="label">Semi-marathon</span>
            <p className="num text-3xl font-semibold mt-1 text-running leading-none">
              {formatTime(semi.predictedTimeMinutes)}
            </p>
            <p className="text-[11px] text-text-tertiary mt-1.5">
              Prédit · confiance {semi.confidence}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 mb-5">
            <div className="surface-2 p-3">
              <span className="label">VMA</span>
              <p className="num text-lg mt-1 font-semibold">
                {vma.toFixed(1)}
                <span className="text-[10px] text-text-tertiary ml-1 font-normal">km/h</span>
              </p>
            </div>
            <div className="surface-2 p-3">
              <span className="label">Allure cible</span>
              <p className="num text-lg mt-1 font-semibold">
                {formatPace(semi.predictedPace)}
                <span className="text-[10px] text-text-tertiary ml-1 font-normal">/km</span>
              </p>
            </div>
          </div>

          <div>
            <div className="flex justify-between mb-1.5">
              <span className="label">Semaine {currentRunningWeek} / 14</span>
              <span className="num text-[11px] text-text-tertiary">
                {Math.round((currentRunningWeek / 14) * 100)}%
              </span>
            </div>
            <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(currentRunningWeek / 14) * 100}%`,
                  background: "var(--running)",
                }}
              />
            </div>
          </div>
        </section>

        {/* --- NUTRITION --- */}
        <section className="surface-1 p-5 lg:p-6 animate-slide-up">
          <header className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Apple size={16} className="text-nutrition" />
              <h3 className="text-sm font-semibold tracking-tight">Nutrition</h3>
            </div>
            <Link
              href="/nutrition"
              className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1 transition-colors"
            >
              Logger <ChevronRight size={12} />
            </Link>
          </header>

          <div className="flex items-center gap-5 mb-5">
            <Ring
              value={caloriesPct * 100}
              max={100}
              size={88}
              strokeWidth={7}
              color="var(--nutrition)"
            >
              <span className="num text-lg font-semibold leading-none">
                {Math.round(todayCalories)}
              </span>
              <span className="label mt-0.5">kcal</span>
            </Ring>

            <div className="flex-1 space-y-2.5">
              <MacroLine
                label="Protéines"
                value={Math.round(todayProtein)}
                max={profile.targetProtein}
                color="var(--running)"
              />
              <MacroLine
                label="Glucides"
                value={Math.round(todayCarbs)}
                max={profile.targetCarbs}
                color="var(--nutrition)"
              />
              <MacroLine
                label="Lipides"
                value={Math.round(todayFat)}
                max={profile.targetFat}
                color="var(--accent-2)"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border-subtle">
            <span className="label">Objectif</span>
            <p className="text-[11px] text-text-secondary mt-1">
              <span className="num font-medium text-text-primary">{Math.round(todayCalories)}</span> / {profile.targetCalories} kcal ·{" "}
              <span className="num font-medium" style={{ color: "var(--running)" }}>
                {Math.round(proteinPct * 100)}%
              </span>{" "}
              protéines
            </p>
          </div>
        </section>
      </div>

      {/* ==================== GOALS STRIP ==================== */}
      {profile.goals && profile.goals.length > 0 && (
        <section className="mt-10 surface-1 p-5 lg:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={14} className="text-accent" />
            <span className="label">Objectifs actifs</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.goals.map((g) => (
              <div
                key={g}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-bg-tertiary text-sm"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span>{g}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 text-center text-[11px] text-text-tertiary">
        <p>
          APEX · <span className="num">v2</span> ·
          <span className="text-text-secondary ml-1">Precision Coach</span>
        </p>
      </footer>
    </div>
  );
}

function MacroLine({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[11px] text-text-secondary">{label}</span>
        <span className="num text-[11px] text-text-tertiary">
          {value} / {max}g
        </span>
      </div>
      <div className="h-1 rounded-full bg-bg-tertiary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct * 100}%`, background: color }}
        />
      </div>
    </div>
  );
}
