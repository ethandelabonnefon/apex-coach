/**
 * Saisie rétroactive d'une injection oubliée (sept. 2026, demande d'Ethan).
 *
 * Toutes les injections de l'app sont écrites avec `injectedAt: new Date()`.
 * Quand Ethan fait une unité de correction sans passer par l'app, cette
 * injection n'existe nulle part : l'insuline active est sous-estimée, donc la
 * prédiction, le plafonnement de la dose suivante et le plan de la nuit
 * travaillent tous sur une image fausse — dans le sens qui ajoute de
 * l'insuline en trop.
 *
 * Ce module ne fait qu'une chose : transformer un choix de jour et une heure
 * en horodatage valide, ou dire pourquoi il ne l'est pas. Aucun accès au
 * store, aucun React — la validation est la partie qui mérite des tests.
 */

export type ForgottenDay = "today" | "yesterday";

export type BuildResult =
  | { ok: true; at: Date }
  | { ok: false; error: string };

/** `HH:MM` en 24 h, minutes obligatoires. */
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/**
 * Construit l'horodatage d'une injection oubliée.
 *
 * @param day   « aujourd'hui » ou « hier » — volontairement un choix fermé
 *              plutôt qu'un sélecteur de date libre : c'est le cas réel, et
 *              ça rend impossible la saisie d'une date absurde. C'est CE
 *              choix fermé, et lui seul, qui borne l'ancienneté à moins de
 *              48 h : le jour est toujours calculé relativement à `nowMs`.
 *              Un sélecteur de date libre lèverait cette borne — il faudrait
 *              alors ajouter une limite explicite.
 * @param time  heure au format `HH:MM`.
 * @param nowMs instant de référence.
 */
export function buildForgottenInjectionDate(
  day: ForgottenDay,
  time: string,
  nowMs: number,
): BuildResult {
  const match = TIME_PATTERN.exec(time.trim());
  if (!match) {
    return { ok: false, error: "Heure invalide — attendu HH:MM." };
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  const at = new Date(nowMs);
  if (day === "yesterday") at.setDate(at.getDate() - 1);
  at.setHours(hours, minutes, 0, 0);

  if (at.getTime() > nowMs) {
    return {
      ok: false,
      error:
        day === "today"
          ? "Cette heure n'est pas encore passée."
          : "Cette heure est dans le futur.",
    };
  }

  return { ok: true, at };
}

/** Bornes de saisie des unités. Le stylo Novorapid délivre par demi-unités. */
export const MIN_FORGOTTEN_UNITS = 0.5;
export const MAX_FORGOTTEN_UNITS = 30;

/** Arrondi à la demi-unité, borné. `null` si la saisie n'est pas un nombre. */
export function normalizeForgottenUnits(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw * 2) / 2;
  if (rounded < MIN_FORGOTTEN_UNITS || rounded > MAX_FORGOTTEN_UNITS) return null;
  return rounded;
}
