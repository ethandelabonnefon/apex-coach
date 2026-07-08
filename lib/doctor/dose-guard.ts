/**
 * Docteur — garde-fou dur anti-hallucination de doses.
 *
 * Avant de renvoyer une réponse Claude, on vérifie que chaque dose numérique
 * d'insuline mentionnée ("4U", "1,5 U", "2 unités") est ancrée dans le
 * contexte fourni (rapport stats, historique de conversation, message user).
 *
 * Une dose est "ancrée" si elle est à distance d'incrément autorisé d'un
 * nombre présent dans le contexte : les règles T1D plafonnent tout ajustement
 * à ±1U (basal) / ±0,5U (ISF) / ±10% (ratio). Donc |v − a| ≤ 1U ou ≤ 10% de a.
 * Une dose hors de toute ancre est remplacée par "[dose retirée]" et la
 * réponse est annotée d'un warning.
 */

/** "4U", "4 U", "1,5U", "2 unités", "0.5 unité" — capture le nombre. */
const DOSE_RE = /(\d+(?:[.,]\d+)?)\s?(?:U\b|unités?\b)/gi;

const NUMBER_RE = /\d+(?:[.,]\d+)?/g;

export const REMOVED_DOSE_PLACEHOLDER = "[dose retirée]";

export const DOSE_WARNING =
  "Une ou plusieurs doses chiffrées non vérifiables (absentes du contexte) ont été retirées de cette réponse — ne suis jamais un chiffre d'insuline que tu ne peux pas relier à tes propres données.";

function parseNum(raw: string): number {
  return parseFloat(raw.replace(",", "."));
}

/**
 * Collecte toutes les valeurs numériques présentes dans le contexte
 * (payload JSON + textes libres : historique, message user).
 */
export function collectAllowedNumbers(
  context: unknown,
  extraTexts: string[] = [],
): Set<number> {
  const allowed = new Set<number>();

  const walk = (node: unknown) => {
    if (typeof node === "number" && Number.isFinite(node)) {
      allowed.add(node);
      return;
    }
    if (typeof node === "string") {
      for (const m of node.match(NUMBER_RE) ?? []) allowed.add(parseNum(m));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const v of Object.values(node)) walk(v);
    }
  };

  walk(context);
  for (const text of extraTexts) walk(text);
  return allowed;
}

/**
 * Une dose est autorisée si elle est proche d'une ancre du contexte :
 * distance ≤ 1U (incrément basal max) ou ≤ 10% (incrément ratio max).
 */
export function isDoseAnchored(value: number, allowed: Set<number>): boolean {
  const EPS = 1e-9;
  for (const a of allowed) {
    if (Math.abs(value - a) <= 1 + EPS) return true;
    if (a > 0 && Math.abs(value - a) / a <= 0.1 + EPS) return true;
  }
  return false;
}

export interface SanitizeResult {
  text: string;
  removed: string[]; // mentions retirées (pour warning/log)
}

/** Retire les doses non ancrées d'un texte. */
export function sanitizeDoses(
  text: string,
  allowed: Set<number>,
): SanitizeResult {
  const removed: string[] = [];
  const sanitized = text.replace(DOSE_RE, (match, num: string) => {
    const value = parseNum(num);
    if (isDoseAnchored(value, allowed)) return match;
    removed.push(match);
    return REMOVED_DOSE_PLACEHOLDER;
  });
  return { text: sanitized, removed };
}
