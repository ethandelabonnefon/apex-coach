/**
 * Docteur — suggestions actionnables ("Valider" en un clic).
 *
 * Une suggestion d'ajustement (ratio/ISF/basal) peut porter un `action`
 * structuré { currentValue, proposedValue, unit } que l'UI affiche avec un
 * bouton de validation. Rien n'est jamais appliqué automatiquement — le
 * clic utilisateur est la seule chose qui écrit dans le store.
 *
 * Garde-fou dur ICI (indépendant du prompt) : la valeur actuelle est
 * TOUJOURS ré-écrasée par le réglage réel envoyé par le client
 * (`currentSettings`, jamais celle que Claude a pu écrire), et l'écart
 * proposé est clampé aux incréments T1D non-négociables :
 *   - basal : ±1 U
 *   - ratio (X U pour 10g) : ±10%
 *   - ISF (mg/dL par U) : ±10 mg/dL
 * Une action sur une zone non vérifiable (pas de valeur actuelle connue)
 * est retirée — la suggestion reste affichée en texte seul.
 */

export type DoctorActionableArea =
  | "ratio-matin"
  | "ratio-midi"
  | "ratio-snack"
  | "ratio-soir"
  | "isf"
  | "basal";

export const ACTIONABLE_AREAS: DoctorActionableArea[] = [
  "ratio-matin",
  "ratio-midi",
  "ratio-snack",
  "ratio-soir",
  "isf",
  "basal",
];

export interface DoctorAction {
  currentValue: number;
  proposedValue: number;
  unit: string;
}

/** Réglages actuels réels (envoyés par le client, jamais par Claude). */
export type DoctorCurrentSettings = Partial<
  Record<DoctorActionableArea, number>
>;

export interface ActionableSuggestion {
  area: string;
  suggestion: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
  action?: DoctorAction;
}

function isActionableArea(area: string): area is DoctorActionableArea {
  return (ACTIONABLE_AREAS as string[]).includes(area);
}

function unitFor(area: DoctorActionableArea): string {
  if (area === "basal") return "U";
  if (area === "isf") return "mg/dL par U";
  return "U/10g";
}

/** Arrondi cohérent avec les pages de réglages existantes (0,5U basal, 0,1 ratio, 1 mg/dL ISF). */
function roundFor(area: DoctorActionableArea, value: number): number {
  if (area === "basal") return Math.round(value * 2) / 2;
  if (area === "isf") return Math.round(value);
  return Math.round(value * 10) / 10;
}

function clampToCap(
  area: DoctorActionableArea,
  current: number,
  proposed: number,
): number {
  let min: number;
  let max: number;
  if (area === "basal") {
    min = current - 1;
    max = current + 1;
  } else if (area === "isf") {
    min = current - 10;
    max = current + 10;
  } else {
    min = current * 0.9;
    max = current * 1.1;
  }
  const clamped = Math.min(max, Math.max(min, proposed));
  // Plancher physiologique : jamais 0 ou négatif.
  return Math.max(0.1, clamped);
}

export interface SanitizeActionsResult {
  suggestions: ActionableSuggestion[];
  warnings: string[];
}

/**
 * Valide/clampe les actions structurées des suggestions. Ne touche pas au
 * texte (`suggestion`/`rationale`) — c'est le rôle de dose-guard.ts.
 */
export function sanitizeActions(
  suggestions: ActionableSuggestion[],
  currentSettings: DoctorCurrentSettings | undefined,
): SanitizeActionsResult {
  const warnings: string[] = [];

  const out = suggestions.map((s): ActionableSuggestion => {
    if (!s.action) return s;

    if (!isActionableArea(s.area)) {
      const rest: ActionableSuggestion = { ...s };
      delete rest.action;
      return rest;
    }

    const current = currentSettings?.[s.area];
    if (current === undefined || !Number.isFinite(current)) {
      const rest: ActionableSuggestion = { ...s };
      delete rest.action;
      return rest;
    }

    const rawProposed = s.action.proposedValue;
    const clamped = clampToCap(s.area, current, rawProposed);
    if (Math.abs(clamped - rawProposed) > 1e-9) {
      warnings.push(
        `Proposition sur "${s.area}" ramenée à l'incrément de sécurité maximum autorisé.`,
      );
    }

    // L'arrondi (pas de 0,5U pour le basal, 1 mg/dL pour l'ISF) peut, sur
    // des valeurs extrêmes, retomber sous le plancher physiologique — on le
    // réapplique après coup pour le garantir dans tous les cas.
    return {
      ...s,
      action: {
        currentValue: roundFor(s.area, current),
        proposedValue: Math.max(0.1, roundFor(s.area, clamped)),
        unit: unitFor(s.area),
      },
    };
  });

  return { suggestions: out, warnings };
}
