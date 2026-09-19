"use client";

/**
 * GlucoseCalendar — heatmap calendrier 30j (Phase 11 Bloc 4.3).
 *
 * Affiche une grille calendrier des 30 derniers jours, chaque case colorée
 * selon le score quotidien (0-100). Tooltip au tap avec TIR%, moyenne, CV%
 * et nombre d'hypos.
 *
 * Le score est calculé client-side depuis les points archive fournis en prop.
 * Pas de fetch interne — la page parent passe `points` (déjà fetché pour les
 * autres viz).
 */

import { useMemo, useState } from "react";
import { buildDailyScores, type DailyScore } from "@/lib/glucose-archive/analytics";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import { CalendarDays, X } from "lucide-react";

const DAYS_PER_WEEK = 7;
const ROWS = 5; // 35 cases > 30 jours, on affiche les 30 derniers seulement

function scoreColor(score: number | null): string {
  if (score === null) return "rgba(0,0,0,0.04)"; // jour vide / data insuffisante
  if (score >= 80) return "var(--success)";  // vert success
  if (score >= 60) return "var(--accent)";  // lime
  if (score >= 40) return "var(--warning)";  // orange warning
  return "var(--error)";                    // rouge error
}

function scoreToneLabel(score: number | null): string {
  if (score === null) return "—";
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Bon";
  if (score >= 40) return "Moyen";
  return "À améliorer";
}

function dayLabel(d: Date): string {
  // 1er du mois → afficher le mois, sinon juste le n°
  const day = d.getDate();
  if (day === 1) {
    return d.toLocaleDateString("fr-FR", { month: "short" }).replace(".", "");
  }
  return String(day);
}

interface GlucoseCalendarProps {
  points: ArchivedPoint[];
  /** Nombre de jours à afficher (default 30). */
  days?: number;
}

export default function GlucoseCalendar({ points, days = 30 }: GlucoseCalendarProps) {
  const [selected, setSelected] = useState<DailyScore | null>(null);

  // Filtre sur la fenêtre demandée
  const scores = useMemo(() => {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const filtered = points.filter((p) => p.t >= cutoff);
    return buildDailyScores(filtered);
  }, [points, days]);

  const scoresByDate = useMemo(() => {
    const map = new Map<string, DailyScore>();
    for (const s of scores) map.set(s.date, s);
    return map;
  }, [scores]);

  // Construire la grille : 30 derniers jours, du plus ancien au plus récent
  const grid = useMemo(() => {
    const cells: { date: string; dayLabel: string; weekday: number; score: DailyScore | null }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      cells.push({
        date: key,
        dayLabel: dayLabel(d),
        weekday: (d.getDay() + 6) % 7, // lundi = 0
        score: scoresByDate.get(key) ?? null,
      });
    }
    return cells;
  }, [scoresByDate, days]);

  // Si aucun jour avec score, on n'affiche rien
  const hasData = scores.some((s) => s.score !== null);

  return (
    <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-diabete" />
          <h2 className="text-base font-semibold text-text-primary">
            Calendrier {days}j
          </h2>
        </div>
        <span className="num text-[10px] text-text-tertiary uppercase tracking-wide">
          score quotidien
        </span>
      </div>

      {!hasData ? (
        <p className="text-xs text-text-tertiary text-center py-6">
          Pas assez de données archivées pour calculer le score quotidien (minimum 6h par jour).
        </p>
      ) : (
        <>
          {/* Header jours de la semaine */}
          <div className="grid grid-cols-7 gap-1.5 mb-2">
            {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
              <div
                key={i}
                className="text-[10px] text-text-tertiary text-center font-medium uppercase"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Grille calendrier */}
          <div className="grid grid-cols-7 gap-1.5">
            {/* Padding initial pour aligner sur le bon jour de la semaine */}
            {Array.from({ length: grid[0]?.weekday ?? 0 }).map((_, i) => (
              <div key={`pad-${i}`} className="aspect-square" />
            ))}
            {grid.map((cell) => {
              const sc = cell.score;
              const color = scoreColor(sc?.score ?? null);
              const isActive = selected?.date === cell.date;
              return (
                <button
                  key={cell.date}
                  type="button"
                  onClick={() => sc && sc.score !== null && setSelected(isActive ? null : sc)}
                  disabled={!sc || sc.score === null}
                  className={`aspect-square rounded-md flex items-center justify-center text-[10px] font-semibold tap-scale transition-all ${
                    isActive ? "ring-2 ring-diabete ring-offset-1 ring-offset-bg-secondary" : ""
                  } ${sc?.score !== null && sc?.score !== undefined ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
                  style={{
                    background: color,
                    color: sc?.score && sc.score >= 60 ? "#000" : "rgba(0,0,0,0.6)",
                  }}
                  title={sc?.score !== null ? `${cell.date} · score ${sc?.score}` : `${cell.date} · pas de data`}
                >
                  {cell.dayLabel}
                </button>
              );
            })}
            {/* Padding final pour compléter la grille */}
            {Array.from({
              length: Math.max(0, ROWS * DAYS_PER_WEEK - (grid[0]?.weekday ?? 0) - grid.length),
            }).map((_, i) => (
              <div key={`tail-${i}`} className="aspect-square" />
            ))}
          </div>

          {/* Légende */}
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--success)" }} />
              ≥80 excellent
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--accent)" }} />
              60-80 bon
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--warning)" }} />
              40-60 moyen
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: "var(--error)" }} />
              &lt;40 à améliorer
            </span>
          </div>

          {/* Tooltip jour sélectionné */}
          {selected && (
            <div className="mt-4 surface-2 rounded-xl p-4 animate-slide-up relative">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="absolute top-2 right-2 p-1.5 rounded-md text-text-tertiary hover:text-text-primary transition-colors tap-scale"
                aria-label="Fermer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <div className="flex items-baseline gap-3 mb-2">
                <span className="num text-2xl font-semibold" style={{ color: scoreColor(selected.score) }}>
                  {selected.score}
                </span>
                <span className="text-xs text-text-tertiary">/ 100</span>
                <Badge tone={selected.score && selected.score >= 60 ? "ok" : "warn"}>
                  {scoreToneLabel(selected.score)}
                </Badge>
              </div>
              <p className="text-xs text-text-secondary mb-3">
                {new Date(selected.startMs).toLocaleDateString("fr-FR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                })}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <Mini label="Moyenne" value={selected.avg !== null ? `${selected.avg} mg/dL` : "—"} />
                <Mini label="TIR" value={`${selected.tirPct}%`} />
                <Mini label="CV" value={selected.cv !== null ? `${Math.round(selected.cv)}%` : "—"} />
                <Mini label="Hypos" value={`${selected.hypoCount}`} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-tertiary rounded-lg px-2.5 py-2">
      <p className="text-[9px] text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className="num text-sm font-semibold text-text-primary mt-0.5">{value}</p>
    </div>
  );
}

function Badge({ tone, children }: { tone: "ok" | "warn"; children: React.ReactNode }) {
  return (
    <span
      className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold ${
        tone === "ok"
          ? "bg-success/15 text-success"
          : "bg-warning/15 text-warning"
      }`}
    >
      {children}
    </span>
  );
}
