import { UserProfile, DiabetesConfig, RatioProfile } from '@/types';

export const USER_PROFILE: UserProfile = {
  name: "Ethan",
  age: 21,
  height: 188,
  weight: 85,
  diabetesType: "T1",
  insulinSystem: "Stylos basal-bolus",
  insulinRapid: "Novorapid",
  basalDose: 26,
  hasCGM: true,
  cgmType: "FreeStyle Libre",
  vo2max: 49,
  benchPress1RM: 104,
  measurements: {
    chest: null, shoulders: null, waist: null, hips: null,
    armLeft: null, armRight: null, thighLeft: null, thighRight: null,
    calfLeft: null, calfRight: null,
  },
  morphology: {
    bodyType: null, armLength: null, femurLength: null,
    torsoLength: null, shoulderWidth: null, hipWidth: null,
    muscleInsertions: {},
  },
  mobility: {
    shoulderFlexion: null, hipFlexion: null,
    ankleFlexion: null, thoracicRotation: null,
  },
  goals: ["Semi-marathon", "Prise de masse", "Glycémie stable"],
  trainingDaysPerWeek: 4,
  runningLevel: "Débutant",
  muscuLevel: "Intermédiaire",
  targetCalories: 3200,
  targetProtein: 170,
  targetCarbs: 350,
  targetFat: 90,
  weakPoints: ["Pectoraux", "Pas de squat/soulevé de terre"],
  injuries: [],
  bodyType: "Ectomorphe-Mésomorphe",
};

// Ratios Ethan (format naturel : X unités pour 10g de glucides) :
//   Matin    1,5 U / 10g  → 10 / 1.5  ≈ 6.67 g par U
//   Midi     1   U / 10g  → 10        = 10   g par U
//   Goûter   1,2 U / 10g  → 10 / 1.2  ≈ 8.33 g par U
//   Soir     1   U / 10g  → 10        = 10   g par U
// Sensib. (ISF) : 0,5 U corrige 50 mg/dL au-dessus de la cible → 1U = 100 mg/dL

// Phase 10a — Trois profils par défaut (Par défaut / Sèche / PDM).
// Les valeurs sont des points de départ raisonnables ; Ethan les ajuste
// lui-même selon son endo et son ressenti. Les profils "Sèche" et "PDM"
// partent des mêmes ratios que "Par défaut" pour que l'utilisateur
// calibre lui-même (incréments +/- 0,1 U/10g et +/- 0,5U basal standards).
const DEFAULT_PROFILE: RatioProfile = {
  id: "prof-default",
  name: "Par défaut",
  description: "Ratios courants — à utiliser hors phase spécifique.",
  ratios: { morning: 10 / 1.5, lunch: 10, snack: 10 / 1.2, dinner: 10 },
  insulinRatios: [
    { id: "r-default-morning", label: "Petit-déjeuner", mealKey: "morning", timeStart: "07:00", timeEnd: "10:00", ratio: 10 / 1.5 },
    { id: "r-default-lunch",   label: "Déjeuner",      mealKey: "lunch",   timeStart: "12:00", timeEnd: "14:00", ratio: 10 },
    { id: "r-default-snack",   label: "Goûter",        mealKey: "snack",   timeStart: "15:00", timeEnd: "17:00", ratio: 10 / 1.2 },
    { id: "r-default-dinner",  label: "Dîner",         mealKey: "dinner",  timeStart: "19:00", timeEnd: "21:00", ratio: 10 },
  ],
  insulinSensitivityFactor: 100,
  basalDose: 26,
  createdAt: new Date("2026-04-24T00:00:00.000Z").toISOString(),
};

// Sèche : moins de glucides au global → basal tend à être légèrement plus bas,
// ratios souvent stables ou un poil plus agressifs (gluconéogenèse).
// Point de départ prudent : ratios identiques, basal -0,5U à ajuster.
const CUT_PROFILE: RatioProfile = {
  id: "prof-cut",
  name: "Sèche",
  description: "Déficit calorique. Glucides réduits, basal légèrement plus bas.",
  ratios: { morning: 10 / 1.5, lunch: 10, snack: 10 / 1.2, dinner: 10 },
  insulinRatios: [
    { id: "r-cut-morning", label: "Petit-déjeuner", mealKey: "morning", timeStart: "07:00", timeEnd: "10:00", ratio: 10 / 1.5 },
    { id: "r-cut-lunch",   label: "Déjeuner",      mealKey: "lunch",   timeStart: "12:00", timeEnd: "14:00", ratio: 10 },
    { id: "r-cut-snack",   label: "Goûter",        mealKey: "snack",   timeStart: "15:00", timeEnd: "17:00", ratio: 10 / 1.2 },
    { id: "r-cut-dinner",  label: "Dîner",         mealKey: "dinner",  timeStart: "19:00", timeEnd: "21:00", ratio: 10 },
  ],
  insulinSensitivityFactor: 100,
  basalDose: 25,
  createdAt: new Date("2026-04-24T00:00:00.000Z").toISOString(),
};

// PDM (prise de masse) : surplus calorique, plus de glucides, basal souvent
// augmenté, ratios potentiellement un poil plus agressifs (repas plus lourds).
// Point de départ prudent : ratios identiques, basal +0,5U à ajuster.
const BULK_PROFILE: RatioProfile = {
  id: "prof-bulk",
  name: "PDM",
  description: "Prise de masse. Glucides élevés, basal légèrement plus haut.",
  ratios: { morning: 10 / 1.5, lunch: 10, snack: 10 / 1.2, dinner: 10 },
  insulinRatios: [
    { id: "r-bulk-morning", label: "Petit-déjeuner", mealKey: "morning", timeStart: "07:00", timeEnd: "10:00", ratio: 10 / 1.5 },
    { id: "r-bulk-lunch",   label: "Déjeuner",      mealKey: "lunch",   timeStart: "12:00", timeEnd: "14:00", ratio: 10 },
    { id: "r-bulk-snack",   label: "Goûter",        mealKey: "snack",   timeStart: "15:00", timeEnd: "17:00", ratio: 10 / 1.2 },
    { id: "r-bulk-dinner",  label: "Dîner",         mealKey: "dinner",  timeStart: "19:00", timeEnd: "21:00", ratio: 10 },
  ],
  insulinSensitivityFactor: 100,
  basalDose: 27,
  createdAt: new Date("2026-04-24T00:00:00.000Z").toISOString(),
};

export const DIABETES_PROFILES_DEFAULT: RatioProfile[] = [
  DEFAULT_PROFILE,
  CUT_PROFILE,
  BULK_PROFILE,
];

export const DIABETES_CONFIG: DiabetesConfig = {
  profiles: DIABETES_PROFILES_DEFAULT,
  activeProfileId: DEFAULT_PROFILE.id,
  // Miroirs du profil actif (synchronisés par les setters du store).
  ratios: { ...DEFAULT_PROFILE.ratios },
  insulinRatios: DEFAULT_PROFILE.insulinRatios.map((r) => ({ ...r })),
  insulinSensitivityFactor: DEFAULT_PROFILE.insulinSensitivityFactor,
  targetGlucose: 110,
  targetRange: { min: 70, max: 180 },
  insulinActiveDuration: 195,
  knownPatterns: [
    {
      name: "Remontée 16h",
      description: "Glycémie remonte ~3h30 après déjeuner",
      suggestion: "Ajouter +1U au midi ou fractionner repas",
    },
    {
      name: "Phénomène de l'aube",
      description: "Résistance hormonale 5h-8h",
      suggestion: "Ratio matin 1,5U / 10g compense bien",
    },
    {
      name: "Post-musculation",
      description: "+45 mg/dL en moyenne 1h après muscu",
      suggestion: "Prévoir correction si >180",
    },
    {
      name: "Running Z2",
      description: "-60 mg/dL pendant cardio prolongé",
      suggestion: "Réduire bolus 30-50% si repas <2h avant",
    },
  ],
};

export const HALF_MARATHON_PLAN = {
  duration: 14,
  targetRace: "Semi-marathon",
  weeklyStructure: { running: 2, muscu: 2 },
  volumeProgression: [
    1.0, 1.1, 1.2, 1.15,
    1.25, 1.35, 1.45, 1.35,
    1.5, 1.6, 1.55,
    1.3, 0.8, 0.5,
  ],
  intervalProgression: [
    null, null,
    { reps: 4, distance: 400, recovery: 400 },
    null,
    { reps: 5, distance: 600, recovery: 400 },
    { reps: 6, distance: 800, recovery: 400 },
    { reps: 5, distance: 1000, recovery: 500 },
    { reps: 4, distance: 800, recovery: 400 },
    { reps: 6, distance: 1000, recovery: 500 },
    { reps: 3, distance: 1600, recovery: 600 },
    { reps: 4, distance: 1200, recovery: 500 },
    { reps: 3, distance: 1000, recovery: 400 },
    { reps: 3, distance: 600, recovery: 400 },
    null,
  ],
};
