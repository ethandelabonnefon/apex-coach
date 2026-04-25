"use client";

import { Card, PageHeader, Badge, Button, SectionTitle } from "@/components/ui";
import { useStore } from "@/lib/store";
import {
  calculateZones,
  formatPace,
  predictRaceTime,
  formatTime,
  getPhase,
  deriveVMA,
} from "@/lib/running-science";
import Link from "next/link";

const ZONE_CONFIG = [
  {
    key: "z1",
    label: "Z1",
    title: "Recuperation",
    color: "border-green-500/30 bg-green-500/5",
    textColor: "text-green-400",
    accentBg: "bg-green-500",
    dotColor: "bg-green-400",
    badgeColor: "green" as const,
  },
  {
    key: "z2",
    label: "Z2",
    title: "Endurance fondamentale",
    color: "border-[#00d4ff]/30 bg-[#00d4ff]/5",
    textColor: "text-[#00d4ff]",
    accentBg: "bg-[#00d4ff]",
    dotColor: "bg-[#00d4ff]",
    badgeColor: "blue" as const,
  },
  {
    key: "z3",
    label: "Z3",
    title: "Tempo / Allure marathon",
    color: "border-yellow-500/30 bg-yellow-500/5",
    textColor: "text-yellow-400",
    accentBg: "bg-yellow-500",
    dotColor: "bg-yellow-400",
    badgeColor: "orange" as const,
  },
  {
    key: "z4",
    label: "Z4",
    title: "Seuil lactique",
    color: "border-orange-500/30 bg-orange-500/5",
    textColor: "text-orange-400",
    accentBg: "bg-orange-500",
    dotColor: "bg-orange-400",
    badgeColor: "orange" as const,
  },
  {
    key: "z5",
    label: "Z5",
    title: "VO2max",
    color: "border-red-500/30 bg-red-500/5",
    textColor: "text-red-400",
    accentBg: "bg-red-500",
    dotColor: "bg-red-400",
    badgeColor: "red" as const,
  },
];

export default function ZonesPage() {
  const { currentRunningWeek, profile, runningDiagnosticData } = useStore();

  const vmaInfo = deriveVMA(runningDiagnosticData, profile.vo2max);
  const vma = vmaInfo.vma;
  const VO2MAX = vmaInfo.vo2max;
  const zones = calculateZones(vma);

  const races = [
    { label: "5K", dist: 5 },
    { label: "10K", dist: 10 },
    { label: "Semi-marathon", dist: 21.1 },
    { label: "Marathon", dist: 42.2 },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Zones d'entrainement"
        subtitle={`Basées sur ta VMA de ${vma.toFixed(1)} km/h (VO2max ${VO2MAX.toFixed(0)} · ${
          vmaInfo.source === "field-test"
            ? "test terrain"
            : vmaInfo.source === "diagnostic-vo2max"
            ? "VO2max diagnostic"
            : vmaInfo.source === "profile-vo2max"
            ? "profil"
            : "estimation"
        })`}
        action={
          <Link href="/running">
            <Button variant="secondary" size="sm">
              ← Retour au plan
            </Button>
          </Link>
        }
      />

      {/* VMA Display */}
      <Card glow="blue" className="mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">
              Vitesse Maximale Aerobie (VMA)
            </p>
            <p className="text-4xl font-bold text-[#00d4ff]">
              {vma.toFixed(1)} <span className="text-lg text-white/40 font-normal">km/h</span>
            </p>
            <p className="text-sm text-white/40 mt-1">
              VO2max: {VO2MAX.toFixed(0)} ml/kg/min | Formule: VMA = VO2max / 3.5
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Allure VMA</p>
              <p className="text-lg font-bold text-white">
                {formatPace(60 / vma)} <span className="text-xs text-white/40">/km</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-white/40 mb-1">Phase actuelle</p>
              <Badge color="blue">{getPhase(currentRunningWeek)} (S{currentRunningWeek})</Badge>
            </div>
          </div>
        </div>
      </Card>

      {/* Zone Cards */}
      <SectionTitle>Les 5 zones</SectionTitle>
      <div className="space-y-4 mb-8">
        {ZONE_CONFIG.map((cfg, idx) => {
          const zone = zones[cfg.key];
          return (
            <Card key={cfg.key} className={`border ${cfg.color}`}>
              <div className="flex flex-col md:flex-row gap-4">
                {/* Zone header */}
                <div className="flex items-center gap-3 md:min-w-[200px]">
                  <div className={`w-12 h-12 rounded-xl ${cfg.accentBg} flex items-center justify-center`}>
                    <span className="text-black font-black text-lg">{cfg.label}</span>
                  </div>
                  <div>
                    <h3 className={`font-bold ${cfg.textColor}`}>{zone.name}</h3>
                    <p className="text-xs text-white/40">
                      {zone.percentVMA.min}-{zone.percentVMA.max}% VMA
                    </p>
                  </div>
                </div>

                {/* Speed & Pace */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Vitesse</p>
                    <p className="text-sm font-semibold text-white">
                      {zone.speedKmh.min.toFixed(1)} - {zone.speedKmh.max.toFixed(1)}
                      <span className="text-white/40 text-xs ml-1">km/h</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Allure</p>
                    <p className="text-sm font-semibold text-white">
                      {formatPace(zone.paceMinKm.min)} - {formatPace(zone.paceMinKm.max)}
                      <span className="text-white/40 text-xs ml-1">/km</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">FC</p>
                    <p className="text-sm font-semibold text-white">
                      {zone.hrPercent.min} - {zone.hrPercent.max}
                      <span className="text-white/40 text-xs ml-1">% FCmax</span>
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-white/40 mb-0.5">Sensation</p>
                    <p className="text-xs text-white/60">{zone.feeling}</p>
                  </div>
                </div>
              </div>

              {/* Purpose */}
              <div className="mt-3 pt-3 border-t border-white/[0.06]">
                <div className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} mt-1.5 shrink-0`} />
                  <p className="text-sm text-white/50">
                    <span className="text-white/70 font-medium">Objectif :</span> {zone.purpose}
                  </p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Zone usage by phase */}
      <SectionTitle>Utilisation par phase</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          {
            phase: "Base",
            weeks: "S1-S4",
            zones: ["Z1", "Z2"],
            description: "Construire la base aerobie. 100% en Z1-Z2, allures faciles.",
            color: "green" as const,
          },
          {
            phase: "Build",
            weeks: "S5-S8",
            zones: ["Z2", "Z4", "Z5"],
            description: "Introduction du fractionne. Z2 dominant + seances de vitesse Z4-Z5.",
            color: "blue" as const,
          },
          {
            phase: "Peak",
            weeks: "S9-S12",
            zones: ["Z2", "Z3", "Z4", "Z5"],
            description: "Intensite maximale. Tempo Z3, fractionne long Z4-Z5, sorties longues progressives.",
            color: "orange" as const,
          },
          {
            phase: "Taper",
            weeks: "S13-S14",
            zones: ["Z2", "Z3"],
            description: "Reduire le volume, maintenir l'intensite. Affutage avant la course.",
            color: "purple" as const,
          },
        ].map((p) => (
          <Card key={p.phase}>
            <div className="flex items-center gap-2 mb-2">
              <Badge color={p.color}>{p.phase}</Badge>
              <span className="text-xs text-white/40">{p.weeks}</span>
            </div>
            <p className="text-sm text-white/60 mb-3">{p.description}</p>
            <div className="flex flex-wrap gap-1">
              {p.zones.map((z) => {
                const idx = parseInt(z.slice(1)) - 1;
                const cfg = ZONE_CONFIG[idx];
                return (
                  <span key={z} className={`text-xs px-2 py-0.5 rounded-full border ${cfg.color} ${cfg.textColor}`}>
                    {z}
                  </span>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {/* Race Pace Predictions */}
      <SectionTitle>Allures de course predites</SectionTitle>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {races.map((race) => {
          const pred = predictRaceTime(VO2MAX, race.dist);
          return (
            <Card key={race.label} glow="blue">
              <p className="text-xs text-white/40 uppercase tracking-wider mb-1">{race.label}</p>
              <p className="text-2xl font-bold text-[#00d4ff] mb-2">
                {formatTime(pred.predictedTimeMinutes)}
              </p>
              <div className="space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Allure</span>
                  <span className="text-xs text-white/70 font-medium">
                    {formatPace(pred.predictedPace)} /km
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Vitesse</span>
                  <span className="text-xs text-white/70 font-medium">
                    {pred.predictedSpeed.toFixed(1)} km/h
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">% VMA</span>
                  <span className="text-xs text-white/70 font-medium">
                    {((pred.predictedSpeed / vma) * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">Precision</span>
                  <Badge color="gray">{pred.confidence}</Badge>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Quick reference table */}
      <SectionTitle>Reference rapide</SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-xs uppercase tracking-wider border-b border-white/[0.06]">
                <th className="text-left py-3 pr-4">Zone</th>
                <th className="text-left py-3 pr-4">% VMA</th>
                <th className="text-left py-3 pr-4">Vitesse (km/h)</th>
                <th className="text-left py-3 pr-4">Allure (/km)</th>
                <th className="text-left py-3 pr-4">FC (%)</th>
                <th className="text-left py-3">Utilisation</th>
              </tr>
            </thead>
            <tbody>
              {ZONE_CONFIG.map((cfg) => {
                const zone = zones[cfg.key];
                return (
                  <tr key={cfg.key} className="border-b border-white/[0.03] last:border-0">
                    <td className="py-3 pr-4">
                      <span className={`font-bold ${cfg.textColor}`}>{cfg.label}</span>
                    </td>
                    <td className="py-3 pr-4 text-white/70">
                      {zone.percentVMA.min}-{zone.percentVMA.max}%
                    </td>
                    <td className="py-3 pr-4 text-white/70">
                      {zone.speedKmh.min.toFixed(1)} - {zone.speedKmh.max.toFixed(1)}
                    </td>
                    <td className="py-3 pr-4 font-medium text-white">
                      {formatPace(zone.paceMinKm.min)} - {formatPace(zone.paceMinKm.max)}
                    </td>
                    <td className="py-3 pr-4 text-white/70">
                      {zone.hrPercent.min}-{zone.hrPercent.max}%
                    </td>
                    <td className="py-3 text-white/50 text-xs">{zone.purpose}</td>
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
