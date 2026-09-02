# Validation des doses par créneau — design (Projet A)

**Date** : 2026-09-02
**Statut** : design validé par Ethan, en attente de relecture de la spec
**Suite** : Projet B (couche d'ajustement glucides/protéines/lipides) — hors périmètre, à rouvrir après une semaine de données validées

## Problème

L'app modélise la physiologie puis en déduit des doses. Le modèle d'absorption
(`lib/glucose-prediction.ts`) a été recalibré une dizaine de fois sans jamais converger, parce
qu'il n'existe aucune mesure d'erreur : chaque retouche est un pari arbitré au ressenti.

Pendant ce temps, la question la plus en amont n'a jamais été posée : **les doses elles-mêmes
sont-elles justes ?** Ethan signale une glycémie actuellement basse, parfois très basse. Si un
ratio de créneau sur-dose, tout ce qu'on empile par-dessus hérite de l'erreur.

## Objectif

Déterminer, créneau par créneau (matin, midi, goûter, soir), si le ratio sur-dose — en comptant
les hypoglycémies post-repas sur les repas éligibles — et proposer un pas de correction prudent.

Ce projet **ne touche à aucune courbe d'absorption**. Il inverse l'ordre : valider les doses à
partir des résultats observés d'abord, ne modéliser que le reste ensuite.

## Principes

1. **C'est un détecteur, pas un modèle.** Aucune physiologie n'est simulée. On compte des
   événements réels sur des repas dont on a écarté les facteurs de confusion.
2. **Jamais d'auto-apply.** Toute proposition de ratio s'affiche avec « Actuel → Proposé », un
   bouton « Valider » et un `confirm()` natif. Règle établie en juillet 2026.
3. **Un créneau sans assez de données se tait explicitement.** Il affiche « pas assez de
   données », jamais un « tout va bien » par défaut. Un silence honnête vaut mieux qu'un faux
   négatif sur une question de dose.

---

## 1. Où le calcul tourne, et sur quelles données

Les injections vivent **uniquement dans le localStorage** du téléphone d'Ethan ; les points
capteur vivent côté serveur dans Vercel KV. Le calcul tourne donc **côté client**, comme le font
déjà `GlucoseCalendar`, `AGPChart` et `usePatternDetection` : les points sont récupérés via
`/api/glucose/archive`, les injections sont lues dans le store Zustand.

Conséquence assumée : pas d'analyse dans un cron, pas de notification proactive. Le verdict se
consulte quand Ethan ouvre la page.

### Fenêtre d'analyse

La fenêtre démarre à **7 jours** et **s'étend en arrière jusqu'à réunir 3 repas éligibles** pour
le créneau considéré, plafonnée à **90 jours** (la rétention de l'archive). Chaque créneau a donc
sa propre profondeur de fenêtre.

L'UI affiche toujours sur quoi le verdict repose : « 5 repas éligibles sur les 12 derniers
jours ». Sans cette ligne, un verdict fondé sur 3 repas d'il y a deux mois serait indiscernable
d'un verdict fondé sur 7 repas de la semaine.

### Amorçage et confiance

Au démarrage, aucune injection n'est confirmée (la confirmation à T+20 est livrée mais pas
encore utilisée). L'analyse démarre donc sur les **glucides estimés**, avec une confiance
affichée comme **provisoire**. Chaque repas confirmé remplace une estimation par une certitude.

Deux niveaux, affichés explicitement :
- **provisoire** — moins de la moitié des repas éligibles du créneau sont confirmés
- **confirmé** — au moins la moitié le sont

La confiance ne change pas le verdict ni la proposition. Elle change ce qu'Ethan doit en penser.

### Remise à zéro après un changement de ratio

Un ratio modifié invalide les repas antérieurs : les mélanger reviendrait à mesurer deux
réglages différents dans le même échantillon. On tamponne donc `ratioChangedAt` par créneau
(même mécanisme que `profile.basalDoseChangedAt`, posé automatiquement par les setters du store
qui touchent un ratio), et la fenêtre d'analyse ne remonte jamais avant ce tampon.

Effet de bord voulu : après avoir validé une baisse de −10 %, le créneau repasse en « pas assez
de données » et se reconstitue sur les jours suivants. C'est ce qui empêche d'enchaîner deux
baisses sur la même semaine de données.

---

## 2. Éligibilité d'un repas

Un repas entre dans le comptage s'il porte des glucides (`resolveCarbs(log) > 0`), n'est pas une
seconde dose de split, et ne tombe sous **aucune** des quatre exclusions retenues par Ethan :

| Exclusion | Règle | Pourquoi |
|---|---|---|
| **Sport** | une séance muscu ou running est datée dans la fenêtre d'observation de 5 h, ou dans les 4 h précédant le repas | Le sport fait chuter la glycémie indépendamment du bolus, et la sensibilité post-exercice persiste. Sans cette exclusion, le créneau du soir — presque toujours suivi d'une séance vers 20 h — serait signalé en permanence. |
| **IOB résiduel** | IOB > 1,0 U au moment du bolus | Le goûter de 17h30 suivi du dîner de 19 h : l'hypo peut venir du cumul, pas du ratio du créneau. Seuil aligné sur celui qui déclenche déjà l'alerte de stacking dans l'UI. |
| **Quantité incertaine** | `carbsUncertain === true` | Une hypo après un plat dont les glucides sont inconnus ne dit rien sur le ratio — elle dit que l'estimation était fausse. Réutilise `isLearnable()`. |
| **Correction intercalée** | une injection de correction est loggée entre le repas et la fin de la fenêtre | L'hypo peut venir de cette seconde dose. |

Le nombre de repas écartés par chaque motif est conservé et affiché : si un créneau est muet,
Ethan doit pouvoir voir *pourquoi* (« 6 repas écartés : 5 suivis de sport »). Sans ça, un créneau
structurellement inanalysable ressemble à un bug.

---

## 3. Le critère et le verdict

**Une hypo** = un point capteur sous **70 mg/dL** dans les **5 h** suivant le bolus du repas.
Une seule hypo est comptée par repas, même si la glycémie repasse sous le seuil plusieurs fois :
on compte des repas fautifs, pas des points.

Verdict par créneau :

| Verdict | Condition |
|---|---|
| `insufficient-data` | moins de 3 repas éligibles |
| `over-bolus` | au moins **2** repas avec hypo **et** taux ≥ **25 %** des repas éligibles |
| `ok` | tout le reste |

Le double critère est délibéré sur de petits échantillons : exiger 2 événements évite de
déclencher sur un accident isolé, et le taux de 25 % évite qu'un créneau très fréquenté ne soit
signalé pour 2 hypos sur 30 repas.

**Limite connue et assumée.** Ce critère détecte le sur-dosage qui provoque des hypos, pas celui
qui fait atterrir à 85 sans jamais passer sous 70. Ethan a choisi ce critère en connaissance de
cause. La section 5 compense partiellement en affichant le point d'atterrissage.

---

## 4. Ce qui est proposé

Sur un verdict `over-bolus` : un pas de **−10 % sur la quantité d'insuline par gramme** du créneau (0,10 U/g → 0,09 U/g, soit 10 g/U → 11 g/U) — le plafond de
sécurité déjà appliqué à toute suggestion de ratio dans l'app (`lib/doctor/t1d-safety-rules.ts`).

Affichage « Actuel 1 U / 10 g → Proposé 1 U / 11 g », bouton « Valider », `confirm()` natif avant
écriture. La validation appelle `updateRatioProfile`, ce qui tamponne `ratioChangedAt` et remet
le créneau en reconstitution (section 1).

Un seul pas à la fois. L'app ne propose jamais de descendre de plus de 10 % sur une évaluation,
quelle que soit la sévérité observée : la réévaluation de la semaine suivante décidera s'il faut
un second pas.

---

## 5. Information secondaire : le point d'atterrissage

Sous le verdict, une ligne non décisionnelle : l'écart moyen entre la glycémie juste avant le
repas et celle 5 h après, sur les repas éligibles. « Tu atterris en moyenne 45 mg/dL plus bas que
ton point de départ. »

Cette ligne n'entre dans aucun calcul et ne déclenche aucune proposition. Elle rend visible le
sur-dosage qui ne provoque pas d'hypo — le « un peu basse » qui échappe au critère principal.

---

## 6. Architecture

**`lib/dose-validation.ts`** (nouveau, pur, testé) — le cœur :

```ts
export interface EligibleMeal {
  injectionId: string;
  mealType: string;
  injectedAt: number;      // ms
  carbsGrams: number;      // resolveCarbs
  units: number;
  confirmed: boolean;
  glucoseBefore: number | null;
  glucoseAfter5h: number | null;
  hadHypo: boolean;
}

export type SlotVerdict = 'insufficient-data' | 'ok' | 'over-bolus';

export interface SlotAnalysis {
  mealType: string;
  verdict: SlotVerdict;
  eligibleCount: number;
  hypoCount: number;
  hypoRate: number;
  confidence: 'provisoire' | 'confirmé';
  windowDays: number;              // profondeur réellement atteinte
  excluded: Record<string, number>; // motif → nombre
  avgLandingDelta: number | null;   // section 5
  proposedRatio: { current: number; proposed: number } | null;
}

export interface DoseValidationInput {
  insulinLogs: InsulinLog[];
  archivePoints: { t: number; value: number }[];
  workouts: { date: string; durationMin: number }[];
  ratios: MealRatios;
  ratioChangedAt: Partial<Record<string, string>>; // créneau → ISO
  nowMs?: number;
}

export function selectEligibleMeals(
  input: DoseValidationInput,
  mealType: string,
): { meals: EligibleMeal[]; excluded: Record<string, number>; windowDays: number };

export function analyzeSlot(
  meals: EligibleMeal[],
  excluded: Record<string, number>,
  windowDays: number,
  currentRatio: number,
  mealType: string,
): SlotAnalysis;

export function analyzeAllSlots(input: DoseValidationInput): SlotAnalysis[];
```

La sélection et l'analyse sont deux fonctions distinctes : la première porte les règles
d'exclusion, la seconde le critère. On peut tester le critère sans fabriquer des séances de
sport, et les règles d'exclusion sans fabriquer des courbes de glycémie.

**`components/diabete/DoseValidation.tsx`** — présentation pure : reçoit `SlotAnalysis[]`, rend
quatre cartes, remonte la validation par callback. Aucun calcul.

**Page** : une section dans `/diabete/historique`, qui héberge déjà les analyses long terme
(GMI, GRI, AGP, calendrier, corrélation sport). La logique de validation du ratio vit dans la
page, seul endroit qui appelle `updateRatioProfile`.

---

## 7. Tests

`lib/dose-validation.test.ts`, runner `node:test` existant :

- Sélection : chacune des quatre exclusions écarte bien le repas visé, et **seulement** lui
  (un test par motif, chacun devant échouer si son exclusion disparaît)
- Sélection : un repas sans glucides, une seconde dose de split → écartés
- Fenêtre : s'étend au-delà de 7 jours jusqu'à 3 repas éligibles ; s'arrête à 90 jours
- Fenêtre : ne remonte jamais avant `ratioChangedAt`
- Verdict : 2 repas éligibles → `insufficient-data` quel que soit le nombre d'hypos
- Verdict : 2 hypos sur 4 repas (50 %) → `over-bolus`
- Verdict : 1 hypo sur 3 repas → `ok` (le seuil de 2 événements protège)
- Verdict : 2 hypos sur 30 repas (6,7 %) → `ok` (le taux de 25 % protège)
- Hypo : plusieurs passages sous 70 dans la fenêtre → comptés comme un seul repas fautif
- Confiance : bascule à `confirmé` à la moitié des repas confirmés
- Proposition : −10 % appliqué au bon créneau, arrondi cohérent avec le format de ratio
- Proposition : `null` sur `ok` et sur `insufficient-data`
- Atterrissage : moyenne calculée sur les seuls repas ayant les deux mesures

---

## 8. Hors périmètre

- **Projet B** : la couche d'ajustement sur glucides, protéines et lipides en cours. Elle
  suppose la base validée par ce projet ; la concevoir maintenant reviendrait à bâtir sur des
  ratios non vérifiés.
- Toute modification des courbes d'absorption de `lib/glucose-prediction.ts`.
- La titration de la basale (Lantus) : même méthode, autre problème, autre fenêtre d'observation.
- Toute application automatique d'un changement de ratio.
