"use client";

import { Card, PageHeader, Badge, Button, SectionTitle, ProgressBar, InfoBox } from "@/components/ui";
import { useStore } from "@/lib/store";
import {
  calculateVMA,
  calculateZones,
  formatPace,
  predictRaceTime,
  formatTime,
  getPhase,
} from "@/lib/running-science";
import { HALF_MARATHON_PLAN } from "@/lib/constants";
import Link from "next/link";

const BASE_VOLUME = 20;
const VO2MAX = 49;

interface Session {
  name: string;
  type: string;
  distance: number;
  zone: string;
  details: string;
  paceRange?: string;
  intervals?: { reps: number; distance: number; recovery: number } | null;
}

function generateSessions(
  weekNumber: number,
  totalVolume: number,
  vma: number,
  zones: ReturnType<typeof calculateZones>,
  interval: { reps: number; distance: number; recovery: number } | null
): Session[] {
  const phase = getPhase(weekNumber);

  if (phase === "Taper") {
    const easyDist = +(totalVolume * 0.55).toFixed(1);
    const tempoDist = +(totalVolume * 0.45).toFixed(1);
    return [
      {
        name: "Footing facile",
        type: "easy",
        distance: easyDist,
        zone: "Z2",
        details: `${easyDist} km en endurance fondamentale`,
        paceRange: `${formatPace(zones.z2.paceMinKm.min)} - ${formatPace(zones.z2.paceMinKm.max)}`,
      },
      {
        name: "Tempo court",
        type: "tempo",
        distance: tempoDist,
        zone: "Z3",
        details: `10 min Z2 + ${(tempoDist - 3).toFixed(1)} km Z3 + 10 min Z2`,
        paceRange: `${formatPace(zones.z3.paceMinKm.min)} - ${formatPace(zones.z3.paceMinKm.max)}`,
      },
    ];
  }

  if (phase === "Base") {
    const easyDist = +(totalVolume * 0.4).toFixed(1);
    const longDist = +(totalVolume * 0.6).toFixed(1);
    return [
      {
        name: "Footing facile",
        type: "easy",
        distance: easyDist,
        zone: "Z2",
        details: `${easyDist} km en endurance fondamentale`,
        paceRange: `${formatPace(zones.z2.paceMinKm.min)} - ${formatPace(zones.z2.paceMinKm.max)}`,
      },
      {
        name: "Sortie longue",
        type: "long",
        distance: longDist,
        zone: "Z2",
        details: `${longDist} km en Z1-Z2, allure conversationnelle`,
        paceRange: `${formatPace(zones.z1.paceMinKm.min)} - ${formatPace(zones.z2.paceMinKm.max)}`,
      },
    ];
  }

  if (phase === "Build") {
    const longDist = +(totalVolume * 0.55).toFixed(1);
    const session1Dist = +(totalVolume * 0.45).toFixed(1);

    const session1: Session = interval
      ? {
          name: "Fractionne",
          type: "intervals",
          distance: session1Dist,
          zone: "Z4-Z5",
          details: `Echauffement 15 min Z2 + ${interval.reps}x${interval.distance}m (rec ${interval.recovery}m) + retour 10 min Z1`,
          paceRange: `Rapide: ${formatPace(zones.z4.paceMinKm.min)} - ${formatPace(zones.z5.paceMinKm.max)} | Rec: ${formatPace(zones.z1.paceMinKm.min)}`,
          intervals: interval,
        }
      : {
          name: "Footing facile",
          type: "easy",
          distance: session1Dist,
          zone: "Z2",
          details: `${session1Dist} km en endurance fondamentale`,
          paceRange: `${formatPace(zones.z2.paceMinKm.min)} - ${formatPace(zones.z2.paceMinKm.max)}`,
        };

    return [
      session1,
      {
        name: "Sortie longue",
        type: "long",
        distance: longDist,
        zone: "Z2",
        details: `${longDist} km en Z1-Z2, allure progressive`,
        paceRange: `${formatPace(zones.z1.paceMinKm.min)} - ${formatPace(zones.z2.paceMinKm.max)}`,
      },
    ];
  }

  // Peak
  const longDist = +(totalVolume * 0.5).toFixed(1);
  const session1Dist = +(totalVolume * 0.5).toFixed(1);

  const session1: Session = interval
    ? {
        name: "Fractionne intensif",
        type: "intervals",
        distance: session1Dist,
        zone: "Z4-Z5",
        details: `Echauffement 15 min Z2 + ${interval.reps}x${interval.distance}m (rec ${interval.recovery}m) + retour 10 min Z1`,
        paceRange: `Rapide: ${formatPace(zones.z4.paceMinKm.min)} - ${formatPace(zones.z5.paceMinKm.max)} | Rec: ${formatPace(zones.z1.paceMinKm.min)}`,
        intervals: interval,
      }
    : {
        name: "Tempo",
        type: "tempo",
        distance: session1Dist,
        zone: "Z3",
        details: `10 min Z2 + ${(session1Dist - 3).toFixed(1)} km Z3 + 10 min Z2`,
        paceRange: `${formatPace(zones.z3.paceMinKm.min)} - ${formatPace(zones.z3.paceMinKm.max)}`,
      };

  return [
    session1,
    {
      name: "Sortie longue progressive",
      type: "long",
      distance: longDist,
      zone: "Z2-Z3",
      details: `${(longDist * 0.7).toFixed(1)} km Z2 + ${(longDist * 0.3).toFixed(1)} km Z3`,
      paceRange: `${formatPace(zones.z2.paceMinKm.min)} - ${formatPace(zones.z3.paceMinKm.max)}`,
    },
  ];
}

function getPhaseColor(phase: string): "blue" | "green" | "orange" | "purple" | "red" {
  switch (phase) {
    case "Base": return "green";
    case "Build": return "blue";
    case "Peak": return "orange";
    case "Taper": return "purple";
    default: return "blue";
  }
}

function getSessionTypeLabel(type: string): string {
  switch (type) {
    case "easy": return "Footing";
    case "long": return "Longue";
    case "intervals": return "Fractionne";
    case "tempo": return "Tempo";
    default: return type;
  }
}

export default function RunningPage() {
  const { currentRunningWeek, setRunningWeek, profile } = useStore();

  const vma = calculateVMA(VO2MAX);
  const zones = calculateZones(vma);

  const weeks = Array.from({ length: HALF_MARATHON_PLAN.duration }, (_, i) => {
    const weekNum = i + 1;
    const volume = +(BASE_VOLUME * HALF_MARATHON_PLAN.volumeProgression[i]).toFixed(1);
    const phase = getPhase(weekNum);
    const interval = HALF_MARATHON_PLAN.intervalProgression[i] ?? null;
    const sessions = generateSessions(weekNum, volume, vma, zones, interval);
    return { weekNum, volume, phase, sessions, interval };
  });

  const currentWeekData = weeks[currentRunningWeek - 1];

  const races = [
    { label: "5K", dist: 5 },
    { label: "10K", dist: 10 },
    { label: "Semi-marathon", dist: 21.1 },
    { label: "Marathon", dist: 42.2 },
  ];

  const maxVolume = Math.max(...weeks.map((w) => w.volume));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Plan Semi-Marathon"
        subtitle={`14 semaines | VMA ${vma.toFixed(1)} km/h | VO2max ${VO2MAX} ml/kg/min`}
        action={
          <Link href="/running/zones">
            <Button variant="secondary" size="sm">
              Zones detaillees
            </Button>
          </Link>
        }
      />

      {/* Week Selector */}
      <Card className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <SectionTitle className="!mb-0">Semaine en cours</SectionTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRunningWeek(Math.max(1, currentRunningWeek - 1))}
              disabled={currentRunningWeek <= 1}
            >
              ←
            </Button>
            <span className="text-[#00d4ff] font-bold text-lg min-w-[80px] text-center">
              S{currentRunningWeek}/14
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRunningWeek(Math.min(14, currentRunningWeek + 1))}
              disabled={currentRunningWeek >= 14}
            >
              →
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge color={getPhaseColor(currentWeekData.phase)}>{currentWeekData.phase}</Badge>
          <span className="text-white/40 text-sm">
            Volume: {currentWeekData.volume} km
          </span>
        </div>
      </Card>

      {/* Pace Zones Summary */}
      <Card className="mb-6">
        <SectionTitle>Allures par zone</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {(["z1", "z2", "z3", "z4", "z5"] as const).map((zKey, i) => {
            const z = zones[zKey];
            const zoneColors = [
              "border-green-500/30 bg-green-500/5",
              "border-[#00d4ff]/30 bg-[#00d4ff]/5",
              "border-yellow-500/30 bg-yellow-500/5",
              "border-orange-500/30 bg-orange-500/5",
              "border-red-500/30 bg-red-500/5",
            ];
            const textColors = [
              "text-green-400",
              "text-[#00d4ff]",
              "text-yellow-400",
              "text-orange-400",
              "text-red-400",
            ];
            return (
              <div key={zKey} className={`p-3 rounded-xl border ${zoneColors[i]}`}>
                <div className={`text-xs font-bold uppercase ${textColors[i]} mb-1`}>
                  Z{i + 1}
                </div>
                <div className="text-white text-sm font-semibold">
                  {formatPace(z.paceMinKm.min)} - {formatPace(z.paceMinKm.max)}
                </div>
                <div className="text-white/35 text-xs">/km</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Current Week Detail */}
      <SectionTitle>Detail Semaine {currentRunningWeek} — {currentWeekData.phase}</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {currentWeekData.sessions.map((session, idx) => (
          <Card key={idx} glow={session.type === "intervals" ? "orange" : "blue"}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-white">{session.name}</h3>
                <p className="text-white/40 text-xs mt-0.5">Seance {idx + 1}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={session.type === "intervals" ? "orange" : session.type === "tempo" ? "purple" : "blue"}>
                  {getSessionTypeLabel(session.type)}
                </Badge>
                <Badge color="gray">{session.zone}</Badge>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-white/40">Distance</p>
                  <p className="text-lg font-bold text-[#00d4ff]">{session.distance} km</p>
                </div>
                {session.paceRange && (
                  <div>
                    <p className="text-xs text-white/40">Allure</p>
                    <p className="text-sm text-white/80">{session.paceRange}</p>
                  </div>
                )}
              </div>

              <div className="bg-white/[0.03] rounded-lg p-3">
                <p className="text-xs text-white/40 mb-1">Structure</p>
                <p className="text-sm text-white/70">{session.details}</p>
              </div>

              {session.intervals && (
                <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg p-3">
                  <p className="text-xs text-orange-400 font-semibold mb-1">Fractionne</p>
                  <p className="text-sm text-white/70">
                    {session.intervals.reps} x {session.intervals.distance}m
                    <span className="text-white/40"> | Recup: {session.intervals.recovery}m trot</span>
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    Allure rapide: {formatPace(zones.z4.paceMinKm.min)} - {formatPace(zones.z5.paceMinKm.max)} /km
                  </p>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* 14-Week Plan Overview */}
      <SectionTitle>Progression 14 semaines</SectionTitle>
      <Card className="mb-8">
        <div className="space-y-2">
          {weeks.map((week) => {
            const isCurrent = week.weekNum === currentRunningWeek;
            const sessionTypes = week.sessions.map((s) => getSessionTypeLabel(s.type)).join(" + ");
            return (
              <button
                key={week.weekNum}
                onClick={() => setRunningWeek(week.weekNum)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${
                  isCurrent
                    ? "bg-[#00d4ff]/10 border border-[#00d4ff]/30"
                    : "hover:bg-white/[0.03] border border-transparent"
                }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                  isCurrent ? "bg-[#00d4ff] text-black" : "bg-white/[0.06] text-white/60"
                }`}>
                  {week.weekNum}
                </div>

                <Badge color={getPhaseColor(week.phase)}>{week.phase}</Badge>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <ProgressBar
                        value={week.volume}
                        max={maxVolume}
                        color={isCurrent ? "#00d4ff" : "#ffffff30"}
                        showValue={false}
                      />
                    </div>
                    <span className={`text-xs font-medium min-w-[50px] text-right ${
                      isCurrent ? "text-[#00d4ff]" : "text-white/50"
                    }`}>
                      {week.volume} km
                    </span>
                  </div>
                </div>

                <span className="text-xs text-white/35 min-w-[120px] text-right hidden md:block">
                  {sessionTypes}
                </span>

                {isCurrent && (
                  <span className="text-[#00d4ff] text-xs font-semibold">EN COURS</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* T1D Running Adaptations */}
      <SectionTitle>Adaptations Diabete T1 — Course</SectionTitle>
      <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <Card>
          <h3 className="font-semibold text-white mb-3">Avant la course</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Glycemie ideale</span>
              <span className="text-sm font-semibold text-green-400">120 - 180 mg/dL</span>
            </div>
            <div className="h-px bg-white/[0.06]" />
            <div className="space-y-1.5">
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  <span className="text-white/70 font-medium">&lt; 100 mg/dL :</span> Prendre 20-30g de glucides rapides, attendre 15 min
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400 text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  <span className="text-white/70 font-medium">100-120 mg/dL :</span> Prendre 15g de glucides, partir apres 10 min
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-green-400 text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  <span className="text-white/70 font-medium">120-180 mg/dL :</span> Zone ideale, c&apos;est parti !
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400 text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  <span className="text-white/70 font-medium">180-250 mg/dL :</span> OK pour Z2, prudence pour fractionne
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-red-400 text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  <span className="text-white/70 font-medium">&gt; 250 mg/dL :</span> Verifier cetones, reporter si &gt; 1.0 mmol/L
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-white mb-3">Pendant la course</h3>
          <div className="space-y-2">
            <InfoBox variant="info">
              <p className="font-medium mb-1">Glucides pendant l&apos;effort</p>
              <p className="text-xs opacity-80">
                30g/h pour les sorties &gt; 1h. Gel, compote, ou boisson sportive.
              </p>
            </InfoBox>
            <div className="space-y-1.5 mt-3">
              <div className="flex items-start gap-2">
                <span className="text-[#00d4ff] text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  <span className="text-white/70 font-medium">Z2 (endurance) :</span> -60 mg/dL/h en moyenne. Anticiper avec glucides.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-orange-400 text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  <span className="text-white/70 font-medium">Z4-Z5 (fractionne) :</span> Peut faire monter temporairement (+30-50 mg/dL). Pas de correction pendant.
                </p>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-white/40 text-xs mt-0.5">●</span>
                <p className="text-xs text-white/50">
                  Toujours avoir du sucre rapide sur soi (dextrose, gel).
                </p>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-white mb-3">Insuline</h3>
          <div className="space-y-1.5">
            <div className="flex items-start gap-2">
              <span className="text-[#00d4ff] text-xs mt-0.5">●</span>
              <p className="text-xs text-white/50">
                <span className="text-white/70 font-medium">Bolus pre-run :</span> Reduire de 30-50% si repas &lt; 2h avant la course
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#00d4ff] text-xs mt-0.5">●</span>
              <p className="text-xs text-white/50">
                <span className="text-white/70 font-medium">Basale :</span> Pas de modification avec les stylos (pas de pompe)
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#00d4ff] text-xs mt-0.5">●</span>
              <p className="text-xs text-white/50">
                <span className="text-white/70 font-medium">Post-run :</span> Sensibilite accrue 4-6h. Reduire bolus du repas suivant de 20-30%
              </p>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-[#00d4ff] text-xs mt-0.5">●</span>
              <p className="text-xs text-white/50">
                <span className="text-white/70 font-medium">Sortie longue (&gt; 1h30) :</span> Reduire bolus de 50% et surveiller dans les 8h suivantes
              </p>
            </div>
            <div className="mt-3">
              <InfoBox variant="warning">
                <p className="text-xs">
                  Risque d&apos;hypoglycemie nocturne apres sortie longue. Collation pre-dodo recommandee (20g glucides lents + proteine).
                </p>
              </InfoBox>
            </div>
          </div>
        </Card>
      </div>

      {/* Race Predictions */}
      <SectionTitle>Predictions de course</SectionTitle>
      <Card className="mb-8">
        <div className="overflow-x-auto scrollbar-hide -mx-2 px-2">
          <table className="w-full text-sm min-w-[500px]">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider border-b border-white/[0.06]">
                <th className="text-left py-3 pr-4">Distance</th>
                <th className="text-left py-3 pr-4">Temps predit</th>
                <th className="text-left py-3 pr-4">Allure</th>
                <th className="text-left py-3 pr-4">Vitesse</th>
                <th className="text-left py-3">Marge</th>
              </tr>
            </thead>
            <tbody>
              {races.map((race) => {
                const pred = predictRaceTime(VO2MAX, race.dist);
                return (
                  <tr key={race.label} className="border-b border-white/[0.03] last:border-0">
                    <td className="py-3 pr-4">
                      <span className="font-semibold text-white">{race.label}</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-[#00d4ff] font-bold">
                        {formatTime(pred.predictedTimeMinutes)}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-white/70">{formatPace(pred.predictedPace)} /km</span>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="text-white/50">{pred.predictedSpeed.toFixed(1)} km/h</span>
                    </td>
                    <td className="py-3">
                      <Badge color="gray">{pred.confidence}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
