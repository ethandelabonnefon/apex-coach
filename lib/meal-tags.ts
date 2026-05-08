/**
 * Quick-tags repas + tailles — Phase 11 Bloc 2.
 *
 * Sélection optionnelle au moment du bolus : 1 tap pour pré-remplir
 * lipides/protéines moyens (override possible) et tagger l'injection.
 * Couvre les ~90% de repas d'Ethan ; "autre" en fallback.
 *
 * NB : on n'utilise PAS d'emojis dans l'UI finale (CLAUDE.md, Phase 2
 * design system — icônes lucide-react uniquement). Le champ `iconName`
 * référence un nom d'icône lucide ; le composant fait le mapping.
 */

import type { LucideIcon } from "lucide-react";

export type MealTagId =
  | "pates"
  | "riz"
  | "pizza"
  | "sandwich"
  | "salade"
  | "snack-sucre"
  | "plat-viande"
  | "petit-dej"
  | "autre";

export type DigestiveComplexity = "simple" | "moderate" | "complex";

export interface MealTag {
  id: MealTagId;
  label: string;
  iconName: string;       // nom lucide-react
  avgFat: number;         // g (taille "normal")
  avgProtein: number;     // g (taille "normal")
  complexity: DigestiveComplexity;
}

export const MEAL_TAGS: ReadonlyArray<MealTag> = [
  { id: "pates",       label: "Pâtes",            iconName: "Wheat",            avgFat: 15, avgProtein: 25, complexity: "complex" },
  { id: "riz",         label: "Riz",              iconName: "Soup",             avgFat: 10, avgProtein: 20, complexity: "moderate" },
  { id: "pizza",       label: "Pizza",            iconName: "Pizza",            avgFat: 25, avgProtein: 20, complexity: "complex" },
  { id: "sandwich",    label: "Sandwich",         iconName: "Sandwich",         avgFat: 12, avgProtein: 15, complexity: "moderate" },
  { id: "salade",      label: "Salade",           iconName: "Salad",            avgFat: 8,  avgProtein: 12, complexity: "simple" },
  { id: "snack-sucre", label: "Snack sucré",      iconName: "Cookie",           avgFat: 10, avgProtein: 3,  complexity: "simple" },
  { id: "plat-viande", label: "Viande + accomp.", iconName: "Beef",             avgFat: 20, avgProtein: 35, complexity: "complex" },
  { id: "petit-dej",   label: "Petit-déj",        iconName: "Croissant",        avgFat: 10, avgProtein: 15, complexity: "moderate" },
  { id: "autre",       label: "Autre",            iconName: "UtensilsCrossed",  avgFat: 0,  avgProtein: 0,  complexity: "simple" },
] as const;

export type MealSizeId = "normal" | "big" | "huge";

export interface MealSize {
  id: MealSizeId;
  label: string;
  multiplier: number;
}

export const MEAL_SIZES: ReadonlyArray<MealSize> = [
  { id: "normal", label: "Normal", multiplier: 1.0 },
  { id: "big",    label: "Gros",   multiplier: 1.3 },
  { id: "huge",   label: "Énorme", multiplier: 1.6 },
] as const;

export function getMealTag(id: string | undefined): MealTag | undefined {
  if (!id) return undefined;
  return MEAL_TAGS.find((t) => t.id === id);
}

export function getMealSize(id: string | undefined): MealSize {
  return MEAL_SIZES.find((s) => s.id === id) ?? MEAL_SIZES[0];
}

/** Macros (lipides/protéines) inférés depuis tag + taille. Override-able par l'user. */
export function inferMacrosFromTag(tagId: MealTagId, sizeId: MealSizeId = "normal"): {
  fatGrams: number;
  proteinGrams: number;
} {
  const tag = getMealTag(tagId);
  const size = getMealSize(sizeId);
  if (!tag) return { fatGrams: 0, proteinGrams: 0 };
  return {
    fatGrams: Math.round(tag.avgFat * size.multiplier),
    proteinGrams: Math.round(tag.avgProtein * size.multiplier),
  };
}

// Re-export pour les composants (typage strict du nom d'icône)
export type { LucideIcon };
