"use client";

/**
 * WhoopCard — affichage des données Whoop (Phase F2 UI extensions).
 *
 * Deux variants :
 *  - "compact" : 3 stats clés (Recovery / Strain / Sommeil) en grid
 *    horizontale, idéal pour Dashboard / page Running
 *  - "full" : vue complète avec jauges visuelles, HRV/RHR, breakdown
 *    sommeil, dernier workout. Page /whoop dédiée.
 *
 * Si Whoop n'est pas connecté, le composant retourne null en mode
 * compact (silencieux) ou affiche un CTA "connecter Whoop" en mode full.
 *
 * Couleurs Whoop officielles :
 *   Recovery : 67-100 vert  / 34-66 jaune / 0-33 rouge
 *   Strain   : 0-9 bleu     / 10-13 vert  / 14-17 jaune / 18-21 rouge
 */

import Link from "next/link";
import { useWhoop, type WhoopSnapshot } from "@/hooks/useWhoop";
import {
  Activity,
  Heart,
  Moon,
  Flame,
  Zap,
  Footprints,
  Loader2,
  RefreshCw,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";

interface WhoopCardProps {
  variant?: "compact" | "full";
}

function recoveryColor(score: number | null): { color: string; bg: string; label: string } {
  if (score === null) return { color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.04)", label: "—" };
  if (score >= 67) return { color: "#7AE582", bg: "rgba(122,229,130,0.15)", label: "Vert" };
  if (score >= 34) return { color: "#FFAE5C", bg: "rgba(255,174,92,0.15)", label: "Jaune" };
  return { color: "#FF6B6B", bg: "rgba(255,107,107,0.15)", label: "Rouge" };
}

function strainColor(strain: number | null): { color: string; bg: string; label: string } {
  if (strain === null) return { color: "var(--text-tertiary)", bg: "rgba(255,255,255,0.04)", label: "—" };
  if (strain >= 18) return { color: "#FF6B6B", bg: "rgba(255,107,107,0.15)", label: "Très dur" };
  if (strain >= 14) return { color: "#FFAE5C", bg: "rgba(255,174,92,0.15)", label: "Dur" };
  if (strain >= 10) return { color: "#7AE582", bg: "rgba(122,229,130,0.15)", label: "Modéré" };
  return { color: "#7FC7FF", bg: "rgba(127,199,255,0.15)", label: "Léger" };
}

function formatSleepDuration(min: number | null): string {
  if (min === null || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

export default function WhoopCard({ variant = "compact" }: WhoopCardProps) {
  const { connected, snapshot, loading, error, refetch } = useWhoop();

  // ─── Mode compact : silencieux si non connecté ─────────────────
  if (variant === "compact") {
    if (!connected || !snapshot) return null;
    return <CompactCard snapshot={snapshot} loading={loading} />;
  }

  // ─── Mode full ─────────────────────────────────
  if (loading && !snapshot) {
    return (
      <section className="surface-1 rounded-3xl p-8 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-text-tertiary" />
      </section>
    );
  }

  if (!connected) {
    return (
      <section className="surface-1 rounded-3xl p-6 sm:p-8 text-center">
        <Activity className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
        <h2 className="text-base font-semibold text-text-primary mb-2">
          Whoop non connecté
        </h2>
        <p className="text-xs text-text-tertiary mb-4 max-w-md mx-auto leading-relaxed">
          Connecte ton compte Whoop pour voir ton recovery, strain quotidien,
          HRV, RHR et sommeil. Ces données enrichissent automatiquement le
          calculateur de bolus post-exercice.
        </p>
        <Link
          href="/diabete/parametres"
          className="inline-flex items-center gap-2 bg-running text-ink font-semibold px-4 py-2 rounded-lg hover:bg-running/90 transition-colors tap-scale text-sm"
        >
          Connecter Whoop
          <ArrowRight className="w-4 h-4" />
        </Link>
      </section>
    );
  }

  if (!snapshot) {
    return (
      <section className="surface-1 rounded-3xl p-6 sm:p-8 text-center">
        <AlertTriangle className="w-6 h-6 text-warning mx-auto mb-3" />
        <p className="text-sm text-warning mb-1">Erreur de chargement Whoop</p>
        {error && <p className="text-[11px] text-text-tertiary">{error}</p>}
        <button
          type="button"
          onClick={refetch}
          className="mt-3 text-xs text-running hover:underline tap-scale"
        >
          Réessayer
        </button>
      </section>
    );
  }

  return <FullCard snapshot={snapshot} loading={loading} onRefresh={refetch} />;
}

// ─── Variant compact ─────────────────────────────
function CompactCard({ snapshot, loading }: { snapshot: WhoopSnapshot; loading: boolean }) {
  const rec = recoveryColor(snapshot.recoveryScore);
  const str = strainColor(snapshot.cycleStrain);
  return (
    <section className="surface-1 rounded-3xl p-5 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-running" />
          <p className="label">Whoop · aujourd&apos;hui</p>
        </div>
        {loading && <Loader2 className="w-3 h-3 animate-spin text-text-tertiary" />}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <CompactStat
          icon={<Heart className="w-3.5 h-3.5" />}
          label="Recovery"
          value={snapshot.recoveryScore !== null ? `${snapshot.recoveryScore}` : "—"}
          unit="%"
          color={rec.color}
          bg={rec.bg}
        />
        <CompactStat
          icon={<Flame className="w-3.5 h-3.5" />}
          label="Strain"
          value={snapshot.cycleStrain !== null ? snapshot.cycleStrain.toFixed(1).replace(".", ",") : "—"}
          color={str.color}
          bg={str.bg}
        />
        <CompactStat
          icon={<Moon className="w-3.5 h-3.5" />}
          label="Sommeil"
          value={formatSleepDuration(snapshot.sleepDurationMin)}
          color="#B4A7FF"
          bg="rgba(180,167,255,0.15)"
        />
      </div>
      <div className="mt-3 text-right">
        <Link
          href="/whoop"
          className="inline-flex items-center gap-1 text-[10px] text-text-tertiary hover:text-running transition-colors"
        >
          Vue détaillée
          <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
    </section>
  );
}

function CompactStat({
  icon,
  label,
  value,
  unit,
  color,
  bg,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl px-3 py-2.5" style={{ background: bg }}>
      <div className="flex items-center gap-1 mb-1" style={{ color }}>
        {icon}
        <p className="text-[9px] uppercase tracking-wide font-semibold">{label}</p>
      </div>
      <p className="num text-lg font-semibold tabular-nums" style={{ color }}>
        {value}
        {unit && <span className="text-[10px] opacity-70 ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}

// ─── Variant full ────────────────────────────────
function FullCard({
  snapshot,
  loading,
  onRefresh,
}: {
  snapshot: WhoopSnapshot;
  loading: boolean;
  onRefresh: () => void;
}) {
  const rec = recoveryColor(snapshot.recoveryScore);
  const str = strainColor(snapshot.cycleStrain);
  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="surface-1 rounded-3xl p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-running" />
            <h1 className="text-xl font-semibold text-text-primary">Whoop</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-text-tertiary">
              {snapshot.fetchedAt
                ? `MAJ ${timeAgo(new Date(snapshot.fetchedAt).toISOString())}`
                : "—"}
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Rafraîchir Whoop"
              className="w-8 h-8 rounded-full bg-bg-tertiary border border-border-subtle flex items-center justify-center text-text-secondary hover:text-running transition-colors tap-scale disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {/* Recovery + Strain gauges */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Gauge
            label="Recovery"
            value={snapshot.recoveryScore}
            max={100}
            unit="%"
            color={rec.color}
            bg={rec.bg}
            zoneLabel={rec.label}
            icon={<Heart className="w-4 h-4" />}
          />
          <Gauge
            label="Strain"
            value={snapshot.cycleStrain}
            max={21}
            decimals={1}
            color={str.color}
            bg={str.bg}
            zoneLabel={str.label}
            icon={<Flame className="w-4 h-4" />}
          />
        </div>

        {/* HRV + RHR */}
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            label="HRV (RMSSD)"
            value={snapshot.hrvMs !== null ? `${Math.round(snapshot.hrvMs)}` : "—"}
            unit="ms"
            icon={<Zap className="w-3.5 h-3.5 text-accent-2" />}
          />
          <MiniStat
            label="RHR"
            value={snapshot.rhrBpm !== null ? `${snapshot.rhrBpm}` : "—"}
            unit="bpm"
            icon={<Heart className="w-3.5 h-3.5 text-error" />}
          />
        </div>
      </section>

      {/* Sommeil */}
      <section className="surface-1 rounded-3xl p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Moon className="w-4 h-4 text-accent-2" />
          <h2 className="text-base font-semibold text-text-primary">Sommeil dernière nuit</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MiniStat
            label="Durée totale"
            value={formatSleepDuration(snapshot.sleepDurationMin)}
            icon={<Moon className="w-3.5 h-3.5 text-accent-2" />}
          />
          <MiniStat
            label="Performance"
            value={snapshot.sleepPerformance !== null ? `${snapshot.sleepPerformance}` : "—"}
            unit="%"
            icon={<Activity className="w-3.5 h-3.5 text-success" />}
          />
        </div>
      </section>

      {/* Dernier workout */}
      {snapshot.lastWorkout && (
        <section className="surface-1 rounded-3xl p-5 sm:p-6">
          <div className="flex items-center gap-2 mb-3">
            <Footprints className="w-4 h-4 text-running" />
            <h2 className="text-base font-semibold text-text-primary">
              Dernière séance
            </h2>
          </div>
          <div className="surface-2 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
              <p className="text-sm font-medium text-text-primary">
                {snapshot.lastWorkout.sport || "Séance"}
              </p>
              <span className="text-[10px] text-text-tertiary">
                {timeAgo(snapshot.lastWorkout.endedAt)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <MiniStat
                label="Strain"
                value={snapshot.lastWorkout.strain.toFixed(1).replace(".", ",")}
                color={strainColor(snapshot.lastWorkout.strain).color}
              />
              <MiniStat
                label="Début"
                value={new Date(snapshot.lastWorkout.startedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
              <MiniStat
                label="Fin"
                value={new Date(snapshot.lastWorkout.endedAt).toLocaleTimeString("fr-FR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function Gauge({
  label,
  value,
  max,
  unit,
  color,
  bg,
  zoneLabel,
  icon,
  decimals = 0,
}: {
  label: string;
  value: number | null;
  max: number;
  unit?: string;
  color: string;
  bg: string;
  zoneLabel: string;
  icon: React.ReactNode;
  decimals?: number;
}) {
  const pct = value !== null ? Math.min(100, (value / max) * 100) : 0;
  const displayValue =
    value !== null
      ? decimals === 0
        ? Math.round(value).toString()
        : value.toFixed(decimals).replace(".", ",")
      : "—";
  return (
    <div className="rounded-2xl p-4" style={{ background: bg }}>
      <div className="flex items-center justify-between mb-2" style={{ color }}>
        <div className="flex items-center gap-1.5">
          {icon}
          <p className="text-[10px] uppercase tracking-wide font-semibold">{label}</p>
        </div>
        <span className="text-[9px] uppercase tracking-wide opacity-80">{zoneLabel}</span>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="num-hero text-3xl sm:text-4xl font-semibold tabular-nums" style={{ color }}>
          {displayValue}
        </span>
        <span className="text-xs opacity-70" style={{ color }}>
          {unit ? unit : `/${max}`}
        </span>
      </div>
      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
  icon,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  icon?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="bg-bg-tertiary rounded-lg px-3 py-2.5">
      <div className="flex items-center gap-1 mb-1">
        {icon}
        <p className="text-[9px] uppercase tracking-wide text-text-tertiary font-semibold">
          {label}
        </p>
      </div>
      <p
        className="num text-base font-semibold tabular-nums"
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
        {unit && <span className="text-[10px] text-text-tertiary ml-0.5">{unit}</span>}
      </p>
    </div>
  );
}
