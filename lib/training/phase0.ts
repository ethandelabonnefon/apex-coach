/**
 * Programme « HYBRID — Phase 0 Brisbane » importé de Notion (sept. 2026).
 *
 * Source : page Notion « 🏋️ Programme — Phase 0 + 3 modes » (séances types)
 * et base « 📊 Tracker Séances » (47 séances datées, 12 oct → 28 nov 2026).
 * Import unique : Apex devient la source de vérité, Notion n'est plus relu.
 * Pour une nouvelle phase, on ajoute un fichier du même format.
 *
 * ⚠️ Pure donnée. Aucun import serveur, aucun import React.
 */

export type WorkoutKind = "Lower A" | "Upper A" | "Lower B" | "Upper B";
export type RunKind = "Run Z2" | "Sortie longue" | "Test 5 km";
export type SessionKind = WorkoutKind | RunKind;

export interface ExerciseTemplate {
  /** Identifiant stable (sert à retrouver les charges de la séance précédente). */
  id: string;
  name: string;
  sets: number;
  /** Tel qu'écrit dans Notion : "8", "6-8", "10 / jambe", "45 sec". */
  reps: string;
  cue: string;
  /** "kg" = charge à saisir ; "sec" = durée tenue ; "bw" = poids du corps. */
  unit: "kg" | "sec" | "bw";
  /** Changement de nom à partir d'une semaine (squat gobelet → barre). */
  variants?: { fromWeek: number; name: string }[];
}

export interface WorkoutTemplate {
  kind: WorkoutKind;
  title: string;
  focus: string;
  exercises: ExerciseTemplate[];
}

export interface PlannedSession {
  /** `${date}-${slug(kind)}` — unique : un type au plus par jour. */
  id: string;
  week: number;
  /** YYYY-MM-DD (heure locale). */
  date: string;
  kind: SessionKind;
  title: string;
  notes: string | null;
  durationMin: number | null;
  optional: boolean;
  deload: boolean;
}

export const PHASE0 = {
  name: "Phase 0 — Brisbane",
  startDate: "2026-10-12",
  endDate: "2026-11-28",
  weeks: 7,
} as const;

export const WORKOUT_TEMPLATES: Record<WorkoutKind, WorkoutTemplate> = {
  "Lower A": {
    kind: "Lower A",
    title: "Lower A",
    focus: "dominante squat",
    exercises: [
      { id: "squat", name: "Squat gobelet", sets: 4, reps: "8", unit: "kg", cue: "RPE 6 les 2 premières semaines, profondeur avant charge", variants: [{ fromWeek: 3, name: "Squat barre" }] },
      { id: "rdl-db", name: "Soulevé de terre roumain haltères", sets: 3, reps: "10", unit: "kg", cue: "Descente 3 sec, dos neutre, étirement ischios net" },
      { id: "walking-lunge", name: "Fentes marchées", sets: 3, reps: "10 / jambe", unit: "kg", cue: "Grands pas, torse droit" },
      { id: "leg-curl", name: "Leg curl", sets: 3, reps: "12", unit: "kg", cue: "Contrôle total du retour" },
      { id: "calf-standing", name: "Mollets debout", sets: 4, reps: "12", unit: "kg", cue: "Pause 1 sec en bas, amplitude complète" },
      { id: "plank", name: "Planche", sets: 3, reps: "45 sec", unit: "sec", cue: "Bassin verrouillé" },
    ],
  },
  "Upper A": {
    kind: "Upper A",
    title: "Upper A",
    focus: "dominante tirage horizontal",
    exercises: [
      { id: "barbell-row", name: "Rowing barre", sets: 4, reps: "8", unit: "kg", cue: "Buste 45°, tirer vers le nombril" },
      { id: "bench", name: "Développé couché", sets: 3, reps: "8", unit: "kg", cue: "Maintien — RPE 7, le 100 kg reviendra tout seul" },
      { id: "cable-row", name: "Tirage horizontal poulie, prise neutre", sets: 3, reps: "10", unit: "kg", cue: "1 sec de squeeze omoplates" },
      { id: "db-press", name: "Développé haltères assis", sets: 3, reps: "10", unit: "kg", cue: "Coudes légèrement devant" },
      { id: "face-pull", name: "Face pulls", sets: 3, reps: "15", unit: "kg", cue: "Corde vers le front, coudes hauts — ta posture se joue ici" },
      { id: "lateral-raise", name: "Élévations latérales", sets: 3, reps: "12", unit: "kg", cue: "Léger, strict, pas d'élan" },
      { id: "incline-curl", name: "Curl incliné", sets: 2, reps: "12", unit: "kg", cue: "Étirement complet en bas" },
    ],
  },
  "Lower B": {
    kind: "Lower B",
    title: "Lower B",
    focus: "dominante hinge",
    exercises: [
      { id: "rdl-bb", name: "Soulevé de terre roumain barre", sets: 4, reps: "8", unit: "kg", cue: "Le lift principal de ta chaîne postérieure" },
      { id: "bulgarian", name: "Split squat bulgare", sets: 3, reps: "8 / jambe", unit: "kg", cue: "Le transfert running n°1 — ça brûle, c'est normal" },
      { id: "hip-thrust", name: "Hip thrust", sets: 3, reps: "10", unit: "kg", cue: "Pause 1 sec en haut, fessiers serrés" },
      { id: "leg-ext", name: "Leg extension", sets: 3, reps: "12", unit: "kg", cue: "Finisher quadris" },
      { id: "calf-seated", name: "Mollets assis", sets: 4, reps: "15", unit: "kg", cue: "Soléaire = amorti de course" },
      { id: "side-plank", name: "Gainage latéral", sets: 3, reps: "30 sec / côté", unit: "sec", cue: "Stabilité de foulée" },
    ],
  },
  "Upper B": {
    kind: "Upper B",
    title: "Upper B",
    focus: "dominante tirage vertical",
    exercises: [
      { id: "pull-up", name: "Tractions (ou tirage vertical)", sets: 4, reps: "6-8", unit: "bw", cue: "Le V-taper se construit ici — lestées quand 4×8 propres" },
      { id: "incline-db", name: "Développé incliné haltères", sets: 3, reps: "8", unit: "kg", cue: "Reprise à 30-32 kg, retour aux 34 sans forcer" },
      { id: "one-arm-row", name: "Rowing haltère unilatéral", sets: 3, reps: "10 / bras", unit: "kg", cue: "Grande amplitude, sans rotation du buste" },
      { id: "lateral-raise", name: "Élévations latérales", sets: 4, reps: "12", unit: "kg", cue: "2e passage de la semaine — les épaules ont besoin de fréquence" },
      { id: "rear-delt", name: "Oiseau (rear delt)", sets: 3, reps: "15", unit: "kg", cue: "Léger, propre, brûlure ciblée" },
      { id: "face-pull", name: "Face pulls", sets: 3, reps: "15", unit: "kg", cue: "Non négociable, 2e passage" },
      { id: "triceps-rope", name: "Extension triceps corde", sets: 2, reps: "12", unit: "kg", cue: "Volume d'appoint" },
    ],
  },
};

/** Les 5 règles d'or du dashboard Notion. */
export const GOLDEN_RULES = [
  "Jambes en premier dans la semaine — quand tu es frais, pas quand la motivation négocie.",
  "Ratio tirage / poussée 2:1 pendant 3 mois minimum.",
  "Pas de jambes lourdes la veille d'une sortie longue.",
  "Un jour de repos complet minimum par semaine.",
  "Jour double = muscu d'abord, cardio ensuite.",
] as const;

type Row = [week: number, date: string, kind: SessionKind, title: string, durationMin: number | null, notes: string | null];

// Copie exacte du Tracker Notion (ordre chronologique).
const ROWS: Row[] = [
  [1, "2026-10-12", "Lower A", "Lower A — la reprise des jambes", null, "RPE 6 max — squat gobelet, charges humbles, même si l'ego dit le contraire. Les courbatures de mercredi seront violentes : c'est prévu, c'est normal, ça passe."],
  [1, "2026-10-13", "Upper A", "Upper A + footing 30 min", null, "Jour double : muscu d'abord, footing Z2 derrière. Noter glycémie avant/après les deux."],
  [1, "2026-10-13", "Run Z2", "Run Z2 — 30 min", 30, "Z2 stricte : conversation possible. Trop dur ? Tu marches. À Brisbane, même en octobre : pars tôt ou en fin de journée, hydratation avant-pendant-après."],
  [1, "2026-10-15", "Lower B", "Lower B — hinge", null, "RDL : la charge est secondaire, l'étirement des ischios est le signal. Split squats bulgares = bienvenue en enfer, c'est le meilleur exercice du programme."],
  [1, "2026-10-16", "Upper B", "Upper B — tirage vertical", null, "Incliné haltères : reprise à 30 kg propre, pas 34. Face pulls stricts."],
  [1, "2026-10-17", "Run Z2", "Run Z2 — 30 min (à jeun à tester)", 30, "Footing à jeun SEULEMENT si testé et validé en France avec ton diabéto — sinon footing classique, zéro pression. À Brisbane : départ avant 7h, kit hypo sur toi, boucle près du logement."],
  [1, "2026-10-18", "Run Z2", "Run Z2 — 30 min (optionnel)", 30, "3e footing si les jambes répondent. Sinon repos complet — la semaine 1 est une semaine d'installation, pas de perf. Profites-en pour repérer les outdoor gyms du quartier."],
  [2, "2026-10-19", "Lower A", "Lower A", null, "Dernière semaine squat gobelet — technique propre = passage barre en S3. Courbatures encore là ? Normal, ça se calme cette semaine."],
  [2, "2026-10-20", "Upper A", "Upper A", null, "Jour double : muscu puis run."],
  [2, "2026-10-20", "Run Z2", "Run Z2 — 30 min", 30, "30 min Z2, après la muscu."],
  [2, "2026-10-22", "Lower B", "Lower B", null, "Mêmes charges qu'en S1 si les courbatures ont été rudes, sinon +1 rep partout."],
  [2, "2026-10-23", "Upper B", "Upper B", null, "Tractions : noter le max propre — c'est ta référence de progression."],
  [2, "2026-10-24", "Run Z2", "Run Z2 — 30 min", 30, "30 min Z2. À jeun si protocole validé en France, sinon classique."],
  [2, "2026-10-25", "Run Z2", "Run Z2 — 30 min (optionnel)", 30, "Optionnel — selon jambes et feu WHOOP."],
  [3, "2026-10-26", "Lower A", "Lower A — squat barre", null, "PASSAGE AU SQUAT BARRE : barre vide, puis montées progressives, RPE 7 max. La profondeur avant la charge, semaine de technique."],
  [3, "2026-10-27", "Upper A", "Upper A", null, "Jour double. Les runs passent à 35 min cette semaine."],
  [3, "2026-10-27", "Run Z2", "Run Z2 — 35 min", 35, "35 min Z2 — première montée de volume."],
  [3, "2026-10-29", "Lower B", "Lower B", null, "RDL barre : même logique que le squat — technique d'abord, la charge suivra vite."],
  [3, "2026-10-30", "Upper B", "Upper B", null, null],
  [3, "2026-10-31", "Run Z2", "Run Z2 — 35 min", 35, "35 min Z2."],
  [3, "2026-11-01", "Run Z2", "Run Z2 — 35 min (optionnel)", 35, "Optionnel — 35 min."],
  [4, "2026-11-02", "Lower A", "Lower A", null, "Semaine de consolidation : +2,5 kg ou +1 rep partout où toutes les séries sont passées au RPE cible."],
  [4, "2026-11-03", "Upper A", "Upper A", null, "Jour double."],
  [4, "2026-11-03", "Run Z2", "Run Z2 — 35 min", 35, "35 min Z2."],
  [4, "2026-11-05", "Lower B", "Lower B", null, null],
  [4, "2026-11-06", "Upper B", "Upper B", null, null],
  [4, "2026-11-07", "Run Z2", "Run Z2 — 35 min", 35, "35 min Z2."],
  [4, "2026-11-08", "Run Z2", "Run Z2 — 35 min (optionnel)", 35, "Optionnel. Fin de S4 = un mois de programme : jette un œil aux moyennes du Journal avant d'ajuster les kcal."],
  [5, "2026-11-09", "Lower A", "Lower A", null, null],
  [5, "2026-11-10", "Upper A", "Upper A", null, "Jour double. Runs : 40 min cette semaine, sortie longue samedi 45 min."],
  [5, "2026-11-10", "Run Z2", "Run Z2 — 40 min", 40, "40 min Z2."],
  [5, "2026-11-12", "Lower B", "Lower B", null, null],
  [5, "2026-11-13", "Upper B", "Upper B", null, null],
  [5, "2026-11-14", "Sortie longue", "Sortie longue — 45 min", 45, "PREMIÈRE SORTIE LONGUE — 45 min Z2 stricte. Gilet + eau + kit hypo. Le rythme n'a aucune importance, la durée est le seul objectif."],
  [5, "2026-11-15", "Run Z2", "Run Z2 — 40 min (optionnel)", 40, "Optionnel — 40 min très faciles, jambes légères après la longue d'hier."],
  [6, "2026-11-16", "Lower A", "Lower A", null, null],
  [6, "2026-11-17", "Upper A", "Upper A", null, "Jour double. Dernière grosse semaine avant l'allègement."],
  [6, "2026-11-17", "Run Z2", "Run Z2 — 40 min", 40, "40 min Z2."],
  [6, "2026-11-19", "Lower B", "Lower B", null, null],
  [6, "2026-11-20", "Upper B", "Upper B", null, "Léger sur les jambes en fin de séance — sortie longue demain."],
  [6, "2026-11-21", "Sortie longue", "Sortie longue — 50 min", 50, "50 min Z2 — la plus longue de la phase. Même protocole : gilet, eau, kit hypo, durée avant rythme."],
  [6, "2026-11-22", "Run Z2", "Run Z2 — 40 min (optionnel)", 40, "Optionnel — 40 min faciles."],
  [7, "2026-11-23", "Lower A", "Lower A — deload", null, "SEMAINE D'ALLÈGEMENT : charges −30 %, mêmes mouvements, séance courte. Objectif : arriver frais samedi."],
  [7, "2026-11-24", "Upper A", "Upper A — deload", null, "Deload −30 %, séance courte."],
  [7, "2026-11-24", "Run Z2", "Run facile — 25 min", 25, "25 min très faciles + 3-4 lignes droites de 15 sec en fin (accélérations progressives, pas des sprints)."],
  [7, "2026-11-27", "Upper B", "Upper B — deload", null, "Deload −30 %, court, zéro jambes."],
  [7, "2026-11-28", "Test 5 km", "Test 5 km", 30, "LE TEST : échauffement 15 min progressif, puis 5 km au max soutenable RÉGULIER (pas de départ canon). C'est ta baseline officielle. Diabète : l'intensité peut faire MONTER la glycémie pendant (adrénaline) puis la faire chuter fort dans les 2-3 h après — kit hypo, surveillance rapprochée post-test. Note ton temps dans le Journal."],
];

export function slugKind(kind: SessionKind): string {
  return kind.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export const PLANNED_SESSIONS: PlannedSession[] = ROWS.map(([week, date, kind, title, durationMin, notes]) => ({
  id: `${date}-${slugKind(kind)}`,
  week,
  date,
  kind,
  title,
  notes,
  durationMin,
  optional: /optionnel/i.test(title),
  deload: week === 7 && kind in WORKOUT_TEMPLATES,
}));

export function isWorkoutKind(kind: SessionKind): kind is WorkoutKind {
  return kind in WORKOUT_TEMPLATES;
}
