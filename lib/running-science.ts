import { RunningZone } from '@/types';

export function calculateVMA(vo2max: number): number {
  return vo2max / 3.5;
}

// Phase 11 — Dérive la VMA en respectant la hiérarchie du diagnostic.
// Priorité : test terrain (calculatedVMA) > VO2max diagnostic > VO2max profil.
// Garantit que la page Running utilise les vraies données utilisateur,
// pas une constante hardcodée.
export type VMASource = "field-test" | "diagnostic-vo2max" | "profile-vo2max" | "fallback";

export function deriveVMA(
  diagnosticData: Record<string, unknown> | undefined | null,
  profileVo2max: number | null | undefined,
  fallbackVo2max = 49,
): { vma: number; vo2max: number; source: VMASource } {
  const d = diagnosticData ?? {};

  const calculatedVMA = typeof d.calculatedVMA === "number" ? d.calculatedVMA : null;
  if (calculatedVMA && calculatedVMA > 5 && calculatedVMA < 30) {
    return {
      vma: calculatedVMA,
      vo2max: calculatedVMA * 3.5,
      source: "field-test",
    };
  }

  const diagVo2 = d.vo2max ? Number(d.vo2max) : null;
  if (diagVo2 && !Number.isNaN(diagVo2) && diagVo2 > 20 && diagVo2 < 90) {
    return {
      vma: calculateVMA(diagVo2),
      vo2max: diagVo2,
      source: "diagnostic-vo2max",
    };
  }

  if (profileVo2max && profileVo2max > 20 && profileVo2max < 90) {
    return {
      vma: calculateVMA(profileVo2max),
      vo2max: profileVo2max,
      source: "profile-vo2max",
    };
  }

  return {
    vma: calculateVMA(fallbackVo2max),
    vo2max: fallbackVo2max,
    source: "fallback",
  };
}

export function calculateZones(vma: number): Record<string, RunningZone> {
  return {
    z1: {
      name: "Récupération",
      percentVMA: { min: 60, max: 70 },
      speedKmh: { min: vma * 0.60, max: vma * 0.70 },
      paceMinKm: { min: 60 / (vma * 0.70), max: 60 / (vma * 0.60) },
      hrPercent: { min: 60, max: 70 },
      feeling: "Très facile, conversation fluide",
      purpose: "Récupération active, flux sanguin",
    },
    z2: {
      name: "Endurance fondamentale",
      percentVMA: { min: 70, max: 80 },
      speedKmh: { min: vma * 0.70, max: vma * 0.80 },
      paceMinKm: { min: 60 / (vma * 0.80), max: 60 / (vma * 0.70) },
      hrPercent: { min: 70, max: 80 },
      feeling: "Confortable, phrases complètes possibles",
      purpose: "Base aérobie, endurance, utilisation des graisses",
    },
    z3: {
      name: "Tempo / Allure marathon",
      percentVMA: { min: 80, max: 88 },
      speedKmh: { min: vma * 0.80, max: vma * 0.88 },
      paceMinKm: { min: 60 / (vma * 0.88), max: 60 / (vma * 0.80) },
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
      speedKmh: { min: vma * 0.95, max: vma * 1.00 },
      paceMinKm: { min: 60 / (vma * 1.00), max: 60 / (vma * 0.95) },
      hrPercent: { min: 92, max: 100 },
      feeling: "Très difficile, quelques mots max",
      purpose: "Développer la VO2max",
    },
  };
}

export function predictRaceTime(vo2max: number, distanceKm: number) {
  const vma = calculateVMA(vo2max);
  const paces: Record<number, number> = {
    5: vma * 0.95,
    10: vma * 0.90,
    21.1: vma * 0.85,
    42.2: vma * 0.80,
  };
  const speed = paces[distanceKm] || vma * 0.85;
  const timeHours = distanceKm / speed;
  return {
    distance: distanceKm,
    predictedSpeed: speed,
    predictedTimeMinutes: timeHours * 60,
    predictedPace: 60 / speed,
    confidence: "±3-5%",
  };
}

export function formatPace(paceMinPerKm: number): string {
  const mins = Math.floor(paceMinPerKm);
  const secs = Math.round((paceMinPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const mins = Math.floor(totalMinutes % 60);
  const secs = Math.round((totalMinutes % 1) * 60);
  if (hours > 0) {
    return `${hours}h${mins.toString().padStart(2, '0')}min${secs.toString().padStart(2, '0')}s`;
  }
  return `${mins}min${secs.toString().padStart(2, '0')}s`;
}

export function getPhase(weekNumber: number): string {
  if (weekNumber <= 4) return "Base";
  if (weekNumber <= 8) return "Build";
  if (weekNumber <= 12) return "Peak";
  return "Taper";
}

export function getGlucoseAdvice(glucose: number, sessionType: string): { status: string; action: string; color: string } {
  if (glucose < 70) {
    return { status: "HYPO", action: "Ne pas courir ! Prendre 15-20g de sucre rapide, attendre 15min.", color: "text-red-500" };
  }
  if (glucose < 120) {
    return { status: "Bas", action: "Prendre 15-20g de glucides rapides, attendre 15min avant de courir.", color: "text-orange-400" };
  }
  if (glucose <= 180) {
    return { status: "OK", action: "Glycémie idéale pour courir. C'est parti !", color: "text-green-400" };
  }
  if (glucose <= 250) {
    return { status: "Élevé", action: sessionType === 'intervals' ? "Attention : l'intensité peut encore faire monter. Envisager une correction légère." : "Acceptable pour du Z2, surveiller la tendance.", color: "text-orange-400" };
  }
  return { status: "TRÈS ÉLEVÉ", action: "Vérifier les cétones. Si >1.0 mmol/L, reporter la séance.", color: "text-red-500" };
}
