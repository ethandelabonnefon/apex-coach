/**
 * Couverture des lipides — 2ᵉ injection (sept. 2026).
 *
 * Remplace le calcul par FPU, qui mettait les calories des lipides ET des
 * protéines dans le même sac. Deux défauts mesurés sur les données d'Ethan :
 *
 *  1. Il se déclenchait sur les protéines. Sur son midi de sèche (60 g
 *     glucides, 15 g lipides, 60 g protéines), l'app réclamait 2 U deux
 *     heures plus tard alors qu'il n'en a aucun besoin — les 60 g de
 *     protéines pesaient 240 des 375 kcal du calcul. Sur 47 repas
 *     exploitables de son archive, les protéines ne montrent AUCUNE
 *     relation dose-effet sur la montée tardive : +29 mg/dL entre 0 et
 *     40 g, +83 entre 40 et 60, +30 au-delà de 60. Non monotone : du bruit.
 *
 *  2. Le montant était très surestimé. Sur son dîner du 9 septembre (109 g
 *     glucides, 63,7 g lipides) l'app réclamait 5 U ; il en a fait 3 et
 *     s'est réveillé à 146 pour une cible de 110, soit un besoin réel de
 *     ~3,5 U.
 *
 * Les lipides, eux, ont un effet réel et tardif : mesuré au point T+5 h,
 * 0 mg/dL entre 10 et 20 g, +12 entre 20 et 30, +59 entre 30 et 45, +89
 * au-delà — et le pic arrive souvent à T+7 h voire T+9 h.
 *
 * ⚠️ Les paliers intermédiaires (10 % et 18 %) sont INTERPOLÉS entre les
 * deux ancrages mesurés, pas observés : Ethan n'a aucun repas propre entre
 * 45 et 60 g de lipides sur 90 jours. C'est pour cela qu'ils sont réglables.
 */

/** Barème par défaut : lipides du repas → part du bolus glucides. */
export interface FatCoverageTiers {
  /** 30–45 g de lipides. Ancré sur l'archive (montée de 0,4 à 0,8 U). */
  moderate: number;
  /** 45–60 g. Interpolé. */
  high: number;
  /** ≥ 60 g. Ancré sur la nuit du 9 septembre (3,5 U sur 14,2 U). */
  veryHigh: number;
}

export const DEFAULT_FAT_COVERAGE_TIERS: FatCoverageTiers = {
  moderate: 0.10,
  high: 0.18,
  veryHigh: 0.25,
};

/** Sous ce seuil, aucune 2ᵉ injection. Seuil « high-fat » de la littérature. */
export const FAT_COVERAGE_MIN_G = 30;
export const FAT_TIER_HIGH_G = 45;
export const FAT_TIER_VERY_HIGH_G = 60;

/** Plafond absolu conservé de l'ancien modèle (sécurité MDI). */
export const FAT_COVERAGE_ABSOLUTE_CAP_U = 8;

/** En deçà, on ne propose pas d'injection : une demi-unité ne vaut pas un rappel. */
const MIN_MEANINGFUL_UNITS = 0.5;

/** Bornes de saisie d'un palier. Au-delà de 40 %, une faute de frappe
 *  produirait une hypoglycémie sévère. */
export const FAT_COVERAGE_MIN_PCT = 0;
export const FAT_COVERAGE_MAX_PCT = 0.4;

export interface FatCoverage {
  /** Unités de la 2ᵉ injection. 0 = pas de 2ᵉ injection. */
  units: number;
  /** Délai (min) après le repas. */
  delayMinutes: number;
  /** Part du bolus glucides retenue (0 si sous le seuil de lipides). */
  pctApplied: number;
  /** Valeur avant arrondi — pour la transparence UI. */
  rawUnits: number;
  /** Le plafond absolu a-t-il mordu ? */
  capped: boolean;
}

/** Part du bolus glucides pour une quantité de lipides donnée. */
export function fatCoveragePct(fatGrams: number, tiers: FatCoverageTiers): number {
  if (!Number.isFinite(fatGrams) || fatGrams < FAT_COVERAGE_MIN_G) return 0;
  if (fatGrams < FAT_TIER_HIGH_G) return tiers.moderate;
  if (fatGrams < FAT_TIER_VERY_HIGH_G) return tiers.high;
  return tiers.veryHigh;
}

/**
 * Délai de la 2ᵉ injection. La courbe du 9 septembre montre que la montée
 * commence 2 h 30 après un repas à 64 g de lipides — le décalage est réel,
 * seul le montant était faux. Piloté par les lipides, comme le reste.
 */
export function fatCoverageDelayMinutes(fatGrams: number): number {
  return fatGrams >= FAT_TIER_VERY_HIGH_G ? 150 : 120;
}

/**
 * Calcule la 2ᵉ injection à partir des lipides du repas et du bolus glucides.
 *
 * Les protéines ne sont volontairement PAS un paramètre : elles ne doivent
 * plus pouvoir influencer la dose. Le jour où quelqu'un voudra les
 * réintroduire, il devra changer cette signature — et donc y réfléchir.
 */
export function computeFatCoverage(input: {
  fatGrams: number;
  /** Bolus glucides du repas (U), avant correction et tendance. */
  carbBolusUnits: number;
  tiers?: FatCoverageTiers;
}): FatCoverage {
  const tiers = input.tiers ?? DEFAULT_FAT_COVERAGE_TIERS;
  const pct = fatCoveragePct(input.fatGrams, tiers);
  const carbBolus = Number.isFinite(input.carbBolusUnits)
    ? Math.max(0, input.carbBolusUnits)
    : 0;

  const rawUnits = carbBolus * pct;
  if (pct === 0 || rawUnits < MIN_MEANINGFUL_UNITS) {
    return { units: 0, delayMinutes: 0, pctApplied: pct, rawUnits, capped: false };
  }

  // Arrondi au PLUS PROCHE, jamais au-dessus : sur une pizza à 30 g de
  // lipides, 1,04 U doit donner 1 U et non 2. L'ancien modèle utilisait
  // Math.ceil, ce qui gonflait systématiquement les petites doses.
  const rounded = Math.round(rawUnits);
  const units = Math.min(rounded, FAT_COVERAGE_ABSOLUTE_CAP_U);

  return {
    units,
    delayMinutes: fatCoverageDelayMinutes(input.fatGrams),
    pctApplied: pct,
    rawUnits,
    capped: rounded > FAT_COVERAGE_ABSOLUTE_CAP_U,
  };
}

/** Valide un palier saisi par l'utilisateur. `null` si hors bornes. */
export function normalizeCoveragePct(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  if (raw < FAT_COVERAGE_MIN_PCT || raw > FAT_COVERAGE_MAX_PCT) return null;
  return Math.round(raw * 1000) / 1000;
}
