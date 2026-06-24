/**
 * Prédiction glycémique — primitives d'effet (Étape 5a).
 *
 * Fonctions PURES, sans I/O, qui calculent la contribution en mg/dL de
 * chaque facteur entre « maintenant » (t=0) et un horizon `minutesAhead`.
 * Elles sont la SOURCE DE VÉRITÉ unique des effets glycémiques : le moteur
 * d'assemblage 8h (étape 5c) et le bedtime/night-brain existant doivent
 * déléguer ici plutôt que de redériver leurs propres formules.
 *
 * ─── Décisions d'architecture (cf. discussion spec) ──────────────────────
 *  • IOB : on RÉUTILISE le modèle bi-exponentiel déjà implémenté
 *    (`iobRemainingFraction`, lib/night-calibration.ts), identique à la
 *    formule Loop/openAPS de la spec. On ne recode pas un 4e modèle d'IOB.
 *  • COB : on NE prend PAS le log-normal de la spec. On garde la logique
 *    calibrée terrain (~10 itérations) : glucides en absorption linéaire +
 *    montée FPU avec le MÊME facteur 6 que le calculateur de dose
 *    (insulin-calculator.ts) et le bedtime-advisor. Cohérence dose↔prédiction.
 *  • ISF : aucune valeur en dur. Le vrai ISF d'Ethan (100 mg/dL/U) est passé
 *    par l'appelant depuis DiabetesConfig — surtout PAS le 35 de la spec.
 *  • Basale : aucun terme soustrait ici (le modèle basal de la spec est faux
 *    physiologiquement). La dérive nocturne mesurée est gérée à l'assemblage
 *    (étape 5b/5c) via estimateNightDrift, pas par une fraction horaire figée.
 */

import { iobRemainingFraction } from "./night-calibration";
import {
  computeExerciseAdjustment,
  type RecentExercise,
} from "./exercise-insulin-adjustment";

// ───────────────────────────────────────────────────────────────────────
// Constantes partagées (alignées sur insulin-calculator.ts + bedtime-advisor.ts)
// ───────────────────────────────────────────────────────────────────────

/** Durée d'action insuline rapide (Novorapid) par défaut — DIA empirique Ethan. */
export const DEFAULT_DIA_MIN = 195;
/** Pic d'action Novorapid par défaut (standard labo, à calibrer). */
export const DEFAULT_PEAK_MIN = 75;

/** Durée d'absorption des glucides « standard » (min). */
export const CARB_DURATION_MIN = 195;
/**
 * Pic d'absorption des glucides (min). Volontairement PLUS PRÉCOCE que le pic
 * insuline (75 min) : les glucides montent vite, l'insuline agit un peu plus
 * tard → bosse post-prandiale réaliste qui revient à la baseline SANS hypo
 * fantôme (un repas bien dosé ne doit pas prédire une hypo).
 *
 * Calibré pour des excursions réalistes d'un repas bien dosé injecté au
 * moment du repas (sans pré-bolus) : 60g → ~+45 mg/dL, 100g → ~+76 mg/dL,
 * pic vers ~85 min, retour propre à la baseline. Un pic plus précoce (45 min)
 * produisait des excursions irréalistes (+180 sur 100g).
 */
export const CARB_PEAK_MIN = 60;
/** Montée glycémique par gramme de glucides absorbé (mg/dL/g) — défaut hors assemblage. */
export const MG_PER_GRAM_CARB = 3.5;

/** 1 FPU ≈ 6 g équivalent glucides (empirique MDI). MÊME facteur que le bolus. */
export const FPU_GLUCOSE_FACTOR = 6;
/** Fenêtre d'absorption des lipides/protéines (FPU) en heures. */
export const FPU_WINDOW_HOURS = 5;

// ───────────────────────────────────────────────────────────────────────
// IOB → baisse glycémique
// ───────────────────────────────────────────────────────────────────────

export interface ActiveBolus {
  /** Unités injectées. */
  units: number;
  /** Minutes écoulées depuis l'injection au moment « maintenant » (t=0). */
  minutesAgo: number;
}

/**
 * Baisse glycémique (mg/dL, valeur positive) due aux bolus rapides ACTIFS,
 * cumulée entre maintenant et `minutesAhead`.
 *
 * Pour chaque bolus, l'insuline « consommée » sur l'intervalle est
 * `units × (fractionRestante(now) − fractionRestante(now+Δ))`. Multipliée
 * par l'ISF, elle donne la baisse glycémique attribuable à cet intervalle.
 * C'est exactement le modèle déjà utilisé par le bedtime-advisor.
 *
 * @param boluses     bolus rapides récents (rapide uniquement, PAS la basale)
 * @param minutesAhead horizon en minutes (>0)
 * @param isf         facteur de sensibilité réel (mg/dL par U) — ex. 100
 */
export function iobGlucoseDrop(
  boluses: ActiveBolus[],
  minutesAhead: number,
  isf: number,
  dia: number = DEFAULT_DIA_MIN,
  peak: number = DEFAULT_PEAK_MIN,
): number {
  if (minutesAhead <= 0) return 0;
  let insulinUsed = 0;
  for (const b of boluses) {
    const remNow = iobRemainingFraction(b.minutesAgo, dia, peak);
    const remFuture = iobRemainingFraction(b.minutesAgo + minutesAhead, dia, peak);
    insulinUsed += b.units * Math.max(0, remNow - remFuture);
  }
  return insulinUsed * isf;
}

/**
 * IOB total (U) encore actif à « maintenant », via le modèle bi-exponentiel.
 * Équivalent fonctionnel de `getInsulinOnBoard` mais sur la courbe
 * exponentielle (et non linéaire) — à utiliser pour la prédiction.
 */
export function activeIOB(
  boluses: ActiveBolus[],
  dia: number = DEFAULT_DIA_MIN,
  peak: number = DEFAULT_PEAK_MIN,
): number {
  return boluses.reduce(
    (sum, b) => sum + b.units * iobRemainingFraction(b.minutesAgo, dia, peak),
    0,
  );
}

// ───────────────────────────────────────────────────────────────────────
// COB → montée glycémique (glucides + FPU calibré)
// ───────────────────────────────────────────────────────────────────────

export interface ActiveMeal {
  /** Glucides du repas (g). */
  carbsGrams: number;
  /** Lipides du repas (g) — pour la composante FPU. Optionnel. */
  fatGrams?: number;
  /** Protéines du repas (g) — pour la composante FPU. Optionnel. */
  proteinGrams?: number;
  /** Minutes écoulées depuis le DÉBUT du repas au moment « maintenant ». */
  minutesAgo: number;
}

/**
 * Fraction de glucides ENCORE à absorber à `minutesAgo` du début du repas.
 * Réutilise la même courbe bi-exponentielle que l'IOB (source unique), avec
 * un pic plus précoce — c'est ce qui fait coïncider montée glucides et baisse
 * insuline pour un repas bien dosé.
 */
export function carbRemainingFraction(
  minutesAgo: number,
  durationMin: number = CARB_DURATION_MIN,
  peakMin: number = CARB_PEAK_MIN,
): number {
  return iobRemainingFraction(minutesAgo, durationMin, peakMin);
}

/**
 * Montée glycémique (mg/dL) due aux GLUCIDES d'un repas, cumulée entre
 * maintenant et `minutesAhead`. Absorption sur une courbe bi-exponentielle
 * (pic ~45 min) → la part absorbée sur l'intervalle est
 * `carbs × mgPerGram × (restant(now) − restant(now+Δ))`. Symétrique au modèle
 * d'IOB, donc un bolus bien dosé annule cette montée sans hypo fantôme.
 */
export function carbGlucoseRise(
  carbsGrams: number,
  mealMinutesAgo: number,
  minutesAhead: number,
  mgPerGram: number = MG_PER_GRAM_CARB,
  durationMin: number = CARB_DURATION_MIN,
  peakMin: number = CARB_PEAK_MIN,
): number {
  if (carbsGrams <= 0 || minutesAhead <= 0) return 0;
  const remNow = carbRemainingFraction(mealMinutesAgo, durationMin, peakMin);
  const remFuture = carbRemainingFraction(mealMinutesAgo + minutesAhead, durationMin, peakMin);
  return carbsGrams * mgPerGram * Math.max(0, remNow - remFuture);
}

/**
 * Montée glycémique (mg/dL) due aux LIPIDES/PROTÉINES (FPU), cumulée entre
 * maintenant et `minutesAhead`. Linéaire sur `windowHours`, avec le facteur 6
 * (même conversion FPU→glucides que le bolus). Ne déclenche qu'à partir de
 * 1 FPU (sous ce seuil l'effet est négligeable, cf. calculateur de dose).
 *
 * ⚠️ Cette montée est destinée à être NETTÉE contre la 2e dose (split) à
 * l'assemblage — un split bien dosé l'annule par construction (même facteur 6).
 */
export function fpuGlucoseRise(
  fatGrams: number,
  proteinGrams: number,
  mealMinutesAgo: number,
  minutesAhead: number,
  mgPerGram: number = MG_PER_GRAM_CARB,
  windowHours: number = FPU_WINDOW_HOURS,
): number {
  if (minutesAhead <= 0) return 0;
  const fpu = (fatGrams * 9 + proteinGrams * 4) / 100;
  if (fpu < 1) return 0;
  const hoursAgo = mealMinutesAgo / 60;
  if (hoursAgo >= windowHours) return 0;

  const totalFpuGlucose = fpu * FPU_GLUCOSE_FACTOR * mgPerGram;
  const ratePerHour = totalFpuGlucose / windowHours;
  const hoursCaptured = Math.max(
    0,
    Math.min(minutesAhead / 60, windowHours - hoursAgo),
  );
  return ratePerHour * hoursCaptured;
}

/**
 * Montée glycémique TOTALE d'un repas (glucides + FPU) entre maintenant et
 * `minutesAhead`. C'est l'équivalent « COB » du modèle, mais ancré sur la
 * logique calibrée plutôt que sur le log-normal de la spec.
 */
export function mealGlucoseRise(
  meal: ActiveMeal,
  minutesAhead: number,
  mgPerGram: number = MG_PER_GRAM_CARB,
): number {
  const carbs = carbGlucoseRise(meal.carbsGrams, meal.minutesAgo, minutesAhead, mgPerGram);
  const fpu = fpuGlucoseRise(
    meal.fatGrams ?? 0,
    meal.proteinGrams ?? 0,
    meal.minutesAgo,
    minutesAhead,
    mgPerGram,
  );
  return carbs + fpu;
}

// ───────────────────────────────────────────────────────────────────────
// Effet basal (Lantus) — Étape 5b
// ───────────────────────────────────────────────────────────────────────
//
// Pourquoi PAS la formule de la spec `(dose/24)·ISF·Δt` :
//   Cette formule soustrait en continu un effet proportionnel à la DOSE, donc
//   la glycémie chute linéairement sans borne (≈ -108 mg/dL/h avec 26U·ISF100).
//   C'est faux physiologiquement : l'insuline basale ne FAIT PAS baisser une
//   glycémie à jeun — elle COMPENSE la production hépatique de glucose. Sur une
//   basale bien titrée, l'effet NET sur une ligne à jeun est ≈ 0.
//
// Modèle réel retenu :
//   effet basal net = dérive_mesurée (mg/dL/h) × heures
//   où `dérive_mesurée` vient de estimateNightDrift() — la pente réelle de la
//   glycémie dans la fenêtre 00h-03h (à jeun, sans IOB), qui isole précisément
//   le déséquilibre basale↔foie. On ne peut PAS dériver ce net de la dose seule
//   (il faudrait connaître la production hépatique du patient). Par défaut 0
//   (= basale supposée titrée) tant que la calibration n'a pas assez de nuits.
//
// L'extrapolation est plafonnée : la dérive est mesurée sur ~3h ; la prolonger
// linéairement sur 8h sur-estimerait. Cap ±80 mg/dL (aligné bedtime-advisor).

/** Plafond absolu de l'effet basal cumulé sur l'horizon (mg/dL). */
export const BASAL_EFFECT_CAP_MGDL = 80;

/**
 * Effet glycémique NET de la basale (Lantus) cumulé entre maintenant et
 * `minutesAhead`. Signé : positif = monte, négatif = descend.
 *
 * @param minutesAhead horizon en minutes
 * @param driftPerHour dérive basale mesurée (mg/dL/h) ; 0 = basale titrée (défaut)
 */
export function basalGlucoseEffect(
  minutesAhead: number,
  driftPerHour: number = 0,
  capMgDl: number = BASAL_EFFECT_CAP_MGDL,
): number {
  if (minutesAhead <= 0) return 0;
  const raw = driftPerHour * (minutesAhead / 60);
  return Math.max(-capMgDl, Math.min(capMgDl, raw));
}

/**
 * Sensibilité glucidique (CSF, mg/dL par gramme) cohérente avec l'ISF et le
 * ratio : 1 g monte la glycémie de ISF/ratio, donc le bolus repas (carbs/ratio)
 * annule EXACTEMENT la montée des glucides quand il est bien dosé. C'est la
 * condition pour qu'un repas correctement bolussé prédise un effet net ≈ 0
 * (pas d'hypo fantôme après chaque repas).
 *
 * @param isf            mg/dL par U (ex. 100)
 * @param ratioGramsPerU grammes couverts par 1 U (ex. 10 le midi)
 */
export function carbSensitivity(isf: number, ratioGramsPerU: number): number {
  if (ratioGramsPerU <= 0) return isf / 10;
  return isf / ratioGramsPerU;
}

export type BasalTitration =
  | "ok"
  | "likely-too-strong"
  | "likely-too-weak"
  | "unknown";

/**
 * Interprète la dérive basale mesurée pour signaler une basale mal titrée.
 * Utile cliniquement : une dérive nocturne franche et reproductible est le
 * signe d'une dose Lantus à ajuster (avec le diabéto), pas un défaut de bolus.
 *
 * Bande « ok » = ±`okBandPerHour` mg/dL/h (défaut ±5, point de départ à
 * calibrer). Au-delà, on flag — mais seulement si la confiance n'est pas faible
 * (sinon échantillon trop maigre pour conclure).
 */
export function assessBasalTitration(
  driftPerHour: number,
  confidence: "low" | "medium" | "high",
  okBandPerHour: number = 5,
): { status: BasalTitration; message: string } {
  if (confidence === "low") {
    return {
      status: "unknown",
      message:
        "Pas assez de nuits propres pour juger la basale. Continue à logger, la calibration affinera ça.",
    };
  }
  if (driftPerHour < -okBandPerHour) {
    return {
      status: "likely-too-strong",
      message: `Tes nuits descendent en moyenne de ${Math.abs(driftPerHour)} mg/dL/h à jeun → ta Lantus est peut-être un peu forte. À voir avec ton diabéto (jamais en auto).`,
    };
  }
  if (driftPerHour > okBandPerHour) {
    return {
      status: "likely-too-weak",
      message: `Tes nuits montent en moyenne de ${driftPerHour} mg/dL/h à jeun → ta Lantus est peut-être un peu faible. À voir avec ton diabéto (jamais en auto).`,
    };
  }
  return {
    status: "ok",
    message: "Ta basale a l'air bien réglée (glycémie à jeun stable la nuit).",
  };
}

// ───────────────────────────────────────────────────────────────────────
// Assemblage — predictGlucoseCurve (Étape 5c, sans Whoop)
// ───────────────────────────────────────────────────────────────────────
//
// Compose les primitives en une courbe 8h (pas 15 min) :
//   glycémie(t) = actuelle
//               + tendance court terme (cap 30 min)
//               + Σ événements [ montée glucides + montée FPU(net split) − baisse IOB ]
//               + effet basal net (dérive mesurée)
//               + dawn (mesuré sinon échelle)
//               + biais appris (optionnel, surtout nuit)
//   puis clamp 40–350 mg/dL.
//
// Sûreté : chaque point est borné ; un repas bien dosé donne un net ≈ 0 grâce
// à la sensibilité glucidique CSF = ISF/ratio. La modulation Whoop (sport)
// arrive à l'étape 5d et ne modifie PAS cette signature (elle injectera un
// effet supplémentaire via un champ optionnel).

/** Vitesse de tendance Libre (mg/dL/min) — slide rule Abbott, identique au reste du code. */
function trendVelocityMgPerMin(arrow?: number): number {
  switch (arrow) {
    case 1: return -1.5; // ↓↓
    case 2: return -0.7; // ↘
    case 4: return 0.7; // ↗
    case 5: return 1.5; // ↑↑
    default: return 0; // → ou inconnu
  }
}

/**
 * Amortissement pratique de l'effet « sensibilité ↑ » post-exercice.
 * Le boost théorique (insuline_active × ISF × pct) sur-estime en pratique
 * (contre-régulation, glucides résiduels…). 0.4 = même facteur conservateur
 * que le bedtime-advisor → prédiction sport cohérente entre les deux moteurs.
 */
export const SPORT_SENSITIVITY_DAMPING = 0.4;

/** Amortissement de la montée FPU NON couverte par un split (cas goûter). */
export const FPU_UNCOVERED_DAMPING = 0.6;
/** Contre-régulation : seuil sous lequel la chute prédite est amortie (mg/dL). */
export const CR_THRESHOLD = 80;
/** Fraction de la chute SOUS le seuil qui est conservée (0.5 = moitié amortie). */
export const CR_DAMP = 0.5;

/**
 * Heures de l'intervalle [now, now+minutesAhead] qui tombent dans la fenêtre
 * nocturne à jeun [0h, 6h) locale. La dérive basale n'est mesurée QUE sur cette
 * fenêtre (estimateNightDrift, 00h-03h) → on ne l'applique donc pas en soirée
 * pendant la digestion du repas (sinon elle écrase la prédiction du repas).
 */
function nightFastingHours(nowMs: number, minutesAhead: number): number {
  if (minutesAhead <= 0) return 0;
  let hours = 0;
  const steps = Math.ceil(minutesAhead / 15);
  for (let i = 0; i < steps; i++) {
    const mid = nowMs + (i * 15 + 7.5) * 60_000;
    const hr = new Date(mid).getHours();
    if (hr >= 0 && hr < 6) hours += 0.25;
  }
  return hours;
}

/** Échelle dawn par défaut (mg/dL) quand aucune courbe mesurée n'est dispo. */
function defaultDawnBump(hourOfDay: number): number {
  if (hourOfDay >= 6 && hourOfDay <= 7) return 40;
  if (hourOfDay === 5 || hourOfDay === 8) return 25;
  if (hourOfDay >= 4 && hourOfDay <= 8) return 15;
  return 0;
}

/** Un événement insuline+repas (typiquement un InsulinLog) en cours d'effet. */
export interface PredictionEvent {
  /** Minutes écoulées depuis l'injection / le début du repas. */
  minutesAgo: number;
  /** Unités de rapide injectées (fait baisser). 0/absent = repas sans bolus. */
  units?: number;
  /** Glucides du repas (g) — fait monter. */
  carbsGrams?: number;
  /** Lipides (g) — composante FPU. */
  fatGrams?: number;
  /** Protéines (g) — composante FPU. */
  proteinGrams?: number;
  /**
   * Sensibilité glucidique (mg/dL/g) pour CET événement = ISF/ratio du repas.
   * Garantit qu'un bolus bien dosé annule la montée. Défaut : ISF/10.
   */
  carbSensitivity?: number;
}

/** 2e dose (split FPU) encore à venir, couplée à la montée FPU pour la nette. */
export interface PendingSplit {
  units: number;
  /** Minutes avant le déclenchement du split. */
  minutesUntil: number;
}

export interface PredictGlucoseInput {
  /** Glycémie actuelle (mg/dL). */
  currentGlucose: number;
  /** Tendance Libre 1..5 (1=↓↓ … 5=↑↑). */
  trendArrow?: number;
  /** Événements insuline+repas actifs. */
  events: PredictionEvent[];
  /** ISF réel (mg/dL/U) — ex. 100. JAMAIS 35. */
  isf: number;
  /** Dérive basale mesurée (mg/dL/h). 0 = titrée. */
  basalDriftPerHour?: number;
  /** Courbe dawn mesurée : heure (4..9) → montée mg/dL. */
  dawnCurveByHour?: Record<number, number>;
  /** Split (FPU) en attente, couplé à la montée FPU. */
  pendingSplit?: PendingSplit;
  /** Biais appris (mg/dL) — pondéré par l'horizon. Optionnel (nuit). */
  learnedBias?: number;
  /**
   * Séance récente (Whoop ou estimée) pour la modulation « sensibilité ↑ »
   * post-exercice. RÉUTILISE computeExerciseAdjustment (muscu vs running
   * différenciés — Yardley 2013) ; on ne recode aucun mapping de strain.
   * L'effet amplifie la baisse due à l'insuline active, et décroît tout seul
   * au fil de l'horizon (le % est recalculé à chaque pas dans le futur).
   */
  sport?: RecentExercise;
  /** DIA / pic (défauts 195 / 75). */
  dia?: number;
  peak?: number;
  /** Plage cible pour les alertes (défaut 70–180, hypo<70, hyper>250). */
  hypoThreshold?: number;
  hyperThreshold?: number;
  /** Horizon (défaut 480 min) et pas (défaut 15 min). */
  horizonMinutes?: number;
  stepMinutes?: number;
  /** Heure de référence (défaut Date.now()). */
  nowMs?: number;
}

export interface PredictionPoint {
  /** Minutes depuis maintenant. */
  minute: number;
  /** Timestamp absolu (ms). */
  at: number;
  /** Glycémie prédite (mg/dL, clampée 40–350). */
  value: number;
}

export interface GlucoseAlert {
  type: "hypo" | "hyper";
  /** Minute où le seuil est franchi pour la première fois. */
  minute: number;
  /** Timestamp absolu (ms) — à formater CÔTÉ CLIENT (la TZ serveur = UTC). */
  at: number;
  /** Heure absolue lisible — NE PAS utiliser pour l'affichage (formatée dans
   *  la TZ du runtime ; côté serveur Vercel = UTC). Conservé pour debug. */
  hourLabel: string;
  /** Valeur prédite à ce point. */
  value: number;
}

export interface GlucosePrediction {
  curve: PredictionPoint[];
  /** Min / max prédits sur l'horizon (hors point t=0). */
  min: PredictionPoint;
  max: PredictionPoint;
  /** Alertes hypo (<seuil) / hyper (>seuil) projetées. */
  alerts: GlucoseAlert[];
  /**
   * Prédiction jugée peu fiable : repas très récent + IOB élevé → dynamique
   * encore instable. On le dit honnêtement plutôt que d'afficher un faux chiffre.
   */
  unreliableTooFresh: boolean;
}

/** Décomposition d'un point (utile transparence UI / debug). */
function effectsAt(
  minutesAhead: number,
  input: PredictGlucoseInput,
): number {
  const isf = input.isf;
  const dia = input.dia ?? DEFAULT_DIA_MIN;
  const peak = input.peak ?? DEFAULT_PEAK_MIN;
  const nowMs = input.nowMs ?? Date.now();

  let glucose = input.currentGlucose;

  // 1. Tendance court terme (cap 30 min)
  const trendMinutes = Math.min(30, minutesAhead);
  glucose += trendVelocityMgPerMin(input.trendArrow) * trendMinutes;

  // 2. Événements : montée glucides + FPU − baisse IOB
  let fpuRiseTotal = 0;
  let insulinDrop = 0; // cumul des baisses dues à l'insuline rapide (sport amplifie)
  for (const ev of input.events) {
    const csf = ev.carbSensitivity ?? carbSensitivity(isf, 10);
    // Montée glucides (annulée par le bolus si bien dosé)
    glucose += carbGlucoseRise(ev.carbsGrams ?? 0, ev.minutesAgo, minutesAhead, csf);
    // Montée FPU (cumulée pour nette éventuelle avec le split)
    fpuRiseTotal += fpuGlucoseRise(
      ev.fatGrams ?? 0,
      ev.proteinGrams ?? 0,
      ev.minutesAgo,
      minutesAhead,
      csf,
    );
    // Baisse IOB du bolus de cet événement
    if (ev.units && ev.units > 0) {
      insulinDrop += iobGlucoseDrop([{ units: ev.units, minutesAgo: ev.minutesAgo }], minutesAhead, isf, dia, peak);
    }
  }

  // 3. FPU ↔ split : le split (s'il existe) couvre le FPU sur la même échelle
  let splitDrop = 0;
  if (input.pendingSplit && minutesAhead > input.pendingSplit.minutesUntil) {
    const since = minutesAhead - input.pendingSplit.minutesUntil;
    splitDrop = iobGlucoseDrop(
      [{ units: input.pendingSplit.units, minutesAgo: 0 }],
      since,
      isf,
      dia,
      peak,
    );
  }
  // Net FPU↔split. Si une 2e dose (split) couvre le FPU → cancellation
  // exacte (net ≤ 0, on garde). Si le FPU n'est PAS couvert (pas de split,
  // cas goûter) → on amortit la montée : en pratique le FPU non bolussé
  // monte MOINS que la couverture théorique (facteur 6), et le léger
  // sur-dosage glucides l'absorbe en partie. Évite les "+90 mg/dL" irréalistes.
  let fpuNet = fpuRiseTotal - splitDrop;
  if (fpuNet > 0) fpuNet *= FPU_UNCOVERED_DAMPING;
  glucose += fpuNet;
  glucose -= insulinDrop;

  // 3bis. Modulation sport (sensibilité insuline ↑) — Étape 5d.
  // RÉUTILISE computeExerciseAdjustment : on recalcule le % AU TEMPS FUTUR
  // (nowMs + horizon) → il décroît tout seul le long de la courbe. L'effet
  // amplifie l'insuline ACTIVE sur l'intervalle (bolus repas + split), borné
  // par l'amortissement pratique. Muscu vs running géré par getSportFactor.
  if (input.sport) {
    const futureMs = nowMs + minutesAhead * 60_000;
    const adj = computeExerciseAdjustment(input.sport, futureMs);
    if (adj && adj.reductionPct > 0) {
      const totalActiveInsulinDrop = insulinDrop + splitDrop;
      glucose -= totalActiveInsulinDrop * (adj.reductionPct / 100) * SPORT_SENSITIVITY_DAMPING;
    }
  }

  // 4. Effet basal net (dérive mesurée) — UNIQUEMENT sur les heures nocturnes
  // à jeun de l'horizon. Évite que la dérive nuit écrase la digestion du soir.
  const nightHours = nightFastingHours(nowMs, minutesAhead);
  if (nightHours > 0 && input.basalDriftPerHour) {
    glucose += basalGlucoseEffect(nightHours * 60, input.basalDriftPerHour);
  }

  // 5. Dawn (mesuré sinon échelle)
  const hourOfDay = new Date(nowMs + minutesAhead * 60_000).getHours();
  const dawn = input.dawnCurveByHour?.[hourOfDay] ?? defaultDawnBump(hourOfDay);
  glucose += dawn;

  // 6. Biais appris (pondéré par l'horizon — plein à 6h)
  if (input.learnedBias) {
    glucose += input.learnedBias * Math.min(1, minutesAhead / 360);
  }

  // 7. Contre-régulation : quand la glycémie chuterait dans le bas, le foie
  // libère du glucose (glucagon) → la chute réelle est amortie. Sans ça, le
  // modèle sur-prédit des hypos sur les grosses corrections / IOB résiduel.
  // N'affecte QUE les trajectoires basses → les repas équilibrés (qui restent
  // en cible) ne bougent pas.
  if (glucose < CR_THRESHOLD) {
    glucose = CR_THRESHOLD - (CR_THRESHOLD - glucose) * CR_DAMP;
  }

  // 8. Clamp réalisme
  return Math.min(350, Math.max(40, Math.round(glucose)));
}

/**
 * Prédit la courbe glycémique sur `horizonMinutes` (défaut 8h) au pas
 * `stepMinutes` (défaut 15 min). Fonction PURE — aucune I/O, aucun accès store.
 * L'appelant (étape 5e) fournit les événements/dérive/dawn lus depuis le store
 * et l'archive.
 */
export function predictGlucoseCurve(input: PredictGlucoseInput): GlucosePrediction {
  const horizon = input.horizonMinutes ?? 480;
  const step = input.stepMinutes ?? 15;
  const nowMs = input.nowMs ?? Date.now();
  const hypo = input.hypoThreshold ?? 70;
  const hyper = input.hyperThreshold ?? 250;

  const curve: PredictionPoint[] = [];
  for (let t = 0; t <= horizon; t += step) {
    curve.push({
      minute: t,
      at: nowMs + t * 60_000,
      value: t === 0 ? Math.round(input.currentGlucose) : effectsAt(t, input),
    });
  }

  // Min / max hors t=0 (on prédit l'avenir, pas l'instant présent)
  const future = curve.slice(1);
  let min = future[0] ?? curve[0];
  let max = future[0] ?? curve[0];
  for (const p of future) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
  }

  // Alertes : premier franchissement de seuil
  const alerts: GlucoseAlert[] = [];
  const firstHypo = future.find((p) => p.value < hypo);
  const firstHyper = future.find((p) => p.value > hyper);
  const fmt = (ms: number) =>
    new Date(ms).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (firstHypo) alerts.push({ type: "hypo", minute: firstHypo.minute, at: firstHypo.at, hourLabel: fmt(firstHypo.at), value: firstHypo.value });
  if (firstHyper) alerts.push({ type: "hyper", minute: firstHyper.minute, at: firstHyper.at, hourLabel: fmt(firstHyper.at), value: firstHyper.value });

  // Fiabilité : repas très récent + IOB élevé → dynamique instable
  const totalIOB = activeIOB(
    input.events.filter((e) => e.units && e.units > 0).map((e) => ({ units: e.units!, minutesAgo: e.minutesAgo })),
    input.dia ?? DEFAULT_DIA_MIN,
    input.peak ?? DEFAULT_PEAK_MIN,
  );
  const freshMealWithCarbs = input.events.some(
    (e) => e.minutesAgo < 45 && (e.carbsGrams ?? 0) > 0,
  );
  const unreliableTooFresh = freshMealWithCarbs && totalIOB > 2;

  return { curve, min, max, alerts, unreliableTooFresh };
}

// ───────────────────────────────────────────────────────────────────────
// Conseil actionnable dérivé de la courbe (atterrir à la cible)
// ───────────────────────────────────────────────────────────────────────

function fmtU(n: number): string {
  return (Math.round(n * 10) / 10).toString().replace(".", ",");
}

export interface PredictionAdvice {
  kind: "correction" | "carbs" | "wait-iob" | "in-range";
  tone: "success" | "warning" | "error" | "info";
  headline: string;
  detail: string;
  /** Quantité (U ou g) si action concrète. */
  quantity?: number;
  unit?: "U" | "g";
}

/**
 * Transforme la courbe prédite en UN conseil : « fais ~XU » / « mange ~Yg » /
 * « attends, IOB en cours » / « rien à ajuster ».
 *
 * Sûreté : la correction se base sur le MINIMUM de la trajectoire à venir
 * (à partir de `fromMinutes`), pas sur un pic transitoire → on ne corrige que
 * si MÊME le point le plus bas reste au-dessus de la cible+marge, donc une
 * correction ne peut pas provoquer d'hypo sur un creux à venir. L'IOB est déjà
 * intégré dans la courbe ; on bloque quand même la suggestion si l'IOB actif
 * est élevé (anti-stacking). Décision finale = ressenti utilisateur.
 */
export function buildPredictionAdvice(input: {
  prediction: GlucosePrediction;
  targetGlucose: number;
  isf: number;
  iobUnits: number;
  /** Début de la fenêtre de référence (min). Défaut 120 (après le pic repas). */
  fromMinutes?: number;
  /** Plafond de correction suggérée (U). Défaut 3. */
  maxCorrection?: number;
}): PredictionAdvice {
  const { prediction, targetGlucose, isf, iobUnits } = input;
  const from = input.fromMinutes ?? 120;
  const maxCorr = input.maxCorrection ?? 3;

  if (prediction.unreliableTooFresh) {
    return {
      kind: "wait-iob",
      tone: "info",
      headline: "Repas trop récent pour conseiller",
      detail: "La dynamique glucides/insuline est encore instable. Reviens dans 1-2h.",
    };
  }

  const later = prediction.curve.filter((p) => p.minute >= from);
  if (later.length === 0) {
    return { kind: "in-range", tone: "success", headline: "Rien à ajuster", detail: "Horizon trop court." };
  }
  const minLater = Math.min(...later.map((p) => p.value));
  const maxLater = Math.max(...later.map((p) => p.value));

  // 1. Hypo à venir → glucides (priorité absolue)
  if (minLater < 75) {
    const carbs = Math.min(25, Math.max(8, Math.ceil((targetGlucose - minLater) / 4)));
    return {
      kind: "carbs",
      tone: "error",
      headline: `Mange ~${carbs}g de glucides`,
      detail: `Sans ça, tu descends vers ~${minLater} mg/dL. ${carbs}g te ramènent vers la cible.`,
      quantity: carbs,
      unit: "g",
    };
  }

  // 2. Tu restes au-dessus de la cible → correction pour atterrir à la cible
  if (minLater > targetGlucose + 25) {
    if (iobUnits > 1.5) {
      return {
        kind: "wait-iob",
        tone: "info",
        headline: `Attends — ${fmtU(iobUnits)}U encore actives`,
        detail: `Tu restes vers ${minLater} mg/dL, mais ${fmtU(iobUnits)}U travaillent déjà (c'est intégré au calcul). Re-vérifie dans 1-2h avant de corriger.`,
      };
    }
    const raw = (minLater - targetGlucose) / isf;
    const units = Math.min(maxCorr, Math.max(0.5, Math.round(raw * 2) / 2));
    const landing = Math.round(minLater - units * isf);
    return {
      kind: "correction",
      tone: "warning",
      headline: `Fais ~${fmtU(units)}U de correction`,
      detail: `Sans rien, tu restes autour de ${minLater} mg/dL pendant des heures. ~${fmtU(units)}U te ramènent vers ${landing} mg/dL. Valide avec ton ressenti.`,
      quantity: units,
      unit: "U",
    };
  }

  // 3. En cible
  return {
    kind: "in-range",
    tone: "success",
    headline: "Bonne trajectoire — rien à ajuster",
    detail: `Tu restes en cible (mini ~${minLater}, maxi ~${maxLater} mg/dL sur l'horizon).`,
  };
}
