"use client";

/**
 * GlucoseChart — courbe glycémie des 8 dernières heures (FreeStyle Libre 2).
 *
 * Lit via le hook `useGlucose({ mode: "history" })` qui appelle
 * `/api/glucose/history` (current + history chronologique).
 *
 * Design :
 *  - bandes de référence colorées en fond (hypo/target/high/hyper)
 *  - courbe lime (accent) avec gradient area
 *  - dot terminal pulsant sur la dernière valeur
 *  - tooltip sur hover avec value + heure + tone
 *  - fallback propre : skeleton / not-configured / error / no-data
 */

import { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { useGlucose } from "@/hooks/useGlucose";
import { GLUCOSE_THRESHOLDS } from "@/lib/libre-link/config";
import {
  glucoseTone,
  glucoseToneColor,
  glucoseToneLabel,
} from "@/lib/libre-link/utils";
import { Activity } from "lucide-react";

type ChartPoint = {
  t: number; // timestamp ms
  value: number;
  label: string; // "14:32"
};

function formatTick(t: number): string {
  const d = new Date(t);
  return d
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");
}

export default function GlucoseChart() {
  const { current, history, loading, notConfigured, error } = useGlucose({
    mode: "history",
  });

  // Mappe l'historique vers des points {t, value, label} triés chronologiquement.
  // L'API `/api/glucose/history` renvoie déjà ~8h de points (15 min resolution),
  // donc on ne filtre pas ici — on trie juste par sécurité.
  const data: ChartPoint[] = useMemo(() => {
    if (!history?.length) return [];
    return history
      .map((h) => ({
        t: new Date(h.date).getTime(),
        value: h.value,
        label: formatTick(new Date(h.date).getTime()),
      }))
      .sort((a, b) => a.t - b.t);
  }, [history]);

  // Domaine Y adaptatif : inclut toujours 40-300, s'étend si besoin.
  const yDomain = useMemo<[number, number]>(() => {
    if (!data.length) return [40, 300];
    const min = Math.min(...data.map((p) => p.value));
    const max = Math.max(...data.map((p) => p.value));
    return [Math.min(40, min - 10), Math.max(300, max + 10)];
  }, [data]);

  // ─── States d'erreur / absence de données ─────────────────────────
  if (notConfigured) {
    return (
      <EmptyState
        icon={<Activity className="w-5 h-5 text-text-tertiary" />}
        title="Capteur non connecté"
        description="Configure LibreLinkUp pour voir ta courbe glycémique live."
      />
    );
  }

  if (loading && !data.length) {
    return (
      <div className="surface-1 rounded-3xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-diabete" />
          <h2 className="text-base font-semibold text-text-primary">
            Courbe 8h
          </h2>
        </div>
        <div className="h-48 rounded-2xl skeleton" />
      </div>
    );
  }

  if (error && !data.length) {
    return (
      <EmptyState
        icon={<Activity className="w-5 h-5 text-warning" />}
        title="Impossible de charger la courbe"
        description={error}
      />
    );
  }

  if (!data.length) {
    return (
      <EmptyState
        icon={<Activity className="w-5 h-5 text-text-tertiary" />}
        title="Pas encore de données"
        description="Les points apparaîtront au fil des lectures du capteur."
      />
    );
  }

  // Stats synthèse : temps en plage (TIR) sur l'historique affiché
  const totalPoints = data.length;
  const inRangePoints = data.filter(
    (p) =>
      p.value >= GLUCOSE_THRESHOLDS.hypo && p.value <= GLUCOSE_THRESHOLDS.high,
  ).length;
  const tirPct = Math.round((inRangePoints / totalPoints) * 100);
  const avgValue = Math.round(
    data.reduce((sum, p) => sum + p.value, 0) / totalPoints,
  );

  const currentTone = current ? glucoseTone(current.value) : "target";

  return (
    <section className="surface-1 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-diabete" />
          <h2 className="text-base font-semibold text-text-primary">
            Courbe 8h
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Stat label="Moyenne" value={`${avgValue}`} unit="mg/dL" />
          <Stat
            label="Temps en plage"
            value={`${tirPct}%`}
            tone={tirPct >= 70 ? "success" : tirPct >= 50 ? "warning" : "error"}
          />
        </div>
      </div>

      <div className="h-48 sm:h-56 -mx-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="glucoseArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--diabete)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--diabete)" stopOpacity={0} />
              </linearGradient>
            </defs>

            <CartesianGrid
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
              strokeDasharray="2 4"
            />

            {/* Bandes de référence (fond) */}
            <ReferenceArea
              y1={yDomain[0]}
              y2={GLUCOSE_THRESHOLDS.hypo}
              fill="var(--error)"
              fillOpacity={0.08}
              stroke="none"
            />
            <ReferenceArea
              y1={GLUCOSE_THRESHOLDS.hypo}
              y2={GLUCOSE_THRESHOLDS.high}
              fill="var(--success)"
              fillOpacity={0.06}
              stroke="none"
            />
            <ReferenceArea
              y1={GLUCOSE_THRESHOLDS.high}
              y2={GLUCOSE_THRESHOLDS.hyper}
              fill="var(--warning)"
              fillOpacity={0.08}
              stroke="none"
            />
            <ReferenceArea
              y1={GLUCOSE_THRESHOLDS.hyper}
              y2={yDomain[1]}
              fill="var(--error)"
              fillOpacity={0.1}
              stroke="none"
            />

            {/* Lignes de seuil cliniques */}
            <ReferenceLine
              y={GLUCOSE_THRESHOLDS.hypo}
              stroke="var(--error)"
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />
            <ReferenceLine
              y={GLUCOSE_THRESHOLDS.high}
              stroke="var(--warning)"
              strokeOpacity={0.5}
              strokeDasharray="3 3"
            />

            <XAxis
              dataKey="t"
              type="number"
              domain={["dataMin", "dataMax"]}
              scale="time"
              tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
              tickFormatter={formatTick}
              minTickGap={40}
              stroke="rgba(255,255,255,0.08)"
            />
            <YAxis
              domain={yDomain}
              tick={{ fill: "var(--text-tertiary)", fontSize: 10 }}
              stroke="rgba(255,255,255,0.08)"
              width={32}
              ticks={[70, 180, 250]}
            />

            <Tooltip
              cursor={{
                stroke: "var(--diabete)",
                strokeOpacity: 0.4,
                strokeDasharray: "3 3",
              }}
              content={<ChartTooltip />}
            />

            <Area
              type="monotone"
              dataKey="value"
              stroke="var(--diabete)"
              strokeWidth={2}
              fill="url(#glucoseArea)"
              dot={false}
              activeDot={{
                r: 4,
                fill: "var(--diabete)",
                stroke: "var(--bg-primary)",
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legende compacte */}
      <div className="mt-3 flex items-center justify-center gap-4 flex-wrap">
        <LegendDot color="var(--error)" label={`< ${GLUCOSE_THRESHOLDS.hypo}`} />
        <LegendDot
          color="var(--success)"
          label={`${GLUCOSE_THRESHOLDS.hypo}–${GLUCOSE_THRESHOLDS.high}`}
        />
        <LegendDot
          color="var(--warning)"
          label={`${GLUCOSE_THRESHOLDS.high}–${GLUCOSE_THRESHOLDS.hyper}`}
        />
        <LegendDot color="var(--error)" label={`> ${GLUCOSE_THRESHOLDS.hyper}`} />
      </div>

      {current && (
        <p className="mt-2 text-center text-[11px] text-text-tertiary">
          Dernière lecture :{" "}
          <span
            className="num font-semibold"
            style={{ color: glucoseToneColor(currentTone) }}
          >
            {current.value}
          </span>{" "}
          mg/dL · {glucoseToneLabel(currentTone)}
        </p>
      )}
    </section>
  );
}

// ─── Sub-components ────────────────────────────────────────────────

function Stat({
  label,
  value,
  unit,
  tone = "default",
}: {
  label: string;
  value: string;
  unit?: string;
  tone?: "default" | "success" | "warning" | "error";
}) {
  const colorClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "error"
          ? "text-error"
          : "text-text-primary";
  return (
    <div className="text-right">
      <p className="text-[9px] text-text-tertiary uppercase tracking-wide leading-tight">
        {label}
      </p>
      <p className={`num text-sm font-semibold leading-tight ${colorClass}`}>
        {value}
        {unit && (
          <span className="text-[9px] text-text-tertiary ml-0.5">{unit}</span>
        )}
      </p>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] text-text-tertiary">
      <span
        className="w-2 h-2 rounded-full"
        style={{ background: color, opacity: 0.7 }}
      />
      <span className="num">{label}</span>
    </span>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className="surface-1 rounded-3xl p-6">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="w-4 h-4 text-diabete" />
        <h2 className="text-base font-semibold text-text-primary">Courbe 8h</h2>
      </div>
      <div className="rounded-2xl surface-2 p-8 flex flex-col items-center justify-center gap-2 text-center">
        {icon}
        <p className="text-sm font-medium text-text-primary mt-1">{title}</p>
        <p className="text-xs text-text-tertiary max-w-sm">{description}</p>
      </div>
    </section>
  );
}

// ─── Tooltip custom ────────────────────────────────────────────────

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  const tone = glucoseTone(point.value);
  return (
    <div className="rounded-xl bg-bg-elevated border border-border-default px-3 py-2 shadow-lg">
      <p className="text-[10px] text-text-tertiary uppercase tracking-wide">
        {new Date(point.t).toLocaleTimeString("fr-FR", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
      <div className="flex items-baseline gap-1.5 mt-0.5">
        <span
          className="num text-lg font-semibold"
          style={{ color: glucoseToneColor(tone) }}
        >
          {point.value}
        </span>
        <span className="text-[10px] text-text-tertiary">mg/dL</span>
      </div>
      <p className="text-[10px] text-text-tertiary mt-0.5">
        {glucoseToneLabel(tone)}
      </p>
    </div>
  );
}
