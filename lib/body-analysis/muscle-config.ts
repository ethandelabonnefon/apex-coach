// ─── Muscle configuration ────────────────────────────────────────

export type MuscleStatus = "strong" | "normal" | "improve" | "weak" | "unknown";

export interface MuscleData {
  id: string;
  name: string;
  status: MuscleStatus;
  score?: number; // 1-10
  notes?: string;
  measurement?: number;
  measurementUnit?: string;
  previousMeasurement?: number;
  analysisSource?: "measurement" | "photo" | "strength" | "user_input" | "combined";
  reasoning?: string;
  weeklyVolume?: number;
  recommendedVolume?: number;
  priorityExercises?: string[];
  history?: { date: string; status: string; measurement?: number }[];
}

export const STATUS_COLORS: Record<MuscleStatus, string> = {
  strong: "#22c55e",
  normal: "#eab308",
  improve: "#f97316",
  weak: "#ef4444",
  unknown: "#3f3f46",
};

export const STATUS_LABELS: Record<MuscleStatus, string> = {
  strong: "Point fort",
  normal: "Normal",
  improve: "À améliorer",
  weak: "Point faible",
  unknown: "Non évalué",
};

export const STATUS_BG: Record<MuscleStatus, string> = {
  strong: "bg-green-500/15 border-green-500/30 text-green-400",
  normal: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400",
  improve: "bg-orange-500/15 border-orange-500/30 text-orange-400",
  weak: "bg-red-500/15 border-red-500/30 text-red-400",
  unknown: "bg-white/5 border-white/10 text-white/40",
};

export const MUSCLE_NAMES: Record<string, string> = {
  traps: "Trapèzes",
  shoulders: "Épaules",
  rear_delts: "Deltoïdes arrière",
  chest: "Pectoraux",
  biceps: "Biceps",
  triceps: "Triceps",
  forearms: "Avant-bras",
  abs: "Abdominaux",
  obliques: "Obliques",
  lats: "Dorsaux",
  lower_back: "Lombaires",
  glutes: "Fessiers",
  quads: "Quadriceps",
  hamstrings: "Ischio-jambiers",
  calves: "Mollets",
};

// Which muscles are visible from which view
export const FRONT_MUSCLES = ["traps", "shoulders", "chest", "biceps", "forearms", "abs", "obliques", "quads", "calves"];
export const BACK_MUSCLES = ["traps", "rear_delts", "triceps", "forearms", "lats", "lower_back", "glutes", "hamstrings", "calves"];

// Default muscle list with unknown status
export function getDefaultMuscles(): MuscleData[] {
  return Object.entries(MUSCLE_NAMES).map(([id, name]) => ({
    id,
    name,
    status: "unknown" as MuscleStatus,
  }));
}
