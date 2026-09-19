"use client";

/**
 * Overview — tableau de bord (brand v5 « Instrument », sept. 2026).
 *
 * Mise en page calquée sur le prototype validé
 * (Test/apex-global-prototype.html, écran « Overview ») :
 *   1. en-tête eyebrow + titre
 *   2. panneau Glycémie live (valeur mono, courbe 8h, moyenne / TIR)
 *   3. grille Récup Whoop | Insuline active
 *   4. panneau Action du jour
 *   5. panneau Nutrition
 *   6. liste des modules avec leur chiffre-clé
 *
 * Aucun calcul nouveau : IOB via `activeIOB` (même moteur que /diabete),
 * calories depuis `meals`, séances depuis `completedWorkouts`.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { useGlucose } from "@/hooks/useGlucose";
import { useWhoop } from "@/hooks/useWhoop";
import { activeIOB } from "@/lib/glucose-prediction";
import { DIABETES_CONFIG } from "@/lib/constants";
import { glucoseToneColor } from "@/lib/libre-link/utils";
import { Sparkline } from "@/components/ui/Sparkline";
import { CalendarDays, Footprints, Droplet, Apple, Stethoscope, ChevronRight } from "lucide-react";
import { StoreRestoreBanner } from "@/components/diabete/StoreRestoreBanner";

function glucoseTone(value: number): "green" | "amber" | "red" {
  if (value < 70 || value > 250) return "red";
  if (value < 80 || value > 180) return "amber";
  return "green";
}

function glucoseStatus(value: number): string {
  if (value < 70) return "Hypoglycémie";
  if (value > 250) return "Très élevée";
  if (value > 180) return "Élevée";
  if (value < 80) return "Basse";
  return "En plage";
}

function fmtMin(min: number | null): string {
  if (min === null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h${String(m).padStart(2, "0")}`;
}

export default function Dashboard() {
  const { profile, glucoseReadings, meals, completedWorkouts, insulinLogs } = useStore();

  const { current: liveGlucose, history: liveHistory } = useGlucose({ mode: "history" });
  const whoop = useWhoop();

  // Tick 60 s pour l'IOB (évite un Date.now() impur au rendu).
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = new Date(nowMs);

  const hours = now.getHours();
  const greeting =
    hours < 5 ? "Bonne nuit" : hours < 12 ? "Bonjour" : hours < 18 ? "Bel après-midi" : "Bonsoir";

  // ─── Glycémie : live + repli manuel ──────────────────
  const lastManual = glucoseReadings[0];
  const displayGlucose = liveGlucose?.value ?? lastManual?.value;
  const sparkData = useMemo(() => {
    if (liveHistory.length >= 2) return liveHistory.map((p) => p.value);
    if (glucoseReadings.length >= 2) return [...glucoseReadings].reverse().slice(-32).map((g) => g.value);
    return [];
  }, [liveHistory, glucoseReadings]);
  const glucoseStats = useMemo(() => {
    if (sparkData.length === 0) return null;
    const avg = Math.round(sparkData.reduce((s, v) => s + v, 0) / sparkData.length);
    const tir = Math.round((sparkData.filter((v) => v >= 70 && v <= 180).length / sparkData.length) * 100);
    return { avg, tir };
  }, [sparkData]);
  const fallbackTone = displayGlucose !== undefined ? glucoseTone(displayGlucose) : null;
  const glucoseColor = liveGlucose
    ? glucoseToneColor(liveGlucose.tone)
    : fallbackTone === "green"
      ? "var(--success)"
      : fallbackTone === "amber"
        ? "var(--warning)"
        : fallbackTone === "red"
          ? "var(--error)"
          : "var(--text-tertiary)";
  const glucoseLed = fallbackTone ?? "steel";

  // ─── Insuline active (même modèle bi-exponentiel que /diabete) ──
  const iob = useMemo(() => {
    const recent = insulinLogs
      .map((log) => ({ units: log.units, minutesAgo: (nowMs - new Date(log.injectedAt).getTime()) / 60000 }))
      .filter((inj) => inj.minutesAgo >= 0 && inj.minutesAgo < DIABETES_CONFIG.insulinActiveDuration);
    return { total: Math.round(activeIOB(recent) * 10) / 10, count: recent.length };
  }, [insulinLogs, nowMs]);

  // ─── Nutrition du jour ───────────────────────────────
  const todayMeals = meals.filter((m) => new Date(m.eatenAt).toDateString() === now.toDateString());
  const todayCalories = Math.round(todayMeals.reduce((s, m) => s + m.calories, 0));
  const todayProtein = Math.round(todayMeals.reduce((s, m) => s + (m.protein ?? 0), 0));
  const todayCarbs = Math.round(todayMeals.reduce((s, m) => s + (m.carbs ?? 0), 0));
  const todayFat = Math.round(todayMeals.reduce((s, m) => s + (m.fat ?? 0), 0));
  const calorieTarget = profile.targetCalories || 3000;
  const caloriePct = Math.min(100, Math.round((todayCalories / calorieTarget) * 100));

  // ─── Séances de la semaine ───────────────────────────
  const completedThisWeek = completedWorkouts.filter(
    (w) => (nowMs - new Date(w.date).getTime()) / 86400000 < 7,
  ).length;

  // ─── Récup Whoop ─────────────────────────────────────
  const recovery = whoop.connected ? whoop.snapshot?.recoveryScore ?? null : null;
  const recoveryLed = recovery === null ? "steel" : recovery >= 67 ? "green" : recovery >= 34 ? "amber" : "red";

  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-5 lg:py-8 space-y-3">
      <StoreRestoreBanner />

      {/* ── En-tête ── */}
      <header className="mb-1">
        <p className="eyebrow">
          {now.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" })}
        </p>
        <h1 className="h-title">
          {greeting} {profile.name}
        </h1>
      </header>

      {/* ── Glycémie ── */}
      <Link href="/diabete" className="panel block hover:bg-bg-hover transition-colors">
        <div className="panel-hd">
          <div className="flex items-center gap-2">
            <span className={`led ${glucoseLed}`} />
            <b>Glycémie</b>
          </div>
          <span className={`pill ${liveGlucose ? "green" : ""}`}>
            {liveGlucose ? "Libre · live" : lastManual ? "manuel" : "non connecté"}
          </span>
        </div>
        <div className="flex items-start gap-3">
          <span className="num-hero text-[52px] leading-none" style={{ color: glucoseColor }}>
            {displayGlucose ?? "—"}
          </span>
          {liveGlucose && (
            <span className="text-2xl mt-1 font-semibold" style={{ color: glucoseColor }}>
              {liveGlucose.arrow}
            </span>
          )}
          <div className="ml-auto text-right">
            <p className="text-[11px] text-text-tertiary">Moy. 8h</p>
            <p className="num text-base">{glucoseStats?.avg ?? "—"}</p>
            <p className="text-[11px] text-text-tertiary mt-1.5">TIR 8h</p>
            <p className="num text-base" style={{ color: "var(--success)" }}>
              {glucoseStats ? `${glucoseStats.tir} %` : "—"}
            </p>
          </div>
        </div>
        {displayGlucose !== undefined && (
          <p className="text-xs text-text-secondary mt-1">
            {liveGlucose?.statusLabel ?? glucoseStatus(displayGlucose)}
            {liveGlucose?.trendLabel ? ` · ${liveGlucose.trendLabel}` : ""}
          </p>
        )}
        {sparkData.length >= 2 && (
          <div className="mt-3 w-full">
            <Sparkline data={sparkData} color="var(--success)" height={72} width={640} className="w-full" />
          </div>
        )}
      </Link>

      {/* ── Récup | IOB ── */}
      <div className="mgrid">
        <Link href="/whoop" className="cell hover:bg-bg-hover transition-colors">
          <div className="flex items-center gap-2">
            <span className={`led ${recoveryLed}`} />
            <span className="eyebrow">Récup Whoop</span>
          </div>
          <div className="v mt-2">
            {recovery ?? "—"}
            <small>%</small>
          </div>
          <div className="l">
            {whoop.connected && whoop.snapshot
              ? `HRV ${whoop.snapshot.hrvMs ?? "—"} · ${fmtMin(whoop.snapshot.sleepDurationMin)}${
                  whoop.snapshot.cycleStrain !== null ? ` · strain ${whoop.snapshot.cycleStrain.toFixed(1)}` : ""
                }`
              : "non connecté"}
          </div>
        </Link>
        <Link href="/diabete" className="cell hover:bg-bg-hover transition-colors">
          <div className="flex items-center gap-2">
            <span className={`led ${iob.total > 0.5 ? "amber" : "steel"}`} />
            <span className="eyebrow">Insuline active</span>
          </div>
          <div className="v mt-2">
            {iob.total.toFixed(1).replace(".", ",")}
            <small>U</small>
          </div>
          <div className="l">
            {iob.count === 0 ? "rien d'actif" : `${iob.count} injection${iob.count > 1 ? "s" : ""} en cours`}
          </div>
        </Link>
      </div>

      {/* ── Action du jour ── */}
      <section className="panel">
        <div className="panel-hd">
          <b>Action du jour</b>
          <span className="pill">
            {completedThisWeek} séance{completedThisWeek > 1 ? "s" : ""} · 7 j
          </span>
        </div>
        <div className="row-item">
          <span className="sq ink" />
          <div>
            <div className="t">Séances — module en reconstruction</div>
            <div className="s">calendrier Phase 0 importé de Notion à venir</div>
          </div>
          <Link href="/muscu" className="ml-auto text-text-tertiary" aria-label="Séances">
            <ChevronRight size={16} />
          </Link>
        </div>
        <div className="row-item">
          <span className="sq cobalt" />
          <div>
            <div className="t">Running</div>
            <div className="s">GPS Apex ou Watch → Whoop</div>
          </div>
          <Link href="/running" className="ml-auto text-text-tertiary" aria-label="Running">
            <ChevronRight size={16} />
          </Link>
        </div>
        <Link
          href="/diabete"
          className="mt-3 flex h-11 items-center justify-center rounded-lg bg-text-primary text-bg-secondary text-sm font-semibold"
        >
          Briefing pré-sport
        </Link>
      </section>

      {/* ── Nutrition ── */}
      <Link href="/nutrition" className="panel block hover:bg-bg-hover transition-colors">
        <div className="panel-hd">
          <b>Nutrition</b>
          <span className="num text-xs text-text-tertiary">
            {todayCalories.toLocaleString("fr-FR")} / {calorieTarget.toLocaleString("fr-FR")} kcal
          </span>
        </div>
        <div className="h-1.5 rounded-sm bg-bg-tertiary overflow-hidden">
          <div className="h-full bg-text-primary" style={{ width: `${caloriePct}%` }} />
        </div>
        <div className="mgrid c3 flat mt-3">
          <div className="cell">
            <div className="v">
              {todayProtein}
              <small>/{profile.targetProtein || 170}</small>
            </div>
            <div className="l">Protéines g</div>
          </div>
          <div className="cell">
            <div className="v">
              {todayCarbs}
              <small>/{profile.targetCarbs || 375}</small>
            </div>
            <div className="l">Glucides g</div>
          </div>
          <div className="cell">
            <div className="v">
              {todayFat}
              <small>/{profile.targetFat || 90}</small>
            </div>
            <div className="l">Lipides g</div>
          </div>
        </div>
      </Link>

      {/* ── Modules ── */}
      <section className="panel py-1">
        {[
          { href: "/muscu", label: "Séances", Icon: CalendarDays, sq: "ink", meta: `${completedThisWeek} cette semaine` },
          { href: "/running", label: "Running", Icon: Footprints, sq: "cobalt", meta: "plan semi" },
          { href: "/diabete", label: "Diabète", Icon: Droplet, sq: "green", meta: glucoseStats ? `TIR ${glucoseStats.tir} %` : "—" },
          { href: "/nutrition", label: "Nutrition", Icon: Apple, sq: "steel", meta: `${caloriePct} %` },
          { href: "/diabete/docteur", label: "Le Docteur", Icon: Stethoscope, sq: "steel", meta: "bilan" },
        ].map(({ href, label, Icon, sq, meta }) => (
          <Link key={href} href={href} className="row-item hover:bg-bg-hover -mx-4 px-4 transition-colors">
            <span className={`sq ${sq}`} />
            <Icon size={16} className="text-text-secondary" />
            <span className="t">{label}</span>
            <span className="d">{meta}</span>
            <ChevronRight size={16} className="text-text-tertiary flex-none" />
          </Link>
        ))}
      </section>

      <footer className="pt-4 text-center text-[11px] text-text-tertiary font-mono">
        APEX · v5 ·{" "}
        <Link href="/credits" className="hover:text-text-secondary">
          Crédits
        </Link>
      </footer>
    </div>
  );
}
