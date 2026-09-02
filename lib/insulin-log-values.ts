/**
 * Lecture des valeurs d'une injection — septembre 2026.
 *
 * Une injection porte DEUX jeux de macros : l'estimation d'avant repas
 * (`carbsGrams`…) et, si le patient a confirmé à T+20 min, la quantité
 * réellement mangée (`carbsConfirmedGrams`…). L'estimation n'est jamais
 * écrasée — l'écart entre les deux est la matière première d'un futur
 * « tu sous-estimes tes portions de pâtes d'environ 30 % ».
 *
 * Conséquence : TOUS les consommateurs doivent lire `confirmé ?? estimé`.
 * Ces helpers sont ce point unique.
 *
 * ─── Pourquoi un module à part ───────────────────────────────────────
 * Ces quatre prédicats étaient exportés par `lib/carbs-on-board.ts`, qui
 * importe `lib/prediction-inputs.ts` (`ratioForMeal`,
 * `EVENT_ACTIVE_WINDOW_MIN`). Faire lire `resolveCarbs` à
 * `prediction-inputs.ts` — le moteur unifié qui alimente le plan de la
 * nuit, et le dernier gros consommateur à ne pas l'utiliser — aurait donc
 * bouclé. Ils vivent ici, sans aucune dépendance, et `carbs-on-board.ts`
 * les ré-exporte pour ne casser aucun appelant existant.
 *
 * Les signatures sont structurelles (et non `InsulinLog`) pour rester
 * utilisables sur les projections partielles, comme le `Pick<InsulinLog,
 * …>` de `buildWeeklyReport`.
 */

export interface CarbFields {
  carbsGrams?: number;
  carbsConfirmedGrams?: number;
}

export interface FatFields {
  fatGrams?: number;
  fatConfirmedGrams?: number;
}

export interface ProteinFields {
  proteinGrams?: number;
  proteinConfirmedGrams?: number;
}

export interface LearnableFields {
  carbsUncertain?: boolean;
}

/** Glucides retenus pour une injection : le confirmé prime sur l'estimation. */
export function resolveCarbs(log: CarbFields): number {
  return log.carbsConfirmedGrams ?? log.carbsGrams ?? 0;
}

/** Lipides retenus : le confirmé prime sur l'estimation. */
export function resolveFat(log: FatFields): number {
  return log.fatConfirmedGrams ?? log.fatGrams ?? 0;
}

/** Protéines retenues : le confirmé prime sur l'estimation. */
export function resolveProtein(log: ProteinFields): number {
  return log.proteinConfirmedGrams ?? log.proteinGrams ?? 0;
}

/**
 * Une injection peut-elle nourrir l'apprentissage (stats par type de repas,
 * backtest nuit, règles de patterns, contexte du Docteur) ?
 *
 * Prédicat unique : un seul endroit à modifier si la règle évolue.
 */
export function isLearnable(log: LearnableFields): boolean {
  return log.carbsUncertain !== true;
}
