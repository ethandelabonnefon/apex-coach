"use client";

/**
 * GlucosePredictionChart — prédiction glycémique 8h (Étape 5f).
 *
 * POST le contexte du store (glycémie live + tendance, injections, split en
 * attente, séance récente) vers `/api/diabete/predict`, qui lit l'archive KV
 * pour la dérive basale + dawn perso et renvoie la courbe via le moteur pur
 * `predictGlucoseCurve`. On NE recalcule rien côté UI — on affiche.
 *
 * Design aligné sur GlucoseChart : bandes hypo/cible/hyper, seuils 70/180,
 * gradient lavender (diabete), tooltip, badges de fiabilité.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  Activity,
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Info,
  RefreshCw,
  Plus,
  Trash2,
  Apple,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { useGlucose } from "@/hooks/useGlucose";
import { useWhoop } from "@/hooks/useWhoop";
import { GLUCOSE_THRESHOLDS } from "@/lib/libre-link/config";
import { trendStringToNumber } from "@/lib/libre-link/utils";
import { resolveRecentExercise } from "@/lib/exercise-insulin-adjustment";

interface PredictionPoint {
  minute: number;
  at: number;
  value: number;
}
interface GlucoseAlert {
  type: "hypo" | "hyper";
  minute: number;
  hourLabel: string;
  value: number;
}
interface PredictionResponse {
  prediction: {
    curve: PredictionPoint[];
    min: PredictionPoint;
    max: PredictionPoint;
    alerts: GlucoseAlert[];
    unreliableTooFresh: boolean;
  };
  meta: {
    personalized: boolean;
    driftPerHour: number;
    driftConfidence: "low" | "medium" | "high";
    eventsUsed: number;
    archivePoints: number;
    generatedAt: string;
  };
}

function formatTick(t: number): string {
  return new Date(t)
    .toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
    .replace(":", "h");
}

const EIGHT_HOURS_MS = 8 * 3_600_000;
const SIX_HOURS_MS = 6 * 3_600_000;

/** "HH:MM" de l'instant courant (pour pré-remplir le champ heure). */
function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Convertit une heure "HH:MM" en ISO aujourd'hui ; si l'heure est dans le
 *  futur (oubli de la veille), on recule d'un jour. Vide → maintenant. */
function hhmmToISO(hhmm: string): string {
  if (!hhmm) return new Date().toISOString();
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return new Date().toISOString();
  const d = new Date();
  d.setHours(h, m, 0, 0);
  if (d.getTime() > Date.now() + 60_000) d.setDate(d.getDate() - 1);
  return d.toISOString();
}

export default function GlucosePredictionChart() {
  const { current } = useGlucose({ mode: "current" });
  const whoop = useWhoop();

  const insulinLogs = useStore((s) => s.insulinLogs);
  const glucoseReadings = useStore((s) => s.glucoseReadings);
  const diabetesConfig = useStore((s) => s.diabetesConfig);
  const splitDoseReminders = useStore((s) => s.splitDoseReminders);
  const completedWorkouts = useStore((s) => s.completedWorkouts);
  const completedRunningSessions = useStore((s) => s.completedRunningSessions);
  const carbEntries = useStore((s) => s.carbEntries);
  const addCarbEntry = useStore((s) => s.addCarbEntry);
  const removeCarbEntry = useStore((s) => s.removeCarbEntry);

  // Formulaire "glucides sans insuline"
  const [showCarbForm, setShowCarbForm] = useState(false);
  const [carbLabel, setCarbLabel] = useState("");
  const [carbG, setCarbG] = useState("");
  const [carbProt, setCarbProt] = useState("");
  const [carbFat, setCarbFat] = useState("");
  const [carbTime, setCarbTime] = useState(""); // "HH:MM" — heure d'ingestion

  const [data, setData] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Glycémie de référence : live FreeStyle, sinon dernière lecture manuelle.
  const currentGlucose = useMemo(() => {
    if (current?.value) return current.value;
    if (glucoseReadings.length) {
      const last = [...glucoseReadings].sort(
        (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
      )[0];
      return last?.value;
    }
    return undefined;
  }, [current, glucoseReadings]);

  const runPrediction = useCallback(async () => {
    if (currentGlucose === undefined) return;
    setLoading(true);
    setError(null);
    try {
      const now = Date.now();
      // Injections des dernières 8h (le serveur re-filtre la fenêtre active).
      const recentInjections = insulinLogs.filter((l) => {
        const t = new Date(l.injectedAt).getTime();
        return Number.isFinite(t) && now - t < EIGHT_HOURS_MS;
      });
      // Split en attente le plus proche (non dismissé), dans le futur.
      const upcomingSplit = splitDoseReminders
        .filter((r) => r.status === "pending")
        .map((r) => ({ units: r.units, minutesUntil: (new Date(r.triggerAt).getTime() - now) / 60_000 }))
        .filter((s) => s.minutesUntil > 0)
        .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
      // Glucides sans insuline (re-sucrage course, collation) des 8 dernières h.
      const recentCarbs = carbEntries.filter((e) => {
        const t = new Date(e.eatenAt).getTime();
        return Number.isFinite(t) && now - t < EIGHT_HOURS_MS;
      });
      // Sans insuline → montée pure (standaloneMeals). Avec insuline → événement.
      const standaloneMeals = recentCarbs
        .filter((e) => !(e.insulinUnits && e.insulinUnits > 0))
        .map((e) => ({
          carbsGrams: e.carbsGrams,
          fatGrams: e.fatGrams,
          proteinGrams: e.proteinGrams,
          eatenAtMs: new Date(e.eatenAt).getTime(),
        }));
      const carbInjections = recentCarbs
        .filter((e) => e.insulinUnits && e.insulinUnits > 0)
        .map((e) => ({
          id: e.id,
          units: e.insulinUnits!,
          insulinType: "rapide",
          mealType: "other",
          carbsGrams: e.carbsGrams,
          fatGrams: e.fatGrams,
          proteinGrams: e.proteinGrams,
          glucoseBefore: 0,
          notes: "glucides sans bolus complet",
          injectedAt: e.eatenAt,
        }));

      // Séance récente (Whoop-first sinon estimation) — réutilise la lib.
      const sport = resolveRecentExercise({
        nowMs: now,
        lastWhoopWorkout: whoop.connected ? whoop.snapshot?.lastWorkout ?? null : null,
        completedWorkouts: completedWorkouts.map((w) => ({ id: w.id, date: w.date, duration: w.duration })),
        completedRunningSessions: completedRunningSessions.map((r) => ({
          id: r.id,
          date: r.date,
          actualDuration: r.actualDuration,
          glucoseCheckpoints: r.glucoseCheckpoints,
        })),
      });

      const res = await fetch("/api/diabete/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentGlucose,
          trendArrow: trendStringToNumber(current?.trend),
          injections: [...recentInjections, ...carbInjections],
          standaloneMeals,
          pendingSplit: upcomingSplit,
          sport: sport ?? undefined,
          isf: diabetesConfig.insulinSensitivityFactor,
          ratios: diabetesConfig.ratios,
          insulinActiveDuration: diabetesConfig.insulinActiveDuration,
          targetRange: diabetesConfig.targetRange,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || `Erreur ${res.status}`);
      }
      setData((await res.json()) as PredictionResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Échec de la prédiction");
    } finally {
      setLoading(false);
    }
  }, [
    currentGlucose,
    current?.trend,
    insulinLogs,
    carbEntries,
    splitDoseReminders,
    completedWorkouts,
    completedRunningSessions,
    whoop.connected,
    whoop.snapshot,
    diabetesConfig,
  ]);

  // Calcul auto au mount + quand la glycémie de référence ou les glucides changent.
  useEffect(() => {
    runPrediction();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentGlucose, carbEntries]);

  const submitCarb = () => {
    const carbs = parseFloat(carbG.replace(",", "."));
    if (!Number.isFinite(carbs) || carbs <= 0) return;
    const prot = parseFloat(carbProt.replace(",", "."));
    const fat = parseFloat(carbFat.replace(",", "."));
    addCarbEntry({
      id: `carb-${Date.now()}`,
      label: carbLabel.trim() || undefined,
      carbsGrams: carbs,
      proteinGrams: Number.isFinite(prot) && prot > 0 ? prot : undefined,
      fatGrams: Number.isFinite(fat) && fat > 0 ? fat : undefined,
      insulinUnits: 0,
      eatenAt: hhmmToISO(carbTime),
    });
    setCarbLabel("");
    setCarbG("");
    setCarbProt("");
    setCarbFat("");
    setCarbTime("");
    setShowCarbForm(false);
  };

  const openCarbForm = () => {
    setCarbTime(nowHHMM()); // pré-rempli à maintenant, modifiable
    setShowCarbForm(true);
  };

  // Glucides sans insuline encore en digestion (< 4h) pour l'affichage.
  const activeCarbs = carbEntries.filter(
    (e) => Date.now() - new Date(e.eatenAt).getTime() < 4 * 3_600_000,
  );

  const chartData = data?.prediction.curve ?? [];

  const yDomain = useMemo<[number, number]>(() => {
    if (!chartData.length) return [40, 250];
    const values = chartData.map((p) => p.value);
    const lo = Math.min(60, Math.min(...values) - 10);
    const hi = Math.max(200, Math.max(...values) + 10);
    return [Math.max(40, Math.floor(lo / 10) * 10), Math.min(350, Math.ceil(hi / 10) * 10)];
  }, [chartData]);

  return (
    <section className="surface-1 rounded-3xl p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-diabete" />
          <h2 className="text-base font-semibold text-text-primary">Prédiction 8h</h2>
        </div>
        <button
          type="button"
          onClick={runPrediction}
          disabled={loading || currentGlucose === undefined}
          className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary disabled:opacity-40 tap-scale"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Calcul…" : "Recalculer"}
        </button>
      </div>

      {/* Glucides sans insuline (re-sucrage course, collation non bolussée) */}
      <div className="mb-4 rounded-2xl surface-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Apple className="w-4 h-4 text-diabete" />
            <span className="text-sm font-medium text-text-primary">Glucides sans insuline</span>
          </div>
          {!showCarbForm && (
            <button
              type="button"
              onClick={openCarbForm}
              className="flex items-center gap-1 text-xs text-accent-ink bg-accent rounded-full px-2.5 py-1 tap-scale"
            >
              <Plus className="w-3.5 h-3.5" /> Ajouter
            </button>
          )}
        </div>

        {/* Liste des glucides actifs (< 4h) */}
        {activeCarbs.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3">
            {activeCarbs.map((e) => {
              const min = Math.round((Date.now() - new Date(e.eatenAt).getTime()) / 60000);
              return (
                <div key={e.id} className="flex items-center justify-between text-xs bg-bg-secondary rounded-lg px-2.5 py-1.5">
                  <span className="text-text-secondary">
                    <span className="text-text-primary font-medium">{e.label || "Glucides"}</span>
                    {" · "}{e.carbsGrams}g gluc
                    {e.proteinGrams ? ` · ${e.proteinGrams}g prot` : ""}
                    {e.fatGrams ? ` · ${e.fatGrams}g lip` : ""}
                    {" · il y a "}{min}min
                  </span>
                  <button
                    type="button"
                    onClick={() => removeCarbEntry(e.id)}
                    className="text-text-tertiary hover:text-error tap-scale"
                    aria-label="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Formulaire d'ajout */}
        {showCarbForm && (
          <div className="mt-3 flex flex-col gap-2 animate-slide-up">
            <div className="flex gap-2">
              <input
                type="text"
                value={carbLabel}
                onChange={(e) => setCarbLabel(e.target.value)}
                placeholder="Aliment (ex: compote) — optionnel"
                className="flex-1 rounded-lg bg-bg-secondary border border-border-default px-3 py-2 text-sm text-text-primary placeholder:text-text-tertiary"
              />
              <label className="flex flex-col gap-1 shrink-0">
                <input
                  type="time"
                  value={carbTime}
                  onChange={(e) => setCarbTime(e.target.value)}
                  className="rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary"
                  aria-label="Heure d'ingestion"
                />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <label className="flex flex-col gap-1">
                <span className="label">Glucides (g)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={carbG}
                  onChange={(e) => setCarbG(e.target.value)}
                  placeholder="39"
                  className="w-full rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">Prot. (g)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={carbProt}
                  onChange={(e) => setCarbProt(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="label">Lip. (g)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={carbFat}
                  onChange={(e) => setCarbFat(e.target.value)}
                  placeholder="0"
                  className="w-full rounded-lg bg-bg-secondary border border-border-default px-2 py-2 text-sm num text-text-primary"
                />
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitCarb}
                disabled={!carbG}
                className="flex-1 rounded-lg bg-accent text-accent-ink text-sm font-medium py-2 disabled:opacity-40 tap-scale"
              >
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => setShowCarbForm(false)}
                className="rounded-lg bg-bg-secondary text-text-secondary text-sm px-4 py-2 tap-scale"
              >
                Annuler
              </button>
            </div>
            <p className="text-[10px] text-text-tertiary">
              Pour les glucides mangés sans faire d&apos;insuline (re-sucrage pendant une course, collation). Pris en compte comme une montée pure dans la prédiction.
            </p>
          </div>
        )}
      </div>

      {currentGlucose === undefined ? (
        <EmptyState
          title="Pas de glycémie disponible"
          description="Connecte LibreLink ou logge une glycémie pour lancer la prédiction."
        />
      ) : error ? (
        <EmptyState
          title="Prédiction indisponible"
          description={error}
          tone="warning"
        />
      ) : !data && loading ? (
        <div className="h-56 rounded-2xl skeleton" />
      ) : data ? (
        <>
          {/* Alertes projetées */}
          {data.prediction.alerts.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {data.prediction.alerts.map((a) => (
                <div
                  key={a.type}
                  className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                    a.type === "hypo"
                      ? "bg-error/10 text-error"
                      : "bg-warning/10 text-warning"
                  }`}
                >
                  {a.type === "hypo" ? (
                    <TrendingDown className="w-4 h-4 shrink-0" />
                  ) : (
                    <TrendingUp className="w-4 h-4 shrink-0" />
                  )}
                  <span>
                    {a.type === "hypo" ? "Hypo prévue" : "Hyper prévue"} ~{a.value} mg/dL à{" "}
                    {a.hourLabel} (dans {Math.round(a.minute / 60 * 10) / 10}h)
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Résumé min / max */}
          <div className="flex items-center gap-4 mb-3">
            <MiniStat label="Mini prévu" value={data.prediction.min.value} hour={formatTick(data.prediction.min.at)} tone={data.prediction.min.value < 70 ? "error" : data.prediction.min.value < 90 ? "warning" : "default"} />
            <MiniStat label="Maxi prévu" value={data.prediction.max.value} hour={formatTick(data.prediction.max.at)} tone={data.prediction.max.value > 250 ? "error" : data.prediction.max.value > 180 ? "warning" : "default"} />
          </div>

          {/* Courbe */}
          <div className="h-56 sm:h-64 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="predArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--diabete)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--diabete)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} strokeDasharray="2 4" />

                <ReferenceArea y1={yDomain[0]} y2={GLUCOSE_THRESHOLDS.hypo} fill="var(--error)" fillOpacity={0.08} stroke="none" />
                <ReferenceArea y1={GLUCOSE_THRESHOLDS.hypo} y2={GLUCOSE_THRESHOLDS.high} fill="var(--success)" fillOpacity={0.06} stroke="none" />
                <ReferenceArea y1={GLUCOSE_THRESHOLDS.high} y2={GLUCOSE_THRESHOLDS.hyper} fill="var(--warning)" fillOpacity={0.08} stroke="none" />
                <ReferenceArea y1={GLUCOSE_THRESHOLDS.hyper} y2={yDomain[1]} fill="var(--error)" fillOpacity={0.1} stroke="none" />

                <ReferenceLine y={GLUCOSE_THRESHOLDS.hypo} stroke="var(--error)" strokeOpacity={0.5} strokeDasharray="3 3" />
                <ReferenceLine y={GLUCOSE_THRESHOLDS.high} stroke="var(--warning)" strokeOpacity={0.5} strokeDasharray="3 3" />

                <XAxis
                  dataKey="at"
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
                  width={32}
                  stroke="rgba(255,255,255,0.08)"
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  labelFormatter={(t) => formatTick(t as number)}
                  formatter={(v) => [`${v} mg/dL`, "Prédit"]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="var(--diabete)"
                  strokeWidth={2}
                  fill="url(#predArea)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Badges fiabilité */}
          <div className="flex items-center gap-3 mt-3 flex-wrap text-[11px] text-text-tertiary">
            {data.prediction.unreliableTooFresh && (
              <span className="flex items-center gap-1 text-warning">
                <AlertTriangle className="w-3 h-3" /> Repas récent — prédiction encore instable
              </span>
            )}
            <span className="flex items-center gap-1">
              <Info className="w-3 h-3" />
              {data.meta.personalized
                ? `Personnalisé (dérive ${data.meta.driftPerHour > 0 ? "+" : ""}${data.meta.driftPerHour} mg/dL/h · ${data.meta.archivePoints} pts)`
                : "Non personnalisé (archive indisponible — défauts sûrs)"}
            </span>
          </div>
          <p className="text-[10px] text-text-tertiary mt-2">
            Aide à la décision — ne remplace pas une vérification capteur. Valide toujours avec ton ressenti.
          </p>
        </>
      ) : (
        <EmptyState title="Prêt à prédire" description="Lance le calcul pour voir ta courbe 8h." />
      )}
    </section>
  );
}

function MiniStat({
  label,
  value,
  hour,
  tone = "default",
}: {
  label: string;
  value: number;
  hour: string;
  tone?: "default" | "warning" | "error";
}) {
  const color =
    tone === "error" ? "text-error" : tone === "warning" ? "text-warning" : "text-text-primary";
  return (
    <div className="flex flex-col">
      <span className="label">{label}</span>
      <span className={`num text-lg ${color}`}>
        {value}
        <span className="text-text-tertiary text-xs ml-1">mg/dL · {hour}</span>
      </span>
    </div>
  );
}

function EmptyState({
  title,
  description,
  tone = "default",
}: {
  title: string;
  description: string;
  tone?: "default" | "warning";
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center h-48 gap-2">
      <Activity className={`w-5 h-5 ${tone === "warning" ? "text-warning" : "text-text-tertiary"}`} />
      <p className="text-sm font-medium text-text-primary">{title}</p>
      <p className="text-xs text-text-tertiary max-w-xs">{description}</p>
    </div>
  );
}
