"use client";

/**
 * Page détail d'une séance running enregistrée (Phase D, mai 2026).
 *
 * Affiche :
 *  - Carte avec trace complète (polyline colorée par glycémie si dispo)
 *  - Replay scrubbable : slider qui contrôle un index de point GPS
 *  - Stats récap (durée, distance, allure, dénivelé, ressenti)
 *  - Splits par km
 *  - Graphiques altitude + glycémie pendant la séance
 *  - Notes
 *
 * URL : /running/seance/[id] où id = CompletedRunningSession.id
 */

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import { useStore } from "@/lib/store";
import {
  formatDistance,
  formatDuration,
  formatPace,
  buildElevationProfile,
  totalElevationGain,
  totalDistance,
  computeKmSplits,
  type GpsPoint,
} from "@/lib/running-tracker";
import {
  ArrowLeft,
  Footprints,
  Trash2,
  MapPin,
  Mountain,
  Droplet,
  Loader2,
  Play,
  Pause,
} from "lucide-react";

const RunningMap = dynamic(() => import("@/components/running/RunningMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-bg-secondary text-text-tertiary">
      <Loader2 className="w-5 h-5 animate-spin" />
    </div>
  ),
});

const FEELING_LABELS: Record<string, { label: string; emoji: string; tone: string }> = {
  great: { label: "Excellent", emoji: "🔥", tone: "text-success" },
  good:  { label: "Bon",       emoji: "👍", tone: "text-success" },
  ok:    { label: "OK",        emoji: "👌", tone: "text-text-secondary" },
  hard:  { label: "Dur",       emoji: "😓", tone: "text-warning" },
  bad:   { label: "Mauvais",   emoji: "😣", tone: "text-error" },
};

export default function RunningSeanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const session = useStore((s) => s.completedRunningSessions.find((r) => r.id === id));
  const deleteSession = useStore((s) => s.deleteCompletedRunningSession);

  // Points GPS reconstruits (avec speed=null car non stocké, mais pas nécessaire ici)
  const gpsPoints: GpsPoint[] = useMemo(
    () =>
      (session?.gpsPoints ?? []).map((p) => ({
        lat: p.lat,
        lon: p.lon,
        altitude: p.altitude,
        accuracy: p.accuracy,
        t: p.t,
        speed: null,
      })),
    [session],
  );

  // Replay scrubber state — index du point GPS courant (0 = début, len-1 = fin)
  const [scrubIdx, setScrubIdx] = useState<number>(-1); // -1 = pas en mode scrub
  const [isPlaying, setIsPlaying] = useState(false);
  const scrubPoint = scrubIdx >= 0 && scrubIdx < gpsPoints.length ? gpsPoints[scrubIdx] : null;

  // Distance / durée / allure cumulées au point scrubIdx
  const scrubStats = useMemo(() => {
    if (scrubIdx < 1 || !gpsPoints.length) return null;
    const slice = gpsPoints.slice(0, scrubIdx + 1);
    const dist = totalDistance(slice);
    const dur = (slice[slice.length - 1].t - slice[0].t) / 1000;
    const pace = dist > 20 && dur > 5 ? 1 / (dist / 1000 / dur) / 60 : null;
    return { distM: dist, durSec: dur, paceMinPerKm: pace };
  }, [scrubIdx, gpsPoints]);

  // Auto-play : avance le scrubIdx (vitesse calibrée selon nb de points
  // pour que le replay complet dure ~15s peu importe la longueur).
  useEffect(() => {
    if (!isPlaying || gpsPoints.length < 2) return;
    const intervalMs = Math.max(20, Math.min(200, 15_000 / gpsPoints.length));
    const id = setInterval(() => {
      setScrubIdx((prev) => {
        if (prev < 0) return 0;
        if (prev >= gpsPoints.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);
    return () => clearInterval(id);
  }, [isPlaying, gpsPoints.length]);

  // Pre-compute (avant early return) pour respecter Rules of Hooks
  const splits = useMemo(() => computeKmSplits(gpsPoints), [gpsPoints]);
  const elevGain = useMemo(() => totalElevationGain(gpsPoints), [gpsPoints]);
  const elevProfile = useMemo(() => buildElevationProfile(gpsPoints), [gpsPoints]);

  // ─── Fallback : séance introuvable ─────────────
  if (!session) {
    return (
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
        <div className="surface-1 rounded-2xl p-8 text-center">
          <Footprints className="w-8 h-8 text-text-tertiary mx-auto mb-3" />
          <p className="text-base font-semibold text-text-primary mb-2">Séance introuvable</p>
          <p className="text-xs text-text-tertiary mb-4">Cette séance a peut-être été supprimée.</p>
          <Link
            href="/running"
            className="inline-flex items-center gap-2 text-sm text-running hover:text-running/80 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour aux séances
          </Link>
        </div>
      </div>
    );
  }

  const cps = session.glucoseCheckpoints ?? [];
  const feeling = FEELING_LABELS[session.feeling] ?? FEELING_LABELS.ok;
  const hasGps = gpsPoints.length >= 2;
  const hasElev = elevProfile.length >= 5 && elevGain > 0;
  const hasGlucose = cps.length >= 2;

  function handleDelete() {
    if (!session) return;
    if (!confirm("Supprimer définitivement cette séance ?")) return;
    deleteSession(session.id);
    router.push("/running");
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 stagger">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <Link
          href="/running"
          className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-running transition-colors tap-scale"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Séances</span>
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          aria-label="Supprimer la séance"
          className="w-9 h-9 rounded-full bg-bg-tertiary border border-border-subtle flex items-center justify-center text-text-secondary hover:text-error hover:border-error/40 transition-colors tap-scale"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Titre + ressenti */}
      <div className="mb-5">
        <p className="label">
          {new Date(session.date).toLocaleDateString("fr-FR", {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <Footprints className="w-5 h-5 text-running" />
          <h1 className="text-2xl font-semibold text-text-primary">
            {session.sessionIndex === -1 ? "Séance libre" : `Semaine ${session.weekNumber}`}
          </h1>
        </div>
        <p className={`text-xs mt-1 ${feeling.tone}`}>
          Ressenti : <span aria-hidden>{feeling.emoji}</span> {feeling.label}
        </p>
      </div>

      {/* Stats grid */}
      <div className={`grid grid-cols-2 ${hasElev ? "sm:grid-cols-5" : "sm:grid-cols-4"} gap-3 mb-4`}>
        <DetailStat label="Durée"          value={formatDuration(session.actualDuration * 60)} />
        <DetailStat label="Distance"       value={`${session.actualDistance.toFixed(2).replace(".", ",")} km`} />
        <DetailStat label="Allure moy"     value={formatPace(session.avgPace || null)} unit="/km" />
        <DetailStat label="Splits"         value={`${splits.length}`} />
        {hasElev && <DetailStat label="Dénivelé +" value={`${elevGain}`} unit="m" />}
      </div>

      {/* Carte + replay scrubber */}
      {hasGps && (
        <section className="surface-1 rounded-2xl overflow-hidden mb-4">
          <div className="relative" style={{ height: 320 }}>
            <RunningMap
              points={gpsPoints}
              mode="replay"
              glucoseCheckpoints={cps}
              scrubIndex={scrubIdx}
            />
            <div className="absolute top-3 left-3 z-[500] flex items-center gap-1.5 bg-bg-tertiary/80 backdrop-blur-md rounded-full px-2.5 py-1 border border-border-subtle">
              <MapPin className="w-3 h-3 text-running" />
              <span className="text-[10px] uppercase tracking-wide text-text-secondary font-semibold">
                Trace GPS · {gpsPoints.length} pts
              </span>
            </div>
          </div>
          {/* Scrub controls */}
          <div className="px-4 py-3 bg-bg-secondary border-t border-border-subtle">
            <div className="flex items-center gap-3 mb-2">
              <button
                type="button"
                onClick={() => {
                  if (scrubIdx < 0) setScrubIdx(0);
                  setIsPlaying((v) => !v);
                }}
                className="shrink-0 w-9 h-9 rounded-full bg-running/15 border border-running/30 flex items-center justify-center text-running hover:bg-running/25 transition-colors tap-scale"
                aria-label={isPlaying ? "Pause replay" : "Lancer replay"}
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={Math.max(0, gpsPoints.length - 1)}
                value={Math.max(0, scrubIdx)}
                onChange={(e) => {
                  setScrubIdx(Number(e.target.value));
                  setIsPlaying(false);
                }}
                className="flex-1 accent-running"
              />
              <button
                type="button"
                onClick={() => { setScrubIdx(-1); setIsPlaying(false); }}
                className="shrink-0 text-[10px] text-text-tertiary hover:text-running tap-scale"
              >
                Reset
              </button>
            </div>
            {scrubPoint && scrubStats && (
              <p className="num text-[10px] text-text-tertiary text-center">
                À {formatDuration(scrubStats.durSec)} · {formatDistance(scrubStats.distM)}
                {scrubStats.paceMinPerKm !== null && (
                  <> · {formatPace(scrubStats.paceMinPerKm)}/km</>
                )}
                {scrubPoint.altitude !== null && (
                  <> · alt {Math.round(scrubPoint.altitude)}m</>
                )}
              </p>
            )}
          </div>
        </section>
      )}

      {/* Graphes altitude + glycémie */}
      {(hasElev || hasGlucose) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {hasElev && (
            <section className="surface-1 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Mountain className="w-3.5 h-3.5 text-running" />
                <p className="label">Profil d&apos;altitude</p>
              </div>
              <div style={{ width: "100%", height: 140 }}>
                <ResponsiveContainer>
                  <AreaChart data={elevProfile} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="elevGradDetail" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="rgba(0,0,0,0.04)" vertical={false} />
                    <XAxis
                      dataKey="distM"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v) => `${(Number(v) / 1000).toFixed(1)}`}
                      tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-elevated)",
                        border: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                      labelFormatter={(v) => `${(Number(v) / 1000).toFixed(2)} km`}
                      formatter={(v) => [`${Math.round(Number(v))} m`, "Altitude"] as [string, string]}
                    />
                    <Area
                      type="monotone"
                      dataKey="alt"
                      stroke="var(--chart-2)"
                      strokeWidth={1.5}
                      fill="url(#elevGradDetail)"
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
          {hasGlucose && (
            <section className="surface-1 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-3">
                <Droplet className="w-3.5 h-3.5 text-diabete" />
                <p className="label">Glycémie pendant la séance</p>
              </div>
              <div style={{ width: "100%", height: 140 }}>
                <ResponsiveContainer>
                  <LineChart
                    data={cps.map((c) => ({ x: c.offsetSec / 60, value: c.value }))}
                    margin={{ top: 5, right: 5, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid stroke="rgba(0,0,0,0.04)" vertical={false} />
                    <XAxis
                      dataKey="x"
                      type="number"
                      domain={["dataMin", "dataMax"]}
                      tickFormatter={(v) => `${Math.round(Number(v))}'`}
                      tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={[40, 280]}
                      ticks={[70, 110, 180, 250]}
                      tick={{ fill: "rgba(0,0,0,0.4)", fontSize: 9 }}
                      axisLine={false}
                      tickLine={false}
                      width={30}
                    />
                    <ReferenceArea y1={70} y2={180} fill="var(--success)" fillOpacity={0.06} />
                    <ReferenceLine y={70} stroke="var(--error)" strokeDasharray="3 3" strokeWidth={1} />
                    <ReferenceLine y={180} stroke="var(--warning)" strokeDasharray="3 3" strokeWidth={1} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--bg-elevated)",
                        border: "1px solid rgba(0,0,0,0.1)",
                        borderRadius: "8px",
                        fontSize: "11px",
                      }}
                      labelFormatter={(v) => `${Math.round(Number(v))} min`}
                      formatter={(v) => [`${v} mg/dL`, "Glycémie"] as [string, string]}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--diabete)"
                      strokeWidth={2}
                      dot={{ r: 3, fill: "var(--diabete)" }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
          )}
        </div>
      )}

      {/* Splits détaillés */}
      {splits.length > 0 && (
        <section className="surface-1 rounded-2xl p-5 mb-4">
          <p className="label mb-3">Splits par km</p>
          <div className="space-y-1.5">
            {splits.map((s) => (
              <div
                key={s.km}
                className="flex items-center justify-between bg-bg-tertiary rounded-lg px-3 py-2 text-sm"
              >
                <span className="num text-text-secondary">Km {s.km}</span>
                <span className="num text-running font-semibold">
                  {formatPace(s.paceMinPerKm)}
                  <span className="text-[10px] text-text-tertiary ml-1">/km</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Notes */}
      {session.notes && (
        <section className="surface-1 rounded-2xl p-5 mb-4">
          <p className="label mb-2">Notes</p>
          <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
            {session.notes}
          </p>
        </section>
      )}
    </div>
  );
}

function DetailStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="surface-1 rounded-xl p-3">
      <p className="label mb-1.5">{label}</p>
      <p className="num text-lg sm:text-xl font-semibold text-running tabular-nums">
        {value}
        {unit && <span className="text-[10px] text-text-tertiary ml-1">{unit}</span>}
      </p>
    </div>
  );
}
