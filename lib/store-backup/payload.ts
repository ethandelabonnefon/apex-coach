/**
 * Sauvegarde serveur du store — fonctions pures (sept. 2026).
 *
 * Contexte : le 19/09/2026, la mémoire locale de la PWA d'Ethan (zustand
 * persist → localStorage) s'est retrouvée aux valeurs par défaut après une
 * mise à jour — ratios, injections, glucides, hypos perdus. Rien côté
 * serveur ne les conservait. Ce module décrit ce qu'on sauvegarde en KV
 * et comment on reconnaît un stockage vidé.
 *
 * Trois règles :
 *  1. On n'envoie que des DONNÉES, jamais de fonctions ni de dérivés
 *     recalculables. Les champs volumineux (points GPS des sorties, photos
 *     base64 du diagnostic) sont retirés : ils feraient dépasser la taille
 *     d'une valeur KV et ne sont pas ce qu'il faut protéger en priorité.
 *  2. Un état « vide » se reconnaît à l'absence conjointe d'injections, de
 *     glucides et d'hypos — pas aux ratios (des ratios par défaut peuvent
 *     être voulus).
 *  3. Le verrou : on refuse d'écrire dans localStorage un état SANS
 *     injections par-dessus un état qui en contenait plusieurs. Supprimer
 *     sa dernière injection reste possible (1 → 0) ; passer de 5 à 0 d'un
 *     coup ne peut être qu'un accident (hydratation ratée, bug).
 *
 * ⚠️ Pure module. Aucun import serveur, aucun import React.
 */

/** Clé localStorage du store zustand (cf. lib/store.ts). Ne pas renommer. */
export const STORE_KEY = "apex-coach-storage";

/** Version du format de sauvegarde serveur. */
export const BACKUP_FORMAT_VERSION = 1;

/** Clés du store qui portent des données à protéger (le reste est recalculé ou de config). */
export const BACKED_UP_KEYS = [
  "profile",
  "diabetesConfig",
  "insulinLogs",
  "carbEntries",
  "hypoEvents",
  "glucoseReadings",
  "meals",
  "splitDoseReminders",
  "nightPredictionLogs",
  "manualDigestion",
  "completedWorkouts",
  "completedRunningSessions",
  "currentRunningWeek",
  "declaredSportSessions",
  "diagnosticCompleted",
  "diagnosticData",
  "diagnosticHistory",
  "runningDiagnosticCompleted",
  "runningDiagnosticData",
  "generatedRunningPlan",
  "nutritionDiagnosticCompleted",
  "nutritionDiagnosticData",
  "nutritionTargets",
] as const;

export interface BackupSummary {
  insulinLogs: number;
  carbEntries: number;
  hypoEvents: number;
  meals: number;
  runningSessions: number;
  workouts: number;
}

export interface BackupPayload {
  formatVersion: number;
  /** Version du store zustand (persist.version) au moment de l'envoi. */
  storeVersion: number;
  savedAt: string;
  summary: BackupSummary;
  state: Record<string, unknown>;
}

type AnyState = Record<string, unknown>;

function arr(state: AnyState, key: string): unknown[] {
  const v = state[key];
  return Array.isArray(v) ? v : [];
}

export function summarizeState(state: AnyState): BackupSummary {
  return {
    insulinLogs: arr(state, "insulinLogs").length,
    carbEntries: arr(state, "carbEntries").length,
    hypoEvents: arr(state, "hypoEvents").length,
    meals: arr(state, "meals").length,
    runningSessions: arr(state, "completedRunningSessions").length,
    workouts: arr(state, "completedWorkouts").length,
  };
}

/** Un stockage sans injection, sans glucide ni hypo = fraîchement (ré)initialisé. */
export function isStoreEmpty(state: AnyState): boolean {
  const s = summarizeState(state);
  return s.insulinLogs === 0 && s.carbEntries === 0 && s.hypoEvents === 0;
}

/** Retire les champs volumineux d'une sortie running (points GPS bruts). */
function stripRunningSession(session: unknown): unknown {
  if (!session || typeof session !== "object") return session;
  const rest = { ...(session as Record<string, unknown>) };
  delete rest.gpsPoints;
  return rest;
}

/** Retire les photos base64 d'une entrée de diagnostic. */
function stripPhotos(entry: unknown): unknown {
  if (!entry || typeof entry !== "object") return entry;
  return { ...(entry as Record<string, unknown>), photos: [] };
}

/**
 * Construit le payload envoyé au serveur : sous-ensemble des clés
 * protégées, allégé des champs lourds. Ne mute jamais l'état d'entrée.
 */
export function buildBackupPayload(
  state: AnyState,
  storeVersion: number,
  now: Date = new Date(),
): BackupPayload {
  const picked: AnyState = {};
  for (const key of BACKED_UP_KEYS) {
    if (state[key] === undefined) continue;
    if (typeof state[key] === "function") continue;
    picked[key] = state[key];
  }
  if (Array.isArray(picked.completedRunningSessions)) {
    picked.completedRunningSessions = picked.completedRunningSessions.map(stripRunningSession);
  }
  if (Array.isArray(picked.diagnosticHistory)) {
    picked.diagnosticHistory = picked.diagnosticHistory.map(stripPhotos);
  }
  if (picked.diagnosticData && typeof picked.diagnosticData === "object") {
    picked.diagnosticData = stripPhotos(picked.diagnosticData);
  }
  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    storeVersion,
    savedAt: now.toISOString(),
    summary: summarizeState(picked),
    state: picked,
  };
}

/**
 * Empreinte bon marché du payload pour ne synchroniser que quand quelque
 * chose a changé. Pas cryptographique : sert de comparaison locale.
 */
export function backupFingerprint(payload: BackupPayload): string {
  const s = JSON.stringify(payload.state);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `${s.length}:${h}`;
}

/** Seuil à partir duquel une perte d'injections est traitée comme un accident. */
export const WIPE_GUARD_MIN_LOGS = 2;

/**
 * Verrou d'écriture : `true` si écrire `nextRaw` dans localStorage
 * effacerait au moins `WIPE_GUARD_MIN_LOGS` injections présentes dans
 * `prevRaw`. Travaille sur les chaînes brutes du persist (`{state, version}`)
 * et ne parse `prevRaw` que dans le cas rare où `nextRaw` n'a aucune
 * injection — l'écriture courante reste bon marché.
 */
export function wouldWipeInsulinLogs(prevRaw: string | null, nextRaw: string): boolean {
  if (!prevRaw) return false;
  if (!/"insulinLogs":\s*\[\s*\]/.test(nextRaw)) return false;
  try {
    const prev = JSON.parse(prevRaw) as { state?: AnyState };
    const count = arr(prev.state ?? {}, "insulinLogs").length;
    return count >= WIPE_GUARD_MIN_LOGS;
  } catch {
    return false;
  }
}

/**
 * Fusion pour la restauration : la sauvegarde serveur prime sur l'état
 * courant pour les clés protégées, le reste de l'état courant (fonctions,
 * clés non sauvegardées) est conservé.
 */
export function mergeRestoredState(current: AnyState, backupState: AnyState): AnyState {
  const next: AnyState = { ...current };
  for (const key of BACKED_UP_KEYS) {
    if (backupState[key] !== undefined) next[key] = backupState[key];
  }
  return next;
}
