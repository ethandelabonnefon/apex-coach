"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import GlucoseStat from "@/components/glucose/GlucoseStat";
import {
  ArrowUpRight,
  Dumbbell,
  Footprints,
  Apple,
  Droplet,
  ChevronRight,
} from "lucide-react";

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

function glucoseTone(value: number): "success" | "warning" | "error" {
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

  // ─── Context temporel ──────────────────────────────
  const now = new Date();
  const hours = now.getHours();
  const greeting =
    hours < 5 ? "Bonne nuit" : hours < 12 ? "Bonjour" : hours < 18 ? "Bel après-midi" : "Bonsoir";
  const todayName = DAYS_FR[now.getDay()];

  // ─── Action du jour : séance muscu si programmée ───
  const sessions = activeProgram?.sessions || muscuProgram.sessions;
  const todaySession = sessions.find((s) => s.day === todayName);

  // ─── Stat 1 : Glycémie (live FreeStyle Libre via GlucoseStat) ────
  // Fallback sur les lectures manuelles si l'API LibreLink n'est pas dispo
  const lastGlucose = glucoseReadings[0];
  const prevGlucose = glucoseReadings[1];

  // ─── Stat 2 : Calories jour ─────────────────────────
  const todayMeals = meals.filter((m) => {
    const d = new Date(m.eatenAt);
    return d.toDateString() === now.toDateString();
  });
  const todayCalories = Math.round(todayMeals.reduce((s, m) => s + m.calories, 0));

  // ─── Stat 3 : Séances complétées cette semaine ──────
  const nowMs = now.getTime();
  const completedThisWeek = completedWorkouts.filter((w) => {
    const diff = (nowMs - new Date(w.date).getTime()) / 86400000;
    return diff < 7;
  }).length;
  const sessionsPlanned = sessions.length || 4;

  return (
    <div className="max-w-[960px] mx-auto px-4 sm:px-6 lg:px-10 py-6 lg:py-10">
      {/* ============ HERO : Salut Ethan + 1 action ============ */}
      <section className="mb-10 animate-in">
        <p className="label mb-2">
          {now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
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
              className="absolute -top-20 -right-20 h-48 w-48 rounded-full opacity-[0.1] blur-3xl"
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
                  <span className="num">{todaySession.exercises.length}</span> exos ·{" "}
                  <span className="num">{todaySession.duration}</span>min · {todaySession.focus}
                </p>
              </div>
              <ArrowUpRight
                size={22}
                strokeWidth={2.5}
                className="text-text-tertiary group-hover:text-muscu transition-colors flex-shrink-0"
              />
            </div>
          </Link>
        ) : lastGlucose && glucoseTone(lastGlucose.value) !== "success" ? (
          <Link
            href="/diabete"
            className="group block surface-1 p-6 lg:p-7 relative overflow-hidden tap-scale hover:bg-bg-tertiary transition-colors"
          >
            <div
              aria-hidden
              className="absolute -top-20 -right-20 h-48 w-48 rounded-full opacity-[0.1] blur-3xl"
              style={{ background: "var(--diabete)" }}
            />
            <div className="relative flex items-center gap-5">
              <div className="h-14 w-14 rounded-xl bg-diabete/15 flex items-center justify-center flex-shrink-0">
                <Droplet size={24} className="text-diabete" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="label">Priorité du moment</span>
                <p className="text-lg sm:text-xl font-semibold tracking-tight mt-1">
                  {glucoseStatus(lastGlucose.value)} — ouvre le calculateur
                </p>
                <p className="text-xs text-text-tertiary mt-0.5">
                  <span className="num">{lastGlucose.value}</span> mg/dL · cible{" "}
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

      {/* ============ 3 STATS MAX ============ */}
      <section className="mb-10 grid grid-cols-3 gap-2 sm:gap-3 stagger">
        {/* Glycémie — live FreeStyle Libre avec fallback manuel */}
        <GlucoseStat
          fallbackValue={lastGlucose?.value}
          fallbackPrevValue={prevGlucose?.value}
          href="/diabete"
        />

        {/* Calories */}
        <Link
          href="/nutrition"
          className="group surface-1 p-3 sm:p-4 tap-scale hover:bg-bg-tertiary transition-colors"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Apple size={12} className="text-nutrition" />
            <span className="label">Calories</span>
          </div>
          <p
            className="num-hero text-2xl sm:text-3xl font-semibold leading-none"
            style={{ color: "var(--nutrition)" }}
          >
            {todayCalories}
          </p>
          <p className="text-[10px] text-text-tertiary mt-1">
            / <span className="num">{profile.targetCalories}</span> kcal
          </p>
        </Link>

        {/* Séances */}
        <Link
          href="/muscu"
          className="group surface-1 p-3 sm:p-4 tap-scale hover:bg-bg-tertiary transition-colors"
        >
          <div className="flex items-center gap-1.5 mb-2">
            <Dumbbell size={12} className="text-muscu" />
            <span className="label">Séances</span>
          </div>
          <p
            className="num-hero text-2xl sm:text-3xl font-semibold leading-none"
            style={{ color: "var(--muscu)" }}
          >
            {completedThisWeek}
            <span className="text-base text-text-tertiary font-normal">
              /{sessionsPlanned}
            </span>
          </p>
          <p className="text-[10px] text-text-tertiary mt-1">cette semaine</p>
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
        APEX · <span className="num">v2</span> · Precision Coach
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
    muscu: "bg-muscu/10 text-muscu group-hover:text-muscu",
    running: "bg-running/10 text-running group-hover:text-running",
    nutrition: "bg-nutrition/10 text-nutrition group-hover:text-nutrition",
    diabete: "bg-diabete/10 text-diabete group-hover:text-diabete",
  }[color];

  return (
    <Link
      href={href}
      className="group flex items-center gap-3 surface-1 p-4 hover:bg-bg-tertiary transition-colors tap-scale"
    >
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClass}`}>
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
