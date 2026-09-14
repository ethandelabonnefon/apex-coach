// ============================================
// APEX Coach — Core Types
// ============================================

export interface UserProfile {
  name: string;
  age: number;
  height: number;
  weight: number;
  diabetesType: string;
  insulinSystem: string;
  insulinRapid: string;
  basalDose: number;
  /** ISO de la dernière fois où basalDose a réellement changé de valeur. Sert à
   * réinitialiser la calibration nuit (dérive/dawn/biais) — cf. lib/night-calibration.ts. */
  basalDoseChangedAt?: string;
  /**
   * Créneau → ISO du dernier changement de son ratio. La validation des
   * doses (lib/dose-validation.ts) ne remonte jamais avant ce tampon :
   * mélanger des repas d'avant et d'après un changement reviendrait à
   * mesurer deux réglages dans le même échantillon.
   */
  ratioChangedAt?: Partial<Record<string, string>>;
  hasCGM: boolean;
  cgmType: string;
  vo2max: number;
  benchPress1RM: number;
  measurements: Measurements;
  morphology: MorphologyData;
  mobility: MobilityData;
  goals: string[];
  trainingDaysPerWeek: number;
  runningLevel: string;
  muscuLevel: string;
  targetCalories: number;
  targetProtein: number;
  targetCarbs: number;
  targetFat: number;
  weakPoints: string[];
  injuries: string[];
  bodyType: string;
}

export interface Measurements {
  chest: number | null;
  shoulders: number | null;
  waist: number | null;
  hips: number | null;
  armLeft: number | null;
  armRight: number | null;
  thighLeft: number | null;
  thighRight: number | null;
  calfLeft: number | null;
  calfRight: number | null;
}

export interface MorphologyData {
  bodyType: string | null;
  armLength: string | null;
  femurLength: string | null;
  torsoLength: string | null;
  shoulderWidth: string | null;
  hipWidth: string | null;
  muscleInsertions: Record<string, string>;
}

export interface MobilityData {
  shoulderFlexion: string | null;
  hipFlexion: string | null;
  ankleFlexion: string | null;
  thoracicRotation: string | null;
}

export interface InsulinRatio {
  id: string;
  label: string;
  mealKey: string;       // 'morning' | 'lunch' | 'snack' | 'dinner' | custom
  timeStart: string;     // "07:00"
  timeEnd: string;       // "10:00"
  ratio: number;         // 1:X
}

/**
 * Profil de ratios insuline — permet de switcher entre Sèche / PDM / Maintenance
 * selon la période (chaque phase a ses propres ratios + basal).
 * Source de vérité en Phase 10a. Les champs flat dans DiabetesConfig
 * (ratios, insulinRatios, insulinSensitivityFactor) sont des miroirs du
 * profil actif, synchronisés par les setters du store (rétrocompat consumers).
 */
export interface RatioProfile {
  id: string;
  name: string;                // "Par défaut" | "Sèche" | "PDM" | custom
  description?: string;
  ratios: { morning: number; lunch: number; snack: number; dinner: number };
  insulinRatios: InsulinRatio[];
  insulinSensitivityFactor: number;
  basalDose: number;           // lent du soir (Lantus/Toujeo/Tresiba…)
  createdAt: string;           // ISO
}

export interface DiabetesConfig {
  // Multi-profils (Phase 10a)
  profiles: RatioProfile[];
  activeProfileId: string;
  // Global (pas par profil)
  targetGlucose: number;
  targetRange: { min: number; max: number };
  insulinActiveDuration: number;
  /**
   * Barème de couverture des lipides pour la 2ᵉ injection (sept. 2026) :
   * part du bolus glucides selon la quantité de lipides du repas. Optionnel
   * — absent, le barème par défaut de `lib/fat-coverage.ts` s'applique, donc
   * aucune migration du store n'est nécessaire.
   *
   * Réglable par l'utilisateur : les paliers intermédiaires sont interpolés
   * entre deux ancrages mesurés, pas observés. Cf. le design du 10/09/2026.
   */
  fatCoverageTiers?: { moderate: number; high: number; veryHigh: number };
  knownPatterns: DiabetesPattern[];
  // Miroirs du profil actif (rétrocompat — Phase 5 à 9)
  ratios: { morning: number; lunch: number; snack: number; dinner: number };
  insulinRatios: InsulinRatio[];
  insulinSensitivityFactor: number;
}

export interface DiabetesPattern {
  name: string;
  description: string;
  suggestion: string;
}

export interface GlucoseReading {
  id: string;
  value: number;
  trend: string;
  recordedAt: Date;
}

export interface InsulinLog {
  id: string;
  units: number;
  insulinType: string;
  mealType: string;
  carbsGrams: number;
  glucoseBefore: number;
  notes: string;
  injectedAt: Date;
  /** ID du profil ratio actif au moment de l'injection (Phase 10a). */
  profileId?: string;
  // ─── Phase 11 — Meal context ────────────────────────────────────────
  /** Lipides du repas en grammes (optionnel — copié depuis Yazio). */
  fatGrams?: number;
  /** Protéines du repas en grammes (optionnel). */
  proteinGrams?: number;
  /** Quick-tag visuel du repas (ex: "pates", "pizza", "snack-sucre"…). */
  mealTag?: string;
  /** Taille du repas (multiplie les valeurs moyennes du tag). */
  mealSize?: 'normal' | 'big' | 'huge';
  /** Tendance Libre au moment de l'injection (Abbott numérique 1..5). */
  trendArrow?: number;
  /** True si c'est la 2e injection d'un split (FPU). */
  isSplitDose?: boolean;
  /** Lien vers la 1re injection si split. */
  parentInjectionId?: string;
  // ─── Confirmation des glucides réels (septembre 2026) ───────────────
  /** Glucides réellement mangés, confirmés après le repas. Prime sur carbsGrams. */
  carbsConfirmedGrams?: number;
  /** Lipides confirmés après le repas. Prime sur fatGrams. */
  fatConfirmedGrams?: number;
  /** Protéines confirmées après le repas. Prime sur proteinGrams. */
  proteinConfirmedGrams?: number;
  /** ISO du moment de la confirmation. */
  carbsConfirmedAt?: string;
  /**
   * Quantité de glucides déclarée non fiable (plat au resto, portion inconnue).
   * Rend l'app muette sur la dose et exclut le repas de l'apprentissage —
   * mais les glucides restent dans le calcul de couverture, sinon on
   * conclurait à tort « trop d'insuline, mange des glucides ».
   */
  carbsUncertain?: boolean;
  /**
   * Séance déclarée pour laquelle cette dose a été RÉDUITE (briefing au
   * moment du bolus, sept. 2026). Avant, la seule trace était
   * `notes: "pré-running"` — un texte que personne ne lisait. Ce champ
   * relie la dose basse à sa raison ; les modules en aval (apprentissage,
   * appoint post-séance) passent par la séance elle-même.
   */
  sportSessionId?: string;
}

/** Nature d'un rappel serveur. */
export type ReminderKind = 'split' | 'meal-confirm' | 'post-session';

/**
 * Rappel programmé côté serveur (KV) et tiré par le cron, donc reçu même
 * app fermée. Trois natures :
 *  - 'split'        : 2e injection d'un split dose (couverture lipides)
 *  - 'meal-confirm' : confirmation des glucides réellement mangés (T+20)
 *  - 'post-session' : appoint qui couvre les glucides du sport encore en
 *                     digestion, 30 min après la fin de la séance
 *                     (`lib/post-session-insulin.ts`)
 */
export interface Reminder {
  id: string;
  /** Absent sur les rappels créés avant septembre 2026 → lire comme 'split'. */
  kind?: ReminderKind;
  /**
   * split / meal-confirm : l'injection d'origine. post-session : l'id de la
   * `DeclaredSportSession`, qui n'a pas d'injection parente.
   */
  parentInjectionId: string;
  /** split & post-session : dose à faire · meal-confirm : dose déjà faite. */
  units: number;
  triggerAt: string;        // ISO timestamp
  createdAt: string;        // ISO
  mealLabel?: string;       // ex: "pâtes", "pizza"
  /** meal-confirm uniquement : glucides estimés au moment du bolus. */
  carbsEstimated?: number;
  /** "pending" | "fired" | "dismissed" — pour ne pas re-tirer le rappel */
  status: 'pending' | 'fired' | 'dismissed';
}

/**
 * Alias historique. Le store Zustand ne persiste que des rappels de split ;
 * conservé pour ne pas casser les imports existants.
 */
export type SplitDoseReminder = Reminder;

/**
 * Glucides ingérés SANS (ou avec peu d') insuline — ex: re-sucrage pendant
 * une course, compote quand on est bas, collation non bolussée (juin 2026).
 *
 * Sert à la prédiction glycémique 8h : ces glucides font MONTER la glycémie
 * sans baisse d'IOB associée. Distinct des `meals` (tracker nutrition) pour
 * éviter tout double-comptage avec les bolus.
 */
export interface CarbEntry {
  id: string;
  /** Libellé optionnel (ex: "Compote", "Banane"). */
  label?: string;
  carbsGrams: number;
  fatGrams?: number;
  proteinGrams?: number;
  /** Insuline prise pour ces glucides (U). 0 par défaut (glucides sans insuline). */
  insulinUnits?: number;
  /** ISO du moment de l'ingestion. */
  eatenAt: string;
  /**
   * Traçabilité vers le `HypoEvent` d'origine quand ce `CarbEntry` vient
   * d'un re-sucrage (cf. `buildHypoCarbEntry` dans `lib/hypo-resucrage.ts`).
   * Absent pour toute entrée saisie manuellement (CarbEntryLogger).
   */
  hypoEventId?: string;
  /**
   * Traçabilité vers la `DeclaredSportSession` quand ces glucides ont été
   * pris pour couvrir un effort (sept. 2026). Même traitement que
   * `hypoEventId` : comptés dans les glucides actifs (la glycémie monte
   * réellement, la prédiction doit les voir), mais exclus de la couverture
   * insuline (`insulinNeededU`) et de l'apprentissage du détecteur de
   * sur-dosage — ils compensent une baisse due au sport, ce n'est pas un
   * repas à couvrir ni à juger.
   */
  sportSessionId?: string;
}

/**
 * Hypoglycemia event — Phase H (juin 2026).
 *
 * Trace une hypo et son re-sucrage pour permettre :
 *  - L'apprentissage du GRG perso (Glucose Response per Gram)
 *  - Le feedback "tu as bien fait" / "trop" / "pas assez"
 *  - L'amélioration des recommandations futures
 */
export interface HypoEvent {
  id: string;
  /** ISO du moment où l'hypo a été détectée (ou loggée). */
  detectedAt: string;
  /** Glycémie initiale (au moment du re-sucrage). */
  initialGlucose: number;
  /** Grammes de glucides consommés au re-sucrage. */
  carbsConsumed: number;
  /** ISO du moment du re-sucrage. */
  consumedAt: string;
  /** Checkpoints glycémie auto-trackés (en mg/dL) ou null si pas encore. */
  glucoseAt15min: number | null;
  glucoseAt30min: number | null;
  glucoseAt45min: number | null;
  glucoseAt60min: number | null;
  /** Pic glycémique atteint entre T+15 et T+90 (auto). */
  peakGlucose: number | null;
  /** Évaluation auto à T+60 :
   *  - 'pending'     : pas encore évalué (avant T+60)
   *  - 'just-right'  : glycémie remontée en cible 90-160 sans over-correction
   *  - 'too-much'    : pic > 180 → tu as mangé trop
   *  - 'too-little'  : encore < 80 à T+30 → pas assez
   *  - 'unknown'     : pas assez de data (capteur down, etc.)
   */
  assessment: 'pending' | 'just-right' | 'too-much' | 'too-little' | 'unknown';
  notes?: string;
  // ── Contexte au moment de la détection (anti-pollution GRG) ──────────
  /** IOB en U au moment du re-sucrage. Optional pour compat anciennes hypos. */
  iobAtDetection?: number;
  /** Minutes depuis le dernier bolus repas (null si > 6h ou aucun). */
  lastBolusMinutesAgo?: number | null;
  /** Units du dernier bolus repas (pour contexte). */
  lastBolusUnits?: number | null;
  /** Contexte auto-classé :
   *  - 'normal'       : hypo "vraie" (IOB faible, pas de bolus récent), utilisée pour le GRG
   *  - 'over-bolus'   : IOB ou bolus récent suspect → exclue par défaut du GRG
   *  - 'post-exercise': hypo post-sport (sensibilité accrue) → exclue par défaut
   *  - 'unknown'      : pas d'info, inclus par défaut
   */
  context?: 'normal' | 'over-bolus' | 'post-exercise' | 'unknown';
  /** Si true → exclu du calcul du GRG perso (auto ou choix utilisateur). */
  excludeFromLearning?: boolean;
}

export interface Meal {
  id: string;
  mealType: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  foods: FoodItem[];
  eatenAt: Date;
}

export interface FoodItem {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Exercise {
  order: number;
  name: string;
  sets: number;
  reps: string;
  rir: number;
  rest: number;
  weight: number | null;
  reasoning: string;
  cues: string[];
  alternatives: { name: string; reason: string }[];
}

export interface WorkoutSession {
  id: string;
  name: string;
  type: 'muscu' | 'running';
  duration: number;
  focus: string;
  exercises: Exercise[];
  notes: { glycemia: string; recovery: string; progression: string };
}

export interface CompletedSet {
  reps: number;
  weight: number;
  rir: number;
}

export interface CompletedExercise {
  name: string;
  sets: CompletedSet[];
  difficulty: number;
  pumpRating: number;
}

export interface RunningZone {
  name: string;
  percentVMA: { min: number; max: number };
  speedKmh: { min: number; max: number };
  paceMinKm: { min: number; max: number };
  hrPercent: { min: number; max: number };
  feeling: string;
  purpose: string;
}

export interface RunningSession {
  name: string;
  type: string;
  zone: string;
  structure: RunningSegment[];
  reasoning: string;
  t1Note?: string;
}

export interface RunningSegment {
  segment: string;
  distance?: number;
  pace?: { min: number; max: number };
  zone?: string;
  description?: string;
  intervals?: { reps: number; distance: number; recovery: number };
  recoveryPace?: { min: number; max: number };
}

export interface WeekPlan {
  weekNumber: number;
  phase: string;
  totalVolume: string;
  sessions: RunningSession[];
}

/**
 * Checkpoint glycémie capturé pendant une séance GPS (Phase C).
 * Stocké dans la session pour permettre :
 *  - Replay coloré sur la carte (polyline segmentée)
 *  - Graphique glycémie post-séance
 *  - Enrichissement direct de SportGlucoseCorrelation (Bloc 6)
 */
export interface SessionGlucoseCheckpoint {
  /** Label sémantique : "T+0", "T+5min", "Km 1", "Km 2", "Pause", "T+30min post"… */
  label: string;
  /** Offset en secondes depuis le début de la séance. */
  offsetSec: number;
  /** Glycémie en mg/dL. */
  value: number;
  /** Timestamp ms absolu. */
  timestamp: number;
  /** Distance cumulée en mètres au moment du checkpoint (0 si pré-séance). */
  distanceMeters: number;
  /** Trend Libre numérique (1=↓↓ ... 5=↑↑) si dispo. */
  trend?: number;
}

export interface CompletedRunningSession {
  id: string;
  weekNumber: number;
  sessionIndex: number;
  date: string;
  plannedDistance: number;
  actualDistance: number;
  actualDuration: number; // minutes
  avgPace: number; // min/km
  glucoseBefore: number | null;
  glucoseAfter: number | null;
  feeling: 'great' | 'good' | 'ok' | 'hard' | 'bad';
  notes: string;
  /** Phase C — points GPS bruts pour replay (optionnel, peut être lourd). */
  gpsPoints?: {
    lat: number;
    lon: number;
    altitude: number | null;
    accuracy: number;
    t: number;
  }[];
  /** Phase C — checkpoints glycémie capturés pendant la séance. */
  glucoseCheckpoints?: SessionGlucoseCheckpoint[];
  /** Phase C — dénivelé positif cumulé en mètres (si altitude dispo). */
  elevationGainM?: number;
}

export type MealTime = 'morning' | 'lunch' | 'snack' | 'dinner' | 'other';

/**
 * Séance déclarée depuis le briefing pré-sport (sept. 2026). Créée quand
 * l'utilisateur accepte la recommandation, ce qui vaut déclaration
 * d'intention — pas de bouton de confirmation supplémentaire. Complétée
 * ensuite par la réconciliation Whoop quand le bracelet remonte la séance.
 */
export interface DeclaredSportSession {
  id: string;
  /** Clé de `SPORTS` (lib/sports.ts). */
  sportKey: string;
  /** Famille d'effort, dupliquée pour rester lisible sans le catalogue. */
  family: "running" | "muscu" | "cardio-other" | "intermittent";
  /** ISO du début prévu. */
  startAt: string;
  plannedDurationMin: number;
  actualDurationMin?: number;
  endedAt?: string;
  whoopWorkoutId?: string;
  cancelledAt?: string;
  /**
   * ISO du moment où l'appoint post-séance a été programmé (sept. 2026).
   * Sert UNIQUEMENT d'idempotence : le `useEffect` qui détecte la fin de
   * séance tourne à chaque tick de 60 s, ce drapeau l'empêche de
   * reprogrammer le rappel soixante fois par heure. Sa présence ne dit rien
   * de ce qu'Ethan a fait du rappel — il peut l'avoir enregistré, ignoré,
   * ou n'avoir jamais eu d'appoint à faire (`skipReason`).
   */
  appointScheduledAt?: string;
  createdAt: string;
}
