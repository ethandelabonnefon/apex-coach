"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { useGlucose } from "@/hooks/useGlucose";
import { Ring } from "@/components/ui/Ring";
import { Sparkline } from "@/components/ui/Sparkline";
import { glucoseToneColor, glucoseToneLabel } from "@/lib/libre-link/utils";
import {
  ArrowUpRight,
  Dumbbell,
  Footprints,
  Apple,
  Droplet,
  ChevronRight,
  Flame,
  Activity,
} from "lucide-react";

const DAYS_FR = [
  "Dimanche",
  "Lundi",
  "Mardi",
  "Mercredi",
  "Jeudi",
  "Vendredi",
  "Samedi",
];

function glucoseToneText(value: number): "success" | "warning" | "error" {
  if (value < 70 || value > 250) return "error";
  if (value > 180 || value < 80) return "warning";
  return "success";
}

function glucoseStatus(value: number): string {
  if (value < 70) return "Hypoglycémie";
  if (value > 250) return "Très élevée";
  if (value > 180) return "Élevée";
  return "En plage";
}

export default function Dashboard() {
  const {
    profile,
    diabetesConfig,
    glucoseReadings,
    meals,
    completedWorkouts,
    activeProgram,
    muscuProgram,
  } = useStore();

  // ─── Glucose live + 8h history pour le sparkline ─────
  const {
    current: liveGlucose,
    history: liveHistory,
    notConfigured: glucoseNotConfigured,
  } = useGlucose({ mode: "history" });

  // ─── Context temporel ─────────────────────────────
  const now = new Date();
  const hours = now.getHours();
  const greeting =
    hours < 5
      ? "Bonne nuit"
      : hours < 12
      ? "Bonjour"
      : hours < 18
      ? "Bel après-midi"
      : "Bonsoir";
  const todayName = DAYS_FR[now.getDay()];

  // ─── Action du jour : séance muscu si programmée ──
  const sessions = activeProgram?.sessions || muscuProgram.sessions;
  const todaySession = sessions.find((s) => s.day === todayName);

  // ─── Glycémie : live + fallback manuel ─────────────
  const lastManualGlucose = glucoseReadings[0];
  const displayGlucose = liveGlucose?.value ?? lastManualGlucose?.value;
  const isLive = liveGlucose !== null;

  // Sparkline data (live history) ou fallback derniers manuels
  const sparkData = useMemo(() => {
    if (liveHistory.length >= 2) {
      return liveHistory.map((p) => p.value);
    }
    if (glucoseReadings.length >= 2) {
      return [...glucoseReadings].reverse().slice(-32).map((g) => g.value);
    }
    return [];
  }, [liveHistory, glucoseReadings]);

  // Stats sur la fenêtre du sparkline
  const glucoseStats = useMemo(() => {
    if (sparkData.length === 0) return null;
    const avg = Math.round(
      sparkData.reduce((s, v) => s + v, 0) / sparkData.length,
    );
    const inRange = sparkData.filter((v) => v >= 70 && v <= 180).length;
    const tir = Math.round((inRange / sparkData.length) * 100);
    return { avg, tir };
  }, [sparkData]);

  // ─── Calories du jour ─────────────────────────────
  const todayMeals = meals.filter((m) => {
    const d = new Date(m.eatenAt);
    return d.toDateString() === now.toDateString();
  });
  const todayCalories = Math.round(
    todayMeals.reduce((s, m) => s + m.calories, 0),
  );
  const calorieTarget = profile.targetCalories || 3000;
  const caloriePct = Math.min(100, Math.round((todayCalories / calorieTarget) * 100));

  // ─── Séances complétées cette semaine ─────────────
  const nowMs = now.getTime();
  const completedThisWeek = completedWorkouts.filter((w) => {
    const diff = (nowMs - new Date(w.date).getTime()) / 86400000;
    return diff < 7;
  }).length;
  const sessionsPlanned = sessions.length || 4;
  const sessionsPct = Math.min(
    100,
    Math.round((completedThisWeek / sessionsPlanned) * 100),
  );

  // ─── Couleur du gros chiffre glucose selon tone ────
  const glucoseColorVal = liveGlucose
    ? glucoseToneColor(liveGlucose.tone)
    : displayGlucose !== undefined
    ? (() => {
        const tone = glucoseToneText(displayGlucose);
        return tone === "success"
          ? "var(--success)"
          : tone === "warning"
          ? "var(--warning)"
          : "var(--error)";
      })()
    : "var(--text-tertiary)";

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      {/* ============ HERO : Salut Ethan + 1 action ============ */}
      <section className="mb-8 animate-in">
        <p className="label mb-2">
          {now.toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
        </p>
        <h1 className="text-3xl sm:text-5xl font-semibold tracking-tight mb-6">
          {greeting},{" "}
          <span style={{ color: "var(--accent)" }}>{profile.name}</span>.
        </h1>

        {/* ACTION DU JOUR — une seule, gros CTA */}
        {todaySession ? (
          <Link
            href={`/muscu/seance/${todaySession.id}`}
            className="group block surface-1 p-6 lg:p-7 relative overflow-hidden tap-scale hover:bg-bg-tertiary transition-colors"
          >
            <div
              aria-hidden
              className="absolute -top-20 -right-20 h-48 w-48 rounded-full opacity-[0.15] blur-3xl"
              style={{ background: "var(--muscu)" }}
            />
            <div className="relative flex items-center gap-5">
              <div className="h-14 w-14 rounded-xl bg-muscu/15 flex items-center justify-center flex-shrink-0">
                <Dumbbell size={24} className="text-muscu" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="label">Séance du jour</span>
                <p className="text-lg sm:text-xl font-semibold tracking-tight mt-1 truncate">
                  {todaySession.name}
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  <span className="num">{todaySession.exercises.length}</span>{" "}
                  exos ·{" "}
                  <span className="num">{todaySession.duration}</span>min ·{" "}
                  {todaySession.focus}
                </p>
              </div>
              <ArrowUpRight
                size={22}
                strokeWidth={2.5}
                className="text-text-tertiary group-hover:text-muscu transition-colors flex-shrink-0"
              />
            </div>
          </Link>
        ) : displayGlucose !== undefined &&
          glucoseToneText(displayGlucose) !== "success" ? (
          <Link
            href="/diabete"
            className="group block surface-1 p-6 lg:p-7 relative overflow-hidden tap-scale hover:bg-bg-tertiary transition-colors"
          >
            <div
              aria-hidden
              className="absolute -top-20 -right-20 h-48 w-48 rounded-full opacity-[0.15] blur-3xl"
              style={{ background: "var(--diabete)" }}
            />
            <div className="relative flex items-center gap-5">
              <div className="h-14 w-14 rounded-xl bg-diabete/15 flex items-center justify-center flex-shrink-0">
                <Droplet size={24} className="text-diabete" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="label">Priorité du moment</span>
                <p className="text-lg sm:text-xl font-semibold tracking-tight mt-1">
                  {glucoseStatus(displayGlucose)} — ouvre le calculateur
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  <span className="num">{displayGlucose}</span> mg/dL · cible{" "}
                  <span className="num">{diabetesConfig.targetGlucose}</span>
                </p>
              </div>
              <ArrowUpRight
                size={22}
                strokeWidth={2.5}
                className="text-text-tertiary group-hover:text-diabete transition-colors flex-shrink-0"
              />
            </div>
          </Link>
        ) : (
          <div className="surface-1 p-6 lg:p-7">
            <span className="label">Aujourd&apos;hui</span>
            <p className="text-lg sm:text-xl font-semibold tracking-tight mt-1 mb-1">
              Jour de repos.
            </p>
            <p className="text-xs text-text-tertiary">
              Récupération active · mobilité, marche, étirements.
            </p>
          </div>
        )}
      </section>

      {/* ============ GLUCOSE TREND HERO (live + sparkline 8h) ============ */}
      <section className="mb-6 animate-in">
        <Link
          href="/diabete"
          className="group block surface-1 relative overflow-hidden p-5 sm:p-6 tap-scale hover:bg-bg-tertiary transition-colors"
        >
          {/* Glow lavender en fond */}
          <div
            aria-hidden
            className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full opacity-[0.10] blur-3xl"
            style={{ background: "var(--diabete)" }}
          />

          <div className="relative">
            <div className="flex items-center gap-1.5 mb-3">
              <Droplet size={12} className="text-diabete" />
              <span className="label">Glycémie</span>
              {isLive && (
                <span
                  className="ml-2 dot-pulse h-1.5 w-1.5 rounded-full bg-success"
                  aria-label="Live"
                />
              )}
              <span className="ml-auto text-[10px] text-text-tertiary">
                {liveHistory.length > 0
                  ? `${liveHistory.length} pts · 8h`
                  : glucoseNotConfigured
                  ? "manuel"
                  : "—"}
              </span>
            </div>

            <div className="flex items-end justify-between gap-4">
              {/* Valeur actuelle + label */}
              <div className="flex-1 min-w-0">
                {displayGlucose !== undefined ? (
                  <>
                    <div className="flex items-baseline gap-2">
                      <span
                        className="num-hero text-5xl sm:text-6xl font-semibold leading-none tabular-nums"
                        style={{ color: glucoseColorVal }}
                      >
                        {displayGlucose}
                      </span>
                      <span className="text-sm text-text-tertiary">mg/dL</span>
                      {liveGlucose && (
                        <span
                          className="text-lg ml-1"
                          style={{ color: glucoseColorVal }}
                        >
                          {liveGlucose.arrow}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-2">
                      {liveGlucose
                        ? `${liveGlucose.statusLabel} · ${liveGlucose.trendLabel}`
                        : `Cible ${diabetesConfig.targetGlucose} mg/dL`}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="num-hero text-5xl sm:text-6xl font-semibold text-text-tertiary leading-none">
                      —
                    </p>
                    <p className="text-xs text-text-tertiary mt-2">
                      {glucoseNotConfigured
                        ? "Capteur non configuré"
                        : "Aucune lecture"}
                    </p>
                  </>
                )}
              </div>

              {/* Sparkline 8h */}
              {sparkData.length >= 2 && (
                <div className="flex-shrink-0">
                  <Sparkline
                    data={sparkData}
                    color={glucoseColorVal}
                    fill
                    height={48}
                    width={140}
                    strokeWidth={2}
                  />
                </div>
              )}
            </div>

            {/* Stats récap si data dispo */}
            {glucoseStats && (
              <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="label">Moy</span>
                  <span
                    className="num font-semibold"
                    style={{
                      color:
                        glucoseStats.avg >= 70 && glucoseStats.avg <= 180
                          ? "var(--success)"
                          : "var(--warning)",
                    }}
                  >
                    {glucoseStats.avg}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="label">TIR</span>
                  <span
                    className="num font-semibold"
                    style={{
                      color:
                        glucoseStats.tir >= 70
                          ? "var(--success)"
                          : "var(--warning)",
                    }}
                  >
                    {glucoseStats.tir}
                    <span className="text-text-tertiary text-[10px]">%</span>
                  </span>
                </div>
                {liveGlucose && (
                  <div className="flex items-center gap-1.5">
                    <span className="label">Statut</span>
                    <span
                      className="font-semibold"
                      style={{ color: glucoseColorVal }}
                    >
                      {glucoseToneLabel(liveGlucose.tone)}
                    </span>
                  </div>
                )}
                <ChevronRight
                  size={14}
                  className="text-text-tertiary group-hover:text-text-primary transition-colors ml-auto"
                />
              </div>
            )}
          </div>
        </Link>
      </section>

      {/* ============ 2 STATS RINGS : Calories + Séances ============ */}
      {/* Layout vertical : ring centré avec valeur DEDANS, label+sub en dessous.
          Plus propre sur mobile, et fidèle aux refs (PulseUp, Antony Thomas). */}
      <section className="mb-6 grid grid-cols-2 gap-3 stagger">
        {/* Calories ring */}
        <Link
          href="/nutrition"
          className="group surface-1 p-5 tap-scale hover:bg-bg-tertiary transition-colors flex flex-col items-center text-center"
        >
          <Ring
            value={todayCalories}
            max={calorieTarget}
            size={120}
            strokeWidth={8}
            color="var(--nutrition)"
          >
            <div className="flex flex-col items-center justify-center leading-tight">
              <Flame size={12} className="text-nutrition/80 mb-0.5" />
              <span
                className="num font-semibold text-2xl tabular-nums"
                style={{ color: "var(--nutrition)" }}
              >
                {todayCalories}
              </span>
              <span className="text-[9px] text-text-tertiary mt-0.5">
                kcal
              </span>
            </div>
          </Ring>
          <p className="label mt-3">Calories</p>
          <p className="text-[10px] text-text-tertiary mt-0.5 num">
            {caloriePct}% · cible {calorieTarget}
          </p>
        </Link>

        {/* Séances ring */}
        <Link
          href="/muscu"
          className="group surface-1 p-5 tap-scale hover:bg-bg-tertiary transition-colors flex flex-col items-center text-center"
        >
          <Ring
            value={completedThisWeek}
            max={sessionsPlanned}
            size={120}
            strokeWidth={8}
            color="var(--muscu)"
          >
            <div className="flex flex-col items-center justify-center leading-tight">
              <Activity size={12} className="text-muscu/80 mb-0.5" />
              <span
                className="num font-semibold text-2xl tabular-nums"
                style={{ color: "var(--muscu)" }}
              >
                {completedThisWeek}
                <span className="text-sm text-text-tertiary font-normal">
                  /{sessionsPlanned}
                </span>
              </span>
              <span className="text-[9px] text-text-tertiary mt-0.5">
                séances
              </span>
            </div>
          </Ring>
          <p className="label mt-3">Cette semaine</p>
          <p className="text-[10px] text-text-tertiary mt-0.5 num">
            {sessionsPct}% complétées
          </p>
        </Link>
      </section>

      {/* ============ ACCÈS RAPIDE AUX SECTIONS ============ */}
      <section className="mb-6">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-sm font-semibold tracking-tight">Accès rapide</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <QuickLink
            href="/muscu"
            icon={<Dumbbell size={18} />}
            label="Musculation"
            color="muscu"
          />
          <QuickLink
            href="/running"
            icon={<Footprints size={18} />}
            label="Running"
            color="running"
          />
          <QuickLink
            href="/nutrition"
            icon={<Apple size={18} />}
            label="Nutrition"
            color="nutrition"
          />
          <QuickLink
            href="/diabete"
            icon={<Droplet size={18} />}
            label="Diabète"
            color="diabete"
          />
        </div>
      </section>

      <footer className="mt-10 text-center text-[10px] text-text-tertiary">
        APEX · <span className="num">v3</span> · Precision Coach
      </footer>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  label,
  color,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  color: "muscu" | "running" | "nutrition" | "diabete";
}) {
  const colorClass = {
    muscu: "bg-muscu/10 text-muscu",
    running: "bg-running/10 text-running",
    nutrition: "bg-nutrition/10 text-nutrition",
    diabete: "bg-diabete/10 text-diabete",
  }[color];

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 surface-1 p-4 hover:bg-bg-tertiary transition-colors tap-scale"
    >
      <div
        className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}
      >
        {icon}
      </div>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight
        size={16}
        className="text-text-tertiary group-hover:text-text-primary transition-colors flex-shrink-0"
      />
    </Link>
  );
}
