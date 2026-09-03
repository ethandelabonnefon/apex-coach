/**
 * Hypo Re-sucrage — Phase H (juin 2026).
 *
 * Helpers pure functions pour :
 *  - Calculer le GRG (Glucose Response per Gram) personnel d'Ethan
 *  - Suggérer combien de glucides manger pour atteindre une cible
 *  - Analyser une hypo a posteriori (just-right / too-much / too-little)
 *
 * Référence clinique : ADA T1D Self-Management Education — règle classique
 * "15-15" (15g glucides, attendre 15min, re-tester) est le défaut, mais
 * l'efficacité varie de 3 à 6 mg/dL par gramme selon les individus.
 *
 * GRG typique adulte T1D : ~4 mg/dL par gramme. Mais peut varier selon :
 *  - Vitesse d'absorption (jus rapide vs biscotte)
 *  - Glycémie de départ
 *  - IOB en cours
 *  - Heure de la journée (résistance insuline matin)
 *
 * ⚠️ Pure functions — aucun side-effect ni import serveur.
 */

import type { CarbEntry, HypoEvent } from "@/types";

/** GRG par défaut si pas assez de data perso (mg/dL par gramme). */
const DEFAULT_GRG = 4.0;
/** Cible standard post-hypo (mg/dL). */
const POST_HYPO_TARGET = 110;
/** Carbs minimum recommandé en cas d'hypo (anti-sous-sucrage). */
const MIN_CARBS = 8;
/** Carbs maximum sans avis médical (anti-sur-sucrage). */
const MAX_CARBS = 30;

// ───────────────────────────────────────────────────────────────────────
// Resucrage → CarbEntry (fix septembre 2026)
// ───────────────────────────────────────────────────────────────────────
//
// Bug production : un re-sucrage n'écrivait qu'un `HypoEvent` (sert à
// apprendre le GRG perso). Aucun `CarbEntry` n'était créé, donc
// `computeCarbsOnBoard` et `buildPredictionEvents` — qui lisent
// `carbEntries` mais jamais `hypoEvents` — ignoraient totalement les
// glucides du re-sucrage. Conséquence : la tuile « Glucides actifs »
// mentait, et le plan de nuit pouvait re-suggérer de manger alors que le
// re-sucrage précédent n'avait pas encore fini d'agir.
//
// Fix : un re-sucrage écrit maintenant LES DEUX objets, à partir de cette
// unique fonction pure — pour ne jamais dupliquer la construction du
// `CarbEntry` dans les composants (HypoLogger.tsx et le plan de nuit dans
// page.tsx) comme ça avait déjà causé un bug par le passé.

export interface BuildHypoCarbEntryInput {
  /** id du `HypoEvent` associé — traçabilité (`CarbEntry.hypoEventId`). */
  hypoEventId: string;
  /** Grammes réellement consommés au re-sucrage. */
  carbsGrams: number;
  /** Moment de la prise — DOIT être le même horodatage que `HypoEvent.consumedAt`. */
  consumedAt: string | Date;
}

/**
 * Construit le `CarbEntry` correspondant à un re-sucrage.
 *
 * Retourne `null` pour 0g ou une valeur négative — pas d'entrée fantôme
 * dans le store pour un re-sucrage qui n'a pas eu lieu.
 */
export function buildHypoCarbEntry(
  input: BuildHypoCarbEntryInput,
): CarbEntry | null {
  const { hypoEventId, carbsGrams, consumedAt } = input;
  if (!Number.isFinite(carbsGrams) || carbsGrams <= 0) return null;

  const eatenAt =
    consumedAt instanceof Date ? consumedAt.toISOString() : consumedAt;

  return {
    // Id dérivé de l'id du HypoEvent — un même re-sucrage produit toujours
    // le même id de CarbEntry (utile pour une future déduplication).
    id: `hypo-${hypoEventId}`,
    label: "Resucrage",
    carbsGrams,
    insulinUnits: 0,
    eatenAt,
    hypoEventId,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Classification contexte d'une hypo (anti-pollution GRG)
// ───────────────────────────────────────────────────────────────────────

/**
 * Seuils de détection "over-bolus" :
 *  - Si IOB > 1.5U au moment de l'hypo → suspicion forte (insuline active >
 *    capacité standard d'une correction)
 *  - Si IOB > 0.8U ET bolus repas < 180 min → suspicion (le repas n'a pas
 *    encore eu le temps d'être absorbé mais l'insuline est déjà active)
 *  - Si IOB > 0.5U ET bolus < 90 min → suspicion forte (insuline en train
 *    de "tomber" sur peu d'absorption)
 *
 * Quand un over-bolus est suspecté, les glucides consommés ne servent
 * pas QUE à remonter — ils luttent aussi contre l'IOB. Le ratio
 * (peak - initial) / carbs est artificiellement faible.
 */
const IOB_HEAVY_THRESHOLD = 1.5;
const IOB_MODERATE_THRESHOLD = 0.8;
const IOB_LIGHT_THRESHOLD = 0.5;
const BOLUS_RECENT_MINUTES = 90;
const BOLUS_ACTIVE_MINUTES = 180;

export interface HypoContextInput {
  /** IOB total en U au moment du re-sucrage. */
  iobUnits: number;
  /** Minutes depuis le dernier bolus repas (null si aucun en activité). */
  lastBolusMinutesAgo: number | null;
}

/**
 * Détermine le contexte d'une hypo pour décider si elle pollue le GRG perso.
 *
 * Retourne :
 *  - 'over-bolus'    : ne PAS apprendre (les carbs luttent contre IOB)
 *  - 'normal'        : apprendre (carbs purs remontent la glycémie)
 *  - 'unknown'       : pas d'info dispo (inclus par défaut)
 *
 * (post-exercise est tagué depuis l'UI, pas auto ici car nécessite Whoop)
 */
export function classifyHypoContext(
  input: HypoContextInput,
): 'normal' | 'over-bolus' | 'unknown' {
  const { iobUnits, lastBolusMinutesAgo } = input;

  // Pas de data → inconnu
  if (iobUnits === undefined || iobUnits === null) return 'unknown';

  // IOB lourde : presque certainement un over-bolus
  if (iobUnits >= IOB_HEAVY_THRESHOLD) return 'over-bolus';

  // Bolus très récent + IOB modérée → over-bolus probable
  if (
    lastBolusMinutesAgo !== null &&
    lastBolusMinutesAgo < BOLUS_RECENT_MINUTES &&
    iobUnits >= IOB_LIGHT_THRESHOLD
  ) {
    return 'over-bolus';
  }

  // Bolus moyennement récent + IOB modérée → over-bolus probable
  if (
    lastBolusMinutesAgo !== null &&
    lastBolusMinutesAgo < BOLUS_ACTIVE_MINUTES &&
    iobUnits >= IOB_MODERATE_THRESHOLD
  ) {
    return 'over-bolus';
  }

  return 'normal';
}

/**
 * Helper UI : reason humain-friendly du tagging contexte.
 */
export function explainHypoContext(
  context: 'normal' | 'over-bolus' | 'post-exercise' | 'unknown' | undefined,
  iobUnits?: number,
  lastBolusMinutesAgo?: number | null,
): string {
  if (context === 'over-bolus') {
    const iobStr = iobUnits ? `${iobUnits.toFixed(1).replace('.', ',')}U` : 'IOB élevée';
    if (lastBolusMinutesAgo !== null && lastBolusMinutesAgo !== undefined && lastBolusMinutesAgo < 180) {
      return `Bolus repas il y a ${Math.round(lastBolusMinutesAgo)} min + ${iobStr} active → l'insuline tire la glycémie, pas un cas classique de re-sucrage.`;
    }
    return `${iobStr} active → l'insuline tire encore, ces carbs ne reflètent pas ton GRG réel.`;
  }
  if (context === 'post-exercise') {
    return 'Hypo détectée en sensibilité post-sport (Whoop). Pas représentatif du GRG de base.';
  }
  if (context === 'normal') {
    return 'Hypo "vraie" — peu d\'IOB, pas de bolus récent. Cette hypo affine ton GRG perso.';
  }
  return 'Contexte inconnu — incluse par défaut dans l\'apprentissage.';
}

// ───────────────────────────────────────────────────────────────────────
// GRG perso
// ───────────────────────────────────────────────────────────────────────

export interface PersonalGRG {
  /** mg/dL par gramme de glucides absorbé. */
  value: number;
  /** Nb d'événements utilisés pour le calcul. */
  sampleSize: number;
  /** Confiance basée sur sampleSize : low (<3), medium (3-6), high (7+). */
  confidence: 'low' | 'medium' | 'high';
  /** True si on utilise la valeur par défaut faute de data. */
  isDefault: boolean;
}

/**
 * Estime le GRG personnel à partir des hypos passées avec assessment
 * fiable (just-right ou too-much-modéré). On calcule la moyenne de
 * (peak - initial) / carbsConsumed.
 *
 * Filtres :
 *  - assessment != 'pending' / 'unknown'
 *  - peakGlucose disponible
 *  - carbsConsumed > 0
 *  - cohérence : delta entre 5 et 150 mg/dL (sinon outlier)
 *  - excludeFromLearning !== true (anti-pollution over-bolus / manuel)
 *  - context !== 'over-bolus' / 'post-exercise' (auto-exclusion)
 */
export function estimatePersonalGRG(events: HypoEvent[]): PersonalGRG {
  const usable = events
    .filter(
      (e) =>
        e.peakGlucose !== null &&
        e.peakGlucose !== undefined &&
        e.carbsConsumed > 0 &&
        e.initialGlucose > 0 &&
        e.assessment !== 'pending' &&
        e.assessment !== 'unknown' &&
        e.excludeFromLearning !== true &&
        e.context !== 'over-bolus' &&
        e.context !== 'post-exercise',
    )
    .map((e) => ({
      ratio: (e.peakGlucose! - e.initialGlucose) / e.carbsConsumed,
      carbs: e.carbsConsumed,
    }))
    .filter((x) => x.ratio >= 1 && x.ratio <= 12); // outlier filter

  if (usable.length === 0) {
    return {
      value: DEFAULT_GRG,
      sampleSize: 0,
      confidence: 'low',
      isDefault: true,
    };
  }

  // Moyenne pondérée par les carbs (donne plus de poids aux hypos avec
  // plus de glucides → moins de bruit relatif).
  const totalCarbs = usable.reduce((s, x) => s + x.carbs, 0);
  const weightedAvg = usable.reduce((s, x) => s + x.ratio * x.carbs, 0) / totalCarbs;

  return {
    value: Math.round(weightedAvg * 10) / 10,
    sampleSize: usable.length,
    confidence: usable.length >= 7 ? 'high' : usable.length >= 3 ? 'medium' : 'low',
    isDefault: false,
  };
}

// ───────────────────────────────────────────────────────────────────────
// Suggestion de carbs
// ───────────────────────────────────────────────────────────────────────

export interface CarbsSuggestion {
  /** Grammes recommandés. */
  grams: number;
  /** GRG utilisé pour le calcul. */
  grg: PersonalGRG;
  /** Explication courte FR. */
  detail: string;
}

/**
 * Recommande combien de glucides manger pour remonter à la cible
 * (par défaut 110 mg/dL).
 *
 * Garde-fous T1D :
 *  - Minimum 8g (même si très peu d'écart, pour anti-sous-sucrage)
 *  - Maximum 30g (au-delà = sur-sucrage probable, risque rebond hyper)
 *  - Arrondi au-dessus pour anti-sous-sucrage (préférable de remonter
 *    légèrement plus haut que de rester en hypo).
 */
export function suggestCarbsForHypo(
  currentGlucose: number,
  grg: PersonalGRG,
  targetGlucose: number = POST_HYPO_TARGET,
): CarbsSuggestion {
  const gap = Math.max(0, targetGlucose - currentGlucose);
  const theoretical = gap / grg.value;
  const grams = Math.min(
    MAX_CARBS,
    Math.max(MIN_CARBS, Math.ceil(theoretical)),
  );

  let detail: string;
  if (grg.isDefault) {
    detail = `Estimation standard (1g ≈ ${grg.value.toFixed(1).replace('.', ',')} mg/dL). On apprendra ton GRG perso avec tes prochaines hypos.`;
  } else if (grg.confidence === 'high') {
    detail = `D'après tes ${grg.sampleSize} dernières hypos, 1g te remonte de +${grg.value.toFixed(1).replace('.', ',')} mg/dL. Confiance élevée.`;
  } else if (grg.confidence === 'medium') {
    detail = `D'après tes ${grg.sampleSize} dernières hypos, 1g te remonte de ~+${grg.value.toFixed(1).replace('.', ',')} mg/dL. Précision moyenne.`;
  } else {
    detail = `Première estimation depuis ${grg.sampleSize} hypos (+${grg.value.toFixed(1).replace('.', ',')} mg/dL/g). À affiner.`;
  }

  return { grams, grg, detail };
}

// ───────────────────────────────────────────────────────────────────────
// Analyse a posteriori
// ───────────────────────────────────────────────────────────────────────

/**
 * Analyse une hypo après les checkpoints pour classifier le re-sucrage.
 *
 * Règles :
 *  - peakGlucose > 180 → 'too-much' (over-correction, rebond hyper)
 *  - glucoseAt30min < 80 → 'too-little' (encore en hypo, fallait plus)
 *  - peakGlucose entre 100-180 ET glucoseAt30min >= 90 → 'just-right'
 *  - Pas assez de data → 'unknown'
 */
export function analyzeHypoEvent(event: HypoEvent): HypoEvent['assessment'] {
  // Pas assez de temps écoulé
  if (event.glucoseAt30min === null) return 'pending';

  // Trop : pic au-dessus de 180
  if (event.peakGlucose !== null && event.peakGlucose > 180) return 'too-much';

  // Pas assez : encore en hypo à T+30
  if (event.glucoseAt30min < 80) return 'too-little';

  // Juste : revenu en cible normale
  if (
    event.glucoseAt30min >= 90 &&
    (event.peakGlucose === null || event.peakGlucose <= 180)
  ) {
    return 'just-right';
  }

  // Border-line (80-90 à T+30) — on attend T+45 pour décider
  if (event.glucoseAt45min !== null) {
    if (event.glucoseAt45min < 80) return 'too-little';
    if (event.glucoseAt45min >= 90) return 'just-right';
  }

  // Default
  return 'pending';
}

/**
 * Cherche le pic glycémique sur les checkpoints disponibles.
 */
export function findPeak(event: HypoEvent): number | null {
  const values = [
    event.glucoseAt15min,
    event.glucoseAt30min,
    event.glucoseAt45min,
    event.glucoseAt60min,
  ].filter((v): v is number => v !== null && v !== undefined);
  if (values.length === 0) return null;
  return Math.max(...values);
}

// ───────────────────────────────────────────────────────────────────────
// Feedback messages pour l'UI
// ───────────────────────────────────────────────────────────────────────

export interface HypoFeedback {
  tone: 'success' | 'warning' | 'error' | 'info';
  emoji: string;
  headline: string;
  detail: string;
  /** Si pertinent, ce qu'il aurait fallu faire la prochaine fois. */
  nextTime?: string;
}

export function buildHypoFeedback(event: HypoEvent): HypoFeedback {
  const peak = event.peakGlucose ?? findPeak(event);

  switch (event.assessment) {
    case 'just-right':
      return {
        tone: 'success',
        emoji: '✅',
        headline: 'Re-sucrage parfait',
        detail: `${event.carbsConsumed}g de glucides ont remonté ta glycémie de ${event.initialGlucose} à ${peak ?? '?'} mg/dL. C'était optimal.`,
      };
    case 'too-much':
      return {
        tone: 'warning',
        emoji: '⚠️',
        headline: `Trop sucré — tu as fait un rebond à ${peak ?? '?'}`,
        detail: `${event.carbsConsumed}g c'était trop pour remonter de ${event.initialGlucose} mg/dL. Tu as fait un pic à ${peak ?? '?'}.`,
        nextTime: peak
          ? `Prochaine fois pour une hypo à ${event.initialGlucose} : essaie ~${Math.max(
              8,
              Math.ceil((110 - event.initialGlucose) / ((peak - event.initialGlucose) / event.carbsConsumed)),
            )}g.`
          : `Prochaine fois : prends moins (10-15g pour une hypo modérée).`,
      };
    case 'too-little':
      return {
        tone: 'error',
        emoji: '🔻',
        headline: 'Pas assez — encore en hypo à T+30',
        detail: `${event.carbsConsumed}g ne suffisaient pas. Glycémie encore à ${event.glucoseAt30min} après 30 min.`,
        nextTime: `Prochaine fois : ${event.carbsConsumed + 10}g pour une hypo similaire.`,
      };
    case 'pending':
      return {
        tone: 'info',
        emoji: '⏳',
        headline: 'Évaluation en cours',
        detail: `Re-sucrage de ${event.carbsConsumed}g il y a moins de 30 min. Le feedback arrive bientôt.`,
      };
    default:
      return {
        tone: 'info',
        emoji: '❔',
        headline: 'Analyse impossible',
        detail: `Pas assez de données capteur pour évaluer ce re-sucrage.`,
      };
  }
}
