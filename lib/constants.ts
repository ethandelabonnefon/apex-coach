import { UserProfile, DiabetesConfig } from '@/types';

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
export const DIABETES_CONFIG: DiabetesConfig = {
  ratios: { morning: 10 / 1.5, lunch: 10, snack: 10 / 1.2, dinner: 10 },
  insulinRatios: [
    { id: "r-morning", label: "Petit-déjeuner", mealKey: "morning", timeStart: "07:00", timeEnd: "10:00", ratio: 10 / 1.5 },
    { id: "r-lunch", label: "Déjeuner", mealKey: "lunch", timeStart: "12:00", timeEnd: "14:00", ratio: 10 },
    { id: "r-snack", label: "Goûter", mealKey: "snack", timeStart: "15:00", timeEnd: "17:00", ratio: 10 / 1.2 },
    { id: "r-dinner", label: "Dîner", mealKey: "dinner", timeStart: "19:00", timeEnd: "21:00", ratio: 10 },
  ],
  insulinSensitivityFactor: 100,
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

export const MUSCU_PROGRAM = {
  name: "Push/Pull/Legs — Hypertrophie",
  type: "PPL" as const,
  daysPerWeek: 4,
  currentWeek: 1,
  currentPhase: "Accumulation",
  sessions: [
    {
      id: "push-a",
      name: "Push A — Pectoraux & Épaules",
      day: "Lundi",
      focus: "Hypertrophie pectoraux",
      duration: 65,
      exercises: [
        {
          order: 1, name: "Développé couché haltères", sets: 4, reps: "8-10", rir: 2, rest: 150, weight: null,
          reasoning: "Choisi plutôt que la barre : tes bras longs créent un désavantage sur la barre. Meilleur stretch du pectoral en bas du mouvement. +15% activation avec haltères (Schoenfeld, 2016).",
          cues: ["Omoplates rétractées et abaissées", "Descendre jusqu'à sentir l'étirement pec", "Coudes à 45° du corps", "Expirer en poussant"],
          alternatives: [{ name: "Développé couché barre", reason: "Si haltères lourds non dispo" }, { name: "Machine convergente", reason: "Si fatigue élevée" }],
        },
        {
          order: 2, name: "Développé incliné haltères", sets: 3, reps: "10-12", rir: 2, rest: 120, weight: null,
          reasoning: "Cible la portion claviculaire du pectoral, souvent sous-développée. L'angle de 30° est optimal (Trebs et al., 2010).",
          cues: ["Inclinaison 30°", "Ne pas verrouiller en haut", "Contrôle excentrique 2-3s"],
          alternatives: [{ name: "Pec deck incliné", reason: "Moins de fatigue systémique" }],
        },
        {
          order: 3, name: "Écarté poulie vis-à-vis", sets: 3, reps: "12-15", rir: 1, rest: 90, weight: null,
          reasoning: "Isolation pectoraux avec tension constante grâce aux câbles. Excellent pour le stretch médial.",
          cues: ["Légère flexion du coude fixe", "Serrer en fin de mouvement", "Stretch complet en bas"],
          alternatives: [{ name: "Écarté haltères", reason: "Si pas de poulie" }],
        },
        {
          order: 4, name: "Développé militaire haltères", sets: 3, reps: "8-10", rir: 2, rest: 120, weight: null,
          reasoning: "Développe les deltoïdes antérieurs et latéraux. Haltères pour meilleur ROM et activation du stabilisateur.",
          cues: ["Abdos gainés", "Ne pas cambrer le dos", "Monter au-dessus de la tête"],
          alternatives: [{ name: "Machine épaules", reason: "Si fatigue importante" }],
        },
        {
          order: 5, name: "Élévations latérales", sets: 4, reps: "15-20", rir: 1, rest: 60, weight: null,
          reasoning: "Volume élevé nécessaire pour les deltoïdes latéraux (Israetel). Reps hautes pour meilleure connexion musculaire.",
          cues: ["Légère inclinaison vers l'avant", "Mener avec le coude", "Pas plus haut que les épaules"],
          alternatives: [{ name: "Élévations câble", reason: "Meilleure tension constante" }],
        },
        {
          order: 6, name: "Extensions triceps poulie", sets: 3, reps: "12-15", rir: 1, rest: 60, weight: null,
          reasoning: "Isolation triceps pour compléter le volume de press. La corde permet une meilleure contraction.",
          cues: ["Coudes fixes le long du corps", "Extension complète", "Séparer la corde en bas"],
          alternatives: [{ name: "Dips machine", reason: "Si poulie occupée" }],
        },
      ],
      notes: { glycemia: "Muscu intense peut faire monter la glycémie. Prévoir correction si >180 après.", recovery: "Si Recovery <50%, réduire le volume de 20%", progression: "Ajouter 1 rep par séance jusqu'au haut de la fourchette, puis +2.5kg" },
    },
    {
      id: "pull-a",
      name: "Pull A — Dos & Biceps",
      day: "Mardi",
      focus: "Dos largeur + épaisseur",
      duration: 60,
      exercises: [
        {
          order: 1, name: "Tractions lestées", sets: 4, reps: "6-8", rir: 2, rest: 180, weight: null,
          reasoning: "Meilleur exercice pour le dos en largeur. Tes bras longs = excellent levier pour les tractions.",
          cues: ["Prise pronation largeur d'épaules+", "Tirer les coudes vers les hanches", "Montée contrôlée, descente lente"],
          alternatives: [{ name: "Lat pulldown", reason: "Si pas assez de reps" }],
        },
        {
          order: 2, name: "Rowing haltère", sets: 3, reps: "8-10", rir: 2, rest: 120, weight: null,
          reasoning: "Épaisseur du dos. Unilatéral pour corriger asymétries et grand ROM.",
          cues: ["Dos plat, genou sur banc", "Tirer vers la hanche", "Squeeze 1s en haut"],
          alternatives: [{ name: "Rowing barre", reason: "Pour plus de charge" }],
        },
        {
          order: 3, name: "Rowing poulie basse prise serrée", sets: 3, reps: "10-12", rir: 2, rest: 90, weight: null,
          reasoning: "Cible les rhomboïdes et le milieu du dos. Tension constante du câble.",
          cues: ["Tirer vers le nombril", "Ouvrir la poitrine en fin de mouvement", "Ne pas balancer"],
          alternatives: [{ name: "T-bar row", reason: "Variation de stimulus" }],
        },
        {
          order: 4, name: "Face pulls", sets: 3, reps: "15-20", rir: 1, rest: 60, weight: null,
          reasoning: "Santé des épaules + deltoïde postérieur. Essentiels pour l'équilibre push/pull.",
          cues: ["Tirer vers le front", "Rotation externe en fin", "Coudes hauts"],
          alternatives: [{ name: "Reverse pec deck", reason: "Si pas de câble" }],
        },
        {
          order: 5, name: "Curl haltères incliné", sets: 3, reps: "10-12", rir: 1, rest: 60, weight: null,
          reasoning: "Meilleur stretch du biceps long chef grâce à l'extension d'épaule.",
          cues: ["Banc à 45°", "Ne pas balancer", "Supination en montant"],
          alternatives: [{ name: "Curl barre EZ", reason: "Pour charges lourdes" }],
        },
      ],
      notes: { glycemia: "Muscu intense peut faire monter la glycémie. Prévoir correction si >180 après.", recovery: "Si Recovery <50%, réduire le volume de 20%", progression: "Double progression : reps max → +2.5kg" },
    },
    {
      id: "legs-a",
      name: "Legs — Quadriceps & Ischios",
      day: "Jeudi",
      focus: "Développement des jambes",
      duration: 70,
      exercises: [
        {
          order: 1, name: "Presse à cuisses", sets: 4, reps: "8-10", rir: 2, rest: 150, weight: null,
          reasoning: "Alternative au squat : tu n'as pas d'expérience en squat. La presse permet de charger lourd en sécurité tout en apprenant le pattern.",
          cues: ["Pieds largeur d'épaules, mi-hauteur", "Descendre jusqu'à 90° de flexion du genou", "Ne pas verrouiller en haut", "Dos plaqué au dossier"],
          alternatives: [{ name: "Hack squat", reason: "Plus de recrutement des quadriceps" }],
        },
        {
          order: 2, name: "Squat bulgare", sets: 3, reps: "10-12", rir: 2, rest: 120, weight: null,
          reasoning: "Unilatéral excellent pour la stabilité et la mobilité. Prépare au squat classique.",
          cues: ["Pied arrière surélevé sur banc", "Genou avant au-dessus du pied", "Descente contrôlée"],
          alternatives: [{ name: "Fentes marchées", reason: "Plus fonctionnel" }],
        },
        {
          order: 3, name: "Leg extension", sets: 3, reps: "12-15", rir: 1, rest: 60, weight: null,
          reasoning: "Isolation des quadriceps. Complète le volume sans fatigue systémique.",
          cues: ["Extension complète", "Pause 1s en haut", "Descente lente 3s"],
          alternatives: [{ name: "Sissy squat", reason: "Si machine non dispo" }],
        },
        {
          order: 4, name: "Romanian deadlift haltères", sets: 3, reps: "10-12", rir: 2, rest: 120, weight: null,
          reasoning: "Cible les ischio-jambiers en excentrique. Haltères pour un pattern plus naturel si tu débutes.",
          cues: ["Légère flexion des genoux fixe", "Descendre le long des jambes", "Sentir l'étirement ischio", "Remonter en serrant les fessiers"],
          alternatives: [{ name: "Leg curl couché", reason: "Si fatigue du bas du dos" }],
        },
        {
          order: 5, name: "Leg curl assis", sets: 3, reps: "12-15", rir: 1, rest: 60, weight: null,
          reasoning: "Isolation ischio-jambiers en position étirée (assis). Complémentaire du RDL.",
          cues: ["Contraction complète", "Résister en excentrique", "Ne pas utiliser l'élan"],
          alternatives: [{ name: "Nordic curl", reason: "Progression avancée" }],
        },
        {
          order: 6, name: "Mollets debout", sets: 4, reps: "15-20", rir: 1, rest: 45, weight: null,
          reasoning: "Soleus et gastrocnémien. Reps élevées car fibres majoritairement lentes.",
          cues: ["Amplitude complète", "Pause 2s en bas (stretch)", "Montée explosive"],
          alternatives: [{ name: "Mollets presse", reason: "Si machine non dispo" }],
        },
      ],
      notes: { glycemia: "Séance jambes intense = montée glycémique probable. Scanner avant et 1h après.", recovery: "Séance très exigeante. Si recovery <40%, reporter.", progression: "Presse : objectif +5kg par semaine" },
    },
    {
      id: "push-b",
      name: "Push B — Volume Pec & Épaules",
      day: "Vendredi",
      focus: "Volume pectoraux (point faible)",
      duration: 60,
      exercises: [
        {
          order: 1, name: "Développé couché barre", sets: 4, reps: "6-8", rir: 2, rest: 180, weight: null,
          reasoning: "Séance B : on utilise la barre pour varier le stimulus. Travailler en force avec moins de reps.",
          cues: ["Prise 1.5x largeur d'épaules", "Toucher le sternum", "Pousser en arc vers le rack"],
          alternatives: [{ name: "Développé couché machine", reason: "Si pas de pareur" }],
        },
        {
          order: 2, name: "Dips lestés", sets: 3, reps: "8-10", rir: 2, rest: 120, weight: null,
          reasoning: "Excellent mouvement composé pour pec inférieur et triceps. Complémentaire du couché.",
          cues: ["Inclinaison vers l'avant", "Descendre jusqu'à 90° du coude", "Pas de rebond en bas"],
          alternatives: [{ name: "Développé décliné", reason: "Si douleur épaule" }],
        },
        {
          order: 3, name: "Pec deck", sets: 3, reps: "12-15", rir: 0, rest: 60, weight: null,
          reasoning: "Isolation pour le volume additionnel sur les pecs. Aller à l'échec car dernier exercice pec.",
          cues: ["Contracter fort en fin de mouvement", "Stretch complet", "Mouvement lent et contrôlé"],
          alternatives: [{ name: "Écarté câbles bas", reason: "Pour cibler le haut du pec" }],
        },
        {
          order: 4, name: "Développé militaire barre", sets: 3, reps: "6-8", rir: 2, rest: 150, weight: null,
          reasoning: "Version barre pour travailler plus lourd et en force sur les épaules.",
          cues: ["Abdos serrés", "Barre devant le menton", "Verrouiller en haut"],
          alternatives: [{ name: "Arnold press", reason: "Plus de deltoïde antérieur" }],
        },
        {
          order: 5, name: "Élévations latérales câble", sets: 4, reps: "12-15", rir: 1, rest: 60, weight: null,
          reasoning: "Câble = tension constante, meilleur que haltères pour les latérales selon EMG.",
          cues: ["Un bras à la fois", "Mener avec le coude", "Contrôler la descente"],
          alternatives: [{ name: "Machine latérale", reason: "Si câble occupé" }],
        },
        {
          order: 6, name: "Barre au front", sets: 3, reps: "10-12", rir: 1, rest: 60, weight: null,
          reasoning: "Excellent pour le long chef du triceps. Complète le volume bras de la séance.",
          cues: ["Descendre derrière la tête", "Coudes fixes", "Ne pas verrouiller en haut"],
          alternatives: [{ name: "Overhead extension câble", reason: "Moins stressant pour les coudes" }],
        },
      ],
      notes: { glycemia: "Surveiller glycémie, surtout si séance après le repas.", recovery: "Volume modéré, récupération correcte.", progression: "DC barre : objectif progresser vers 110kg 1RM" },
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
