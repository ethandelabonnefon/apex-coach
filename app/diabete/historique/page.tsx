"use client";

/**
 * /diabete/historique — vue long terme (7 / 14 / 30 / 90 jours).
 *
 * Lit depuis /api/glucose/archive (Vercel KV, alimenté par le cron 4h).
 *
 * 3 blocs :
 *  1. Stats récap (TIR, avg, CV, hypo/hyper counts)
 *  2. Pattern par heure (bar chart 24h — détecte les "je suis haut à 16h")
 *  3. Line chart de la période (zoomable visuellement via la période)
 *
 * Les injections insuline (store local) sont superposées en dots sur le line
 * chart pour lier cause (bolus) → effet (glycémie).
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  CartesianGrid,
  Scatter,
  ComposedChart,
} from "recharts";
import { useStore } from "@/lib/store";
import { GLUCOSE_THRESHOLDS } from "@/lib/libre-link/config";
import GlucoseCalendar from "@/components/glucose/GlucoseCalendar";
import AGPChart from "@/components/glucose/AGPChart";
import SportGlucoseCorrelation from "@/components/glucose/SportGlucoseCorrelation";
import { usePatternDetection } from "@/hooks/usePatternDetection";
import { isLearnable } from "@/lib/carbs-on-board";
import type { SportSession } from "@/lib/sport-glucose-analytics";
import {
  ArrowLeft,
  AlertTriangle,
  TrendingUp,
  Activity,
  Droplet,
  Syringe,
  Sparkles,
  CheckCircle2,
  Lightbulb,
  Loader2,
  RefreshCw,
  LayoutGrid,
  LineChart as LineIcon,
} from "lucide-react";

type ArchivePoint = {
  t: number;
  value: number;
  trend: string;
  isHigh: boolean;
  isLow: boolean;
};

type ArchiveResponse = {
  points: ArchivePoint[];
  range: { fromMs: number; toMs: number; days: number };
  meta: { total: number; latestTs: number | null; oldestTs: number | null };
  warning?: string;
};

type InsightSuggestion = {
  area: string;
  suggestion: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
};

type InsightOutput = {
  summary: string;
  highlights: string[];
  suggestions: InsightSuggestion[];
  warnings: string[];
  generatedAt: string;
};

const PERIODS = [
  { days: 7, label: "7j" },
  { days: 14, label: "14j" },
  { days: 30, label: "30j" },
  { days: 90, label: "90j" },
] as const;

// ───────────────────────────────────────────────────────────────────────
// Helpers stats
// ───────────────────────────────────────────────────────────────────────

function pct(n: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((n / total) * 100);
}

// Phase 11 Bloc 4 — GMI/GRI seuils sévères
const VLOW = 54;
const VHIGH = 250;

function stats(points: ArchivePoint[]) {
  if (points.length === 0) {
    return {
      count: 0,
      avg: 0,
      sd: 0,
      cv: 0,
      tirPct: 0,
      hypoPct: 0,
      lowPct: 0,
      highPct: 0,
      hyperPct: 0,
      hypoCount: 0,
      hyperCount: 0,
      gmi: 0,
      gri: 0,
    };
  }
  const values = points.map((p) => p.value);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
  const sd = Math.sqrt(variance);
  const cv = avg > 0 ? (sd / avg) * 100 : 0;

  let hypo = 0, low = 0, target = 0, high = 0, hyper = 0, vLow = 0, vHigh = 0;
  for (const v of values) {
    if (v < VLOW) vLow++;
    if (v < GLUCOSE_THRESHOLDS.hypo) hypo++;
    else if (v < GLUCOSE_THRESHOLDS.low) low++;
    else if (v <= GLUCOSE_THRESHOLDS.high) target++;
    else if (v <= GLUCOSE_THRESHOLDS.hyper) high++;
    else hyper++;
    if (v > VHIGH) vHigh++;
  }

  const total = values.length;
  const vLowPct = pct(vLow, total);
  const lowPct = pct(low, total);
  const highPct = pct(high, total);
  const vHighPct = pct(vHigh, total);

  // GMI ≈ HbA1c (Bergenstal et al. 2018)
  const gmi = 3.31 + 0.02392 * avg;
  // GRI (Klonoff et al. 2022), capé 0-100
  const griRaw = 3.0 * vLowPct + 2.4 * lowPct + 1.6 * vHighPct + 0.8 * highPct;
  const gri = Math.max(0, Math.min(100, Math.round(griRaw * 10) / 10));

  return {
    count: total,
    avg: Math.round(avg),
    sd: Math.round(sd),
    cv: Math.round(cv),
    tirPct: pct(target, total),
    hypoPct: pct(hypo, total),
    lowPct,
    highPct,
    hyperPct: pct(hyper, total),
    hypoCount: hypo,
    hyperCount: hyper,
    gmi: Math.round(gmi * 100) / 100,
    gri,
  };
}

/**
 * Agrège par heure du jour (0-23). Renvoie un array de 24 objets avec
 * { hour, avg, count, min, max }. Utilisé pour la bar chart pattern horaire.
 */
function aggregateByHour(points: ArchivePoint[]) {
  const buckets: { sum: number; count: number; min: number; max: number }[] =
    Array.from({ length: 24 }, () => ({ sum: 0, count: 0, min: Infinity, max: -Infinity }));

  for (const p of points) {
    const h = new Date(p.t).getHours();
    const b = buckets[h];
    b.sum += p.value;
    b.count += 1;
    if (p.value < b.min) b.min = p.value;
    if (p.value > b.max) b.max = p.value;
  }

  return buckets.map((b, h) => ({
    hour: h,
    hourLabel: `${String(h).padStart(2, "0")}h`,
    avg: b.count > 0 ? Math.round(b.sum / b.count) : null,
    count: b.count,
    min: b.count > 0 ? b.min : null,
    max: b.count > 0 ? b.max : null,
  }));
}

/** Couleur de la barre selon la zone glycémique moyenne. */
function barColor(avg: number | null): string {
  if (avg === null) return "var(--text-disabled)";
  if (avg < GLUCOSE_THRESHOLDS.hypo) return "var(--running)";
  if (avg < GLUCOSE_THRESHOLDS.low) return "var(--error)";
  if (avg <= GLUCOSE_THRESHOLDS.high) return "var(--success)";
  if (avg <= GLUCOSE_THRESHOLDS.hyper) return "var(--warning)";
  return "var(--running)";
}

function formatTick(t: number, days: number): string {
  const d = new Date(t);
  if (days <= 2) {
    return d
      .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
      .replace(":", "h");
  }
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

// ───────────────────────────────────────────────────────────────────────
// Page
// ───────────────────────────────────────────────────────────────────────

export default function DiabeteHistoriquePage() {
  const [days, setDays] = useState<number>(7);
  const [data, setData] = useState<ArchiveResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Phase 11 Bloc 4 — toggle Vue courbe vs Vue AGP pour la section line chart
  const [chartView, setChartView] = useState<"line" | "agp">("line");

  const insulinLogs = useStore((s) => s.insulinLogs);
  const diabetesConfig = useStore((s) => s.diabetesConfig);
  // Phase 11 Bloc 5 — sources de contexte enrichi pour le bilan IA
  const completedWorkouts = useStore((s) => s.completedWorkouts);
  const completedRunningSessions = useStore((s) => s.completedRunningSessions);
  const { patterns: detectedPatterns } = usePatternDetection({
    insulinLogs,
    diabetesConfig,
  });

  // Phase 11 Bloc 6 — sessions sport mappées en SportSession[] pour la
  // corrélation glucose. Filtrées à la fenêtre courante.
  const muscuSportSessions: SportSession[] = useMemo(() => {
    const fromMs = Date.now() - days * 24 * 60 * 60 * 1000;
    return completedWorkouts
      .filter((w) => new Date(w.date).getTime() >= fromMs)
      .map((w) => ({
        date: w.date,
        type: "muscu" as const,
        durationMin: Math.round(w.duration ?? 60),
      }));
  }, [completedWorkouts, days]);

  const runningSportSessions: SportSession[] = useMemo(() => {
    const fromMs = Date.now() - days * 24 * 60 * 60 * 1000;
    return completedRunningSessions
      .filter((r) => new Date(r.date).getTime() >= fromMs)
      .map((r) => ({
        date: r.date,
        type: "running" as const,
        durationMin: Math.round(r.actualDuration ?? 45),
        // Phase C — passe les checkpoints réels pour enrichissement prioritaire
        glucoseCheckpoints: r.glucoseCheckpoints,
      }));
  }, [completedRunningSessions, days]);

  // ─── État Bilan IA (Phase 10c) ────────────────────────────────────────
  const [insight, setInsight] = useState<InsightOutput | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const [insightError, setInsightError] = useState<string | null>(null);

  const activeProfileName = useMemo(() => {
    const active = diabetesConfig.profiles?.find(
      (p) => p.id === diabetesConfig.activeProfileId,
    );
    return active?.name ?? "Par défaut";
  }, [diabetesConfig]);

  const generateInsight = async () => {
    setInsightLoading(true);
    setInsightError(null);
    setInsight(null);
    try {
      // Phase 11 Bloc 5 — préparer le contexte enrichi
      const fromMs = Date.now() - days * 24 * 60 * 60 * 1000;

      // Workouts dans la fenêtre (muscu + running)
      const workoutSessions = [
        ...completedWorkouts
          .filter((w) => new Date(w.date).getTime() >= fromMs)
          .map((w) => ({
            date: w.date,
            type: "muscu" as const,
            durationMin: Math.round(w.duration ?? 60),
          })),
        ...completedRunningSessions
          .filter((r) => new Date(r.date).getTime() >= fromMs)
          .map((r) => ({
            date: r.date,
            type: "running" as const,
            durationMin: Math.round(r.actualDuration ?? 45),
          })),
      ];

      // Meal context — injections taguées avec leurs macros
      const mealContext = insulinLogs
        .filter((log) => {
          const t = new Date(log.injectedAt).getTime();
          return t >= fromMs && !log.isSplitDose;
        })
        .map((log) => ({
          mealType: log.mealType,
          mealTag: log.mealTag,
          mealSize: log.mealSize,
          carbsGrams: log.carbsGrams,
          fatGrams: log.fatGrams,
          proteinGrams: log.proteinGrams,
          injectedAt:
            log.injectedAt instanceof Date
              ? log.injectedAt.toISOString()
              : new Date(log.injectedAt).toISOString(),
          glucoseBefore: log.glucoseBefore,
        }));

      const res = await fetch("/api/diabete/weekly-insight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          days,
          injections: insulinLogs.filter(isLearnable),
          profiles: (diabetesConfig.profiles ?? []).map((p) => ({
            id: p.id,
            name: p.name,
          })),
          activeProfileName,
          // Phase 11 Bloc 5
          detectedPatterns: detectedPatterns.map((p) => ({
            type: p.type,
            severity: p.severity,
            title: p.title,
            message: p.message,
            occurrences: p.occurrences,
            timeWindow: p.timeWindow,
            suggestion: p.suggestion,
          })),
          workoutSessions,
          mealContext,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (!json.insight) {
        throw new Error("Réponse sans insight");
      }
      setInsight(json.insight as InsightOutput);
    } catch (err) {
      setInsightError(err instanceof Error ? err.message : "fetch failed");
    } finally {
      setInsightLoading(false);
    }
  };

  // Reset l'insight si on change de période
  useEffect(() => {
    setInsight(null);
    setInsightError(null);
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/glucose/archive?days=${days}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ArchiveResponse>;
      })
      .then((json) => {
        if (!cancelled) {
          setData(json);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "fetch failed");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [days]);

  const points = data?.points ?? [];
  const overallStats = useMemo(() => stats(points), [points]);
  const hourlyPattern = useMemo(() => aggregateByHour(points), [points]);

  // Injections dans la même fenêtre (depuis le store local)
  const injectionsInRange = useMemo(() => {
    if (!data) return [];
    const { fromMs, toMs } = data.range;
    return insulinLogs
      .map((log) => {
        const t = log.injectedAt instanceof Date
          ? log.injectedAt.getTime()
          : new Date(log.injectedAt).getTime();
        return { t, units: log.units, mealType: log.mealType, carbs: log.carbsGrams };
      })
      .filter((i) => i.t >= fromMs && i.t <= toMs)
      .sort((a, b) => a.t - b.t);
  }, [insulinLogs, data]);

  // Chart data — échantillonnage : pour 30j/90j, on moyenne à l'heure pour éviter
  // de surcharger Recharts (30j × 96 pts = 2880 pts = laggy sur mobile).
  const lineChartData = useMemo(() => {
    if (points.length === 0) return [];
    if (days <= 14) {
      return points.map((p) => ({ t: p.t, value: p.value, label: formatTick(p.t, days) }));
    }
    // Bucketize par heure pour 30/90j
    const hourMs = 60 * 60 * 1000;
    const map = new Map<number, { sum: number; count: number }>();
    for (const p of points) {
      const bucket = Math.floor(p.t / hourMs) * hourMs;
      const existing = map.get(bucket) ?? { sum: 0, count: 0 };
      existing.sum += p.value;
      existing.count += 1;
      map.set(bucket, existing);
    }
    return Array.from(map.entries())
      .map(([t, { sum, count }]) => ({
        t,
        value: Math.round(sum / count),
        label: formatTick(t, days),
      }))
      .sort((a, b) => a.t - b.t);
  }, [points, days]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto pb-32 stagger">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="label">Diabète · Historique</p>
          <h1 className="mt-1 text-2xl font-semibold text-text-primary">
            Historique glycémie
          </h1>
          <p className="text-xs text-text-tertiary mt-1">
            Données archivées toutes les 4h — rétention 90 jours.
          </p>
        </div>
        <Link
          href="/diabete"
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors px-3 py-1.5 rounded-lg border border-border-subtle tap-scale"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Retour
        </Link>
      </div>

      {/* Sélecteur de période */}
      <div className="mb-4 flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p.days}
            onClick={() => setDays(p.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all tap-scale ${
              days === p.days
                ? "bg-diabete/15 border-diabete/40 text-diabete"
                : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-diabete/30 hover:text-text-primary"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Warning (KV absent, etc.) */}
      {data?.warning && (
        <div className="mb-4 rounded-xl bg-warning/10 border border-warning/25 p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <p className="text-xs text-text-secondary">{data.warning}</p>
        </div>
      )}

      {/* ─── Bilan IA (Phase 10c) ────────────────────────────────────── */}
      <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <Sparkles className="w-4 h-4 text-accent-2 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-text-primary">
                Bilan IA · {days}j
              </h2>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                Analyse de ta glycémie + injections par Claude — suggestions
                à valider avec ton diabéto.
              </p>
            </div>
          </div>
          <button
            onClick={generateInsight}
            disabled={insightLoading || overallStats.count === 0}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-accent-2/15 border border-accent-2/40 text-accent-2 hover:bg-accent-2/25 disabled:opacity-50 disabled:cursor-not-allowed tap-scale flex-shrink-0"
          >
            {insightLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Analyse…
              </>
            ) : insight ? (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                Régénérer
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                Générer
              </>
            )}
          </button>
        </div>

        {!insight && !insightLoading && !insightError && (
          <div className="rounded-xl bg-bg-tertiary border border-border-subtle p-4 text-center">
            <Lightbulb className="w-5 h-5 text-text-tertiary mx-auto mb-1.5" />
            <p className="text-xs text-text-secondary">
              Clique sur <span className="text-accent-2 font-medium">Générer</span> pour
              que Claude analyse tes {days}{" "}derniers jours.
            </p>
            <p className="text-[10px] text-text-tertiary mt-1">
              Profil actif : <span className="text-text-secondary">{activeProfileName}</span>
            </p>
          </div>
        )}

        {insightLoading && (
          <div className="rounded-xl bg-bg-tertiary border border-border-subtle p-6 text-center">
            <Loader2 className="w-5 h-5 text-accent-2 animate-spin mx-auto mb-2" />
            <p className="text-xs text-text-secondary">
              Claude lit tes patterns…
            </p>
            <p className="text-[10px] text-text-tertiary mt-1">
              ~10-20 secondes
            </p>
          </div>
        )}

        {insightError && (
          <div className="rounded-xl bg-error/10 border border-error/25 p-4 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-error flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs text-error font-medium">Échec génération</p>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                {insightError}
              </p>
            </div>
          </div>
        )}

        {insight && !insightLoading && (
          <div className="space-y-3">
            {/* Summary */}
            <div className="rounded-xl bg-accent-2/10 border border-accent-2/25 p-4">
              <p className="text-sm text-text-primary leading-relaxed">
                {insight.summary}
              </p>
            </div>

            {/* Warnings */}
            {insight.warnings.length > 0 && (
              <div className="space-y-2">
                {insight.warnings.map((w, i) => (
                  <div
                    key={i}
                    className="rounded-xl bg-warning/10 border border-warning/25 p-3 flex items-start gap-2"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 text-warning flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-text-secondary leading-relaxed">{w}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Highlights */}
            {insight.highlights.length > 0 && (
              <div>
                <p className="label mb-2">Observations</p>
                <ul className="space-y-1.5">
                  {insight.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-3.5 h-3.5 text-success flex-shrink-0 mt-0.5" />
                      <span className="text-xs text-text-secondary leading-relaxed">{h}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Suggestions */}
            {insight.suggestions.length > 0 && (
              <div>
                <p className="label mb-2">Suggestions à valider</p>
                <div className="space-y-2">
                  {insight.suggestions.map((s, i) => (
                    <div
                      key={i}
                      className="rounded-xl bg-bg-tertiary border border-border-subtle p-3"
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="label text-[9px] text-accent-2">
                          {s.area}
                        </span>
                        <span
                          className={`text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            s.confidence === "high"
                              ? "bg-success/15 text-success"
                              : s.confidence === "medium"
                                ? "bg-warning/15 text-warning"
                                : "bg-text-tertiary/15 text-text-tertiary"
                          }`}
                        >
                          {s.confidence === "high"
                            ? "Forte"
                            : s.confidence === "medium"
                              ? "Modérée"
                              : "Faible"}
                        </span>
                      </div>
                      <p className="text-xs text-text-primary leading-relaxed font-medium">
                        {s.suggestion}
                      </p>
                      <p className="text-[11px] text-text-tertiary leading-relaxed mt-1">
                        {s.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[9px] text-text-tertiary text-center pt-1">
              Généré le{" "}
              {new Date(insight.generatedAt).toLocaleString("fr-FR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              · ces suggestions sont indicatives, valide-les avec ton diabéto.
            </p>
          </div>
        )}
      </section>
      {/* ──────────────────────────────────────────────────────────────── */}

      {/* Stats récap */}
      {loading ? (
        <div className="surface-1 rounded-3xl p-6 mb-4 animate-pulse">
          <div className="h-16 bg-bg-tertiary rounded-xl" />
        </div>
      ) : error ? (
        <div className="surface-1 rounded-3xl p-6 mb-4 text-center">
          <p className="text-sm text-error">Erreur chargement : {error}</p>
        </div>
      ) : overallStats.count === 0 ? (
        <div className="surface-1 rounded-3xl p-6 mb-4 text-center">
          <Droplet className="w-8 h-8 text-text-tertiary mx-auto mb-2" />
          <p className="text-sm text-text-secondary font-medium">Pas encore de données</p>
          <p className="text-xs text-text-tertiary mt-1">
            Le cron d&apos;archivage s&apos;exécute toutes les 4h. Reviens bientôt !
          </p>
        </div>
      ) : (
        <>
          {/* Stats en grille */}
          <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
            <p className="label mb-3">Vue d&apos;ensemble · {days}j</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
              <StatTile
                label="Moyenne"
                value={`${overallStats.avg}`}
                unit="mg/dL"
                hint={`±${overallStats.sd}`}
                tone="diabete"
              />
              <StatTile
                label="Time in Range"
                value={`${overallStats.tirPct}`}
                unit="%"
                hint={`${overallStats.count} pts`}
                tone={overallStats.tirPct >= 70 ? "success" : overallStats.tirPct >= 50 ? "warning" : "error"}
              />
              <StatTile
                label="Variabilité"
                value={`${overallStats.cv}`}
                unit="% CV"
                hint={overallStats.cv <= 36 ? "stable" : "variable"}
                tone={overallStats.cv <= 36 ? "success" : "warning"}
              />
              <StatTile
                label="Hypos / Hypers"
                value={`${overallStats.hypoCount}/${overallStats.hyperCount}`}
                unit=""
                hint={`${overallStats.hypoPct}% / ${overallStats.hyperPct}%`}
                tone={overallStats.hypoCount + overallStats.hyperCount > 0 ? "warning" : "success"}
              />
            </div>

            {/* Phase 11 Bloc 4 — Métriques cliniques (GMI + GRI) */}
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-3">
              <StatTile
                label="GMI"
                value={overallStats.gmi.toFixed(1).replace(".", ",")}
                unit="%"
                hint="≈ HbA1c estimée"
                tone={overallStats.gmi < 7 ? "success" : overallStats.gmi < 8 ? "warning" : "error"}
              />
              <StatTile
                label="GRI"
                value={`${Math.round(overallStats.gri)}`}
                unit="/ 100"
                hint={
                  overallStats.gri < 20
                    ? "Zone A · excellent"
                    : overallStats.gri < 40
                    ? "Zone B · bon"
                    : overallStats.gri < 60
                    ? "Zone C · à améliorer"
                    : overallStats.gri < 80
                    ? "Zone D · mauvais"
                    : "Zone E · très mauvais"
                }
                tone={
                  overallStats.gri < 20
                    ? "success"
                    : overallStats.gri < 60
                    ? "warning"
                    : "error"
                }
              />
            </div>

            {/* Barre répartition zones */}
            <div className="mt-5">
              <p className="label mb-2">Répartition temps par zone</p>
              <div className="flex rounded-lg overflow-hidden h-6 bg-bg-tertiary">
                {overallStats.hypoPct > 0 && (
                  <div
                    style={{ width: `${overallStats.hypoPct}%`, background: "var(--running)" }}
                    className="flex items-center justify-center"
                    title={`Hypo : ${overallStats.hypoPct}%`}
                  >
                    {overallStats.hypoPct >= 5 && (
                      <span className="num text-[10px] text-ink font-semibold">{overallStats.hypoPct}%</span>
                    )}
                  </div>
                )}
                {overallStats.lowPct > 0 && (
                  <div
                    style={{ width: `${overallStats.lowPct}%`, background: "var(--error)" }}
                    title={`Low : ${overallStats.lowPct}%`}
                  />
                )}
                {overallStats.tirPct > 0 && (
                  <div
                    style={{ width: `${overallStats.tirPct}%`, background: "var(--success)" }}
                    className="flex items-center justify-center"
                    title={`Cible : ${overallStats.tirPct}%`}
                  >
                    {overallStats.tirPct >= 10 && (
                      <span className="num text-[10px] text-ink font-semibold">{overallStats.tirPct}%</span>
                    )}
                  </div>
                )}
                {overallStats.highPct > 0 && (
                  <div
                    style={{ width: `${overallStats.highPct}%`, background: "var(--warning)" }}
                    className="flex items-center justify-center"
                    title={`High : ${overallStats.highPct}%`}
                  >
                    {overallStats.highPct >= 10 && (
                      <span className="num text-[10px] text-ink font-semibold">{overallStats.highPct}%</span>
                    )}
                  </div>
                )}
                {overallStats.hyperPct > 0 && (
                  <div
                    style={{ width: `${overallStats.hyperPct}%`, background: "var(--running)" }}
                    title={`Hyper : ${overallStats.hyperPct}%`}
                  />
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-tertiary">
                <span><span className="inline-block w-2 h-2 rounded-sm bg-[var(--running)] mr-1" />Hypo &lt;70</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-[var(--error)] mr-1" />Low 70-80</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-[var(--success)] mr-1" />Cible 80-180</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-[var(--warning)] mr-1" />High 180-250</span>
                <span><span className="inline-block w-2 h-2 rounded-sm bg-[var(--running)] mr-1" />Hyper &gt;250</span>
              </div>
            </div>
          </section>

          {/* Phase 11 Bloc 4.3 — Calendrier 30j */}
          <GlucoseCalendar points={data?.points ?? []} days={Math.min(30, days)} />

          {/* Phase 11 Bloc 6 — Corrélation sport ↔ glycémie */}
          <SportGlucoseCorrelation
            muscuSessions={muscuSportSessions}
            runningSessions={runningSportSessions}
            archivePoints={data?.points ?? []}
          />

          {/* Pattern par heure (bar chart 24h) */}
          <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-diabete" />
              <h2 className="text-base font-semibold text-text-primary">Pattern par heure du jour</h2>
            </div>
            <p className="text-xs text-text-tertiary mb-4">
              Moyenne glycémique à chaque heure — identifie tes heures à risque.
            </p>
            <div className="w-full h-56 sm:h-64">
              <ResponsiveContainer>
                <BarChart data={hourlyPattern} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis
                    dataKey="hourLabel"
                    stroke="var(--text-tertiary)"
                    tick={{ fontSize: 10 }}
                    interval={2}
                  />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    tick={{ fontSize: 10 }}
                    domain={[40, 300]}
                    ticks={[70, 140, 180, 250]}
                  />
                  <ReferenceLine y={70} stroke="var(--error)" strokeDasharray="3 3" />
                  <ReferenceLine y={180} stroke="var(--warning)" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-elevated)",
                      border: "1px solid rgba(0,0,0,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(v) => [`${v} mg/dL`, "Moyenne"]}
                    labelFormatter={(l) => `${l} — ${hourlyPattern.find((h) => h.hourLabel === l)?.count ?? 0} mesures`}
                  />
                  <Bar dataKey="avg" radius={[4, 4, 0, 0]}>
                    {hourlyPattern.map((h) => (
                      <rect key={h.hour} fill={barColor(h.avg)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* Top 3 heures à risque */}
            {(() => {
              const risky = [...hourlyPattern]
                .filter((h) => h.avg !== null && h.count >= 2)
                .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0))
                .slice(0, 3);
              if (risky.length === 0) return null;
              return (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="text-[10px] text-text-tertiary uppercase tracking-wide">Heures les + hautes :</span>
                  {risky.map((h) => (
                    <span
                      key={h.hour}
                      className="num text-xs px-2 py-0.5 rounded-md"
                      style={{
                        background: `${barColor(h.avg)}20`,
                        color: barColor(h.avg),
                      }}
                    >
                      {h.hourLabel} · {h.avg}
                    </span>
                  ))}
                </div>
              );
            })()}
          </section>

          {/* Toggle Vue courbe / Vue AGP (Phase 11 Bloc 4.4) */}
          {chartView === "agp" ? (
            <>
              <div className="flex items-center justify-end mb-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => setChartView("line")}
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-border-subtle text-text-secondary hover:text-diabete hover:border-diabete/40 transition-colors tap-scale"
                >
                  <LineIcon className="w-3 h-3" />
                  Vue courbe
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-diabete/40 bg-diabete/10 text-diabete tap-scale"
                  disabled
                >
                  <LayoutGrid className="w-3 h-3" />
                  Vue AGP
                </button>
              </div>
              <AGPChart points={data?.points ?? []} days={Math.min(14, days)} />
            </>
          ) : (
          <>
          {/* Line chart de la période */}
          <section className="surface-1 rounded-3xl p-5 sm:p-6 mb-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-diabete" />
                <h2 className="text-base font-semibold text-text-primary">Courbe {days}j</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-diabete/40 bg-diabete/10 text-diabete tap-scale"
                    disabled
                  >
                    <LineIcon className="w-3 h-3" />
                    Courbe
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartView("agp")}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-md border border-border-subtle text-text-secondary hover:text-diabete hover:border-diabete/40 transition-colors tap-scale"
                  >
                    <LayoutGrid className="w-3 h-3" />
                    AGP
                  </button>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-text-tertiary">
                  <Syringe className="w-3 h-3 text-accent-2" />
                  <span>{injectionsInRange.length} injections</span>
                </div>
              </div>
            </div>
            <div className="w-full h-64 sm:h-80">
              <ResponsiveContainer>
                <ComposedChart
                  data={lineChartData}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                  <XAxis
                    dataKey="t"
                    type="number"
                    domain={["dataMin", "dataMax"]}
                    stroke="var(--text-tertiary)"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(t) => formatTick(t, days)}
                  />
                  <YAxis
                    stroke="var(--text-tertiary)"
                    tick={{ fontSize: 10 }}
                    domain={[40, 300]}
                    ticks={[70, 140, 180, 250]}
                  />
                  <ReferenceArea y1={80} y2={180} fill="var(--success)" fillOpacity={0.05} />
                  <ReferenceLine y={70} stroke="var(--error)" strokeDasharray="3 3" />
                  <ReferenceLine y={180} stroke="var(--warning)" strokeDasharray="3 3" />
                  <Tooltip
                    contentStyle={{
                      background: "var(--bg-elevated)",
                      border: "1px solid rgba(0,0,0,0.1)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    labelFormatter={(t) => {
                      const d = new Date(t as number);
                      return d.toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                    }}
                    formatter={(v, name) => {
                      if (name === "value") return [`${v} mg/dL`, "Glycémie"];
                      return [v, name];
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "var(--accent)" }}
                    isAnimationActive={false}
                  />
                  {/* Overlay injections */}
                  <Scatter
                    data={injectionsInRange.map((i) => ({ t: i.t, value: 60, units: i.units }))}
                    fill="var(--diabete)"
                    shape="triangle"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-text-tertiary mt-2 flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-3 h-0.5 bg-diabete" />
                Glycémie
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block w-2 h-2 rotate-45 bg-accent-2" />
                Injection
              </span>
              {days > 14 && (
                <span className="text-text-tertiary italic">
                  · points moyennés à l&apos;heure pour fluidité
                </span>
              )}
            </p>
          </section>
          </>
          )}

          {/* Meta debug */}
          {data?.meta && (
            <p className="text-[10px] text-text-tertiary text-center">
              Archive : {data.meta.total} points · dernier archivage{" "}
              {data.meta.latestTs
                ? new Date(data.meta.latestTs).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "—"}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ─── Tuile stat mini ────────────────────────────────────────────────────
function StatTile({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  hint?: string;
  tone: "diabete" | "success" | "warning" | "error";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "warning"
        ? "text-warning"
        : tone === "error"
          ? "text-error"
          : "text-diabete";

  return (
    <div className="surface-2 rounded-2xl p-3 sm:p-4">
      <p className="label text-[9px]">{label}</p>
      <div className="mt-1 flex items-baseline gap-1">
        <span className={`num text-2xl sm:text-3xl font-semibold ${toneClass}`}>{value}</span>
        {unit && <span className="text-[10px] text-text-tertiary">{unit}</span>}
      </div>
      {hint && <p className="text-[10px] text-text-tertiary mt-0.5">{hint}</p>}
    </div>
  );
}
