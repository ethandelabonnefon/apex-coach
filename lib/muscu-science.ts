// Calcul du 1RM estimé (formule d'Epley)
export function estimate1RM(weight: number, reps: number): number {
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30));
}

// Volume total (sets × reps × poids)
export function calculateVolume(sets: { reps: number; weight: number }[]): number {
  return sets.reduce((total, set) => total + set.reps * set.weight, 0);
}

// Détection de plateau
export function detectPlateau(
  history: { date: string; estimated1RM: number }[]
): { isPlateaued: boolean; weeksSincePR: number; suggestions: string[] } {
  if (history.length < 3) return { isPlateaued: false, weeksSincePR: 0, suggestions: [] };

  const sorted = [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const maxRM = Math.max(...sorted.map((h) => h.estimated1RM));
  const lastThree = sorted.slice(0, 3);
  const recentMax = Math.max(...lastThree.map((h) => h.estimated1RM));

  const weeksSincePR = Math.floor(
    (Date.now() - new Date(sorted.find((h) => h.estimated1RM === maxRM)!.date).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
  );

  const isPlateaued = weeksSincePR >= 3 && recentMax <= maxRM;

  const suggestions: string[] = [];
  if (isPlateaued) {
    suggestions.push("Essayer un deload d'1 semaine (-40% volume)");
    suggestions.push("Changer la plage de reps (si 8-10, passer à 5-7 ou 12-15)");
    suggestions.push("Varier l'exercice principal (ex: haltères → barre)");
    suggestions.push("Augmenter la fréquence sur ce muscle (ajouter 2-3 sets)");
  }

  return { isPlateaued, weeksSincePR, suggestions };
}

// Recommandation de poids pour la prochaine séance
export function suggestNextWeight(
  lastSets: { reps: number; weight: number; rir: number }[],
  targetReps: string, // "8-10"
): { suggestedWeight: number; reasoning: string } {
  const [minReps, maxReps] = targetReps.split('-').map(Number);
  const allHitMax = lastSets.every((s) => s.reps >= maxReps);
  const avgRIR = lastSets.reduce((sum, s) => sum + s.rir, 0) / lastSets.length;
  const lastWeight = lastSets[0]?.weight || 0;

  if (allHitMax && avgRIR >= 1) {
    return {
      suggestedWeight: lastWeight + 2.5,
      reasoning: `Tu as atteint ${maxReps} reps sur toutes les séries avec RIR≥1. Augmente de 2.5kg.`,
    };
  }

  if (lastSets.some((s) => s.reps < minReps)) {
    return {
      suggestedWeight: lastWeight - 2.5,
      reasoning: `Tu n'as pas atteint ${minReps} reps sur certaines séries. Réduis de 2.5kg pour maintenir la qualité.`,
    };
  }

  return {
    suggestedWeight: lastWeight,
    reasoning: `Continue avec ${lastWeight}kg — vise +1 rep par série avant d'augmenter.`,
  };
}

// Volume landmarks (Israetel)
export const VOLUME_LANDMARKS: Record<string, { mev: number; mrv: number; mav_low: number; mav_high: number }> = {
  "Pectoraux": { mev: 8, mrv: 22, mav_low: 12, mav_high: 20 },
  "Dos": { mev: 8, mrv: 25, mav_low: 12, mav_high: 20 },
  "Épaules latérales": { mev: 6, mrv: 26, mav_low: 12, mav_high: 22 },
  "Épaules postérieures": { mev: 0, mrv: 20, mav_low: 8, mav_high: 16 },
  "Biceps": { mev: 4, mrv: 20, mav_low: 8, mav_high: 16 },
  "Triceps": { mev: 4, mrv: 18, mav_low: 6, mav_high: 14 },
  "Quadriceps": { mev: 6, mrv: 20, mav_low: 10, mav_high: 18 },
  "Ischio-jambiers": { mev: 4, mrv: 16, mav_low: 8, mav_high: 14 },
  "Mollets": { mev: 6, mrv: 16, mav_low: 8, mav_high: 14 },
};

// Phase de périodisation
export function getCurrentPhaseInfo(week: number): {
  name: string;
  focus: string;
  rirTarget: string;
  volumeMultiplier: number;
} {
  const cycleWeek = ((week - 1) % 6) + 1;
  if (cycleWeek <= 3) {
    return { name: "Accumulation", focus: "Volume élevé, intensité modérée", rirTarget: "2-3", volumeMultiplier: 1.0 };
  }
  if (cycleWeek <= 5) {
    return { name: "Intensification", focus: "Volume réduit, intensité élevée", rirTarget: "1-2", volumeMultiplier: 0.85 };
  }
  return { name: "Deload", focus: "Récupération", rirTarget: "4-5", volumeMultiplier: 0.5 };
}
