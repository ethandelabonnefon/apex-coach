import type { DiagnosticEntry } from './store';

export interface DiagnosticChange {
  field: string;
  label: string;
  section: string;
  before: number;
  after: number;
  delta: number;
  percentChange: number;
  impact: 'high' | 'medium' | 'low';
  direction: 'up' | 'down' | 'stable';
}

export interface DiagnosticDiff {
  hasSignificantChanges: boolean;
  changes: DiagnosticChange[];
  mobilityChanges: { field: string; label: string; before: string; after: string }[];
  weakPointsAdded: string[];
  weakPointsRemoved: string[];
  newPhotos: boolean;
}

const MEASUREMENT_FIELDS: { key: string; label: string; section: string; impactWeight: number }[] = [
  { key: 'chest', label: 'Tour de poitrine', section: 'mensurations', impactWeight: 2 },
  { key: 'shoulders', label: "Tour d'épaules", section: 'mensurations', impactWeight: 3 },
  { key: 'waist', label: 'Tour de taille', section: 'mensurations', impactWeight: 3 },
  { key: 'hips', label: 'Tour de hanches', section: 'mensurations', impactWeight: 1 },
  { key: 'armRelaxed', label: 'Bras relâché', section: 'mensurations', impactWeight: 2 },
  { key: 'armFlexed', label: 'Bras contracté', section: 'mensurations', impactWeight: 2 },
  { key: 'thigh', label: 'Tour de cuisse', section: 'mensurations', impactWeight: 2 },
  { key: 'calf', label: 'Tour de mollet', section: 'mensurations', impactWeight: 1 },
  { key: 'armSpan', label: 'Envergure', section: 'longueurs', impactWeight: 1 },
  { key: 'torsoLength', label: 'Longueur du tronc', section: 'longueurs', impactWeight: 1 },
  { key: 'benchPress1RM', label: 'DC 1RM', section: 'historique', impactWeight: 3 },
  { key: 'squat1RM', label: 'Squat 1RM', section: 'historique', impactWeight: 3 },
  { key: 'deadlift1RM', label: 'Deadlift 1RM', section: 'historique', impactWeight: 3 },
  { key: 'ohp1RM', label: 'OHP 1RM', section: 'historique', impactWeight: 2 },
  { key: 'pullups', label: 'Tractions max', section: 'historique', impactWeight: 2 },
];

const MOBILITY_FIELDS: { key: string; label: string }[] = [
  { key: 'shoulderMobility', label: 'Mobilité épaules' },
  { key: 'hipMobility', label: 'Mobilité hanches' },
  { key: 'ankleMobility', label: 'Mobilité chevilles' },
];

const SIGNIFICANT_THRESHOLD = 0.02; // 2%

function getNumericValue(entry: DiagnosticEntry, section: string, key: string): number {
  const sectionData = entry[section as keyof DiagnosticEntry] as Record<string, string> | undefined;
  if (!sectionData || typeof sectionData !== 'object') return 0;
  return parseFloat(sectionData[key]) || 0;
}

function determineImpact(percentChange: number, impactWeight: number): 'high' | 'medium' | 'low' {
  const score = Math.abs(percentChange) * impactWeight;
  if (score > 0.15) return 'high';
  if (score > 0.06) return 'medium';
  return 'low';
}

export function compareDiagnostics(oldEntry: DiagnosticEntry, newEntry: DiagnosticEntry): DiagnosticDiff {
  const changes: DiagnosticChange[] = [];

  for (const field of MEASUREMENT_FIELDS) {
    const before = getNumericValue(oldEntry, field.section, field.key);
    const after = getNumericValue(newEntry, field.section, field.key);

    if (before === 0 && after === 0) continue;
    if (before === 0 && after > 0) {
      // New measurement, not a "change"
      changes.push({
        field: field.key,
        label: field.label,
        section: field.section,
        before: 0,
        after,
        delta: after,
        percentChange: 1,
        impact: 'medium',
        direction: 'up',
      });
      continue;
    }

    const delta = after - before;
    const percentChange = before > 0 ? delta / before : 0;

    if (Math.abs(percentChange) > SIGNIFICANT_THRESHOLD) {
      changes.push({
        field: field.key,
        label: field.label,
        section: field.section,
        before,
        after,
        delta,
        percentChange,
        impact: determineImpact(percentChange, field.impactWeight),
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable',
      });
    }
  }

  // Mobility changes
  const mobilityChanges: DiagnosticDiff['mobilityChanges'] = [];
  for (const field of MOBILITY_FIELDS) {
    const before = (oldEntry.mobilite as Record<string, string>)?.[field.key] || '';
    const after = (newEntry.mobilite as Record<string, string>)?.[field.key] || '';
    if (before !== after && before && after) {
      mobilityChanges.push({ field: field.key, label: field.label, before, after });
    }
  }

  // Weak points diff
  const oldWP = new Set(oldEntry.weakPoints || []);
  const newWP = new Set(newEntry.weakPoints || []);
  const weakPointsAdded = [...newWP].filter((wp) => !oldWP.has(wp));
  const weakPointsRemoved = [...oldWP].filter((wp) => !newWP.has(wp));

  // Photos
  const newPhotos = (newEntry.photos?.length || 0) > 0 && (oldEntry.photos?.length || 0) === 0;

  return {
    hasSignificantChanges: changes.length > 0 || mobilityChanges.length > 0 || weakPointsAdded.length > 0 || weakPointsRemoved.length > 0,
    changes,
    mobilityChanges,
    weakPointsAdded,
    weakPointsRemoved,
    newPhotos,
  };
}

export function formatDelta(delta: number, unit: string = 'cm'): string {
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta.toFixed(1)} ${unit}`;
}

export function formatPercentChange(pct: number): string {
  const sign = pct > 0 ? '+' : '';
  return `${sign}${(pct * 100).toFixed(1)}%`;
}
