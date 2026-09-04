# Plafonnement prédictif de la dose — design

**Date** : 2026-09-03
**Statut** : design validé par Ethan, en attente de relecture de la spec

## Problème

Le calculateur de bolus et le prédicteur glycémique vivent dans la même app et se contredisent.

Cas réel, mesuré en faisant tourner les deux moteurs sur le même scénario — 56 mg/dL, 100 g à midi, 2,5 U encore actives :

| Dose | Minimum prédit par l'app | Atterrissage à 5 h |
|---|---|---|
| **10 U — ce que le calculateur propose** | **40 mg/dL** | 40 |
| 9 U | 60 | 60 |
| **8 U** | 61 | **139** |
| 7 U | 63 | 239 |

Le calculateur propose 10 U ; le prédicteur de la même app annonce que 10 U mènent à 40 mg/dL. Les deux moteurs ne se parlent pas.

La cause est structurelle. `calculateBolus` empile sept couches — glucides, correction, IOB, tendance, sport prévu, sport passé, FPU — mais :

- la **correction ne s'applique qu'au-dessus de 180** ; sous ce seuil elle vaut zéro ;
- l'**IOB n'est soustrait que de la correction**, donc de zéro entre 70 et 180 : l'insuline active n'a aucun effet sur la dose dans toute la plage normale ;
- **sous 70, rien n'est retiré** — l'app affiche une phrase (« considérer des glucides supplémentaires ») et propose la dose pleine.

Résultat : à 56 mg/dL avec 2,5 U actives, l'app propose exactement la même dose qu'à 150 mg/dL à jeun.

## Objectif

Ajouter une couche de sécurité qui **plafonne** la dose proposée pour que la trajectoire glycémique prédite ne descende jamais sous une limite de sécurité.

C'est le principe de Loop, dont la documentation énonce : *« Loop calcule le bolus recommandé de telle sorte que la glycémie prédite ne descende jamais sous la limite de sécurité. Cela peut aboutir à une glycémie future prédite au-dessus de la cible, mais cela évitera une hypoglycémie peu après le repas. »*

Autrement dit : **on accepte de finir haut plutôt que de risquer de finir bas.**

## Périmètre, précisé par Ethan

L'objet est la **dose au moment de l'injection** — obtenir un chiffre qui tienne compte de l'hypoglycémie en cours, de l'insuline active et du sport, pour viser une stabilité glycémique. Ce n'est pas un module de prédiction nocturne : le plan de nuit existe déjà et garde son rôle.

## Principes

1. **Le plafond ne peut que réduire, jamais augmenter.** Si la prédiction annonce une hyperglycémie, la dose n'est pas relevée. C'est un garde-fou, pas un optimiseur.
2. **Jamais silencieusement.** La dose d'origine et la raison du plafonnement sont toujours affichées. Une dose ne change pas à l'insu de l'utilisateur.
3. **Le calculateur ne change pas.** Ses sept couches produisent une dose candidate ; le plafonnement est une couche distincte, testable seule et neutralisable.

---

## 1. Limite de sécurité

**`PREDICTION_SAFETY_LIMIT = 80 mg/dL`** — dix mg/dL au-dessus du seuil d'hypoglycémie de l'app (70), pour absorber l'erreur du modèle de prédiction, réelle et à ce jour **non mesurée**. Voir « Risque assumé ».

**`CAPPING_GRACE_MIN = 60 minutes`** — la limite s'applique au minimum de la trajectoire **après** cette fenêtre, pas sur toute la courbe.

Ce délai n'est pas un confort : il est nécessaire, et sa valeur est tirée du modèle lui-même. Quand l'utilisateur part de 56 mg/dL, les premières minutes de la trajectoire restent proches de son point de départ **quelle que soit la dose** — aucune dose, même nulle, ne peut le remonter instantanément. Une règle portant sur le minimum absolu serait donc insatisfiable et ramènerait mécaniquement la dose à zéro.

Soixante minutes, c'est le pic d'absorption des glucides du modèle (`CARB_PEAK_MIN = 60`, `lib/glucose-prediction.ts`) : avant, la trajectoire est dominée par le point de départ ; après, par la dose.

Vérification sur le cas réel (56 mg/dL, 100 g, 2,5 U actives), trajectoires simulées avec le moteur de l'app :

| Dose | +0 | +30 | +60 | +90 | +120 | +300 | Min après 60 min |
|---|---|---|---|---|---|---|---|
| 10 U | 56 | 56 | 54 | 49 | 40 | 40 | **40** — rejetée |
| 9 U | 56 | 60 | 69 | 75 | 76 | 60 | **60** — rejetée |
| **8 U** | 56 | 65 | 88 | 124 | 146 | 139 | **88** — retenue |
| 7 U | 56 | 70 | 117 | 177 | 221 | 239 | 117 — inutilement basse |

La règle retient bien 8 U, la dose la plus élevée dont la trajectoire tient.

## 2. Algorithme

```
capDoseByPrediction(candidateUnits, context) → CappedDose
```

1. Construire les événements de prédiction depuis le store — insuline déjà injectée et glucides en cours — via `buildPredictionEvents` (`lib/prediction-inputs.ts`), la source unique déjà utilisée par le plan de nuit.
2. Y ajouter le repas en cours de saisie : ses glucides, ses macros, et la dose testée, à `minutesAgo: 0`.
3. Simuler avec `predictGlucoseCurve` (`lib/glucose-prediction.ts`) sur l'horizon défini plus bas.
4. Si le minimum de la trajectoire **au-delà de la 60ᵉ minute** est **≥ 80**, la candidate passe inchangée.
5. Sinon, décrémenter **d'une unité entière** (le stylo d'Ethan n'a pas de demi-unités) et re-simuler, jusqu'à ce que le minimum tienne ou que la dose atteigne 0.

Le résultat porte la dose retenue, la dose d'origine, le minimum prédit avant et après, et une raison rédigée.

**Horizon : 300 minutes.** Couvre la durée d'action du Novorapid (195 min) et l'absorption des glucides (195 min), donc la fenêtre où le bolus initial domine.

**Pas de plancher.** Le plafond peut descendre jusqu'à 0 si la trajectoire l'exige. Ajouter un plancher réintroduirait précisément le risque qu'on cherche à écarter. La conséquence — une hyperglycémie post-prandiale — est le compromis explicitement accepté par la méthode de Loop.

## 3. Le split dose à venir (correction post-revue, 3 septembre 2026)

**Cette section affirmait initialement que le moteur ne sait pas modéliser une insuline future** (« `iobRemainingFraction` d'un `minutesAgo` négatif renvoie 1 — faux »), et que c'était une limitation acceptée par Ethan. **C'était factuellement faux**, et l'arbitrage n'a donc jamais eu lieu sur les bonnes bases : la revue finale a trouvé `PredictGlucoseInput.pendingSplit` déjà présent dans `predictGlucoseCurve` (`lib/glucose-prediction.ts`), appliqué avec la sémantique correcte (une 2ᵉ dose à `minutesUntil` minutes est traitée comme injectée depuis `minutesAhead − minutesUntil` minutes, une fois ce délai dépassé). Le plan de nuit (`bedtime-advisor.ts`) et le plan de nuit unifié de `page.tsx` l'utilisaient déjà pour modéliser exactement ce cas.

**Le vrai défaut (C1, Critical) n'était donc pas une limitation du moteur, mais un oubli de câblage** : `capDoseByPrediction` ne recevait jamais le split programmé par le même clic « Enregistrer l'injection ». Mesuré : 56 mg/dL, 2,5 U actives, repas 100 g/35 g lip/45 g prot → `calculateBolus` proposait 10 U + split `{later: 3, delayMinutes: 150}` ; sans voir ce split, le plafond validait 9 U (« ta trajectoire tient ») alors que la trajectoire réelle (9 U + le split) descendait à 67 mg/dL dans l'horizon standard, et à 58 mg/dL au-delà. **Le plafond rendait donc ce chemin plus dangereux qu'avant la branche** : sans lui, le patient voyait la dose pleine et se méfiait ; avec lui, il voyait une validation qui n'en était pas une.

**Correction appliquée** :
- `DoseCappingContext` gagne un champ optionnel `pendingSplit?: { units: number; minutesUntil: number }`, du même type que `PredictGlucoseInput.pendingSplit`.
- `app/diabete/page.tsx` le renseigne depuis `bolusResult.splitDose` (`{ units: splitDose.later, minutesUntil: splitDose.delayMinutes }`) — le MÊME split que celui programmé à l'enregistrement.
- `simulateMinAfterGrace` le transmet tel quel à `predictGlucoseCurve`.
- Ce n'est **pas** un plafonnement du split : `splitDose.later` n'est jamais modifié, il est seulement rendu visible à la simulation. Sa quantité reste validée terrain par l'utilisateur, hors périmètre (§8).

**Horizon étendu en présence d'un split.** La 2ᵉ dose continue de baisser la glycémie jusqu'à DIA (195 min) après **son propre** déclenchement, donc jusqu'à `pendingSplit.minutesUntil + 195` au-delà de maintenant — au-delà de l'horizon standard (300 min) dès qu'un split est prévu à plus de ~105 min (le calibrage actuel va jusqu'à 150 min). Vérifié empiriquement : sans extension, un cas réaliste (glycémie 120 mg/dL, split de 8 U à +150 min — bornes hautes du calibrage) est déclaré sûr par l'horizon standard (creux vu : 151 mg/dL) alors que le vrai creux, 40 minutes plus tard, descend à 78 mg/dL — un faux négatif de sécurité de 73 mg/dL, pas seulement un problème d'affichage.

`CAPPING_HORIZON_MIN` (300, cas sans split) est donc étendu à `max(300, pendingSplit.minutesUntil + 300)` **uniquement quand un split est présent** — jamais pour le cas sans split, qui garde le comportement exact d'avant cette correction. Un balayage des repas split-worthy réels de l'app (pâtes énorme, pizza, viande+accompagnement, cas Ethan 152 g) × glycémies 90–220 mg/dL, sans sport ni IOB additionnel, montre que cette extension ne change la dose retenue dans **aucun** de ces cas : elle ne rend donc pas le plafonnement systématique en usage normal, elle ferme uniquement le trou de sécurité ci-dessus.

## 4. Architecture

**`lib/dose-capping.ts`** (nouveau, pur, testé) :

```ts
export const PREDICTION_SAFETY_LIMIT = 80;
export const CAPPING_HORIZON_MIN = 300;
export const CAPPING_GRACE_MIN = 60;

export interface DoseCappingContext {
  currentGlucose: number | null | undefined;
  /** Âge (min) de `currentGlucose` — I3, revue finale. Reprend le seuil
   *  de `suggestTopUp` (`TOPUP_MAX_GLUCOSE_AGE_MIN`, 15 min). Périmé →
   *  refus explicite de plafonner (pas de désactivation silencieuse). */
  glucoseAgeMin?: number | null;
  insulinLogs: InsulinLog[];
  carbEntries: CarbEntry[];
  /** Repas en cours de saisie, pas encore enregistré. */
  pendingMeal: { carbsGrams: number; fatGrams: number; proteinGrams: number; mealType: string };
  isf: number;
  ratios: MealRatios;
  sport?: RecentExercise;
  /** 2ᵉ dose (split FPU) programmée par le même clic — C1, §3. */
  pendingSplit?: { units: number; minutesUntil: number };
  nowMs?: number;
}

export interface CappedDose {
  units: number;              // dose retenue
  originalUnits: number;      // dose candidate avant plafonnement
  capped: boolean;
  /** Minimum de la trajectoire au-delà de CAPPING_GRACE_MIN, avec la dose candidate. */
  predictedMinBefore: number | null;
  /** Idem, avec la dose retenue. */
  predictedMinAfter: number | null;
  reason: string | null;      // null si non plafonnée
}

export function capDoseByPrediction(
  candidateUnits: number,
  ctx: DoseCappingContext,
): CappedDose;
```

**Glycémie absente.** Si aucune lecture capteur réelle n'est disponible, la simulation n'a pas de point de départ : le plafond **ne s'applique pas** et la dose candidate passe, avec une raison explicite (« pas de mesure capteur — dose non vérifiée par la prédiction »). C'est le seul comportement honnête : on ne simule pas depuis une valeur inventée. Ce dépôt a déjà corrigé deux fois le motif inverse (une valeur par défaut de 120 passée à un garde-fou).

**Câblage.** `app/diabete/page.tsx` appelle `capDoseByPrediction` après `calculateBolus`, et affiche la dose plafonnée. `calculateBolus` n'est pas modifié — sa signature est consommée par de nombreux tests et par le briefing pré-sport.

## 5. Interface

Le chiffre hero affiche la dose retenue. Quand un plafonnement a eu lieu, un encadré sous le résultat, en tonalité d'avertissement :

> **Ramenée de 10 U à 8 U** — à 10 U, ta glycémie descendrait à 40 mg/dL vers 14h.

La dose d'origine reste lisible. Aucun bouton pour « forcer » la dose d'origine : l'utilisateur peut toujours saisir la dose qu'il veut via l'override manuel existant, qui est déjà tracé dans les notes de l'injection.

## 6. Tests

`lib/dose-capping.test.ts`, runner `node:test` existant :

- Le cas d'Ethan : 56 mg/dL, 100 g, 2,5 U actives, candidate 10 U → **8 U**, `capped: true`, minimum après 60 min de **40** avant plafonnement et **88** après.
- La fenêtre de grâce est nécessaire : le même cas avec une règle portant sur le minimum absolu ramènerait la dose à 0. Test explicite qu'elle ne le fait pas.
- Trajectoire saine : candidate 6 U à 140 mg/dL sans IOB → **inchangée**, `capped: false`, `reason: null`.
- **Le plafond ne monte jamais** : une trajectoire prédite en hyperglycémie laisse la candidate intacte.
- Décrémentation par unités entières : la dose retenue est toujours un entier.
- Le plafond peut descendre à 0 si aucune dose ne tient.
- Glycémie absente → candidate inchangée, raison explicite, `capped: false`.
- Candidate à 0 → renvoie 0 sans simuler.
- Les glucides de resucrage en cours (`hypoEventId`) entrent bien dans la trajectoire — ils font monter, donc ils **augmentent** la dose tenable. Test de non-régression du correctif du 3 septembre.

## 7. Risque assumé

Ce plafond confie une décision de dose au modèle de prédiction, dont **l'erreur n'a jamais été mesurée** — c'est précisément le chantier qu'Ethan a ouvert et qui reste à faire.

Trois atténuations :
- la limite à 80 laisse 10 mg/dL de marge ;
- le plafond ne fait que **réduire**, donc son pire échec est une hyperglycémie, pas une hypoglycémie ;
- le chiffre prédit est affiché dans la raison, donc confrontable à l'expérience et signalable s'il déraille.

Cette spec renforce l'argument pour le backtest : une fois l'erreur du modèle mesurée, on saura si 80 est la bonne marge.

## 8. Hors périmètre

- Toute modification des sept couches de `calculateBolus`.
- Le plafonnement de la dose du split elle-même (`splitDose.later`) — validée terrain, hors sujet. (Le fait que le plafond en tienne compte, lui, est désormais dans le périmètre — §3.)
- La modélisation d'une séance sportive **à venir** (`isPreWorkout`) dans la prédiction — `predictGlucoseCurve` ne modélise que le sport passé. Le plafond ne prétend pas vérifier ces doses ; le badge de validation est masqué et remplacé par un message explicite quand `isPreWorkout` est vrai.
- Le backtest de l'erreur du modèle — chantier distinct.
