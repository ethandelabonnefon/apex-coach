"use client";

/**
 * AGPChart — Ambulatory Glucose Profile simplifié (Phase 11 Bloc 4.4).
 *
 * Représente la "modal day" : pour chaque tranche de 30min de la journée,
 * on superpose la médiane + les bandes percentiles (P25-P75, P10-P90)
 * agrégées sur 14 jours. C'est le standard de la communauté T1D pour
 * détecter les patterns récurrents (dawn, post-meal, …).
 *
 * Construction :
 *  - 48 buckets de 30min (0..23:30)
 *  - Bande grise large : P10-P90
 *  - Bande grise foncée : P25-P75
 *  - Ligne lime : médiane
 *  - Bande de fond verte : zone cible 70-180
 *  - Pointillés sur 70 et 180 (seuils stricts)
 */

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceArea,
  ReferenceLine,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { buildAgpProfile, type AgpSlot } from "@/lib/glucose-archive/analytics";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import { LineChart as LineIcon } from "lucide-react";

interface AGPChartProps {
  points: ArchivedPoint[];
  /** Fenêtre en jours pour agréger les percentiles (default 14). */
  days?: number;
}

interface ChartRow {
  label: string;
  minute: number;
  median: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  /** Pour le rendu des bandes via Area (need pair). */
  band10_90: [number, number] | null;
  band25_75: [number, number] | null;
}

export default function AGPChart({ points, days = 14 }: AGPChartProps) {
  const slots: AgpSlot[] = useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = points.filter((p) => p.t >= cutoff);
    return buildAgpProfile(filtered);
  }, [points, days]);

  const data: ChartRow[] = useMemo(() => {
    return slots.map((s) => ({
      label: s.label,
      minute: s.minuteOfDay,
      median: s.median,
      p10: s.p10,
      p25: s.p25,
      p75: s.p75,
      p90: s.p90,
      band10_90: s.p10 !== null && s.p90 !== null ? [s.p10, s.p90] : null,
      band25_75: s.p25 !== null && s.p75 !== null ? [s.p25, s.p75] : null,
    }));
  }, [slots]);

  const totalCount = useMemo(() => slots.reduce((sum, s) => sum + s.count, 0), [slots]);
  const hasData = totalCount > 50;

  const yMax = useMemo(() => {
    let max = 250;
    for (const s of slots) {
      if (s.p90 !== null && s.p90 > max) max = s.p90;
    }
    return Math.min(400, Math.ceil(max / 50) * 50);
  }, [slots]);

  return (
    <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LineIcon className="w-4 h-4 text-diabete" />
          <h2 className="text-base font-semibold text-text-primary">
            Profil glucose ambulatoire (AGP · {days}j)
          </h2>
        </div>
        <span className="num text-[10px] text-text-tertiary uppercase tracking-wide">
          modal day
        </span>
      </div>

      {!hasData ? (
        <p className="text-xs text-text-tertiary text-center py-6">
          Pas assez de données pour générer un AGP représentatif (minimum 50 points sur {days}j).
        </p>
      ) : (
        <>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="rgba(0,0,0,0.04)" vertical={false} />
                <XAxis
                  dataKey="label"
                  type="category"
                  ticks={["00:00", "04:00", "08:00", "12:00", "16:00", "20:00"]}
                  interval={0}
                  tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[40, yMax]}
                  ticks={[70, 140, 180, 250]}
                  tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  width={40}
                />

                {/* Zone cible 70-180 en fond vert */}
                <ReferenceArea
                  y1={70}
                  y2={180}
                  fill="var(--success)"
                  fillOpacity={0.06}
                  stroke="none"
                />
                {/* Seuils 70 et 180 en pointillés */}
                <ReferenceLine
                  y={70}
                  stroke="var(--error)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
                <ReferenceLine
                  y={180}
                  stroke="var(--warning)"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />

                {/* Bande P10-P90 (gris large) */}
                <Area
                  type="monotone"
                  dataKey="band10_90"
                  fill="rgba(180,167,255,0.10)"
                  stroke="none"
                  isAnimationActive={false}
                  connectNulls
                />
                {/* Bande P25-P75 (gris plus dense) */}
                <Area
                  type="monotone"
                  dataKey="band25_75"
                  fill="rgba(180,167,255,0.22)"
                  stroke="none"
                  isAnimationActive={false}
                  connectNulls
                />
                {/* Médiane en ligne lime */}
                <Line
                  type="monotone"
                  dataKey="median"
                  stroke="var(--accent)"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />

                <Tooltip
                  cursor={{ stroke: "rgba(0,0,0,0.2)" }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as ChartRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="surface-2 rounded-lg px-3 py-2 border border-border-subtle text-xs space-y-0.5">
                        <p className="num font-semibold text-text-primary">{label}</p>
                        {row.median !== null && (
                          <p className="text-text-secondary">
                            Médiane : <span className="num text-diabete font-semibold">{row.median}</span> mg/dL
                          </p>
                        )}
                        {row.p25 !== null && row.p75 !== null && (
                          <p className="text-text-tertiary text-[11px]">
                            P25-P75 : <span className="num">{row.p25}-{row.p75}</span>
                          </p>
                        )}
                        {row.p10 !== null && row.p90 !== null && (
                          <p className="text-text-tertiary text-[11px]">
                            P10-P90 : <span className="num">{row.p10}-{row.p90}</span>
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-diabete" />
              Médiane
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: "rgba(180,167,255,0.22)" }}
              />
              P25-P75 (50% du temps)
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: "rgba(180,167,255,0.10)" }}
              />
              P10-P90 (80% du temps)
            </span>
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: "rgba(122,229,130,0.20)" }}
              />
              Cible 70-180
            </span>
          </div>
        </>
      )}
    </section>
  );
}
