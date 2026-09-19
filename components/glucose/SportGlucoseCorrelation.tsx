"use client";

/**
 * SportGlucoseCorrelation — Phase 11 Bloc 6.2.
 *
 * Dashboard de corrélation sport ↔ glycémie. 2 onglets (Muscu / Running)
 * avec courbe agrégée T-30 → T+120 et insights personnalisés ("avec une
 * glycémie de départ de 130, tu risques d'être à ~175 à T+45min en muscu").
 *
 * Reçoit en input :
 *  - les `completedWorkouts` muscu et `completedRunningSessions` running
 *  - les points archive glucose 30j (ou + selon la fenêtre choisie par la page)
 */

import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  enrichSession,
  summarizeSportImpact,
  type SportSession,
} from "@/lib/sport-glucose-analytics";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import { Dumbbell, Footprints, TrendingUp, TrendingDown } from "lucide-react";

interface SportGlucoseCorrelationProps {
  /** Sessions muscu (mappées depuis store.completedWorkouts). */
  muscuSessions: SportSession[];
  /** Sessions running (mappées depuis store.completedRunningSessions). */
  runningSessions: SportSession[];
  /** Points archive (>= fenêtre couvrant les sessions). */
  archivePoints: ArchivedPoint[];
}

export default function SportGlucoseCorrelation({
  muscuSessions,
  runningSessions,
  archivePoints,
}: SportGlucoseCorrelationProps) {
  const [tab, setTab] = useState<"muscu" | "running">("muscu");

  const enriched = useMemo(() => {
    const all = [...muscuSessions, ...runningSessions];
    return all.map((s) => enrichSession(s, archivePoints));
  }, [muscuSessions, runningSessions, archivePoints]);

  const summary = useMemo(
    () => summarizeSportImpact(enriched, tab),
    [enriched, tab],
  );

  const chartData = useMemo(
    () => summary.avgCurve.map((c) => ({
      label: c.label,
      offset: c.offsetMin,
      avg: c.avg,
      count: c.count,
    })),
    [summary],
  );

  const accentColor = tab === "muscu" ? "var(--accent)" : "var(--chart-2)";
  const Icon = tab === "muscu" ? Dumbbell : Footprints;
  const sportLabel = tab === "muscu" ? "muscu" : "running";

  // Insight texte personnalisé
  const insightText = useMemo(() => {
    if (summary.trackedCount === 0) return null;
    if (summary.avgDelta === null) {
      return `${summary.trackedCount} séance${summary.trackedCount > 1 ? "s" : ""} loggée${summary.trackedCount > 1 ? "s" : ""} mais pas assez de points archive pour calculer l'impact.`;
    }
    const sign = summary.avgDelta > 0 ? "monte" : summary.avgDelta < 0 ? "descend" : "varie peu";
    const abs = Math.abs(summary.avgDelta);
    if (tab === "muscu") {
      return `En moyenne sur tes ${summary.trackedCount} séances trackées, ta glycémie ${sign} de ${abs} mg/dL pendant la muscu (T-30 → T+30).`;
    }
    return `En moyenne sur tes ${summary.trackedCount} séances trackées, ta glycémie ${sign} de ${abs} mg/dL pendant le running (T-30 → T+30).`;
  }, [summary, tab]);

  // Fallback : pas de séance loggée → message clair, pas de chart vide
  const hasAnySession = (muscuSessions.length + runningSessions.length) > 0;
  if (!hasAnySession) {
    return (
      <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Dumbbell className="w-4 h-4 text-diabete" />
          <h2 className="text-base font-semibold text-text-primary">
            Corrélation sport ↔ glycémie
          </h2>
        </div>
        <p className="text-xs text-text-tertiary text-center py-6">
          Aucune séance loggée pour l&apos;instant. Termine une séance dans /muscu/seance/[id]
          ou logue un running pour voir l&apos;impact réel sur ta glycémie.
        </p>
      </section>
    );
  }

  return (
    <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color: accentColor }} />
          <h2 className="text-base font-semibold text-text-primary">
            Corrélation sport ↔ glycémie
          </h2>
        </div>
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-bg-tertiary rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setTab("muscu")}
            className={`flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-md transition-all tap-scale ${
              tab === "muscu"
                ? "bg-muscu/15 text-muscu"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Dumbbell className="w-3 h-3" />
            Muscu ({muscuSessions.length})
          </button>
          <button
            type="button"
            onClick={() => setTab("running")}
            className={`flex items-center gap-1 text-[11px] font-medium px-3 py-1.5 rounded-md transition-all tap-scale ${
              tab === "running"
                ? "bg-running/15 text-running"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            <Footprints className="w-3 h-3" />
            Running ({runningSessions.length})
          </button>
        </div>
      </div>

      {summary.trackedCount === 0 ? (
        <p className="text-xs text-text-tertiary text-center py-6">
          Aucune séance {sportLabel} dans la fenêtre.
        </p>
      ) : (
        <>
          {/* Stats récap : trackedCount, avgDelta, worstDelta */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <Stat
              label="Trackées"
              value={`${summary.trackedCount}`}
              hint="séances"
            />
            <Stat
              label="Delta moyen"
              value={
                summary.avgDelta !== null
                  ? `${summary.avgDelta > 0 ? "+" : ""}${summary.avgDelta}`
                  : "—"
              }
              hint="mg/dL T-30→T+30"
              tone={
                summary.avgDelta === null
                  ? "neutral"
                  : (tab === "muscu" && summary.avgDelta > 0) ||
                    (tab === "running" && summary.avgDelta < 0)
                  ? "expected"
                  : "unexpected"
              }
            />
            <Stat
              label="Pire delta"
              value={
                summary.worstDelta !== null
                  ? `${summary.worstDelta > 0 ? "+" : ""}${summary.worstDelta}`
                  : "—"
              }
              hint={
                summary.worstDeltaDate
                  ? new Date(summary.worstDeltaDate).toLocaleDateString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                    })
                  : "—"
              }
              tone="warning"
            />
          </div>

          {/* Insight texte */}
          {insightText && (
            <p className="text-xs text-text-secondary mb-3 leading-relaxed">
              {insightText}
            </p>
          )}

          {/* Courbe agrégée T-30 → T+120 */}
          <div className="w-full h-48 sm:h-56">
            <ResponsiveContainer>
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: -16, bottom: 0 }}
              >
                <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke="var(--text-tertiary)"
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[60, 260]}
                  ticks={[70, 110, 180, 250]}
                  tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={32}
                />
                <ReferenceArea y1={70} y2={180} fill="var(--success)" fillOpacity={0.05} />
                <ReferenceLine y={70} stroke="var(--error)" strokeDasharray="3 3" />
                <ReferenceLine y={180} stroke="var(--warning)" strokeDasharray="3 3" />
                <ReferenceLine x="T+0" stroke={accentColor} strokeDasharray="2 2" strokeOpacity={0.4} />
                <Line
                  type="monotone"
                  dataKey="avg"
                  stroke={accentColor}
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: accentColor }}
                  isAnimationActive={false}
                  connectNulls
                />
                <Tooltip
                  cursor={{ stroke: "rgba(0,0,0,0.2)" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as { label: string; avg: number | null; count: number };
                    if (!row) return null;
                    return (
                      <div className="surface-2 rounded-lg px-3 py-2 border border-border-subtle text-xs">
                        <p className="num font-semibold text-text-primary mb-0.5">{row.label}</p>
                        <p className="text-text-secondary">
                          Moyenne :{" "}
                          {row.avg !== null ? (
                            <span className="num font-semibold" style={{ color: accentColor }}>
                              {row.avg}
                            </span>
                          ) : (
                            <span className="text-text-tertiary">—</span>
                          )}{" "}
                          {row.avg !== null && "mg/dL"}
                        </p>
                        <p className="text-[10px] text-text-tertiary mt-0.5">
                          basé sur {row.count} séance{row.count > 1 ? "s" : ""}
                        </p>
                      </div>
                    );
                  }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Recommandation personnalisée */}
          {summary.avgDelta !== null && summary.trackedCount >= 3 && (
            <div className="mt-3 rounded-lg bg-accent-2/10 border border-accent-2/25 px-3 py-2 flex items-start gap-2">
              {tab === "muscu" ? (
                <TrendingUp className="w-3.5 h-3.5 text-accent-2 shrink-0 mt-0.5" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-accent-2 shrink-0 mt-0.5" />
              )}
              <p className="text-[11px] text-text-secondary leading-snug">
                Avec une glycémie de départ de <span className="num">130</span>, tu risques
                d&apos;être à environ{" "}
                <span className="num font-semibold" style={{ color: accentColor }}>
                  {130 + summary.avgDelta}
                </span>{" "}
                mg/dL à T+30min en {sportLabel} (basé sur tes {summary.trackedCount} dernières
                séances).
              </p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "expected" | "unexpected" | "warning" | "neutral";
}) {
  const valueColor =
    tone === "expected"
      ? "text-success"
      : tone === "unexpected"
      ? "text-warning"
      : tone === "warning"
      ? "text-error"
      : "text-text-primary";
  return (
    <div className="bg-bg-tertiary rounded-lg px-3 py-2.5">
      <p className="text-[10px] text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className={`num text-base font-semibold mt-0.5 ${valueColor}`}>{value}</p>
      {hint && <p className="text-[9px] text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}
