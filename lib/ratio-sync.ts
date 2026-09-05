/**
 * Synchronisation des deux représentations du ratio insuline/glucides.
 *
 * Le même nombre vit à deux endroits dans `DiabetesConfig` :
 *   - `ratios` : objet plat { morning, lunch, snack, dinner } (format legacy)
 *   - `insulinRatios` : tableau d'`InsulinRatio` (format actuel, avec libellé
 *     et créneau horaire)
 *
 * **Tous les lecteurs préfèrent le tableau** — `getRatioForMeal`
 * (`lib/insulin-calculator.ts`) comme l'affichage de `/diabete/parametres`
 * ne retombent sur l'objet plat que si le tableau n'a pas d'entrée pour ce
 * créneau. Écrire dans l'objet plat sans mettre le tableau à jour produit
 * donc une écriture **totalement invisible** : ni la dose ni l'affichage ne
 * bougent.
 *
 * C'est le bug de septembre 2026 sur la validation des doses par créneau :
 * `handleApplyRatio` (`app/diabete/historique/page.tsx`) ne passait que
 * `ratios` à `updateRatioProfile`, qui recopiait `insulinRatios` inchangé.
 * Le bouton « Valider » affichait sa confirmation, écrivait dans le store, et
 * ne changeait aucune dose. Sur une fonctionnalité de sécurité destinée à
 * corriger un sur-dosage responsable de 4 hypoglycémies sur 5 déjeuners,
 * l'échec silencieux est le pire mode de défaillance possible.
 *
 * Ce module tient l'invariant en un seul endroit, pour que le prochain
 * appelant n'ait pas à y penser.
 */

import type { InsulinRatio } from "@/types";

export type SlotKey = "morning" | "lunch" | "snack" | "dinner";

export const RATIO_SLOTS: SlotKey[] = ["morning", "lunch", "snack", "dinner"];

/** Métadonnées de repli, alignées sur MEAL_SLOTS de `/diabete/parametres`. */
const SLOT_DEFAULTS: Record<SlotKey, { label: string; timeStart: string; timeEnd: string }> = {
  morning: { label: "Petit-déjeuner", timeStart: "07:00", timeEnd: "10:00" },
  lunch: { label: "Déjeuner", timeStart: "12:00", timeEnd: "14:00" },
  snack: { label: "Goûter", timeStart: "15:00", timeEnd: "17:00" },
  dinner: { label: "Dîner", timeStart: "19:00", timeEnd: "21:00" },
};

export type SlotRatios = Partial<Record<SlotKey, number>>;

/**
 * Reporte les valeurs de `ratios` dans `existing`, en préservant l'identité et
 * les métadonnées (id, libellé, créneau horaire) des entrées déjà présentes.
 *
 * - Un créneau absent de `ratios` garde sa valeur actuelle.
 * - Une valeur non finie ou <= 0 est ignorée : un ratio nul ferait diverger
 *   le calcul de dose (division par zéro), on préfère conserver l'ancien.
 * - Les entrées de `existing` dont le `mealKey` n'est pas un des quatre
 *   créneaux (ratios personnalisés) sont conservées telles quelles.
 */
export function syncInsulinRatios(
  existing: InsulinRatio[] | undefined,
  ratios: SlotRatios | undefined,
): InsulinRatio[] {
  const current = existing ?? [];
  if (!ratios) return current.map((r) => ({ ...r }));

  const bySlot = new Map<string, InsulinRatio>();
  for (const r of current) bySlot.set(r.mealKey, r);

  const out: InsulinRatio[] = [];
  for (const slot of RATIO_SLOTS) {
    const previous = bySlot.get(slot);
    const proposed = ratios[slot];
    const usable = typeof proposed === "number" && Number.isFinite(proposed) && proposed > 0;
    const ratio = usable ? (proposed as number) : previous?.ratio;
    // Créneau sans valeur ni antécédent : on ne fabrique pas un ratio.
    if (ratio === undefined) continue;
    const meta = SLOT_DEFAULTS[slot];
    out.push({
      id: previous?.id ?? `r-${slot}`,
      label: previous?.label ?? meta.label,
      mealKey: slot,
      timeStart: previous?.timeStart ?? meta.timeStart,
      timeEnd: previous?.timeEnd ?? meta.timeEnd,
      ratio,
    });
  }

  // Ratios personnalisés hors des quatre créneaux : préservés à l'identique.
  for (const r of current) {
    if (!RATIO_SLOTS.includes(r.mealKey as SlotKey)) out.push({ ...r });
  }

  return out;
}
