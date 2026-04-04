/**
 * RUNNING CALCULATOR — Pure deterministic functions
 *
 * Re-exports and extends lib/running-science.ts
 * All functions are DETERMINISTIC: same input = always same output
 */

import type { RunningZone } from "@/types";

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

export interface RunningInput {
  vo2max?: number; // ml/kg/min
  vmaFromTest?: number; // km/h (if measured directly)
  age: number;
  maxHR?: number; // measured max HR, or will be estimated
}

export interface RunningOutput {
  vma: number; // km/h
  maxHR: number;
  zones: Record<string, RunningZone>;
  predictions: {
    fiveK: RacePrediction;
    tenK: RacePrediction;
    halfMarathon: RacePrediction;
    marathon: RacePrediction;
  };
}

export interface RacePrediction {
  distance: number;
  distanceLabel: string;
  predictedSpeed: number; // km/h
  predictedTimeMinutes: number;
  predictedPace: number; // min/km
  formattedTime: string;
  formattedPace: string;
  confidence: string;
}

// ═══════════════════════════════════════════════════════════
// CONSTANTES
// ═══════════════════════════════════════════════════════════

// VMA percentages for race distance predictions
const RACE_VMA_PERCENT: Record<number, number> = {
  5: 0.95,
  10: 0.90,
  21.1: 0.85,
  42.2: 0.80,
};

const RACE_LABELS: Record<number, string> = {
  5: "5 km",
  10: "10 km",
  21.1: "Semi-marathon",
  42.2: "Marathon",
};

// ═══════════════════════════════════════════════════════════
// FUNCTIONS
// ═══════════════════════════════════════════════════════════

/** Convert VO2max (ml/kg/min) to VMA (km/h) */
export function calculateVMA(vo2max: number): number {
  return vo2max / 3.5;
}

/** Estimate max HR from age (Tanaka formula) */
export function estimateMaxHR(age: number): number {
  return Math.round(208 - 0.7 * age);
}

/** Calculate all 5 running zones from VMA */
export function calculateZones(vma: number): Record<string, RunningZone> {
  return {
    z1: {
      name: "Récupération",
      percentVMA: { min: 60, max: 70 },
      speedKmh: { min: vma * 0.6, max: vma * 0.7 },
      paceMinKm: { min: 60 / (vma * 0.7), max: 60 / (vma * 0.6) },
      hrPercent: { min: 60, max: 70 },
      feeling: "Très facile, conversation fluide",
      purpose: "Récupération active, flux sanguin",
    },
    z2: {
      name: "Endurance fondamentale",
      percentVMA: { min: 70, max: 80 },
      speedKmh: { min: vma * 0.7, max: vma * 0.8 },
      paceMinKm: { min: 60 / (vma * 0.8), max: 60 / (vma * 0.7) },
      hrPercent: { min: 70, max: 80 },
      feeling: "Confortable, phrases complètes possibles",
      purpose: "Base aérobie, endurance, utilisation des graisses",
    },
    z3: {
      name: "Tempo / Allure marathon",
      percentVMA: { min: 80, max: 88 },
      speedKmh: { min: vma * 0.8, max: vma * 0.88 },
      paceMinKm: { min: 60 / (vma * 0.88), max: 60 / (vma * 0.8) },
      hrPercent: { min: 80, max: 88 },
      feeling: "Inconfortable mais soutenable",
      purpose: "Seuil aérobie, économie de course",
    },
    z4: {
      name: "Seuil lactique",
      percentVMA: { min: 88, max: 95 },
      speedKmh: { min: vma * 0.88, max: vma * 0.95 },
      paceMinKm: { min: 60 / (vma * 0.95), max: 60 / (vma * 0.88) },
      hrPercent: { min: 88, max: 92 },
      feeling: "Difficile, phrases courtes",
      purpose: "Repousser le seuil lactique",
    },
    z5: {
      name: "VO2max",
      percentVMA: { min: 95, max: 100 },
      speedKmh: { min: vma * 0.95, max: vma * 1.0 },
      paceMinKm: { min: 60 / (vma * 1.0), max: 60 / (vma * 0.95) },
      hrPercent: { min: 92, max: 100 },
      feeling: "Très difficile, quelques mots max",
      purpose: "Développer la VO2max",
    },
  };
}

/** Predict race performance from VO2max */
export function predictRaceTime(vo2max: number, distanceKm: number): RacePrediction {
  const vma = calculateVMA(vo2max);
  const vmaPercent = RACE_VMA_PERCENT[distanceKm] || 0.85;
  const speed = vma * vmaPercent;
  const timeMinutes = (distanceKm / speed) * 60;
  const pace = 60 / speed;

  return {
    distance: distanceKm,
    distanceLabel: RACE_LABELS[distanceKm] || `${distanceKm} km`,
    predictedSpeed: Math.round(speed * 10) / 10,
    predictedTimeMinutes: Math.round(timeMinutes * 10) / 10,
    predictedPace: Math.round(pace * 100) / 100,
    formattedTime: formatTime(timeMinutes),
    formattedPace: formatPace(pace),
    confidence: "±3-5%",
  };
}

/** Full running calculation from input */
export function calculateRunning(input: RunningInput): RunningOutput {
  const vma = input.vmaFromTest || (input.vo2max ? calculateVMA(input.vo2max) : 14);
  const maxHR = input.maxHR || estimateMaxHR(input.age);
  const zones = calculateZones(vma);
  const vo2max = input.vo2max || vma * 3.5;

  return {
    vma: Math.round(vma * 10) / 10,
    maxHR,
    zones,
    predictions: {
      fiveK: predictRaceTime(vo2max, 5),
      tenK: predictRaceTime(vo2max, 10),
      halfMarathon: predictRaceTime(vo2max, 21.1),
      marathon: predictRaceTime(vo2max, 42.2),
    },
  };
}

// ═══════════════════════════════════════════════════════════
// FORMATTING HELPERS (pure, deterministic)
// ═══════════════════════════════════════════════════════════

export function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.round((totalMinutes % 1) * 60);
  if (hours > 0) {
    return `${hours}h${mins.toString().padStart(2, "0")}min${secs.toString().padStart(2, "0")}s`;
  }
  return `${mins}min${secs.toString().padStart(2, "0")}s`;
}

export function getPhase(weekNumber: number): string {
  if (weekNumber <= 4) return "Base";
  if (weekNumber <= 8) return "Build";
  if (weekNumber <= 12) return "Peak";
  return "Taper";
}

export function getGlucoseAdvice(
  glucose: number,
  sessionType: string
): { status: string; action: string; color: string } {
  if (glucose < 70) {
    return {
      status: "HYPO",
      action: "Ne pas courir ! Prendre 15-20g de sucre rapide, attendre 15min.",
      color: "text-red-500",
    };
  }
  if (glucose < 120) {
    return {
      status: "Bas",
      action: "Prendre 15-20g de glucides rapides, attendre 15min avant de courir.",
      color: "text-orange-400",
    };
  }
  if (glucose <= 180) {
    return {
      status: "OK",
      action: "Glycémie idéale pour courir. C'est parti !",
      color: "text-green-400",
    };
  }
  if (glucose <= 250) {
    return {
      status: "Élevé",
      action:
        sessionType === "intervals"
          ? "Attention : l'intensité peut encore faire monter. Envisager une correction légère."
          : "Acceptable pour du Z2, surveiller la tendance.",
      color: "text-orange-400",
    };
  }
  return {
    status: "TRÈS ÉLEVÉ",
    action: "Vérifier les cétones. Si >1.0 mmol/L, reporter la séance.",
    color: "text-red-500",
  };
}
