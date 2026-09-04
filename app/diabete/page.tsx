"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  calculateBolus,
  getDigestiveComplexity,
  getInjectionTimingAdvice,
  computePreSportBriefing,
  inferMealTimeFromClock,
} from "@/lib/insulin-calculator";
import { activeIOB } from "@/lib/glucose-prediction";
import {
  computeCarbsOnBoard,
  suggestTopUp,
  resolveCarbDelta,
  filterLearnableNightLogs,
  resolveCarbs,
  resolveFat,
  resolveProtein,
  resolveCobStatus,
  NIGHT_BALANCE_THRESHOLD_U,
} from "@/lib/carbs-on-board";
import { DIABETES_CONFIG } from "@/lib/constants";
import type { InsulinLog, MealTime, SplitDoseReminder } from "@/types";
import type { GlucoseTrend } from "@/lib/libre-link/utils";
import { Badge } from "@/components/ui/Badge";
import { useGlucose } from "@/hooks/useGlucose";
import GlucoseWidget from "@/components/glucose/GlucoseWidget";
import GlucoseChart from "@/components/glucose/GlucoseChart";
import CarbEntryLogger from "@/components/glucose/CarbEntryLogger";
import { CarbsOnBoardTile } from "@/components/glucose/CarbsOnBoardTile";
import { MealConfirmCard } from "@/components/diabete/MealConfirmCard";
import { TopUpCard } from "@/components/diabete/TopUpCard";
import CorrectionSuggestion from "@/components/glucose/CorrectionSuggestion";
import PushOptIn from "@/components/glucose/PushOptIn";
import {
  MEAL_TAGS,
  MEAL_SIZES,
  inferMacrosFromTag,
  getGlycemicProfile,
  type MealTagId,
  type MealSizeId,
} from "@/lib/meal-tags";
import { getMealTypeHistory, getAvgMacrosForTag, type ArchivePoint } from "@/lib/meal-analytics";
import { openYazio } from "@/lib/external-apps";
import {
  scheduleReminderOnServer,
  cancelReminderOnServer,
} from "@/lib/reminders/client";
import {
  computeExerciseAdjustment,
  resolveRecentExercise,
} from "@/lib/exercise-insulin-adjustment";
import { buildPredictionEvents } from "@/lib/prediction-inputs";
import { capDoseByPrediction } from "@/lib/dose-capping";
import { useWhoop } from "@/hooks/useWhoop";
import NightBrain from "@/components/diabete/NightBrain";
import { estimatePersonalGRG, classifyHypoContext, buildHypoCarbEntry } from "@/lib/hypo-resucrage";
import {
  estimateNightDrift,
  estimateDawnCurve,
  resolveNightLogs,
  estimateWakeupBias,
} from "@/lib/night-calibration";
import { computeNightPlan } from "@/lib/night-brain";
import HypoLogger from "@/components/diabete/HypoLogger";
import HypoFeedback from "@/components/diabete/HypoFeedback";
import { useHypoTracker } from "@/hooks/useHypoTracker";
import { usePatternDetection } from "@/hooks/usePatternDetection";
import type { DetectedPattern, PatternSeverity } from "@/lib/glucose-archive/pattern-engine";
import {
  enrichSession,
  computeAvgSportImpact,
  type SportSession,
  type EnrichedSportSession,
} from "@/lib/sport-glucose-analytics";
import type { ArchivedPoint } from "@/lib/glucose-archive/store";
import {
  Droplet,
  Syringe,
  Calculator,
  Settings,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  Dumbbell,
  Footprints,
  Minus,
  Trash2,
  Pencil,
  History,
  Sparkles,
  Clock,
  Plus,
  CheckCircle2,
  Wheat,
  Soup,
  Pizza,
  Sandwich,
  Salad,
  Cookie,
  Beef,
  Croissant,
  UtensilsCrossed,
  Info,
  AlertCircle,
  X,
  Apple,
  ZapOff,
  Activity,
  ShieldCheck,
  ShieldAlert,
  Shield,
  Sparkle,
  Stethoscope,
  HelpCircle,
} from "lucide-react";

// Mapping iconName (lib/meal-tags) → composant lucide-react
const MEAL_TAG_ICONS = {
  Wheat,
  Soup,
  Pizza,
  Sandwich,
  Salad,
  Cookie,
  Beef,
  Croissant,
  UtensilsCrossed,
} as const;

type GlucoseTone = "low" | "normal" | "high" | "critical";

function glucoseTone(value: number): GlucoseTone {
  if (value < 70 || value > 250) return "critical";
  if (value > 180) return "high";
  if (value < 80) return "low";
  return "normal";
}

function glucoseColor(tone: GlucoseTone): string {
  switch (tone) {
    case "critical":
      return "var(--glucose-critical)";
    case "high":
      return "var(--glucose-high)";
    case "low":
      return "var(--glucose-low)";
    default:
      return "var(--glucose-normal)";
  }
}

const MEAL_OPTIONS: { value: MealTime; label: string }[] = [
  { value: "morning", label: "Petit-déj" },
  { value: "lunch", label: "Déjeuner" },
  { value: "snack", label: "Goûter" },
  { value: "dinner", label: "Dîner" },
  { value: "other", label: "Autre" },
];

// Conversion ratio interne (g par U) → format naturel "X,YU"
function formatUper10g(gPerU: number): string {
  const units = 10 / gPerU;
  const rounded = Math.round(units * 10) / 10;
  if (rounded === Math.floor(rounded)) return `${rounded}U`;
  return `${rounded.toFixed(1).replace(".", ",")}U`;
}

// Map de la trend Libre (string) → numérique pour le calculateur
function trendStringToNumber(trend: GlucoseTrend | string | undefined): number | undefined {
  switch (trend) {
    case "SingleDown": return 1;
    case "FortyFiveDown": return 2;
    case "Flat": return 3;
    case "FortyFiveUp": return 4;
    case "SingleUp": return 5;
    default: return undefined;
  }
}

/** Formate un délai en minutes pour le briefing pré-sport ("1 h 30"). */
function formatBriefingDelay(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const rem = min % 60;
  return rem ? `${h} h ${rem}` : `${h} h`;
}

function trendNumberToArrow(trend?: number): string {
  switch (trend) {
    case 1: return "↓↓";
    case 2: return "↘";
    case 3: return "→";
    case 4: return "↗";
    case 5: return "↑↑";
    default: return "—";
  }
}

export default function DiabetePage() {
  const {
    profile,
    updateProfile,
    diabetesConfig,
    glucoseReadings,
    insulinLogs,
    addInsulinLog,
    updateInsulinLog,
    removeInsulinLog,
    splitDoseReminders,
    addSplitDoseReminder,
    updateSplitDoseReminder,
    removeSplitDoseReminder,
  } = useStore();
  // Phase 11 Bloc 6.3 — séances historiques pour personnaliser l'advisor
  const completedWorkouts = useStore((s) => s.completedWorkouts);
  const completedRunningSessions = useStore((s) => s.completedRunningSessions);
  // Phase « Night Brain » — GRG perso pour une suggestion de glucides unifiée
  const hypoEvents = useStore((s) => s.hypoEvents);
  const addHypoEvent = useStore((s) => s.addHypoEvent);
  // Glucides sans insuline (re-sucrage course, collation) — alimente la prédiction
  const carbEntries = useStore((s) => s.carbEntries);
  const addCarbEntry = useStore((s) => s.addCarbEntry);
  // Boucle d'auto-apprentissage de la prédiction nuit (prédit vs réel)
  const nightPredictionLogs = useStore((s) => s.nightPredictionLogs);
  const addNightPredictionLog = useStore((s) => s.addNightPredictionLog);
  const setNightPredictionLogs = useStore((s) => s.setNightPredictionLogs);

  // Phase H — Auto-enrichissement des checkpoints des hypos en cours.
  // Le hook tick toutes les 60s et update les hypoEvents non-évalués.
  useHypoTracker();

  // ─── Bolus calculator ─────────────────────────
  const [carbsGrams, setCarbsGrams] = useState(60);
  // Repas auto-déduit de l'heure (juillet 2026) : plus besoin d'y penser, le
  // bon ratio est pré-sélectionné. Un tap manuel sur un chip reprend la main
  // (mealTimeTouched) et l'auto-sync s'arrête pour la session.
  const [mealTime, setMealTime] = useState<MealTime>("lunch");
  const [mealTimeTouched, setMealTimeTouched] = useState(false);
  const [currentGlucose, setCurrentGlucose] = useState(120);
  const [isPreWorkout, setIsPreWorkout] = useState(false);
  const [workoutType, setWorkoutType] = useState<"muscu" | "running" | null>(null);
  const [minutesUntilWorkout, setMinutesUntilWorkout] = useState(60);

  // ─── Phase 11 — FPU + trend arrow ─────────────
  const [fatGrams, setFatGrams] = useState<number>(0);
  const [proteinGrams, setProteinGrams] = useState<number>(0);
  const [showMacros, setShowMacros] = useState(false);
  const [trendArrow, setTrendArrow] = useState<number | undefined>(undefined);

  // ─── Phase 11 — Briefing pré-sport indépendant ──────
  // L'utilisateur peut planifier un sport sans toucher au calculateur de
  // bolus. Affiche des recommandations actionnables (manger, réduire le
  // split, décaler, etc.) basées sur l'IOB + glycémie live + split en attente.
  const [briefingActive, setBriefingActive] = useState(false);
  const [briefingType, setBriefingType] = useState<"muscu" | "running">("muscu");
  const [briefingMinutes, setBriefingMinutes] = useState<number>(30);
  const [briefingRefreshing, setBriefingRefreshing] = useState(false);
  // L'auto-refresh est défini plus bas, après la déclaration de useGlucose.

  // ─── Phase 11 Bloc 2 — Meal tag + size ────────
  const [mealTag, setMealTag] = useState<MealTagId | undefined>(undefined);
  const [mealSize, setMealSize] = useState<MealSizeId>("normal");
  /** Si l'user édite manuellement les macros, on n'écrase plus avec le tag. */
  const [macrosManuallyEdited, setMacrosManuallyEdited] = useState(false);

  // ─── Confirmation des glucides (septembre 2026) ────────────
  // Quantité de glucides non estimable (resto, cuisine de quelqu'un
  // d'autre). Ne remet PAS les glucides à zéro (lib/carbs-on-board.ts en a
  // besoin pour le calcul de couverture) — juste un drapeau qui rend l'app
  // muette sur la dose et n'attend pas de rappel de confirmation.
  const [carbsUncertain, setCarbsUncertain] = useState(false);

  // Quand un tag est sélectionné (et que l'user n'a pas override les macros),
  // pré-remplir lipides + protéines + déplier le block macros.
  useEffect(() => {
    if (!mealTag || macrosManuallyEdited) return;
    const macros = inferMacrosFromTag(mealTag, mealSize);
    setFatGrams(macros.fatGrams);
    setProteinGrams(macros.proteinGrams);
    if (macros.fatGrams > 0 || macros.proteinGrams > 0) {
      setShowMacros(true);
    }
  }, [mealTag, mealSize, macrosManuallyEdited]);

  // ─── Pattern detection (Bloc 3) ────────────────────────────
  const {
    patterns: detectedPatterns,
    dismissedIds: patternDismissedIds,
    dismissPattern,
  } = usePatternDetection({
    insulinLogs,
    diabetesConfig,
  });
  const visiblePatterns = useMemo(
    () => detectedPatterns.filter((p) => !patternDismissedIds.has(p.id)),
    [detectedPatterns, patternDismissedIds],
  );

  // ─── Archive points pour meal analytics (Bloc 2.3) ──────────
  // Fetch léger one-shot au mount + à chaque nouvelle injection
  // (refresh débouncé via insulinLogs.length).
  const [archivePoints, setArchivePoints] = useState<ArchivePoint[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/glucose/archive?days=30", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (cancelled || !data?.points) return;
        setArchivePoints(data.points as ArchivePoint[]);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [/* refetch quand on log */]);

  // ─── IOB ──────────────────────────────────────
  // Tick toutes les 60s pour rafraîchir l'IOB en temps réel.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // ─── Repas auto selon l'heure ─────────────────
  // Se cale au mount (client uniquement — pas de mismatch SSR) puis suit le
  // tick 60s : si l'app reste ouverte de 14h55 à 15h05, le chip passe tout
  // seul de « Déjeuner » à « Goûter ». Un choix manuel gèle l'auto-sync.
  useEffect(() => {
    if (mealTimeTouched) return;
    setMealTime(inferMealTimeFromClock(new Date(nowTick)));
  }, [nowTick, mealTimeTouched]);
  const iob = useMemo(() => {
    const now = nowTick;
    const recentInjections = insulinLogs
      .map((log) => {
        const injectedAt = new Date(log.injectedAt);
        const minutesAgo = (now - injectedAt.getTime()) / 60000;
        return { units: log.units, minutesAgo, mealType: log.mealType, injectedAt };
      })
      .filter(
        (inj) =>
          inj.minutesAgo < DIABETES_CONFIG.insulinActiveDuration && inj.minutesAgo >= 0
      );
    // Modèle bi-exponentiel (même moteur que la prédiction nuit / COB) — un
    // seul modèle d'IOB affiché sur la page pour ne jamais contredire la
    // tuile Glucides actifs.
    const totalIOB = activeIOB(
      recentInjections.map((inj) => ({ units: inj.units, minutesAgo: inj.minutesAgo })),
    );
    return {
      totalIOB: Math.round(totalIOB * 10) / 10,
      details: recentInjections,
    };
  }, [insulinLogs, nowTick]);

  // ─── Confirmation des glucides (T+15 → T+3h) ──────────────────────
  // État dérivé : la première injection avec glucides, ni confirmée ni
  // marquée incertaine, dans la fenêtre.
  const [topUpDismissedDeficit, setTopUpDismissedDeficit] = useState<number | undefined>(undefined);

  // `insulinLogs` est trié du plus récent au plus ancien (addInsulinLog
  // insère en tête) → .find() retourne bien la dernière injection éligible.
  // Ne pas ajouter de tri.
  // Injection dont le drapeau « incertain » vient d'être levé depuis
  // l'historique : elle rouvre la carte de saisie même hors fenêtre
  // (spec §5, « réversible dans les deux sens »).
  const [reopenedConfirmId, setReopenedConfirmId] = useState<string | null>(null);

  const pendingConfirm = useMemo(() => {
    const reopened = reopenedConfirmId
      ? insulinLogs.find(
          (log) =>
            log.id === reopenedConfirmId &&
            !log.carbsConfirmedAt &&
            !log.carbsUncertain,
        )
      : undefined;
    if (reopened) return reopened;
    return (
      insulinLogs.find((log) => {
        if (log.isSplitDose) return false;
        if (!log.carbsGrams || log.carbsGrams <= 0) return false;
        if (log.carbsConfirmedAt || log.carbsUncertain) return false;
        const minutesAgo = (nowTick - new Date(log.injectedAt).getTime()) / 60_000;
        return minutesAgo >= 15 && minutesAgo <= 180;
      }) ?? null
    );
  }, [insulinLogs, nowTick, reopenedConfirmId]);

  // Détails de la dernière injection active (pour message contextualisé IOB)
  const lastActiveInjection = useMemo(() => {
    const now = nowTick;
    const candidates = insulinLogs
      .map((log) => {
        const injectedAt = new Date(log.injectedAt);
        const minutesAgo = (now - injectedAt.getTime()) / 60000;
        return { log, minutesAgo, injectedAt };
      })
      .filter((c) => c.minutesAgo < DIABETES_CONFIG.insulinActiveDuration && c.minutesAgo >= 0)
      .sort((a, b) => a.minutesAgo - b.minutesAgo);
    return candidates[0] ?? null;
  }, [insulinLogs, nowTick]);

  // Phase F2 — Hook Whoop (strain Whoop prime sur l'estimation interne)
  const whoop = useWhoop();

  // ─── Raccourci "Utiliser la valeur live" pour le calculateur bolus ─────
  // Déclaré ici (et non plus bas) : le plafonnement prédictif (cappedDose,
  // ci-dessous) a besoin de `liveGlucose?.value` avant sa propre déclaration
  // dans l'ordre du fichier — jamais de `currentGlucose` (état par défaut).
  const { current: liveGlucose, refetch: refetchGlucose, lastFetchedAt: lastLiveFetch } = useGlucose({ mode: "current" });
  const liveValueForBolus = liveGlucose?.value;
  const liveTrend = trendStringToNumber(liveGlucose?.trend);

  // Âge (min) de la lecture live. Déclaré ici (déplacé depuis plus bas,
  // revue finale I3) : `cappedDose` en a besoin — une lecture périmée et
  // HAUTE simule une trajectoire saine, donc aucun plafonnement, en
  // silence. `suggestTopUp` (plus bas) et `cappedDose` partagent ce calcul.
  const liveGlucoseAgeMin = useMemo(() => {
    if (!liveGlucose) return undefined;
    const ms = new Date(liveGlucose.date).getTime();
    if (!Number.isFinite(ms)) return undefined;
    return (nowTick - ms) / 60_000;
  }, [liveGlucose, nowTick]);

  // ─── I2 (revue finale) : source UNIQUE de glycémie pour les DEUX moitiés
  // du calcul de dose (calculateBolus ET capDoseByPrediction). Avant : le
  // calculateur lisait `currentGlucose` (champ, `useState(120)`) pendant
  // que le plafond lisait `liveGlucose?.value` (capteur seul) — deux
  // chiffres différents pouvaient alimenter le MÊME nombre affiché en
  // hero (capteur à 56 + champ à 120 → la candidate ignorait l'hypo que
  // le plafond voyait ; champ à 60 + capteur figé à 200 → l'inverse).
  //
  // Motif déjà établi ailleurs dans ce fichier pour les actions d'écriture
  // EXPLICITES (lignes ~839, ~909, ~1268 : `liveGlucose?.value ??
  // currentGlucose`) — PAS le motif « live seul, jamais de repli » réservé
  // aux garde-fous SILENCIEUX (`cob`/`topUp`, cf. commentaire ~705) : ici
  // le champ est la valeur que le patient voit, édite et valide
  // explicitement avant de cliquer « Enregistrer l'injection » — un repli
  // dessus n'invente rien, il respecte une correction manuelle d'un live
  // mort ou décalé (capteur en panne, changement de Libre).
  const glucoseForBolus = liveValueForBolus ?? currentGlucose;

  // Phase F — Détection séance récente + ajustement post-exercice.
  //
  // I5 (revue finale) : `recentExercise` est LA SEULE résolution de séance
  // récente — `resolveRecentExercise` centralise déjà le Whoop-first-sinon-
  // estimation (avec les bons gardes : `endedAtMs <= nowMs` et
  // `Math.max(1, durationMin)`, cf. exercise-insulin-adjustment.ts:354-358).
  // Avant : un memo inline ICI réimplémentait la branche Whoop SANS ces
  // deux gardes, pendant qu'un second memo plus bas (`recentExercise`)
  // utilisait la version correcte — les deux alimentaient le MÊME chiffre
  // de dose (candidate ET simulation du plafond) avec des résultats qui
  // pouvaient diverger (ex. un workout Whoop daté dans le futur — fuseaux,
  // sync différée — que le calculateur réduisait pour une séance que le
  // plafond ignorait). `gpsPoints`, seul argument supplémentaire de
  // l'ancienne version inline, est vérifié inutilisé dans
  // `findMostRecentExercise` (jamais lu dans le corps de la fonction) —
  // safe à perdre.
  const recentExercise = useMemo(
    () =>
      resolveRecentExercise({
        nowMs: nowTick,
        lastWhoopWorkout: whoop.connected ? whoop.snapshot?.lastWorkout ?? null : null,
        completedWorkouts: completedWorkouts.map((w) => ({
          id: w.id,
          date: w.date,
          duration: w.duration,
        })),
        completedRunningSessions: completedRunningSessions.map((r) => ({
          id: r.id,
          date: r.date,
          actualDuration: r.actualDuration,
          glucoseCheckpoints: r.glucoseCheckpoints,
        })),
      }),
    [nowTick, whoop.connected, whoop.snapshot, completedWorkouts, completedRunningSessions],
  );

  // Réduction du bolus : dérivée de la MÊME résolution que la simulation du
  // plafond (`recentExercise` ci-dessus) — plus de 2e résolution divergente.
  const exerciseAdjustment = useMemo(
    () => computeExerciseAdjustment(recentExercise, nowTick),
    [recentExercise, nowTick],
  );

  const bolusResult = useMemo(
    () =>
      calculateBolus(
        carbsGrams,
        mealTime,
        glucoseForBolus,
        isPreWorkout,
        workoutType,
        minutesUntilWorkout,
        diabetesConfig,
        iob.totalIOB,
        fatGrams,
        proteinGrams,
        trendArrow,
        getGlycemicProfile(mealTag),
        exerciseAdjustment?.reductionPct,
      ),
    [
      carbsGrams,
      mealTime,
      glucoseForBolus,
      isPreWorkout,
      workoutType,
      minutesUntilWorkout,
      diabetesConfig,
      iob.totalIOB,
      fatGrams,
      proteinGrams,
      trendArrow,
      mealTag,
      exerciseAdjustment,
    ]
  );

  // Le calculateur produit une dose candidate ; le prédicteur la valide.
  // Sans ce garde-fou, l'app propose des doses que son propre moteur
  // annonce comme hypoglycémiantes (cas mesuré : 10 U → 40 mg/dL prédits).
  const cappedDose = useMemo(
    () =>
      capDoseByPrediction(bolusResult.totalBolus, {
        // I2 : même source que `calculateBolus` ci-dessus (`glucoseForBolus`)
        // — voir le commentaire à sa déclaration pour le choix.
        currentGlucose: glucoseForBolus,
        glucoseAgeMin: liveGlucoseAgeMin,
        insulinLogs,
        carbEntries,
        pendingMeal: {
          carbsGrams,
          fatGrams,
          proteinGrams,
          mealType: mealTime,
        },
        isf: diabetesConfig.insulinSensitivityFactor,
        ratios: diabetesConfig.ratios,
        sport: recentExercise ?? undefined,
        // C1 : le split FPU programmé par le MÊME clic « Enregistrer
        // l'injection » (cf. handleLogInjection plus bas) doit être vu par
        // le plafond — sinon il valide une dose que l'app reprogramme
        // aussitôt après (final-fix-brief.md, C1). `splitDose.later` n'est
        // JAMAIS modifié ici, seulement rendu visible à la simulation.
        pendingSplit: bolusResult.splitDose
          ? { units: bolusResult.splitDose.later, minutesUntil: bolusResult.splitDose.delayMinutes }
          : undefined,
        // Règle 2 (sept 2026) : plancher de sécurité — le plafond ne
        // descend jamais sous ce bolus glucides moins CARB_BOLUS_FLOOR_MARGIN.
        // Même valeur que celle utilisée par `calculateBolus` ci-dessus
        // (déjà réduite par pré-sport / sensibilité post-exercice le cas
        // échéant), pas redérivée depuis `carbsGrams` pour ne pas diverger.
        carbBolusUnits: bolusResult.carbBolus,
        nowMs: nowTick,
      }),
    [
      bolusResult.totalBolus,
      bolusResult.splitDose,
      bolusResult.carbBolus,
      recentExercise,
      glucoseForBolus,
      liveGlucoseAgeMin,
      insulinLogs,
      carbEntries,
      carbsGrams,
      fatGrams,
      proteinGrams,
      mealTime,
      diabetesConfig,
      nowTick,
    ],
  );

  // ─── Override manuel des unités ────────────────
  const [unitsOverride, setUnitsOverride] = useState<number | null>(null);
  useEffect(() => {
    setUnitsOverride(null);
  }, [
    carbsGrams,
    mealTime,
    currentGlucose,
    isPreWorkout,
    workoutType,
    minutesUntilWorkout,
    iob.totalIOB,
    fatGrams,
    proteinGrams,
    trendArrow,
  ]);
  const finalUnits = unitsOverride ?? cappedDose.units;

  // ─── Niveau de confiance des macros (Phase 11, mai 2026) ──────
  // - "precise" : l'utilisateur a saisi ses macros manuellement (Yazio)
  // - "preset"  : tag sélectionné mais valeurs preset utilisées
  // - "none"    : pas de macros du tout (correction seule ou repas léger)
  const macrosConfidence: 'precise' | 'preset' | 'none' = useMemo(() => {
    if (fatGrams === 0 && proteinGrams === 0) return 'none';
    if (macrosManuallyEdited) return 'precise';
    if (mealTag) return 'preset';
    return 'precise'; // saisie sans tag = considérée précise
  }, [fatGrams, proteinGrams, macrosManuallyEdited, mealTag]);

  // ─── Toast split dose ─────────────────────────
  const [splitToast, setSplitToast] = useState<string | null>(null);
  useEffect(() => {
    if (!splitToast) return;
    const id = setTimeout(() => setSplitToast(null), 6000);
    return () => clearTimeout(id);
  }, [splitToast]);

  function handleLogInjection() {
    if (finalUnits <= 0) return;
    const overridden = unitsOverride !== null && unitsOverride !== cappedDose.units;
    const baseNote = isPreWorkout ? `pré-${workoutType}` : "";
    // I4 (revue finale) : le calculateur proposait la CANDIDATE
    // (`cappedDose.originalUnits`), pas la dose déjà plafonnée
    // (`cappedDose.units`) — la note d'override pointait sur le mauvais
    // chiffre.
    const overrideNote = overridden
      ? `manuel (calc proposait ${cappedDose.originalUnits}U)`
      : "";
    // I4 : trace le plafonnement dans l'historique — sans ça, ni Le
    // Docteur, ni le bilan hebdo, ni un futur backtest ne peuvent
    // distinguer un repas plafonné d'un repas normal (c'est justement le
    // corpus qui doit calibrer la limite de 80).
    const cappedNote = cappedDose.capped
      ? `plafonné ${cappedDose.originalUnits}→${cappedDose.units}U`
      : "";
    const splitNote = bolusResult.splitDose ? `split 1/2` : "";
    const notes = [baseNote, cappedNote, overrideNote, splitNote].filter(Boolean).join(" · ");
    const injectionId = crypto.randomUUID();
    addInsulinLog({
      id: injectionId,
      units: finalUnits,
      insulinType: profile.insulinRapid,
      mealType: mealTime,
      carbsGrams,
      glucoseBefore: glucoseForBolus,
      notes,
      injectedAt: new Date(),
      fatGrams: fatGrams > 0 ? fatGrams : undefined,
      proteinGrams: proteinGrams > 0 ? proteinGrams : undefined,
      trendArrow,
      mealTag,
      mealSize: mealTag ? mealSize : undefined,
      carbsUncertain: carbsUncertain || undefined,
    });

    // ─── Programmer le rappel split dose ──────────
    if (bolusResult.splitDose) {
      const reminderId = crypto.randomUUID();
      const triggerAt = new Date(Date.now() + bolusResult.splitDose.delayMinutes * 60_000);
      const reminder: SplitDoseReminder = {
        id: reminderId,
        parentInjectionId: injectionId,
        units: bolusResult.splitDose.later,
        triggerAt: triggerAt.toISOString(),
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      addSplitDoseReminder(reminder);
      // Sync serveur (fire-and-forget) : permet au cron de tirer la
      // notif push même si l'app est fermée à l'heure du rappel.
      scheduleReminderOnServer({ ...reminder, kind: "split" });
      const hours = Math.floor(bolusResult.splitDose.delayMinutes / 60);
      const mins = bolusResult.splitDose.delayMinutes % 60;
      const delayLabel = mins === 0 ? `${hours}h` : `${hours}h${mins.toString().padStart(2, '0')}`;
      setSplitToast(
        `Rappel programmé : ${bolusResult.splitDose.later}U dans ${delayLabel} pour couvrir les graisses/protéines.`
      );
    }

    // ─── Rappel de confirmation des glucides (T+20 min) ──────────
    // Inutile si la quantité est déjà déclarée incertaine — on ne va pas
    // demander à Ethan de confirmer ce qu'il a lui-même dit ne pas savoir.
    // Serveur UNIQUEMENT (pas de store Zustand local) : le useEffect de
    // secours ci-dessous (tick 60s) construit une notif « fais XU pour
    // couvrir les graisses/protéines » pour tout rappel `pending` du store
    // local — un meal-confirm n'a rien à faire là, ça enverrait un ordre
    // d'injection au lieu d'une demande de confirmation.
    if (carbsGrams > 0 && !carbsUncertain) {
      // Une seule lecture d'horloge : `triggerAt` et `createdAt` doivent
      // décrire le même instant.
      const nowMs = Date.now();
      scheduleReminderOnServer({
        // ID déterministe : permet d'annuler le rappel à la confirmation
        // sans avoir à mémoriser son identifiant côté client.
        id: `mc-${injectionId}`,
        kind: "meal-confirm",
        parentInjectionId: injectionId,
        units: finalUnits,
        triggerAt: new Date(nowMs + 20 * 60_000).toISOString(),
        createdAt: new Date(nowMs).toISOString(),
        mealLabel: mealTag,
        carbsEstimated: carbsGrams,
        status: "pending",
      });
    }

    setCarbsUncertain(false);
    setUnitsOverride(null);
  }

  function handleDeleteInjection(id: string, units: number) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Supprimer cette injection de ${units}U ? Action irréversible.`)
    ) {
      return;
    }
    removeInsulinLog(id);
    // Supprimer une injection est le geste de quelqu'un qui corrige une
    // erreur de saisie : ses rappels doivent partir avec elle. Sans ça, le
    // rappel de confirmation T+20 demande « tu as mangé combien
    // finalement ? » pour un repas qui n'existe plus, et le rappel de
    // split ordonne une 2e dose pour un bolus effacé.
    cancelReminderOnServer(`mc-${id}`);
    for (const r of splitDoseReminders) {
      if (r.parentInjectionId !== id) continue;
      removeSplitDoseReminder(r.id); // store local
      cancelReminderOnServer(r.id); // KV serveur (cron)
    }
  }

  const lastGlucose = glucoseReadings[0];
  const lastValue = lastGlucose?.value ?? currentGlucose;
  const iobTone: "info" | "warning" =
    iob.totalIOB > 2 ? "warning" : "info";

  // ─── Glucides actifs (COB) ────────────────────────────────────────
  // Même moteur d'absorption que la prédiction nuit → les deux vues ne
  // peuvent pas se contredire. `currentGlucose` alimente uniquement
  // `hypoActive`/`glucoseUnknown` (correction 2, septembre 2026) : sous le
  // seuil d'hypo — ou glycémie inconnue — la tuile tait son verdict de
  // déficit. Aucun calcul de couverture ni de grammes n'en dépend.
  // Déclaré après `useGlucose` : dépend de `liveGlucose`.
  //
  // ⚠️ UNIQUEMENT `liveGlucose?.value`, jamais `?? currentGlucose` : ce
  // dernier est l'état du champ du calculateur, `useState(120)` — une
  // valeur fabriquée que l'utilisateur n'a pas forcément saisie. Repasser
  // ce défaut ici masquerait un capteur en panne (changement de Libre,
  // LibreLink indisponible) PENDANT une vraie hypo : `hypoActive` se
  // calculerait sur 120 mg/dL inventés au lieu de se déclarer inconnu.
  // Même défaut déjà trouvé et corrigé sur `TopUpContext.currentGlucose`
  // (`suggestTopUp`) — la correction retenue à l'époque est la même ici :
  // ne passer que la lecture capteur réelle, traiter son absence comme un
  // blocage (`glucoseUnknown`), pas comme une glycémie normale.
  const cob = useMemo(
    () =>
      computeCarbsOnBoard({
        insulinLogs,
        carbEntries,
        isf: diabetesConfig.insulinSensitivityFactor,
        ratios: diabetesConfig.ratios,
        nowMs: nowTick,
        currentGlucose: liveGlucose?.value,
      }),
    [insulinLogs, carbEntries, diabetesConfig, nowTick, liveGlucose],
  );

  // ─── Appoint suggéré (écart de glucides d'une injection confirmée) ──
  // L'appoint NE se calcule PAS sur la couverture absolue de la tuile :
  // celle-ci inclut les FPU que le split diffère volontairement, et
  // prescrire dessus rejoue l'hypo de 12h-14h. Seul l'écart
  // « confirmé − estimé » d'une injection donne lieu à une dose.
  const carbDelta = useMemo(
    () => resolveCarbDelta(insulinLogs, nowTick, diabetesConfig.ratios),
    [insulinLogs, nowTick, diabetesConfig.ratios],
  );

  // `liveGlucoseAgeMin` : déclaré plus haut (déplacé, I3) — suggestTopUp a
  // besoin de la glycémie CAPTEUR la plus fraîche pour ses garde-fous
  // anti-hypo. On ne lui passe jamais `currentGlucose` (champ du
  // calculateur, initialisé à 120) : un garde-fou évalué sur une valeur
  // inventée ne protège de rien.
  const topUp = useMemo(
    () =>
      suggestTopUp(carbDelta, {
        currentGlucose: liveGlucose?.value,
        glucoseAgeMin: liveGlucoseAgeMin,
        trendArrow: trendStringToNumber(liveGlucose?.trend),
        lastOfferedDeficitU: topUpDismissedDeficit,
      }),
    [carbDelta, liveGlucose, liveGlucoseAgeMin, topUpDismissedDeficit],
  );

  // Auto-refresh la glycémie live quand on active le briefing pré-sport
  // (pour avoir la donnée la plus fraîche possible). Évite de baser une
  // décision sur une lecture obsolète.
  useEffect(() => {
    if (briefingActive) {
      setBriefingRefreshing(true);
      Promise.resolve(refetchGlucose()).finally(() => {
        setBriefingRefreshing(false);
      });
    }
  }, [briefingActive, refetchGlucose]);

  // ─── Migration douce — push KV pour les reminders locaux ──────────
  // Au mount de /diabete, on POST vers le serveur tous les splits pending
  // qui n'auraient pas encore été synchronisés (cas : reminder créé avant
  // que le pipeline serveur soit en place, ou réseau down au moment de
  // l'ajout). upsertReminder est idempotent (clef = id) donc safe à rappeler.
  // Ça garantit que le cron /api/cron/split-check les verra.
  useEffect(() => {
    const pendingToSync = splitDoseReminders.filter(
      (r) => r.status === "pending",
    );
    if (pendingToSync.length === 0) return;
    for (const r of pendingToSync) {
      scheduleReminderOnServer({ ...r, kind: "split" }); // fire-and-forget, silencieux si fail
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once au mount

  // ─── Phase 11 : check des split-dose reminders dûs (backup local) ─────
  // À chaque tick (60s), on regarde si un rappel pending arrive à échéance.
  // C'est la voie BACKUP : si l'utilisateur est sur /diabete au moment du
  // déclenchement, on tire une notif locale via le service worker pour
  // un feedback instantané. La voie principale est désormais le cron
  // serveur /api/cron/split-check qui envoie un VAPID push même si l'app
  // est fermée. Le tag `split-<id>` côté SW déduplique si les 2 arrivent.
  const [activeReminders, setActiveReminders] = useState<SplitDoseReminder[]>([]);
  useEffect(() => {
    const now = Date.now();
    const due = splitDoseReminders.filter(
      (r) => r.status === 'pending' && new Date(r.triggerAt).getTime() <= now
    );
    setActiveReminders(due);

    // Tirer une notif locale pour chaque rappel dû non-fired
    if (typeof window !== "undefined" && "serviceWorker" in navigator && "Notification" in window) {
      due.forEach((r) => {
        if (Notification.permission === "granted") {
          navigator.serviceWorker.ready.then((reg) => {
            reg.showNotification("Rappel split dose", {
              body: `Il est temps de faire ${r.units}U pour couvrir les graisses/protéines de ton repas.`,
              icon: "/icons/icon-192x192.png",
              badge: "/icons/icon-192x192.png",
              tag: `split-${r.id}`,
              data: { url: "/diabete", type: "split" },
            });
          }).catch(() => {});
        }
        // Marque comme fired pour ne pas le re-tirer à chaque tick
        updateSplitDoseReminder(r.id, { status: 'fired' });
      });
    }
  }, [splitDoseReminders, nowTick, updateSplitDoseReminder]);

  // Rappels pending pour affichage (incluant ceux fired non-dismissed)
  const pendingReminders = useMemo(
    () => splitDoseReminders.filter((r) => r.status !== 'dismissed'),
    [splitDoseReminders]
  );

  function handleConfirmSplitDose(reminder: SplitDoseReminder) {
    const injectionId = crypto.randomUUID();
    addInsulinLog({
      id: injectionId,
      units: reminder.units,
      insulinType: profile.insulinRapid,
      mealType: 'other',
      carbsGrams: 0,
      glucoseBefore: liveValueForBolus ?? currentGlucose,
      notes: 'split 2/2 (FPU)',
      injectedAt: new Date(),
      isSplitDose: true,
      parentInjectionId: reminder.parentInjectionId,
    });
    removeSplitDoseReminder(reminder.id);
    // Sync serveur : cancel le reminder pour que le cron ne le re-tire pas
    cancelReminderOnServer(reminder.id);
  }

  function handleDismissSplitDose(reminder: SplitDoseReminder) {
    removeSplitDoseReminder(reminder.id);
    cancelReminderOnServer(reminder.id);
  }

  function handleConfirmCarbs(
    log: InsulinLog,
    values: { carbs: number; fat: number; protein: number },
  ) {
    setReopenedConfirmId(null);
    updateInsulinLog(log.id, {
      carbsConfirmedGrams: values.carbs,
      fatConfirmedGrams: values.fat,
      proteinConfirmedGrams: values.protein,
      carbsConfirmedAt: new Date().toISOString(),
    });
    // Le rappel serveur n'a plus lieu d'être.
    cancelReminderOnServer(`mc-${log.id}`);
  }

  function handleMarkUncertain(log: InsulinLog) {
    setReopenedConfirmId(null);
    updateInsulinLog(log.id, {
      carbsUncertain: true,
      carbsConfirmedAt: new Date().toISOString(),
    });
    cancelReminderOnServer(`mc-${log.id}`);
  }

  /**
   * Lève le drapeau « quantité incertaine » depuis l'historique et rouvre
   * la carte de saisie (spec §5 : réversible dans les deux sens). Un tap
   * accidentel excluait sinon le repas de l'apprentissage à vie.
   */
  function handleClearUncertain(log: InsulinLog) {
    updateInsulinLog(log.id, {
      carbsUncertain: false,
      carbsConfirmedAt: undefined,
    });
    setReopenedConfirmId(log.id);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function handleAcceptTopUp(units: number) {
    if (!topUp) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Enregistrer un appoint de ${units} U ?`)
    ) {
      return;
    }
    addInsulinLog({
      id: crypto.randomUUID(),
      units,
      insulinType: profile.insulinRapid,
      mealType: "correction",
      carbsGrams: 0,
      glucoseBefore: liveGlucose?.value ?? currentGlucose,
      notes: "appoint (glucides non couverts)",
      injectedAt: new Date(),
      // Traçabilité : l'appoint pointe sur le repas qui l'a causé — c'est
      // aussi ce qui marque ce delta comme servi (cf. `carbDelta`).
      parentInjectionId: topUp.injectionId,
    });
    // NE PAS effacer la mémoire anti-répétition : sur un déficit plafonné
    // à 4 U, l'effacer laissait la carte reproposer 4 U aussitôt →
    // 8 U en deux clics, plafond contourné.
    setTopUpDismissedDeficit(topUp.deficitU);
  }

  // ─── Sessions sport enrichies (Bloc 6.3) ──────────────────────────
  // On les enrichit ici une fois pour réutiliser dans l'advisor sans
  // recalcul à chaque tick.
  const enrichedSportSessions: EnrichedSportSession[] = useMemo(() => {
    const sessions: SportSession[] = [
      ...completedWorkouts.map((w) => ({
        date: w.date,
        type: "muscu" as const,
        durationMin: Math.round(w.duration ?? 60),
      })),
      ...completedRunningSessions.map((r) => ({
        date: r.date,
        type: "running" as const,
        durationMin: Math.round(r.actualDuration ?? 45),
        // Phase C — checkpoints réels prioritaires sur archive
        glucoseCheckpoints: r.glucoseCheckpoints,
      })),
    ];
    // archivePoints du Bloc 2 (meal-analytics) sont compatibles avec ArchivedPoint
    return sessions.map((s) => enrichSession(s, archivePoints as ArchivedPoint[]));
  }, [completedWorkouts, completedRunningSessions, archivePoints]);

  // ─── Briefing pré-sport (advisor indépendant) ─────────────────────
  // Utilise la glycémie live + IOB + split dose en attente pour donner
  // des recommandations actionnables. Calculé seulement quand activé.
  const preSportBriefing = useMemo(() => {
    if (!briefingActive) return null;
    // Glycémie de référence : live si dispo, sinon manuel
    const refGlucose = liveGlucose?.value ?? currentGlucose;
    const refTrend = liveGlucose ? trendStringToNumber(liveGlucose.trend) : trendArrow;

    // Split dose en attente le plus proche
    const now = nowTick;
    const upcomingSplit = splitDoseReminders
      .filter((r) => r.status === "pending")
      .map((r) => ({ ...r, minutesUntil: Math.round((new Date(r.triggerAt).getTime() - now) / 60000) }))
      .filter((r) => r.minutesUntil >= 0)
      .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];

    const personalImpact = computeAvgSportImpact(enrichedSportSessions, briefingType, 3);

    return computePreSportBriefing({
      currentGlucose: refGlucose,
      trendArrow: refTrend,
      iobUnits: iob.totalIOB,
      isfMgPerU: diabetesConfig.insulinSensitivityFactor,
      insulinActiveMinutes: diabetesConfig.insulinActiveDuration,
      workoutType: briefingType,
      minutesUntilWorkout: briefingMinutes,
      pendingSplitUnits: upcomingSplit?.units,
      pendingSplitMinutesUntil: upcomingSplit?.minutesUntil,
      personalSportImpact: personalImpact,
    });
  }, [
    briefingActive,
    briefingType,
    briefingMinutes,
    liveGlucose,
    currentGlucose,
    trendArrow,
    iob.totalIOB,
    diabetesConfig,
    splitDoseReminders,
    nowTick,
    enrichedSportSessions,
  ]);

  // Action : réduire la 2e dose du split en attente (depuis le briefing)
  function handleReduceSplit(reminderId: string, newUnits: number) {
    updateSplitDoseReminder(reminderId, { units: newUnits });
  }

  // Action : décaler le split de 60min (post-sport)
  function handleDelaySplit(reminderId: string, addMinutes: number) {
    const r = splitDoseReminders.find((x) => x.id === reminderId);
    if (!r) return;
    const newTrigger = new Date(new Date(r.triggerAt).getTime() + addMinutes * 60_000);
    updateSplitDoseReminder(reminderId, { triggerAt: newTrigger.toISOString() });
  }

  // ─── Pre-workout advisor (Bloc 1.4 + Bloc 6.3) ───────────────────
  const advisorState = useMemo(() => {
    if (!isPreWorkout || !workoutType) return null;
    const isf = diabetesConfig.insulinSensitivityFactor;
    const activeDuration = diabetesConfig.insulinActiveDuration;
    // Estimation simple de la baisse causée par l'IOB d'ici le sport
    const fractionDuringWindow = Math.min(1, minutesUntilWorkout / activeDuration);
    const estimatedDropFromIOB = iob.totalIOB * isf * fractionDuringWindow;
    const estimatedGlucoseAtWorkout = Math.round(currentGlucose - estimatedDropFromIOB);

    // Phase 11 Bloc 6.3 — impact réel basé sur les séances trackées
    // (fallback sur les valeurs académiques si < 3 séances).
    const personalizedImpact = computeAvgSportImpact(
      enrichedSportSessions,
      workoutType,
      3,
    );
    const usedPersonalImpact = personalizedImpact !== null;

    let tone: 'safe' | 'caution' | 'risk' = 'safe';
    let message = '';
    let carbsNeeded = 0;

    if (workoutType === 'muscu') {
      if (estimatedGlucoseAtWorkout < 120) {
        tone = 'risk';
        carbsNeeded = Math.max(15, Math.ceil((140 - estimatedGlucoseAtWorkout) / 4));
        message = `Risque d'hypo en début de séance. Mange ${carbsNeeded}g de glucides avant.`;
      } else if (estimatedGlucoseAtWorkout > 250) {
        tone = 'caution';
        message = "Glycémie trop haute pour la muscu. Fais ta correction et attends 30min.";
      } else {
        tone = 'safe';
        if (usedPersonalImpact) {
          const sign = personalizedImpact >= 0 ? "+" : "";
          message = `Tu es safe pour la muscu. D'après tes séances, ta glycémie va ${personalizedImpact >= 0 ? "monter" : "descendre"} de ${sign}${personalizedImpact} mg/dL en moyenne.`;
        } else {
          message = "Tu es safe pour la muscu. La glycémie va probablement monter de +30 à +50 mg/dL pendant la séance.";
        }
      }
    } else {
      // running
      if (estimatedGlucoseAtWorkout < 140) {
        tone = 'risk';
        carbsNeeded = Math.max(15, Math.ceil((150 - estimatedGlucoseAtWorkout) / 4));
        message = `Risque d'hypo en running. Mange ${carbsNeeded}g de glucides rapides avant.`;
      } else if (estimatedGlucoseAtWorkout > 250) {
        tone = 'caution';
        message = "Glycémie trop haute. Vérifie les cétones avant de courir.";
      } else {
        tone = 'safe';
        if (usedPersonalImpact) {
          const sign = personalizedImpact >= 0 ? "+" : "";
          message = `Tu es safe pour le running. D'après tes séances, ta glycémie va ${personalizedImpact >= 0 ? "monter" : "descendre"} de ${sign}${personalizedImpact} mg/dL en moyenne. Emporte du sucre au cas où.`;
        } else {
          message = "Tu es safe pour le running. Emporte du sucre au cas où.";
        }
      }
    }

    // Glycémie estimée pendant le sport — affinée si personalisée
    const estimatedDuringWorkout = usedPersonalImpact
      ? estimatedGlucoseAtWorkout + personalizedImpact
      : estimatedGlucoseAtWorkout;

    return {
      tone,
      message,
      estimatedGlucoseAtWorkout,
      estimatedDuringWorkout,
      carbsNeeded,
      personalizedImpact,
      usedPersonalImpact,
    };
  }, [
    isPreWorkout,
    workoutType,
    minutesUntilWorkout,
    iob.totalIOB,
    currentGlucose,
    diabetesConfig,
    enrichedSportSessions,
  ]);

  // ─── Phase G — Bedtime Advisor inputs ────────────────
  // Compile tous les paramètres pour le conseiller du soir.
  // Visible uniquement entre 20h et 2h du matin (heure d'utilisation
  // typique avant coucher).
  const isEveningHours = useMemo(() => {
    const h = new Date(nowTick).getHours();
    return h >= 20 || h < 2;
  }, [nowTick]);

  // ─── Calibration nuit perso (archive + injections + backtest) ─────
  // Reset sur changement de basale : la dérive/dawn/biais mesurés avant un
  // changement de dose Lantus ne reflètent plus la physio actuelle. On ignore
  // tout ce qui précède `basalDoseChangedAt` pour repartir propre et se
  // recalibrer sur les nuits post-changement (seuils de confiance existants
  // = 4 nuits mini, donc ~2-4 jours avant que la calibration reparte).
  const basalChangeMs = profile.basalDoseChangedAt
    ? new Date(profile.basalDoseChangedAt).getTime()
    : null;
  const nightCalibration = useMemo(() => {
    const allPts = archivePoints as ArchivedPoint[];
    const pts = basalChangeMs ? allPts.filter((p) => p.t >= basalChangeMs) : allPts;
    const injections = insulinLogs
      .filter((l) => !basalChangeMs || new Date(l.injectedAt).getTime() >= basalChangeMs)
      .map((l) => ({
        injectedAt: new Date(l.injectedAt).toISOString(),
        units: l.units,
      }));
    const logsSinceChange = filterLearnableNightLogs(
      basalChangeMs
        ? nightPredictionLogs.filter((l) => new Date(l.createdAt).getTime() >= basalChangeMs)
        : nightPredictionLogs,
      insulinLogs,
    );
    const drift = estimateNightDrift(pts, injections);
    const dawn = estimateDawnCurve(pts);
    const resolved = resolveNightLogs(logsSinceChange, pts, nowTick);
    const bias = estimateWakeupBias(resolved);
    return {
      drift,
      dawn,
      bias,
      verifiedNights: resolved.filter((r) => r.errorMgDl !== undefined).length,
      recalibratingSince: basalChangeMs ? profile.basalDoseChangedAt : undefined,
    };
  }, [archivePoints, insulinLogs, nightPredictionLogs, nowTick, basalChangeMs, profile.basalDoseChangedAt]);

  // Persiste la résolution des prédictions passées (backtest) dès que
  // l'archive permet de remplir de nouvelles nuits.
  useEffect(() => {
    const resolved = resolveNightLogs(
      nightPredictionLogs,
      archivePoints as ArchivedPoint[],
      Date.now(),
    );
    const changed = resolved.some(
      (r, i) => r.actualWakeupGlucose !== nightPredictionLogs[i]?.actualWakeupGlucose,
    );
    if (changed) setNightPredictionLogs(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivePoints, nightPredictionLogs]);

  const bedtimeInput = useMemo(() => {
    const refGlucose = liveGlucose?.value ?? currentGlucose;
    const refTrend = liveGlucose ? trendStringToNumber(liveGlucose.trend) : trendArrow;
    // Dernier repas significatif depuis les insulinLogs (carbs > 0)
    // Confirmé ?? estimé partout : le plan de la nuit doit raisonner sur ce
    // qu'Ethan a réellement mangé, pas sur son estimation d'avant repas.
    const lastMeal = insulinLogs
      .filter((log) => resolveCarbs(log) > 0 && log.mealType !== "correction")
      .map((log) => {
        const injectedAt = new Date(log.injectedAt).getTime();
        return { ...log, injectedAt, hoursAgo: (nowTick - injectedAt) / 3_600_000 };
      })
      .sort((a, b) => b.injectedAt - a.injectedAt)[0];
    const lastMealFat = lastMeal ? resolveFat(lastMeal) : 0;
    const lastMealProtein = lastMeal ? resolveProtein(lastMeal) : 0;
    const inferredFpu =
      lastMealFat > 0 && lastMealProtein > 0
        ? (lastMealFat * 9 + lastMealProtein * 4) / 100
        : 0;

    const mealHoursAgo = lastMeal?.hoursAgo;
    const mealFpu = inferredFpu;
    const mealCarbs = lastMeal ? resolveCarbs(lastMeal) : undefined;

    // Moteur unifié : mêmes événements que la prédiction 8h (bolus + glucides
    // sans insuline) → le plan nuit voit exactement le même contexte.
    const events = buildPredictionEvents({
      insulinLogs,
      carbEntries,
      isf: diabetesConfig.insulinSensitivityFactor,
      ratios: diabetesConfig.ratios,
      nowMs: nowTick,
    });
    // Split en attente
    const upcomingSplit = splitDoseReminders
      .filter((r) => r.status === "pending")
      .map((r) => ({ ...r, minutesUntil: Math.round((new Date(r.triggerAt).getTime() - nowTick) / 60000) }))
      .filter((r) => r.minutesUntil >= 0)
      .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
    return {
      currentGlucose: refGlucose,
      trendArrow: refTrend,
      iobUnits: iob.totalIOB,
      // IOB exponentiel par injection (plus précis que le scalaire linéaire)
      iobInjections: iob.details.map((d) => ({ units: d.units, minutesAgo: d.minutesAgo })),
      // Calibration perso (gâtée par la confiance — sinon fallback scolaire)
      nightDriftPerHour:
        nightCalibration.drift.sampleNights >= 4 ? nightCalibration.drift.driftPerHour : undefined,
      dawnCurveByHour:
        nightCalibration.dawn.sampleDays >= 4 &&
        Object.keys(nightCalibration.dawn.curve).length > 0
          ? nightCalibration.dawn.curve
          : undefined,
      wakeupBias: nightCalibration.bias.bias || undefined,
      isfMgPerU: diabetesConfig.insulinSensitivityFactor,
      // Montée par gramme de glucides = ISF / ratio du soir (g par U).
      // Sert à équilibrer la montée FPU avec la dose split qui la couvre.
      mgPerGramCarb:
        diabetesConfig.ratios?.dinner && diabetesConfig.ratios.dinner > 0
          ? diabetesConfig.insulinSensitivityFactor / diabetesConfig.ratios.dinner
          : undefined,
      insulinActiveMinutes: diabetesConfig.insulinActiveDuration,
      targetGlucose: diabetesConfig.targetGlucose,
      hoursUntilWakeup: 7,
      lastMealHoursAgo: mealHoursAgo,
      lastMealFpu: mealFpu,
      lastMealCarbs: mealCarbs,
      // Moteur unifié (consolidation) — prédictions = même moteur que la courbe 8h
      events,
      sportExercise: recentExercise ?? undefined,
      exerciseAdjustmentPct: exerciseAdjustment?.reductionPct,
      exerciseSource: exerciseAdjustment?.source as 'running' | 'muscu' | 'cardio-other' | undefined,
      exerciseHoursAgo: exerciseAdjustment?.hoursAgo,
      pendingSplitUnits: upcomingSplit?.units,
      pendingSplitMinutesUntil: upcomingSplit?.minutesUntil,
      // Le soir, on qualifie déficit/excès avec un seuil plus strict
      // (1,5 U), mais avec LA MÊME définition que la tuile — pas un
      // second seuillage dans night-brain. Un repas incertain n'est plus
      // retiré en bloc : seule sa branche déficit sera neutralisée, la
      // branche « trop d'insuline, garde du sucre à portée » est une
      // alerte hypo et doit survivre (spec §5).
      mealCoverage:
        cob.status === "idle"
          ? undefined
          : {
              carbsRemainingG: cob.totalRemainingG,
              balanceU: cob.balanceU,
              status: resolveCobStatus({
                totalRemainingG: cob.totalRemainingG,
                insulinActiveU: cob.insulinActiveU,
                balanceU: cob.balanceU,
                thresholdU: NIGHT_BALANCE_THRESHOLD_U,
              }),
              uncertain: cob.uncertain,
            },
      nowMs: nowTick,
    };
  }, [
    liveGlucose,
    currentGlucose,
    trendArrow,
    insulinLogs,
    iob.totalIOB,
    diabetesConfig,
    exerciseAdjustment,
    recentExercise,
    splitDoseReminders,
    carbEntries,
    nightCalibration,
    cob,
    nowTick,
  ]);

  function handleBedtimeCorrection(units: number, notes: string) {
    if (units <= 0) return;
    addInsulinLog({
      id: crypto.randomUUID(),
      units,
      insulinType: profile.insulinRapid,
      mealType: "correction",
      carbsGrams: 0,
      glucoseBefore: liveGlucose?.value ?? currentGlucose,
      notes,
      injectedAt: new Date(),
    });
  }

  // ─── Night Brain — GRG perso + handlers unifiés ──────────────────
  const personalGrg = useMemo(() => estimatePersonalGRG(hypoEvents), [hypoEvents]);

  const nightBrainInput = useMemo(
    () => ({ ...bedtimeInput, personalGrg }),
    [bedtimeInput, personalGrg],
  );

  // Backtest : logge UNE prédiction de réveil par nuit (dédup 12h) pour
  // qu'on puisse la comparer à la glycémie réelle le lendemain et apprendre.
  useEffect(() => {
    if (!isEveningHours) return;
    const glu = liveGlucose?.value ?? currentGlucose;
    if (!glu || glu <= 0) return;
    const last = nightPredictionLogs[0];
    if (last && Date.now() - new Date(last.createdAt).getTime() < 12 * 3_600_000) return;
    const plan = computeNightPlan(nightBrainInput);
    const wake = plan.predictions[plan.predictions.length - 1];
    if (!wake) return;
    addNightPredictionLog({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      predictedWakeupGlucose: wake.glucose,
      wakeupAtMs: Date.now() + 7 * 3_600_000,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEveningHours, nightBrainInput]);

  // Repas loggé récent (calculateur de bolus) à reprendre dans la carte
  // "Ce que tu digères" → Ethan n'a qu'à ajouter un en-cas par-dessus.
  const loggedMealPrefill = useMemo(() => {
    const m = insulinLogs
      .filter((log) => resolveCarbs(log) > 0 && log.mealType !== "correction")
      .map((log) => ({ ...log, t: new Date(log.injectedAt).getTime() }))
      .sort((a, b) => b.t - a.t)[0];
    if (!m) return null;
    const minsAgo = Math.max(0, Math.round((nowTick - m.t) / 60000));
    if (minsAgo > 360) return null; // > 6h → plus pertinent pour la nuit
    return {
      carbsGrams: resolveCarbs(m),
      fatGrams: resolveFat(m),
      proteinGrams: resolveProtein(m),
      insulinUnits: m.units,
      minsAgo,
      timeLabel: new Date(m.t).toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
  }, [insulinLogs, nowTick]);

  // Logge une prise de glucides d'hypo depuis le plan nuit → crée un
  // HypoEvent (comme le HypoLogger) pour que le tracker apprenne le GRG,
  // ET un CarbEntry (buildHypoCarbEntry) pour que ces glucides soient vus
  // par computeCarbsOnBoard / buildPredictionEvents — sinon le plan de nuit
  // ignore l'effet de son propre conseil (bug production sept. 2026).
  function handleNightHypoCarbs(grams: number) {
    if (grams <= 0) return;
    const context = classifyHypoContext({
      iobUnits: iob.totalIOB,
      lastBolusMinutesAgo: lastActiveInjection?.minutesAgo ?? null,
    });
    const now = new Date();
    const hypoEventId = crypto.randomUUID();
    addHypoEvent({
      id: hypoEventId,
      detectedAt: now.toISOString(),
      initialGlucose: liveGlucose?.value ?? currentGlucose,
      carbsConsumed: grams,
      consumedAt: now.toISOString(),
      glucoseAt15min: null,
      glucoseAt30min: null,
      glucoseAt45min: null,
      glucoseAt60min: null,
      peakGlucose: null,
      assessment: "pending",
      iobAtDetection: iob.totalIOB,
      lastBolusMinutesAgo: lastActiveInjection?.minutesAgo ?? null,
      lastBolusUnits: lastActiveInjection?.log.units ?? null,
      context,
      excludeFromLearning: context === "over-bolus",
    });
    const carbEntry = buildHypoCarbEntry({
      hypoEventId,
      carbsGrams: grams,
      consumedAt: now,
    });
    if (carbEntry) addCarbEntry(carbEntry);
  }

  // Confirme (logge) le split en attente le plus proche depuis le plan nuit.
  function handleNightConfirmSplit() {
    const upcoming = splitDoseReminders
      .filter((r) => r.status === "pending")
      .sort(
        (a, b) =>
          new Date(a.triggerAt).getTime() - new Date(b.triggerAt).getTime(),
      )[0];
    if (upcoming) handleConfirmSplitDose(upcoming);
  }

  // Phase G fix juin 2026 — Ajuste ou supprime le split en attente le plus
  // proche selon la recommandation du bedtime advisor.
  function handleAdjustBedtimeSplit(newUnits: number) {
    const now = Date.now();
    const upcomingSplit = splitDoseReminders
      .filter((r) => r.status === "pending")
      .map((r) => ({ ...r, ms: new Date(r.triggerAt).getTime() }))
      .filter((r) => r.ms >= now)
      .sort((a, b) => a.ms - b.ms)[0];
    if (!upcomingSplit) return;
    if (newUnits <= 0) {
      // Skip → on supprime le rappel (local + serveur)
      removeSplitDoseReminder(upcomingSplit.id);
      cancelReminderOnServer(upcomingSplit.id);
    } else {
      // Réduire → on met à jour les units (local + ré-upsert serveur)
      updateSplitDoseReminder(upcomingSplit.id, { units: newUnits });
      scheduleReminderOnServer({
        ...upcomingSplit,
        kind: "split",
        units: newUnits,
        status: "pending",
      });
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto stagger">
      {/* ── HERO : Glycémie + IOB ── */}
      <section className="surface-1 rounded-3xl p-6 sm:p-8 mb-4 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-24 -left-16 h-64 w-64 rounded-full opacity-[0.10] blur-3xl"
          style={{ background: "var(--diabete)" }}
        />

        <div className="relative flex items-start justify-between gap-4 mb-6">
          <div>
            <p className="label">Diabète T1</p>
            <h1 className="mt-1 text-xl sm:text-2xl font-semibold text-text-primary">
              {profile.insulinRapid} · {profile.cgmType}
            </h1>
          </div>
          <div className="flex gap-1.5">
            <NavIconLink href="/diabete/docteur" label="Docteur">
              <Stethoscope className="w-4 h-4" />
            </NavIconLink>
            <NavIconLink href="/diabete/historique" label="Historique">
              <History className="w-4 h-4" />
            </NavIconLink>
            <NavIconLink href="/diabete/patterns" label="Patterns">
              <Sparkles className="w-4 h-4" />
            </NavIconLink>
            <NavIconLink href="/diabete/parametres" label="Paramètres">
              <Settings className="w-4 h-4" />
            </NavIconLink>
          </div>
        </div>

        <div className="relative space-y-4">
          <GlucoseWidget
            fallbackValue={lastValue}
            fallbackRecordedAt={lastGlucose?.recordedAt}
          />

          <div className="grid grid-cols-2 gap-4">
            {/* Jumelle visuelle de CarbsOnBoardTile : même fix mobile (icône
                empilée au-dessus du texte sous `sm`) — cf. son commentaire
                pour le calcul de largeur à 375px. */}
            <div className="surface-2 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
              <div className="shrink-0 w-8 h-8 sm:w-12 sm:h-12 rounded-xl bg-info/10 flex items-center justify-center">
                <Syringe className={`w-4 h-4 sm:w-5 sm:h-5 ${iobTone === "warning" ? "text-warning" : "text-info"}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="label mb-1">Insuline active</p>
                <div className="flex items-baseline gap-1.5">
                  <span
                    className={`num-hero text-4xl sm:text-5xl font-semibold leading-none ${
                      iobTone === "warning" ? "text-warning" : "text-info"
                    }`}
                  >
                    {iob.totalIOB.toFixed(1)}
                  </span>
                  <span className="text-xs text-text-tertiary">U</span>
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  {iob.details.length === 0
                    ? "Rien d'actif"
                    : `${iob.details.length} injection${iob.details.length > 1 ? "s" : ""} en cours`}
                </p>
              </div>
            </div>
            <CarbsOnBoardTile cob={cob} />
          </div>
        </div>
      </section>

      {/* ── AJOUTER DES GLUCIDES (geste d'urgence : re-sucrage, collation) ──
          Volontairement juste sous les 3 tuiles du haut, avant la courbe 8h :
          accessible sans défiler quand Ethan vient de se re-sucrer. Section
          unique — ne pas en recréer une deuxième ailleurs. */}
      <div className="mb-4">
        <CarbEntryLogger />
      </div>

      {/* ── COURBE 8H (capteur live) ── */}
      <div className="mb-4">
        <GlucoseChart />
      </div>

      {/* ── PATTERNS DÉTECTÉS (Phase 11 Bloc 3) ── */}
      {visiblePatterns.length > 0 && (
        <section className="mb-4 space-y-2">
          {visiblePatterns.map((p) => (
            <PatternCard key={p.id} pattern={p} onDismiss={() => dismissPattern(p.id)} />
          ))}
        </section>
      )}

      {/* ── HYPO LOGGER (Phase H — apparait si glycémie < 80) ──
          En soirée (20h-2h), c'est le Night Brain qui gère l'hypo dans le
          plan unifié → on masque le logger autonome pour éviter le doublon. */}
      {!isEveningHours && (liveGlucose?.value ?? currentGlucose) < 80 && (
        <HypoLogger
          currentGlucose={liveGlucose?.value ?? currentGlucose}
          trendArrow={trendStringToNumber(liveGlucose?.trend) ?? trendArrow}
          iobUnits={iob.totalIOB}
          lastBolusMinutesAgo={lastActiveInjection?.minutesAgo ?? null}
          lastBolusUnits={lastActiveInjection?.log.units ?? null}
        />
      )}

      {/* ── HYPO FEEDBACK (hypos récentes 24h) ── */}
      <HypoFeedback />

      {/* ── CORRECTION SUGGÉRÉE (hyper) ── */}
      <div className="mb-4">
        <CorrectionSuggestion />
      </div>

      {/* ── CONFIRMATION DES GLUCIDES (T+15 → T+3h) ── */}
      {/* key={pendingConfirm.id} : si l'injection éligible change pendant que
          la carte est montée (confirmation de la précédente qui démasque la
          suivante), on force un remount plutôt que de garder l'état local
          (carbs/fat/protein) initialisé depuis l'ancienne injection. */}
      {pendingConfirm && (
        <MealConfirmCard
          key={pendingConfirm.id}
          log={pendingConfirm}
          onConfirm={(v) => handleConfirmCarbs(pendingConfirm, v)}
          onUncertain={() => handleMarkUncertain(pendingConfirm)}
        />
      )}

      {/* ── APPOINT SUGGÉRÉ (glucides restants non couverts) ── */}
      {topUp && (
        <TopUpCard
          topUp={topUp}
          onAccept={handleAcceptTopUp}
          onDismiss={() => setTopUpDismissedDeficit(topUp.deficitU)}
        />
      )}

      {/* ── RAPPELS SPLIT DOSE en attente ── */}
      {pendingReminders.length > 0 && (
        <section className="surface-1 rounded-3xl p-5 mb-4 border border-accent-2/30">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-diabete" />
            <h2 className="text-base font-semibold text-text-primary">
              Rappel{pendingReminders.length > 1 ? "s" : ""} split dose
            </h2>
          </div>
          <div className="space-y-2">
            {pendingReminders.map((r) => {
              const triggerMs = new Date(r.triggerAt).getTime();
              const now = nowTick;
              const minutesRemaining = Math.round((triggerMs - now) / 60000);
              const isDue = minutesRemaining <= 0;
              return (
                <div
                  key={r.id}
                  className={`rounded-xl p-3 flex items-center justify-between gap-3 ${
                    isDue ? 'bg-diabete/15 border border-diabete/40' : 'bg-bg-tertiary border border-border-subtle'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">
                      {isDue
                        ? `À faire maintenant : ${r.units}U`
                        : `Dans ${minutesRemaining} min : ${r.units}U`}
                    </p>
                    <p className="text-[11px] text-text-tertiary mt-0.5">
                      {new Date(r.triggerAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      · couverture FPU
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleConfirmSplitDose(r)}
                      className="bg-diabete text-ink text-xs font-semibold px-3 py-2 rounded-lg tap-scale flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Logger
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDismissSplitDose(r)}
                      aria-label="Annuler le rappel"
                      className="p-2 rounded-md text-text-tertiary hover:text-error hover:bg-error/10 transition-colors tap-scale"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── NIGHT BRAIN (plan nuit unifié — visible en soirée 20h-2h) ──
          Remplace l'empilement HypoLogger + rappel split + BedtimeAdvisor
          par UNE carte : un plan ordonné et cohérent. */}
      {isEveningHours && (
        <>
          <NightBrain
            input={nightBrainInput}
            calibration={{
              driftPerHour: nightCalibration.drift.driftPerHour,
              driftNights: nightCalibration.drift.sampleNights,
              dawnDays: nightCalibration.dawn.sampleDays,
              verifiedNights: nightCalibration.verifiedNights,
              bias: nightCalibration.bias.bias,
              recalibratingSince: nightCalibration.recalibratingSince,
            }}
            onLogHypoCarbs={handleNightHypoCarbs}
            onLogCorrection={handleBedtimeCorrection}
            onConfirmSplit={handleNightConfirmSplit}
            onAdjustSplit={handleAdjustBedtimeSplit}
            onResetCalibration={(sinceMs) =>
              // Reset manuel : changement de lente fait AVANT que l'app le
              // tracke (ou re-saisie de la même valeur → pas de tampon auto).
              // updateProfile merge le champ tel quel sans toucher basalDose.
              updateProfile({ basalDoseChangedAt: new Date(sinceMs).toISOString() })
            }
          />
        </>
      )}

      {/* ── BRIEFING PRÉ-SPORT (advisor indépendant) ── */}
      <section className="surface-1 rounded-3xl p-5 mb-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-diabete" />
            <h2 className="text-base font-semibold text-text-primary">
              Briefing pré-sport
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setBriefingActive((v) => !v)}
            className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
              briefingActive ? "bg-diabete" : "bg-border-strong"
            }`}
            aria-label="Toggle briefing pré-sport"
          >
            <span
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-bg-primary transition-transform ${
                briefingActive ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        {!briefingActive ? (
          <p className="text-xs text-text-tertiary leading-relaxed">
            Active si tu prévois un sport bientôt. On regarde ton IOB, ta
            glycémie live et tes split doses pour te donner des conseils
            actionnables (manger des glucides, réduire ou décaler une dose).
          </p>
        ) : (
          <div className="space-y-3 animate-slide-up">
            {/* Sélecteur sport */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBriefingType("muscu")}
                className={`flex items-center gap-2 justify-center py-2 text-xs font-medium rounded-lg border transition-all tap-scale ${
                  briefingType === "muscu"
                    ? "bg-muscu/15 border-muscu/40 text-muscu"
                    : "bg-bg-tertiary border-border-subtle text-text-secondary"
                }`}
              >
                <Dumbbell className="w-3.5 h-3.5" />
                Muscu
              </button>
              <button
                type="button"
                onClick={() => setBriefingType("running")}
                className={`flex items-center gap-2 justify-center py-2 text-xs font-medium rounded-lg border transition-all tap-scale ${
                  briefingType === "running"
                    ? "bg-running/15 border-running/40 text-running"
                    : "bg-bg-tertiary border-border-subtle text-text-secondary"
                }`}
              >
                <Footprints className="w-3.5 h-3.5" />
                Running
              </button>
            </div>

            {/* Quand fais-tu ton sport ? — boutons discrets (le slider était
                trompeur : les repères ne correspondaient pas à l'échelle). */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="label">Dans combien de temps ?</p>
                <span className="num text-xs text-diabete font-semibold">
                  {formatBriefingDelay(briefingMinutes)} · à{" "}
                  {new Date(nowTick + briefingMinutes * 60000).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 45, 60, 90, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBriefingMinutes(m)}
                    className={`py-2 text-xs font-semibold rounded-lg border transition-all tap-scale num ${
                      briefingMinutes === m
                        ? "bg-diabete/15 border-diabete/40 text-diabete"
                        : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default"
                    }`}
                  >
                    {formatBriefingDelay(m)}
                  </button>
                ))}
              </div>
            </div>

            {/* Données utilisées — transparence sur les inputs */}
            <div className="rounded-xl bg-bg-tertiary border border-border-subtle p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="label">Données utilisées</p>
                <button
                  type="button"
                  onClick={() => {
                    setBriefingRefreshing(true);
                    Promise.resolve(refetchGlucose()).finally(() => {
                      setBriefingRefreshing(false);
                    });
                  }}
                  disabled={briefingRefreshing}
                  className="flex items-center gap-1 text-[10px] text-text-tertiary hover:text-diabete transition-colors disabled:opacity-50 tap-scale"
                >
                  <Activity className={`w-3 h-3 ${briefingRefreshing ? 'animate-spin' : ''}`} />
                  {briefingRefreshing ? 'Refresh…' : 'Rafraîchir'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Glycémie live */}
                <div className="flex items-start gap-1.5">
                  <Droplet className="w-3 h-3 text-diabete shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-text-tertiary uppercase tracking-wide">Glycémie</p>
                    {liveGlucose ? (
                      <p className="num text-text-primary font-semibold">
                        {liveGlucose.value}
                        <span className="text-text-secondary ml-1">{liveGlucose.arrow}</span>
                        <span className="text-[9px] text-text-tertiary ml-1">
                          ({Math.round((Date.now() - new Date(liveGlucose.date).getTime()) / 60000)}min)
                        </span>
                      </p>
                    ) : (
                      <p className="num text-text-tertiary">{currentGlucose} (manuel)</p>
                    )}
                  </div>
                </div>
                {/* IOB */}
                <div className="flex items-start gap-1.5">
                  <Syringe className="w-3 h-3 text-info shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-[9px] text-text-tertiary uppercase tracking-wide">IOB</p>
                    <p className="num text-text-primary font-semibold">
                      {iob.totalIOB.toFixed(1)}
                      <span className="text-text-tertiary ml-0.5">U</span>
                    </p>
                  </div>
                </div>
                {/* Split en attente */}
                {(() => {
                  const upcomingSplit = splitDoseReminders
                    .filter((r) => r.status === "pending")
                    .map((r) => ({ ...r, minutesUntil: Math.round((new Date(r.triggerAt).getTime() - nowTick) / 60000) }))
                    .filter((r) => r.minutesUntil >= 0)
                    .sort((a, b) => a.minutesUntil - b.minutesUntil)[0];
                  if (!upcomingSplit) return null;
                  return (
                    <div className="flex items-start gap-1.5 col-span-2">
                      <Clock className="w-3 h-3 text-accent-2 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[9px] text-text-tertiary uppercase tracking-wide">Split en attente</p>
                        <p className="num text-text-primary font-semibold">
                          {upcomingSplit.units}U dans {upcomingSplit.minutesUntil}min
                        </p>
                      </div>
                    </div>
                  );
                })()}
                {/* Repas récent en digestion (transparence — la prédiction
                    reste prudente et ne crédite pas la montée du repas). */}
                {loggedMealPrefill && loggedMealPrefill.minsAgo < 180 && (
                  <div className="flex items-start gap-1.5 col-span-2">
                    <Apple className="w-3 h-3 text-text-tertiary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-[9px] text-text-tertiary uppercase tracking-wide">
                        Repas en digestion
                      </p>
                      <p className="num text-text-secondary text-[11px] leading-snug">
                        {loggedMealPrefill.carbsGrams}g il y a {loggedMealPrefill.minsAgo}min — l&apos;estimation reste prudente
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Briefing résultats */}
            {preSportBriefing && (
              <div
                className={`rounded-xl p-3 border ${
                  preSportBriefing.risk === "risk"
                    ? "bg-error/10 border-error/30"
                    : preSportBriefing.risk === "caution"
                    ? "bg-warning/10 border-warning/30"
                    : "bg-success/10 border-success/30"
                }`}
              >
                <div className="flex items-center justify-between mb-2 text-[10px]">
                  <span className="label" style={{ color: "var(--diabete)" }}>
                    Glycémie estimée
                  </span>
                  <span className="num text-text-secondary">
                    <span className="font-semibold text-text-primary">
                      {preSportBriefing.estimatedAtWorkoutStart}
                    </span>{" "}
                    au début · ~
                    <span className="font-semibold text-text-primary">
                      {preSportBriefing.estimatedDuringWorkout}
                    </span>{" "}
                    pendant
                  </span>
                </div>

                {/* Décomposition du calcul (transparence) */}
                {(() => {
                  const b = preSportBriefing.breakdown;
                  const pieces: string[] = [];
                  pieces.push(`${b.glucoseInput} (actuel)`);
                  if (b.dropFromIob > 0) pieces.push(`-${b.dropFromIob} (IOB)`);
                  if (b.dropFromSplit > 0) pieces.push(`-${b.dropFromSplit} (split)`);
                  if (b.dropFromTrend > 0) pieces.push(`-${b.dropFromTrend} (trend)`);
                  else if (b.dropFromTrend < 0) pieces.push(`+${-b.dropFromTrend} (trend)`);
                  return (
                    <p className="num text-[10px] text-text-tertiary mb-2 leading-snug">
                      {pieces.join(" ")}
                    </p>
                  );
                })()}

                <div className="space-y-2">
                  {preSportBriefing.recommendations.map((reco, i) => {
                    const RecoIcon =
                      reco.type === "eat-carbs"
                        ? Apple
                        : reco.type === "reduce-split"
                        ? Minus
                        : reco.type === "delay-split"
                        ? Clock
                        : reco.type === "delay-workout"
                        ? AlertTriangle
                        : reco.type === "check-glucose"
                        ? AlertCircle
                        : CheckCircle2;
                    const tone =
                      preSportBriefing.risk === "risk"
                        ? "text-error"
                        : preSportBriefing.risk === "caution"
                        ? "text-warning"
                        : "text-success";
                    return (
                      <div key={i} className="flex items-start gap-2">
                        <RecoIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${tone}`} />
                        <div className="min-w-0 flex-1">
                          <p className={`text-xs font-semibold leading-snug ${tone}`}>
                            {reco.headline}
                          </p>
                          <p className="text-[10px] text-text-secondary mt-0.5 leading-snug">
                            {reco.detail}
                          </p>
                          {/* Actions inline pour reduce-split / delay-split */}
                          {(reco.type === "reduce-split" || reco.type === "delay-split") &&
                            (() => {
                              const split = splitDoseReminders.find(
                                (r) => r.status === "pending",
                              );
                              if (!split) return null;
                              if (reco.type === "reduce-split" && reco.quantity !== undefined) {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleReduceSplit(split.id, reco.quantity!)}
                                    className="mt-1.5 text-[10px] font-semibold text-diabete bg-diabete/10 hover:bg-diabete/20 transition-colors px-2 py-1 rounded-md tap-scale"
                                  >
                                    Réduire à {reco.quantity}U →
                                  </button>
                                );
                              }
                              if (reco.type === "delay-split") {
                                return (
                                  <button
                                    type="button"
                                    onClick={() => handleDelaySplit(split.id, 90)}
                                    className="mt-1.5 text-[10px] font-semibold text-diabete bg-diabete/10 hover:bg-diabete/20 transition-colors px-2 py-1 rounded-md tap-scale"
                                  >
                                    Décaler de 1h30 →
                                  </button>
                                );
                              }
                              return null;
                            })()}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── CALCULATEUR BOLUS (action primaire) ── */}
      <section className="surface-1 rounded-3xl p-6 sm:p-8 mb-4 glow-accent">
        <div className="flex items-center gap-2 mb-5">
          <Calculator className="w-5 h-5 text-diabete" />
          <h2 className="text-lg font-semibold text-text-primary">Calculateur de bolus</h2>
        </div>

        {/* Phase F — Encadré ajustement post-exercice (insulin sensitivity ↑) */}
        {exerciseAdjustment && (() => {
          const sportLabel =
            exerciseAdjustment.source === "running" ? "Running"
            : exerciseAdjustment.source === "cardio-other" ? "Cardio"
            : "Muscu";
          const isMuscu = exerciseAdjustment.source === "muscu";
          // Pour la muscu, l'effet est moindre → tone "warning" plus discret
          const toneBg = isMuscu ? "bg-warning/10" : "bg-success/10";
          const toneBorder = isMuscu ? "border-warning/30" : "border-success/30";
          const toneText = isMuscu ? "text-warning" : "text-success";
          const Icon = exerciseAdjustment.source === "muscu" ? Dumbbell : Footprints;
          return (
            <div className={`rounded-2xl ${toneBg} border ${toneBorder} p-3 mb-5 flex items-start gap-2`}>
              <Icon className={`w-4 h-4 ${toneText} shrink-0 mt-0.5`} />
              <div className="min-w-0 flex-1">
                <p className={`text-xs font-semibold ${toneText} leading-snug`}>
                  Sensibilité insuline ↑ — bolus réduit de {exerciseAdjustment.reductionPct}%
                </p>
                <p className="text-[10px] text-text-secondary mt-1 leading-snug">
                  {sportLabel} ({exerciseAdjustment.durationMin}min) il y a{" "}
                  <span className="num">{exerciseAdjustment.hoursAgo.toFixed(1).replace(".", ",")}h</span>
                  {" · "}
                  strain {exerciseAdjustment.strainSource === "whoop" ? "" : "estimé "}
                  <span className="num font-semibold">{exerciseAdjustment.strain.toFixed(0)}</span>/21
                  {exerciseAdjustment.strainSource === "whoop" && (
                    <span className={`ml-1 text-[9px] uppercase tracking-wide ${toneText} opacity-80 font-semibold`}>Whoop</span>
                  )}
                </p>
                {isMuscu && (
                  <p className="text-[10px] text-warning/80 mt-1 leading-snug italic">
                    Muscu = effet glycémique moindre que cardio (Yardley 2013).
                    Réduction limitée à {Math.round(exerciseAdjustment.sportFactor * 100)}% de l&apos;effet cardio.
                  </p>
                )}
              </div>
            </div>
          );
        })()}

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <BolusInput
            label="Glucides"
            unit="g"
            value={carbsGrams}
            onChange={setCarbsGrams}
            min={0}
            max={300}
          />
          <BolusInput
            label="Glycémie"
            unit="mg/dL"
            value={currentGlucose}
            onChange={setCurrentGlucose}
            min={40}
            max={500}
            suffix={trendArrow ? trendNumberToArrow(trendArrow) : undefined}
          />
        </div>

        <button
          type="button"
          onClick={() => setCarbsUncertain((v) => !v)}
          className={`mt-2 flex items-center gap-1.5 text-xs tap-scale ${
            carbsUncertain ? "text-warning" : "text-text-tertiary"
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5" />
          {carbsUncertain
            ? "Quantité incertaine — aucun conseil de dose ne sera donné"
            : "Je ne suis pas sûr de la quantité"}
        </button>

        {liveValueForBolus !== undefined && (liveValueForBolus !== currentGlucose || trendArrow !== liveTrend) && (
          <button
            type="button"
            onClick={() => {
              setCurrentGlucose(liveValueForBolus);
              if (liveTrend) setTrendArrow(liveTrend);
            }}
            className="mb-3 w-full text-xs text-diabete hover:text-diabete/80 transition-colors py-2 rounded-lg border border-diabete/25 bg-diabete/5 tap-scale flex items-center justify-center gap-1.5"
          >
            <span
              className="dot-pulse h-1.5 w-1.5 rounded-full bg-success"
              aria-hidden
            />
            Utiliser la valeur live (<span className="num">{liveValueForBolus}</span>{" "}
            {liveTrend ? trendNumberToArrow(liveTrend) : ""} mg/dL)
          </button>
        )}

        {/* Quick-tags repas (Phase 11 Bloc 2.1) */}
        <div className="mb-4">
          <p className="label mb-2">Type de repas</p>
          <div className="grid grid-cols-3 sm:grid-cols-3 gap-2">
            {MEAL_TAGS.map((t) => {
              const Icon = MEAL_TAG_ICONS[t.iconName as keyof typeof MEAL_TAG_ICONS] ?? UtensilsCrossed;
              const active = mealTag === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (active) {
                      // Désélection : on garde les macros déjà saisies
                      setMealTag(undefined);
                    } else {
                      setMealTag(t.id);
                      setMacrosManuallyEdited(false); // re-prefill from tag
                    }
                  }}
                  className={`flex flex-col items-center gap-1 py-2.5 px-1 text-[11px] font-medium rounded-lg border transition-all tap-scale ${
                    active
                      ? "bg-diabete/15 border-diabete/40 text-diabete"
                      : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="leading-tight text-center">{t.label}</span>
                </button>
              );
            })}
          </div>
          {mealTag && (
            <div className="mt-3 grid grid-cols-3 gap-2 animate-slide-up">
              {MEAL_SIZES.map((s) => {
                const active = mealSize === s.id;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setMealSize(s.id);
                      setMacrosManuallyEdited(false);
                    }}
                    className={`py-2 text-xs font-medium rounded-lg border transition-all tap-scale ${
                      active
                        ? "bg-diabete/15 border-diabete/40 text-diabete"
                        : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default"
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          )}
          {/* Historique par type de repas (Bloc 2.3) */}
          {mealTag && (() => {
            const history = getMealTypeHistory(insulinLogs, archivePoints, mealTag, 5);
            if (history.count < 3 || !history.suggestion) return null;
            return (
              <div className="mt-3 rounded-lg bg-accent-2/10 border border-accent-2/25 px-3 py-2 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-accent-2 shrink-0 mt-0.5" />
                <p className="text-[11px] text-text-secondary leading-snug">
                  {history.suggestion}
                </p>
              </div>
            );
          })()}

          {/* Auto-calibration macros perso (Phase 11, mai 2026) */}
          {mealTag && (() => {
            const avg = getAvgMacrosForTag(insulinLogs, mealTag, 5);
            if (avg.count < 3 || avg.avgFat === null || avg.avgProtein === null) return null;
            // Calcule l'écart vs preset pour décider d'afficher
            const tag = MEAL_TAGS.find((t) => t.id === mealTag);
            if (!tag) return null;
            const sizeMult = MEAL_SIZES.find((s) => s.id === mealSize)?.multiplier ?? 1;
            const presetFat = Math.round(tag.avgFat * sizeMult);
            const presetProt = Math.round(tag.avgProtein * sizeMult);
            const diffFat = Math.abs((avg.avgFat ?? 0) - presetFat);
            const diffProt = Math.abs((avg.avgProtein ?? 0) - presetProt);
            // Affiche uniquement si l'écart vs preset est >= 5g (sinon pas pertinent)
            if (diffFat < 5 && diffProt < 5) return null;
            return (
              <div className="mt-3 rounded-lg bg-diabete/10 border border-diabete/25 px-3 py-2.5 flex items-start gap-2">
                <Sparkle className="w-3.5 h-3.5 text-diabete shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-text-primary font-medium leading-snug">
                    Tes {avg.count} derniers &laquo; {tag.label} &raquo; : ~
                    <span className="num text-diabete">{avg.avgFat}g</span> lip +{" "}
                    <span className="num text-diabete">{avg.avgProtein}g</span> prot
                  </p>
                  <p className="text-[10px] text-text-tertiary mt-0.5">
                    Preset : {presetFat}g lip + {presetProt}g prot
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setFatGrams(avg.avgFat!);
                      setProteinGrams(avg.avgProtein!);
                      setMacrosManuallyEdited(true);
                      setShowMacros(true);
                    }}
                    className="mt-1.5 text-[10px] font-semibold text-diabete bg-diabete/15 hover:bg-diabete/25 transition-colors px-2.5 py-1 rounded-md tap-scale"
                  >
                    Utiliser ma moyenne →
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Hint Yazio sync pour repas riches/lourds (slow profile) */}
          {mealTag && !macrosManuallyEdited && (() => {
            const tag = MEAL_TAGS.find((t) => t.id === mealTag);
            if (!tag || tag.glycemicProfile !== 'slow') return null;
            return (
              <div className="mt-3 rounded-lg bg-warning/10 border border-warning/25 px-3 py-2.5 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-text-secondary leading-snug">
                    Repas riche : pour une dose précise, copie tes vraies macros depuis Yazio
                    plutôt que le preset.
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openYazio()}
                      className="text-[11px] font-semibold text-ink bg-warning hover:bg-warning/90 transition-colors px-3 py-1.5 rounded-md tap-scale flex items-center gap-1.5"
                    >
                      <Apple className="w-3 h-3" />
                      Ouvrir Yazio →
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowMacros(true)}
                      className="text-[10px] font-semibold text-warning hover:underline tap-scale"
                    >
                      Saisir manuellement
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>

        {/* Macros optionnelles (FPU) */}
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowMacros((v) => !v)}
            className="text-xs text-text-tertiary hover:text-diabete transition-colors flex items-center gap-1.5"
          >
            {showMacros ? <ChevronDown className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            Lipides &amp; protéines {mealTag ? "(pré-remplis)" : "(optionnel)"}
          </button>
          {showMacros && (
            <div className="mt-3 grid grid-cols-2 gap-3 animate-slide-up">
              <BolusInput
                label="Lipides"
                unit="g"
                value={fatGrams}
                onChange={(v) => { setFatGrams(v); setMacrosManuallyEdited(true); }}
                min={0}
                max={200}
              />
              <BolusInput
                label="Protéines"
                unit="g"
                value={proteinGrams}
                onChange={(v) => { setProteinGrams(v); setMacrosManuallyEdited(true); }}
                min={0}
                max={200}
              />
            </div>
          )}
        </div>

        {/* Meal selector — auto-sélectionné selon l'heure, override manuel possible */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <p className="label">Repas</p>
            {mealTimeTouched ? (
              <button
                type="button"
                onClick={() => setMealTimeTouched(false)}
                className="text-[10px] font-medium text-text-tertiary underline underline-offset-2 hover:text-text-secondary transition-colors tap-scale"
              >
                Revenir en auto
              </button>
            ) : (
              <span className="text-[10px] text-text-tertiary">
                auto selon l&apos;heure
              </span>
            )}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {MEAL_OPTIONS.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  setMealTime(m.value);
                  setMealTimeTouched(true);
                  if (m.value === "other") setCarbsGrams(0);
                }}
                className={`py-2 text-xs font-medium rounded-lg border transition-all tap-scale ${
                  mealTime === m.value
                    ? "bg-diabete/15 border-diabete/40 text-diabete"
                    : "bg-bg-tertiary border-border-subtle text-text-secondary hover:border-border-default"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mealTime === "other" && (
            <p className="mt-2 text-[11px] text-text-tertiary leading-relaxed">
              Saisie libre — pour une injection sans repas associé (ex: correction
              d&apos;hyper). Mets <span className="num">0</span>g de glucides si tu
              veux uniquement la correction sur la glycémie.
            </p>
          )}
        </div>

        {/* Pre-workout */}
        <div className="surface-2 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-sm font-medium text-text-primary">Pré-entraînement ?</p>
              <p className="text-xs text-text-tertiary">Ajuste le bolus automatiquement</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsPreWorkout(!isPreWorkout);
                if (isPreWorkout) setWorkoutType(null);
              }}
              className={`relative w-12 h-6 rounded-full transition-colors shrink-0 ${
                isPreWorkout ? "bg-diabete" : "bg-border-strong"
              }`}
              aria-label="Toggle pré-entraînement"
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-bg-primary transition-transform ${
                  isPreWorkout ? "translate-x-6" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {isPreWorkout && (
            <div className="space-y-3 animate-slide-up">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setWorkoutType("muscu")}
                  className={`flex items-center gap-2 justify-center py-2.5 text-xs font-medium rounded-lg border transition-all tap-scale ${
                    workoutType === "muscu"
                      ? "bg-muscu/15 border-muscu/40 text-muscu"
                      : "bg-bg-tertiary border-border-subtle text-text-secondary"
                  }`}
                >
                  <Dumbbell className="w-3.5 h-3.5" />
                  Muscu
                </button>
                <button
                  type="button"
                  onClick={() => setWorkoutType("running")}
                  className={`flex items-center gap-2 justify-center py-2.5 text-xs font-medium rounded-lg border transition-all tap-scale ${
                    workoutType === "running"
                      ? "bg-running/15 border-running/40 text-running"
                      : "bg-bg-tertiary border-border-subtle text-text-secondary"
                  }`}
                >
                  <Footprints className="w-3.5 h-3.5" />
                  Running
                </button>
              </div>
              <BolusInput
                label="Dans combien de minutes"
                unit="min"
                value={minutesUntilWorkout}
                onChange={setMinutesUntilWorkout}
                min={0}
                max={360}
              />

              {/* Pre-workout advisor */}
              {advisorState && (
                <div
                  className={`rounded-xl p-3 border ${
                    advisorState.tone === 'risk'
                      ? 'bg-error/10 border-error/30 text-error'
                      : advisorState.tone === 'caution'
                      ? 'bg-warning/10 border-warning/30 text-warning'
                      : 'bg-success/10 border-success/30 text-success'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {workoutType === 'muscu' ? (
                      <Dumbbell className="w-4 h-4 shrink-0 mt-0.5" />
                    ) : (
                      <Footprints className="w-4 h-4 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-snug">
                        {advisorState.message}
                      </p>
                      <p className="text-[11px] mt-1 opacity-80">
                        Glycémie estimée à T+{minutesUntilWorkout}min :{" "}
                        <span className="num font-semibold">
                          {advisorState.estimatedGlucoseAtWorkout}
                        </span>{" "}
                        mg/dL
                        {advisorState.usedPersonalImpact && (
                          <>
                            {" · "}
                            <span className="num font-semibold">
                              ~{advisorState.estimatedDuringWorkout}
                            </span>{" "}
                            pendant
                          </>
                        )}
                      </p>
                      {advisorState.usedPersonalImpact && (
                        <p className="text-[10px] mt-0.5 opacity-60">
                          basé sur tes séances trackées
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* IOB stacking encadré (Phase 11) */}
        {iob.totalIOB > 1 && (
          <div className="rounded-2xl bg-warning/10 border border-warning/30 p-4 mb-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-sm font-semibold text-text-primary">
                  IOB actif :{" "}
                  <span className="num text-warning">{iob.totalIOB.toFixed(1)}</span>U
                  {lastActiveInjection && (
                    <span className="text-text-tertiary text-xs font-normal">
                      {" "}
                      ({lastActiveInjection.log.mealType} de{" "}
                      {new Date(lastActiveInjection.injectedAt).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })})
                    </span>
                  )}
                </p>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Le bolus glucides{" "}
                  <span className="num font-semibold">
                    ({bolusResult.carbBolus.toFixed(1).replace(".", ",")}U)
                  </span>{" "}
                  n&apos;est PAS réduit (la nourriture arrive).{" "}
                  {bolusResult.correctionBolus > 0
                    ? `La correction est réduite anti-stacking : ${bolusResult.correctionBolus.toFixed(1).replace(".", ",")}U.`
                    : "Pas de correction nécessaire."}
                </p>
                {cappedDose.capped && (
                  <p className="text-[11px] text-warning leading-relaxed">
                    Détail du calcul avant plafonnement — la dose réellement retenue est{" "}
                    {cappedDose.units}U (voir ci-dessous).
                  </p>
                )}
                <p className="text-xs text-text-secondary leading-relaxed">
                  Total effectif avec IOB :{" "}
                  <span className="num font-semibold text-warning">
                    {finalUnits}U + {iob.totalIOB.toFixed(1).replace(".", ",")}U
                  </span>{" "}
                  = ~
                  <span className="num font-semibold">
                    {(finalUnits + iob.totalIOB).toFixed(1).replace(".", ",")}U
                  </span>{" "}
                  travaillant sur ta glycémie.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Résultat hero — éditable */}
        <div className="rounded-2xl bg-diabete/10 border border-diabete/30 p-5">
          <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
            <p className="label" style={{ color: "var(--diabete)" }}>
              {bolusResult.splitDose ? "Maintenant" : "Dose à injecter"}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Badge de confiance macros (Phase 11) */}
              {(() => {
                const cfg =
                  macrosConfidence === 'precise'
                    ? { Icon: ShieldCheck, label: 'Macros précises', cls: 'bg-success/15 text-success border-success/30', title: 'Macros saisies précisément — calcul fiable' }
                    : macrosConfidence === 'preset'
                    ? { Icon: Shield, label: 'Preset', cls: 'bg-warning/15 text-warning border-warning/30', title: 'Macros estimées via preset — précision approximative. Override avec tes vrais chiffres Yazio pour fiabilité maximale.' }
                    : { Icon: ShieldAlert, label: 'Sans macros', cls: 'bg-text-tertiary/15 text-text-tertiary border-text-tertiary/30', title: 'Pas de macros renseignées — bolus calculé sur les glucides uniquement (OK pour repas léger / correction).' };
                return (
                  <span
                    title={cfg.title}
                    className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full font-semibold border ${cfg.cls}`}
                  >
                    <cfg.Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                );
              })()}
              {bolusResult.digestiveComplexity !== 'simple' && (fatGrams > 0 || proteinGrams > 0) && (
                <Badge
                  variant={bolusResult.digestiveComplexity === 'complex' ? 'warning' : 'default'}
                  size="sm"
                >
                  {bolusResult.digestiveComplexity === 'complex' ? 'Complexe' : 'Modéré'}
                </Badge>
              )}
              {iob.totalIOB > 0.5 && (
                <Badge variant="warning" size="sm">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  IOB {iob.totalIOB}U
                </Badge>
              )}
            </div>
          </div>

          {/* Stepper +/- */}
          <div className="flex items-center justify-center gap-4 mb-3">
            <button
              type="button"
              onClick={() => setUnitsOverride(Math.max(0, finalUnits - 1))}
              className="shrink-0 w-11 h-11 rounded-full bg-bg-tertiary border border-border-default text-diabete text-xl font-semibold hover:bg-bg-hover transition-colors tap-scale"
              aria-label="Diminuer d'1U"
            >
              −
            </button>
            <div className="flex items-baseline gap-2 min-w-[140px] justify-center">
              <span className="num-hero text-6xl sm:text-7xl font-semibold text-diabete leading-none tabular-nums">
                {finalUnits}
              </span>
              <span className="text-xl text-diabete/70 font-medium">U</span>
            </div>
            <button
              type="button"
              onClick={() => setUnitsOverride(finalUnits + 1)}
              className="shrink-0 w-11 h-11 rounded-full bg-bg-tertiary border border-border-default text-diabete text-xl font-semibold hover:bg-bg-hover transition-colors tap-scale"
              aria-label="Augmenter d'1U"
            >
              +
            </button>
          </div>

          {/* Plafonnement prédictif (septembre 2026) */}
          {isPreWorkout ? (
            // I6 (revue finale) : `capDoseByPrediction` ne modélise PAS la
            // séance à venir (calculateBolus réduit la candidate pour elle,
            // mais le plafond simule sans son effet hypoglycémiant). Que
            // `cappedDose` soit capped ou non ici ne dit donc RIEN sur la
            // sécurité réelle de la dose vis-à-vis du sport — afficher
            // « ta trajectoire tient » serait promettre à moitié. On le dit
            // explicitement plutôt que d'afficher un badge qui n'en est pas
            // un pour ce cas précis.
            <div className="mt-3 rounded-xl border border-warning/25 bg-warning/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-warning" />
                <p className="text-sm font-semibold text-text-primary">
                  Dose non vérifiée par la prédiction
                </p>
              </div>
              <p className="text-xs text-text-secondary">
                Séance {workoutType === "muscu" ? "muscu" : workoutType === "running" ? "running" : "sportive"}{" "}
                prévue non modélisée par le plafond prédictif — vérifie ta glycémie avant de partir.
              </p>
            </div>
          ) : cappedDose.capped ? (
            <div className="mt-3 rounded-xl border border-warning/25 bg-warning/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-warning" />
                <p className="text-sm font-semibold text-text-primary">
                  Ramenée de {cappedDose.originalUnits} U à {cappedDose.units} U
                </p>
              </div>
              <p className="text-xs text-text-secondary">
                {cappedDose.reason}
                {cappedDose.predictedMinMinute !== null && (
                  <>
                    {" "}
                    Minimum prévu vers{" "}
                    {new Date(nowTick + cappedDose.predictedMinMinute * 60_000).toLocaleTimeString(
                      "fr-FR",
                      { hour: "2-digit", minute: "2-digit" },
                    )}
                    .
                  </>
                )}
              </p>
            </div>
          ) : cappedDose.reason ? (
            // I3 (revue finale) : élevé au même niveau de visibilité que le
            // bloc « plafonné » ci-dessus (avant : `text-xs
            // text-text-tertiary` sur une ligne — le gris le plus discret
            // de la palette pour un message de sécurité). « Dose non
            // vérifiée » n'est pas moins important que « dose ramenée ».
            <div className="mt-3 rounded-xl border border-warning/25 bg-warning/5 p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShieldAlert className="w-4 h-4 text-warning" />
                <p className="text-sm font-semibold text-text-primary">
                  Dose non vérifiée par la prédiction
                </p>
              </div>
              <p className="text-xs text-text-secondary">{cappedDose.reason}</p>
            </div>
          ) : null}

          {/* Split dose later */}
          {bolusResult.splitDose && (
            <div className="text-center mb-3 rounded-lg bg-accent-2/10 border border-accent-2/30 px-3 py-2">
              <p className="text-[10px] text-accent-2 uppercase tracking-wide font-semibold">
                Puis dans{" "}
                {Math.floor(bolusResult.splitDose.delayMinutes / 60)}h
                {bolusResult.splitDose.delayMinutes % 60 > 0
                  ? bolusResult.splitDose.delayMinutes % 60
                  : ""}
              </p>
              <p className="num text-2xl font-semibold text-accent-2 mt-0.5">
                {bolusResult.splitDose.later}
                <span className="text-sm text-accent-2/70 ml-1">U</span>
              </p>
              <p className="text-[10px] text-text-tertiary mt-0.5">
                couverture FPU (graisses + protéines)
              </p>
            </div>
          )}

          {/* Indicateur suggestion calc + reset si modifié */}
          <div className="text-center mb-4">
            {unitsOverride !== null && unitsOverride !== cappedDose.units ? (
              <button
                type="button"
                onClick={() => setUnitsOverride(null)}
                className="text-[11px] text-text-tertiary hover:text-diabete transition-colors underline-offset-2 hover:underline"
              >
                Modifié — calc suggérait {cappedDose.units}U (cliquer pour rétablir)
              </button>
            ) : (
              <p className="text-[11px] text-text-tertiary">
                Suggestion automatique — ajustable avec − / +
              </p>
            )}
          </div>

          {/* Rappel plafonnement — le détail ci-dessous porte sur la dose
              CANDIDATE (avant plafonnement), jamais sur finalUnits. Sans ce
              bandeau, le breakdown et le raisonnement affichent des chiffres
              qui ne somment plus à la dose retenue. */}
          {cappedDose.capped && (
            <div className="mb-3 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 flex items-start gap-2">
              <ShieldAlert className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <p className="text-[11px] text-text-secondary leading-snug">
                Détail du calcul <span className="font-semibold text-warning">avant plafonnement</span>{" "}
                ({cappedDose.originalUnits} U) — la dose à injecter reste{" "}
                <span className="font-semibold text-warning">{cappedDose.units} U</span>, affichée ci-dessus.
              </p>
            </div>
          )}

          {/* Breakdown */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <div className="bg-bg-tertiary rounded-lg px-3 py-2">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Glucides</p>
              <p className="num text-base font-semibold text-info">
                {bolusResult.carbBolus.toFixed(1)}<span className="text-xs text-text-tertiary">U</span>
              </p>
            </div>
            <div className="bg-bg-tertiary rounded-lg px-3 py-2">
              <p className="text-[10px] text-text-tertiary uppercase tracking-wide">Correction</p>
              <p className="num text-base font-semibold text-warning">
                {bolusResult.correctionBolus.toFixed(1)}<span className="text-xs text-text-tertiary">U</span>
              </p>
            </div>
            {bolusResult.fpuBolus > 0 && (
              <div className="bg-bg-tertiary rounded-lg px-3 py-2">
                <p className="text-[10px] text-text-tertiary uppercase tracking-wide">FPU</p>
                <p className="num text-base font-semibold text-accent-2">
                  {bolusResult.fpuBolus.toFixed(1)}<span className="text-xs text-text-tertiary">U</span>
                </p>
              </div>
            )}
            {bolusResult.trendBolus !== 0 && (
              <div className="bg-bg-tertiary rounded-lg px-3 py-2">
                <p className="text-[10px] text-text-tertiary uppercase tracking-wide">
                  Tendance {trendNumberToArrow(trendArrow)}
                </p>
                <p
                  className={`num text-base font-semibold ${
                    bolusResult.trendBolus > 0 ? "text-warning" : "text-success"
                  }`}
                >
                  {bolusResult.trendBolus > 0 ? "+" : ""}
                  {bolusResult.trendBolus.toFixed(1).replace(".", ",")}
                  <span className="text-xs text-text-tertiary">U</span>
                </p>
              </div>
            )}
          </div>

          {bolusResult.adjustments.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {bolusResult.adjustments.map((adj, i) => (
                <Badge key={i} variant="warning" size="sm">
                  {adj}
                </Badge>
              ))}
            </div>
          )}

          {/* Digestive complexity hint (Bloc 2.2) */}
          {(fatGrams > 0 || proteinGrams > 0) && (() => {
            const dc = getDigestiveComplexity(carbsGrams, fatGrams, proteinGrams);
            const tone =
              dc.level === 'complex' ? 'bg-error/10 border-error/30 text-error'
              : dc.level === 'moderate' ? 'bg-warning/10 border-warning/30 text-warning'
              : 'bg-success/10 border-success/30 text-success';
            return (
              <div className={`mb-3 rounded-lg border px-3 py-2 flex items-start gap-2 ${tone}`}>
                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-snug">{dc.message}</p>
              </div>
            );
          })()}

          {/* Conseil de timing d'injection (pré-bolus / pendant / après) */}
          {(() => {
            // I2 (revue finale) : 3e site du motif « valeur par défaut du
            // champ passée à un garde-fou », après suggestTopUp et
            // computeCarbsOnBoard (préexistant, mais touché dans la même
            // passe puisque la source de glycémie est déjà unifiée
            // ci-dessus). Même `glucoseForBolus` que calculateBolus /
            // capDoseByPrediction.
            const timing = getInjectionTimingAdvice(
              glucoseForBolus,
              carbsGrams,
              mealTime,
              trendArrow,
              isPreWorkout,
            );
            if (!timing) return null;
            const tone =
              timing.tone === 'early'
                ? 'bg-warning/10 border-warning/30 text-warning'
                : timing.tone === 'with-meal'
                ? 'bg-info/10 border-info/30 text-info'
                : 'bg-diabete/10 border-diabete/30 text-diabete';
            return (
              <div className={`mb-3 rounded-lg border px-3 py-2 flex items-start gap-2 ${tone}`}>
                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold leading-snug">
                    {timing.headline}
                  </p>
                  <p className="text-[10px] leading-snug opacity-80 mt-0.5">
                    {timing.rationale}
                  </p>
                </div>
              </div>
            );
          })()}

          <button
            type="button"
            onClick={handleLogInjection}
            disabled={finalUnits <= 0}
            className="w-full bg-diabete text-ink font-semibold py-3 rounded-xl hover:bg-diabete/90 transition-colors tap-scale disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Enregistrer l&apos;injection ({finalUnits}U)
          </button>

          {bolusResult.reasoning.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary transition-colors">
                Voir le raisonnement
              </summary>
              <div className="mt-2 space-y-1 text-xs text-text-secondary">
                {cappedDose.capped && (
                  <div className="flex items-start gap-2 pb-1.5 mb-1.5 border-b border-border-subtle">
                    <ShieldAlert className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
                    <span className="text-warning">
                      Raisonnement calculé pour {cappedDose.originalUnits} U (dose candidate,
                      avant plafonnement) — la dose retenue est {cappedDose.units} U.
                    </span>
                  </div>
                )}
                {bolusResult.reasoning.map((r, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-diabete shrink-0">›</span>
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      </section>

      {/* ── Toast split dose ── */}
      {splitToast && (
        <div className="fixed bottom-24 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 max-w-md w-[92vw] sm:w-auto rounded-xl bg-accent-2/15 border border-accent-2/40 px-4 py-3 backdrop-blur-md shadow-lg animate-slide-up">
          <div className="flex items-start gap-3">
            <Clock className="w-4 h-4 text-accent-2 shrink-0 mt-0.5" />
            <p className="text-xs text-text-primary leading-snug">{splitToast}</p>
          </div>
        </div>
      )}

      {/* ── Historique des injections ── */}
      <div className="mb-4">
        <section className="surface-1 rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Syringe className="w-4 h-4 text-diabete" />
              <h2 className="text-base font-semibold text-text-primary">Injections</h2>
            </div>
            <span className="num text-xs text-text-tertiary">
              {insulinLogs.length} total
            </span>
          </div>

          {insulinLogs.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-sm text-text-secondary">Aucune injection</p>
              <p className="text-xs text-text-tertiary mt-1">
                Utilise le calculateur au-dessus pour logger
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto">
              {insulinLogs.slice(0, 10).map((log) => (
                <div
                  key={log.id}
                  className="group bg-bg-tertiary rounded-xl p-3 border border-border-subtle"
                >
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="num text-lg font-semibold text-diabete">
                        {log.units}
                        <span className="text-xs text-text-tertiary ml-0.5">U</span>
                      </span>
                      <Badge
                        variant={
                          log.mealType === "correction" || log.mealType === "other"
                            ? "warning"
                            : "default"
                        }
                        size="sm"
                      >
                        {log.mealType}
                      </Badge>
                      {log.isSplitDose && (
                        <Badge variant="default" size="sm">
                          split
                        </Badge>
                      )}
                      {log.parentInjectionId && !log.isSplitDose && (
                        <Badge variant="warning" size="sm">
                          appoint
                        </Badge>
                      )}
                      {log.carbsUncertain && (
                        <button
                          type="button"
                          onClick={() => handleClearUncertain(log)}
                          title="Lever le drapeau et saisir la quantité"
                          aria-label="Lever le drapeau « incertain » et saisir la quantité"
                          className="tap-scale rounded-full"
                        >
                          <Badge variant="warning" size="sm">
                            incertain
                            <Pencil className="w-2.5 h-2.5 ml-1 inline-block align-[-1px]" />
                          </Badge>
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="num text-[10px] text-text-tertiary">
                        {new Date(log.injectedAt).toLocaleString("fr-FR", {
                          day: "2-digit",
                          month: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteInjection(log.id, log.units)}
                        aria-label="Supprimer l'injection"
                        className="p-1.5 rounded-md text-text-tertiary hover:text-error hover:bg-error/10 transition-colors tap-scale"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="num flex items-center gap-3 text-[11px] text-text-tertiary flex-wrap">
                    <span>
                      {log.carbsConfirmedGrams ?? log.carbsGrams}g gluc.
                      {log.carbsConfirmedGrams !== undefined &&
                        log.carbsConfirmedGrams !== log.carbsGrams && (
                          <span className="text-text-tertiary">
                            {" "}
                            (estimé {log.carbsGrams})
                          </span>
                        )}
                    </span>
                    {(log.fatGrams || log.proteinGrams) && (
                      <span>
                        {log.fatGrams ?? 0}g lip · {log.proteinGrams ?? 0}g prot
                      </span>
                    )}
                    {log.mealTag && (
                      <span className="text-accent-2">
                        #{log.mealTag}
                        {log.mealSize && log.mealSize !== "normal" ? ` · ${log.mealSize}` : ""}
                      </span>
                    )}
                    <span>
                      Glyc.{" "}
                      <span
                        style={{
                          color: glucoseColor(glucoseTone(log.glucoseBefore)),
                        }}
                      >
                        {log.glucoseBefore}
                      </span>
                    </span>
                  </div>
                  {log.notes && (
                    <p className="text-[11px] text-text-tertiary mt-1 italic">
                      {log.notes}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Push notifications ── */}
      <div className="mb-4">
        <PushOptIn />
      </div>

      {/* ── Footer ratios ── */}
      <section className="surface-1 rounded-3xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="label">Mon programme</p>
          <Link
            href="/diabete/parametres"
            className="flex items-center gap-1 text-xs text-diabete hover:text-diabete/80 transition-colors"
          >
            Modifier <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <RatioChip
            label="Le matin"
            value={formatUper10g(diabetesConfig.ratios.morning)}
            unit="pour 10g"
          />
          <RatioChip
            label="À midi"
            value={formatUper10g(diabetesConfig.ratios.lunch)}
            unit="pour 10g"
          />
          <RatioChip
            label="Au goûter"
            value={formatUper10g(
              diabetesConfig.insulinRatios?.find((r) => r.mealKey === "snack")?.ratio ??
                diabetesConfig.ratios.lunch
            )}
            unit="pour 10g"
          />
          <RatioChip
            label="Au dîner"
            value={formatUper10g(diabetesConfig.ratios.dinner)}
            unit="pour 10g"
          />
        </div>
      </section>
    </div>
  );
}

// ─── Sub-components ────────────────────────────

function BolusInput({
  label,
  unit,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  unit: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix?: string;
}) {
  return (
    <label className="block">
      <p className="label mb-1.5">{label}</p>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          min={min}
          max={max}
          className="num w-full bg-bg-tertiary border border-border-subtle rounded-xl px-3 py-3 text-xl font-semibold text-text-primary focus:outline-none focus:border-diabete/50 transition-colors"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-text-tertiary uppercase tracking-wide pointer-events-none">
          {suffix ? <span className="num text-sm text-diabete mr-1">{suffix}</span> : null}
          {unit}
        </span>
      </div>
    </label>
  );
}

function RatioChip({
  label,
  value,
  unit,
}: {
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="bg-bg-tertiary rounded-xl px-3 py-2.5 text-center">
      <p className="text-[10px] text-text-tertiary uppercase tracking-wide">{label}</p>
      <p className="num text-base font-semibold text-text-primary mt-0.5">{value}</p>
      {unit && <p className="text-[9px] text-text-tertiary">{unit}</p>}
    </div>
  );
}

function NavIconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="flex items-center justify-center w-9 h-9 rounded-lg border border-border-subtle text-text-secondary hover:text-diabete hover:border-diabete/40 hover:bg-diabete/5 transition-colors tap-scale"
    >
      {children}
    </Link>
  );
}

function severityStyles(s: PatternSeverity): {
  containerClass: string;
  iconClass: string;
  Icon: typeof AlertTriangle;
} {
  switch (s) {
    case "alert":
      return {
        containerClass: "surface-1 border border-error/40 bg-error/5",
        iconClass: "text-error",
        Icon: AlertTriangle,
      };
    case "warning":
      return {
        containerClass: "surface-1 border border-warning/40 bg-warning/5",
        iconClass: "text-warning",
        Icon: AlertCircle,
      };
    default:
      return {
        containerClass: "surface-1 border border-border-default",
        iconClass: "text-info",
        Icon: Info,
      };
  }
}

function PatternCard({
  pattern,
  onDismiss,
}: {
  pattern: DetectedPattern;
  onDismiss: () => void;
}) {
  const { containerClass, iconClass, Icon } = severityStyles(pattern.severity);
  return (
    <div className={`rounded-2xl px-4 py-3 ${containerClass}`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${iconClass}`} />
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-text-primary leading-snug">
              {pattern.title}
            </p>
            <span className="num text-[10px] text-text-tertiary uppercase tracking-wide shrink-0">
              {pattern.timeWindow}
            </span>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            {pattern.message}
          </p>
          <p className="text-xs text-diabete italic leading-relaxed">
            {pattern.suggestion}
          </p>
          <div className="flex items-center justify-end pt-1">
            <button
              type="button"
              onClick={onDismiss}
              className="flex items-center gap-1 text-[11px] text-text-tertiary hover:text-text-secondary transition-colors tap-scale px-2 py-1 rounded-md"
            >
              <X className="w-3 h-3" />
              Compris
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
