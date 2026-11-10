/**
 * Heures locales dans un fuseau donné (fable-5.2, nov. 2026).
 *
 * Le serveur (Vercel) tourne en UTC. Tout calcul « à quelle heure de la
 * journée ? » fait côté serveur avec `getHours()` répond donc en UTC, pas à
 * l'heure de la personne : une ou deux heures d'écart en France, neuf au
 * Japon. Constaté en production : le bilan IA et Le Docteur recevaient des
 * créneaux horaires décalés, et situaient donc les hypos au mauvais moment
 * de la journée.
 *
 * Règle : côté navigateur, on ne passe PAS de fuseau (celui de l'appareil
 * est le bon). Côté serveur, on passe toujours celui que le navigateur a
 * envoyé.
 *
 * Pur : aucun import serveur.
 */

export interface LocalParts {
  hour: number;
  minute: number;
  /** Jour local `YYYY-MM-DD`. */
  day: string;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `true` si la chaîne est un fuseau IANA que le moteur connaît. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || timeZone.length === 0 || timeZone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Fuseau de l'appareil (navigateur), ou `undefined` s'il est illisible. */
export function deviceTimeZone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : undefined;
  } catch {
    return undefined;
  }
}

/** Heure et jour locaux d'un instant, dans le fuseau demandé. */
export function localParts(ms: number, timeZone?: string): LocalParts {
  if (!timeZone) {
    const d = new Date(ms);
    return {
      hour: d.getHours(),
      minute: d.getMinutes(),
      day: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    };
  }
  let fmt = formatterCache.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, fmt);
  }
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(ms))) parts[p.type] = p.value;
  return {
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    day: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** `JJ/MM HHhMM` en heure locale — lisible tel quel dans un prompt. */
export function formatLocalStamp(ms: number, timeZone?: string): string {
  const { hour, minute, day } = localParts(ms, timeZone);
  const [, month, dayOfMonth] = day.split("-");
  return `${dayOfMonth}/${month} ${pad(hour)}h${pad(minute)}`;
}
